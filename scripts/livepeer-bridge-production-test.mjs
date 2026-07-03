// Production-path bridge integration test (plan §6 D15).
//
// Exercises the REAL production code: bridge/agent (lease store, HMAC control
// API, loopback auth hook, codec-gated forwarder), bridge/mediamtx.localtest.yml
// (production semantics on loopback ports), and the app-side signed
// agent-client (src/lib/bridge/agent-client.ts). Proves a browser WHIP publish
// creates an ACTIVE Livepeer session with a matching parent stream, that the
// lease reports publishing, and that every lease/process/temporary stream is
// cleaned up afterwards.
//
// Requires: mediamtx + ffmpeg + curl on PATH, LIVEPEER_API_KEY in .env.local.
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { loadTsModule } from "../tests/helpers/load-ts-module.mjs";
import { livepeerBridgeRtmpUrl, redactBridgeSecrets } from "./livepeer-bridge-helpers.mjs";

const LIVEPEER_API = "https://livepeer.studio/api";
const ROOT = new URL("../", import.meta.url);
const AGENT_ENTRY = new URL("../bridge/agent/index.mjs", import.meta.url).pathname;
const CONFIG = new URL("../bridge/mediamtx.localtest.yml", import.meta.url).pathname;
const CONTROL_URL = "http://127.0.0.1:8091";
const WHIP_BASE = "http://127.0.0.1:8889";

loadEnv();
if (!process.env.LIVEPEER_API_KEY) throw new Error("LIVEPEER_API_KEY missing");
const controlSecret = randomBytes(32).toString("hex");
const headers = { authorization: `Bearer ${process.env.LIVEPEER_API_KEY}` };

const { createBridgeAgentClient } = await loadTsModule(
  new URL("../src/lib/bridge/agent-client.ts", import.meta.url),
);
const agentClient = createBridgeAgentClient({ controlUrl: CONTROL_URL, controlSecret });

const stream = await createTemporaryStream();
const agentLogs = [];
const mediaMtxLogs = [];
let agent = null;
let mediaMtx = null;
let whip = null;
let lease = null;

