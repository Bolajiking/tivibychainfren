import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import {
  bridgeActivationConfirmed,
  bridgeVerifierOverrides,
  livepeerBridgeRtmpUrl,
  localBridgeWhipUrl,
  redactBridgeSecrets,
} from "./livepeer-bridge-helpers.mjs";

const LIVEPEER_API = "https://livepeer.studio/api";
const ROOT = new URL("../", import.meta.url);
const CONFIG = new URL("../infra/mediamtx/mediamtx.local.yml", import.meta.url);
const LOCAL_PUBLISH_USER = "local-publisher";
const LOCAL_PUBLISH_PASS = "local-validation-secret";

loadEnv();
if (!process.env.LIVEPEER_API_KEY) throw new Error("LIVEPEER_API_KEY missing");
const overrides = bridgeVerifierOverrides(process.env);
const configPath = overrides.configPath ?? CONFIG.pathname;
const whipUrl = overrides.whipUrl ?? localBridgeWhipUrl("bridge");

const headers = { authorization: `Bearer ${process.env.LIVEPEER_API_KEY}` };
const stream = await createTemporaryStream();
const destination = livepeerBridgeRtmpUrl(stream.streamKey);
const mediaMtxLogs = [];
let mediaMtx = null;
let whip = null;

try {
  mediaMtx = spawn("mediamtx", [configPath], {
    cwd: ROOT.pathname,
    env: { ...process.env, TVINBIO_RTMP_DESTINATION: destination },
    stdio: ["ignore", "pipe", "pipe"],
  });
  capture(mediaMtx.stdout, mediaMtxLogs);
  capture(mediaMtx.stderr, mediaMtxLogs);
  await waitForMediaMtx();

  whip = spawn(
    process.execPath,
    [new URL("./whip-browser-test.mjs", import.meta.url).pathname, whipUrl, stream.id],
    {
      cwd: ROOT.pathname,
      env: {
        ...process.env,
        WHIP_PREFER_H264: "1",
        WHIP_AUTH_USERNAME: LOCAL_PUBLISH_USER,
        WHIP_AUTH_PASSWORD: LOCAL_PUBLISH_PASS,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const [whipExit, whipOutput] = await collect(whip);
  const confirmation = await waitForActivation(stream.id);
  const result = {
    mode: overrides.mode,
    mediaMtxVersion: await commandOutput("mediamtx", ["--version"]),
    whipExit,
    whipConnected: /"connected": true/.test(whipOutput),
    livepeerActive: confirmation.isActive,
    matchingSessions: confirmation.sessions,
    passed: whipExit === 0 && bridgeActivationConfirmed(confirmation),
    mediaMtxEvents: mediaMtxLogs
      .filter((line) => /WebRTC|runOnReady|RTSP|not ready|ready|ffmpeg|codec|flv|invalid|error/i.test(line))
      .slice(-40),
    whipTail: whipOutput.split(/\r?\n/).slice(-35),
  };
  console.log(JSON.stringify(redactBridgeSecrets(result, stream.streamKey), null, 2));
  process.exitCode = result.passed ? 0 : 2;
} finally {
  if (whip && whip.exitCode === null) whip.kill("SIGINT");
  if (mediaMtx && mediaMtx.exitCode === null) {
    mediaMtx.kill("SIGINT");
    await Promise.race([onceExit(mediaMtx), delay(5_000)]);
  }
  await livepeer(`/stream/${encodeURIComponent(stream.id)}`, { method: "DELETE" }).catch(() => null);
}

async function createTemporaryStream() {
  const response = await livepeer("/stream", {
    method: "POST",
    body: JSON.stringify({ name: `tvinbio-bridge-local-${Date.now()}`, record: false }),
  });
  if (!response.ok) throw new Error(`Livepeer stream create failed (${response.status})`);
  const value = JSON.parse(response.text);
  if (!value?.id || !value?.streamKey) throw new Error("Livepeer stream response incomplete");
  return value;
}

async function waitForMediaMtx() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (mediaMtx?.exitCode !== null) throw new Error(`MediaMTX exited before ready (${mediaMtx?.exitCode})`);
    try {
      const response = await fetch("http://127.0.0.1:9997/v3/paths/list");
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error("MediaMTX did not become ready");
}

async function readActivation(streamId) {
  const [streamResponse, sessionsResponse] = await Promise.all([
    livepeer(`/stream/${encodeURIComponent(streamId)}`),
    livepeer(`/session?parentId=${encodeURIComponent(streamId)}`),
  ]);
  const streamValue = streamResponse.ok ? JSON.parse(streamResponse.text) : {};
  const sessionsValue = sessionsResponse.ok ? JSON.parse(sessionsResponse.text) : [];
  return {
    isActive: streamValue?.isActive === true,
    sessions: Array.isArray(sessionsValue)
      ? sessionsValue.filter((session) => session?.parentId === streamId).length
      : 0,
  };
}

async function waitForActivation(streamId) {
  let last = { isActive: false, sessions: 0 };
  for (let attempt = 0; attempt < 12; attempt += 1) {
    last = await readActivation(streamId);
    if (bridgeActivationConfirmed(last)) return last;
    await delay(1_000);
  }
  return last;
}

async function livepeer(path, init = {}) {
  const response = await fetch(`${LIVEPEER_API}${path}`, {
    ...init,
    headers: { ...headers, ...(init.body ? { "content-type": "application/json" } : {}) },
  });
  return { ok: response.ok, status: response.status, text: await response.text() };
}

function capture(readable, target) {
  let pending = "";
  readable?.setEncoding("utf8");
  readable?.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    target.push(...lines.filter(Boolean));
  });
}

function collect(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { output += chunk; });
    child.stderr?.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => resolve([code ?? 1, output]));
  });
}

function onceExit(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("exit", resolve));
}

async function commandOutput(command, args) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  const [exit, output] = await collect(child);
  if (exit !== 0) return "unknown";
  return output.trim();
}

function loadEnv() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
