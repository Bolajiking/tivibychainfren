// Browser-live bridge publisher for harnesses (Phase E propagation proof).
// Boots the PRODUCTION bridge agent + MediaMTX (production-semantics localtest
// config), creates a lease through the signed app-side agent-client, and
// publishes synthetic browser media over WHIP/ICE-TCP. The stream key exists
// only inside the lease-create call, exactly as in production.
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { loadTsModule } from "../tests/helpers/load-ts-module.mjs";
import { livepeerBridgeRtmpUrl } from "./livepeer-bridge-helpers.mjs";

const ROOT = new URL("../", import.meta.url);
const AGENT_ENTRY = new URL("../bridge/agent/index.mjs", import.meta.url).pathname;
const CONFIG = new URL("../bridge/mediamtx.localtest.yml", import.meta.url).pathname;
const CONTROL_URL = "http://127.0.0.1:8091";
const WHIP_BASE = "http://127.0.0.1:8889";

export async function startBridgePublisher({ streamKey, streamId, onLog = () => {} }) {
  const controlSecret = randomBytes(32).toString("hex");
  const { createBridgeAgentClient } = await loadTsModule(
    new URL("../src/lib/bridge/agent-client.ts", import.meta.url),
  );
  const agentClient = createBridgeAgentClient({ controlUrl: CONTROL_URL, controlSecret });
  const logs = [];
  const capture = (readable) => {
    readable.setEncoding("utf8");
    readable.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (line.trim()) {
          logs.push(line);
          onLog(line);
        }
      }
    });
  };

  const agent = spawn(process.execPath, [AGENT_ENTRY], {
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
  capture(agent.stdout);
  capture(agent.stderr);

  const mediaMtx = spawn("mediamtx", [CONFIG], { cwd: ROOT.pathname, stdio: ["ignore", "pipe", "pipe"] });
  capture(mediaMtx.stdout);
  capture(mediaMtx.stderr);

  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      if ((await fetch(`${CONTROL_URL}/healthz`)).ok) break;
    } catch {}
    if (Date.now() > deadline) throw new Error("bridge agent/mediamtx did not become healthy");
    await delay(500);
  }

  const lease = await agentClient.createLease({
    leaseId: randomUUID(),
    attemptId: randomUUID(),
    creatorId: "propagation-harness",
    rtmpUrl: livepeerBridgeRtmpUrl(streamKey),
  });
  if (!lease) throw new Error("bridge lease create failed");

  const heartbeat = setInterval(() => void agentClient.heartbeatLease(lease.leaseId).catch(() => {}), 10_000);
  heartbeat.unref?.();

  const whip = spawn(
    process.execPath,
    [new URL("./whip-browser-test.mjs", import.meta.url).pathname, lease.whipUrl, streamId, "--stay-alive"],
    {
      cwd: ROOT.pathname,
      env: {
        ...process.env,
        WHIP_PREFER_H264: "1",
        WHIP_AUTH_USERNAME: "lease",
        WHIP_AUTH_PASSWORD: lease.publishToken,
        WHIP_STAY_ALIVE_MS: process.env.WHIP_STAY_ALIVE_MS ?? "300000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  capture(whip.stdout);
  capture(whip.stderr);

  let stopped = false;
  return {
    logs,
    lease,
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(heartbeat);
      if (whip.exitCode === null) whip.kill("SIGINT");
      await agentClient.revokeLease(lease.leaseId).catch(() => {});
      if (mediaMtx.exitCode === null) {
        mediaMtx.kill("SIGINT");
        await Promise.race([onceExit(mediaMtx), delay(5_000)]);
      }
      if (agent.exitCode === null) {
        agent.kill("SIGTERM");
        await Promise.race([onceExit(agent), delay(5_000)]);
      }
    },
  };
}

function onceExit(child) {
  return new Promise((resolve) => child.once("exit", resolve));
}