try {
  agent = spawn(process.execPath, [AGENT_ENTRY], {
    cwd: ROOT.pathname,
    env: {
      ...process.env,
      TVINBIO_BRIDGE_CONTROL_SECRET: controlSecret,
      BRIDGE_PUBLIC_WHIP_BASE: WHIP_BASE,
      BRIDGE_CONTROL_PORT: "8091",
      BRIDGE_LOOPBACK_PORT: "9998",
      MEDIAMTX_API: "http://127.0.0.1:9997",
      MEDIAMTX_RTSP_BASE: "rtsp://127.0.0.1:8554",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  capture(agent.stdout, agentLogs);
  capture(agent.stderr, agentLogs);

  mediaMtx = spawn("mediamtx", [CONFIG], {
    cwd: ROOT.pathname,
    stdio: ["ignore", "pipe", "pipe"],
  });
  capture(mediaMtx.stdout, mediaMtxLogs);
  capture(mediaMtx.stderr, mediaMtxLogs);

  await waitFor(async () => (await fetch(`${CONTROL_URL}/healthz`)).ok, 15_000, "agent+mediamtx healthz");

  lease = await agentClient.createLease({
    leaseId: randomUUID(),
    attemptId: randomUUID(),
    creatorId: "integration-harness",
    rtmpUrl: livepeerBridgeRtmpUrl(stream.streamKey),
  });
  if (!lease) throw new Error("lease_create_failed");

  // Pre-publish keepalive (10 s cadence, spec §7.4) until the media plane
  // takes over lease liveness via publisher presence.
  const heartbeat = setInterval(() => {
    void agentClient.heartbeatLease(lease.leaseId).catch(() => {});
  }, 10_000);
  heartbeat.unref?.();

  whip = spawn(
    process.execPath,
    [new URL("./whip-browser-test.mjs", import.meta.url).pathname, lease.whipUrl, stream.id],
    {
      cwd: ROOT.pathname,
      env: {
        ...process.env,
        WHIP_PREFER_H264: "1",
        WHIP_AUTH_USERNAME: "lease",
        WHIP_AUTH_PASSWORD: lease.publishToken,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const [whipExit, whipOutput] = await collect(whip);
  const confirmation = await waitForActivation(stream.id);
  const leaseAfterPublish = await agentClient.leaseStatus(lease.leaseId);

  await agentClient.revokeLease(lease.leaseId);
  const leaseAfterRevoke = await agentClient.leaseStatus(lease.leaseId);
  const health = await (await fetch(`${CONTROL_URL}/healthz`)).json();

  const result = {
    mode: "production-agent-bridge",
    whipExit,
    whipConnected: /"connected": true/.test(whipOutput),
    h264Preferred: /"videoCodec": "video\/H264"/i.test(whipOutput) || /H264/i.test(whipOutput),
    livepeerActive: confirmation.isActive,
    matchingSessions: confirmation.sessions,
    leasePublishingDuringBroadcast: leaseAfterPublish?.publishing === true,
    leaseGoneAfterRevoke: leaseAfterRevoke === null,
    forwarderStarted: agentLogs.some((line) => line.includes("forwarder_started")),
    activeLeasesAtEnd: health.leases?.active ?? null,
    passed: false,
    agentEvents: agentLogs.filter((line) => /lease|forwarder|control/i.test(line)).slice(-30),
    mediaMtxEvents: mediaMtxLogs
      .filter((line) => /WebRTC|runOn|RTSP|ready|ffmpeg|codec|flv|auth|error/i.test(line))
      .slice(-30),
    whipTail: whipOutput.split(/\r?\n/).slice(-25),
  };
  result.passed =
    whipExit === 0 &&
    result.whipConnected &&
    confirmation.isActive === true &&
    Number(confirmation.sessions) > 0 &&
    result.leasePublishingDuringBroadcast &&
    result.leaseGoneAfterRevoke &&
    result.forwarderStarted &&
    result.activeLeasesAtEnd === 0;

  console.log(
    JSON.stringify(redactBridgeSecrets(redactToken(result, lease.publishToken), stream.streamKey), null, 2),
  );
  process.exitCode = result.passed ? 0 : 2;
} finally {
  if (whip && whip.exitCode === null) whip.kill("SIGINT");
  if (lease) await agentClient.revokeLease(lease.leaseId).catch(() => {});
  if (mediaMtx && mediaMtx.exitCode === null) {
    mediaMtx.kill("SIGINT");
    await Promise.race([onceExit(mediaMtx), delay(5_000)]);
  }
  if (agent && agent.exitCode === null) {
    agent.kill("SIGTERM");
    await Promise.race([onceExit(agent), delay(5_000)]);
  }
  await livepeer(`/stream/${encodeURIComponent(stream.id)}`, { method: "DELETE" }).catch(() => null);
}

async function createTemporaryStream() {
  const response = await livepeer("/stream", {
    method: "POST",
    body: JSON.stringify({ name: `tvinbio-bridge-prod-${Date.now()}`, record: false }),
  });
  if (!response.ok) throw new Error(`temporary stream create failed: ${response.status}`);
  const payload = await response.json();
  if (!payload?.id || !payload?.streamKey) throw new Error("temporary stream response invalid");
  return { id: payload.id, streamKey: payload.streamKey };
}

async function waitForActivation(streamId, timeoutMs = 60_000) {
  const startedAt = Date.now();
  let last = { isActive: false, sessions: 0 };
  while (Date.now() - startedAt < timeoutMs) {
    const [streamRes, sessionRes] = await Promise.all([
      livepeer(`/stream/${encodeURIComponent(streamId)}`),
      livepeer(`/session?parentId=${encodeURIComponent(streamId)}`),
    ]);
    const streamPayload = streamRes.ok ? await streamRes.json() : null;
    const sessions = sessionRes.ok ? await sessionRes.json() : [];
    last = {
      isActive: streamPayload?.isActive === true,
      sessions: Array.isArray(sessions) ? sessions.filter((s) => s.parentId === streamId).length : 0,
    };
    if (last.isActive && last.sessions > 0) return last;
    await delay(2_000);
  }
  return last;
}

function livepeer(path, init = {}) {
  return fetch(`${LIVEPEER_API}${path}`, {
    ...init,
    headers: { ...headers, ...(init.body ? { "content-type": "application/json" } : {}) },
  });
}

async function waitFor(check, timeoutMs, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await check()) return;
    } catch {
      // keep waiting
    }
    await delay(500);
  }
  throw new Error(`timeout waiting for ${label}`);
}

function capture(readable, sink) {
  readable.setEncoding("utf8");
  readable.on("data", (chunk) => {
    for (const line of chunk.split(/\r?\n/)) if (line.trim()) sink.push(line);
  });
}

function collect(child) {
  const output = [];
  capture(child.stdout, output);
  capture(child.stderr, output);
  return Promise.all([onceExit(child), Promise.resolve().then(async () => {
    await onceExit(child);
    return output.join("\n");
  })]);
}

function onceExit(child) {
  return new Promise((resolve) => child.once("exit", resolve));
}

function redactToken(value, token) {
  if (!token) return value;
  const text = JSON.stringify(value).split(token).join("<redacted-publish-token>");
  return JSON.parse(text);
}

function loadEnv() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
    }
  } catch {
    // no .env.local
  }
}
