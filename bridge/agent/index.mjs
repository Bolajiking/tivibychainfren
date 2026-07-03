#!/usr/bin/env node
// Bridge agent entrypoint. Wiring only — all decision logic lives in the
// tested modules (leases.mjs, auth.mjs, server.mjs, forwarder.mjs).
//
// Env:
//   TVINBIO_BRIDGE_CONTROL_SECRET  shared HMAC secret (required)
//   BRIDGE_PUBLIC_WHIP_BASE        public signaling base, e.g. https://bridge.example.com:8443 (required)
//   BRIDGE_CONTROL_PORT            control API port      (default 8091, loopback; TLS terminator fronts it)
//   BRIDGE_LOOPBACK_PORT           MediaMTX hook port    (default 9998, loopback only)
//   MEDIAMTX_API                   MediaMTX API base     (default http://127.0.0.1:9997)
//   MEDIAMTX_RTSP_BASE             RTSP base for ffmpeg  (default rtsp://127.0.0.1:8554)
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createLeaseStore } from "./leases.mjs";
import { createAgentApp } from "./server.mjs";
import { createForwarderRunner } from "./forwarder.mjs";

const controlSecret = process.env.TVINBIO_BRIDGE_CONTROL_SECRET;
const publicWhipBase = process.env.BRIDGE_PUBLIC_WHIP_BASE;
if (!controlSecret || !publicWhipBase) {
  console.error("[agent] TVINBIO_BRIDGE_CONTROL_SECRET and BRIDGE_PUBLIC_WHIP_BASE are required");
  process.exit(1);
}

const controlPort = Number(process.env.BRIDGE_CONTROL_PORT ?? 8091);
const loopbackPort = Number(process.env.BRIDGE_LOOPBACK_PORT ?? 9998);
const mediamtxApi = (process.env.MEDIAMTX_API ?? "http://127.0.0.1:9997").replace(/\/$/, "");
const rtspBase = process.env.MEDIAMTX_RTSP_BASE ?? "rtsp://127.0.0.1:8554";

const log = (entry) => console.log(JSON.stringify({ at: new Date().toISOString(), ...entry }));

const store = createLeaseStore();

const runner = createForwarderRunner({
  rtspBase,
  fetchPathInfo: async (apiPath) => {
    const response = await fetch(`${mediamtxApi}${apiPath}`);
    if (!response.ok) throw new Error(`mediamtx_api_${response.status}`);
    return response.json();
  },
  fetchDestination: async (path) => store.destinationFor(path),
  spawn,
  onReject: (path, reason) => {
    const lease = store.describe().find((entry) => entryPath(entry) === path) ?? null;
    // Reject terminates the lease (spec §6.3 step 3: non-H.264 never reaches ffmpeg).
    for (const described of store.describe()) {
      if (store.get(described.leaseId)?.path === path) {
        store.revoke(described.leaseId, reason);
        void kickPublisher(path);
      }
    }
    log({ event: "lease_rejected", path, reason, leaseId: lease?.leaseId ?? null });
  },
  log,
});

function entryPath(entry) {
  return store.get(entry.leaseId)?.path ?? null;
}

async function kickPublisher(path) {
  // Best effort: end any WebRTC session publishing this path.
  try {
    const response = await fetch(`${mediamtxApi}/v3/webrtcsessions/list`);
    if (!response.ok) return;
    const payload = await response.json();
    for (const session of payload.items ?? []) {
      if (session.path === path && session.state === "publish") {
        await fetch(`${mediamtxApi}/v3/webrtcsessions/kick/${encodeURIComponent(session.id)}`, {
          method: "POST",
        }).catch(() => {});
      }
    }
  } catch {
    // MediaMTX also drops the publisher on the next auth re-check.
  }
}

const app = createAgentApp({
  controlSecret,
  store,
  publicWhipBase,
  checkMediamtx: async () => {
    const response = await fetch(`${mediamtxApi}/v3/paths/list`).catch(() => null);
    return response?.ok === true;
  },
  onLeaseEnded: (leaseId, reason) => {
    log({ event: "lease_ended", leaseId, reason });
  },
  log,
});

// The loopback surface also drives the forwarder lifecycle: runOnReady/
// runOnNotReady curl these endpoints, so publishing state and ffmpeg stay
// aligned with the media plane, not the browser.
const loopbackServer = createServer(async (req, res) => {
  const url = new URL(req.url, "http://agent.local");
  if (req.method === "POST" && url.pathname === "/internal/ready") {
    const path = url.searchParams.get("path");
    if (path) {
      store.markPublishing(path);
      await runner.start(path);
      res.writeHead(204);
      res.end();
      return;
    }
  }
  if (req.method === "POST" && url.pathname === "/internal/not-ready") {
    const path = url.searchParams.get("path");
    if (path) {
      store.markPublisherGone(path);
      runner.stop(path);
      res.writeHead(204);
      res.end();
      return;
    }
  }
  return app.loopback(req, res);
});

const controlServer = createServer(app.control);

controlServer.listen(controlPort, "127.0.0.1", () => log({ event: "control_listening", port: controlPort }));
loopbackServer.listen(loopbackPort, "127.0.0.1", () => log({ event: "loopback_listening", port: loopbackPort }));

// Sweeper: expire leases per policy; re-arm publisher presence from the media plane.
const sweeper = setInterval(async () => {
  for (const swept of store.sweep()) {
    log({ event: "lease_swept", leaseId: swept.leaseId, reason: swept.reason });
    runner.stop(swept.path);
    void kickPublisher(swept.path);
  }
  try {
    const response = await fetch(`${mediamtxApi}/v3/paths/list`);
    if (response.ok) {
      const payload = await response.json();
      for (const item of payload.items ?? []) {
        if (item.ready === true) store.publisherSeen(item.name);
      }
    }
  } catch {
    // MediaMTX briefly unavailable; presence re-arms on the next tick.
  }
}, 5_000);

function shutdown() {
  log({ event: "shutting_down" });
  clearInterval(sweeper);
  for (const described of store.describe()) {
    store.revoke(described.leaseId, "shutdown");
  }
  runner.stopAll();
  controlServer.close();
  loopbackServer.close();
  setTimeout(() => process.exit(0), 1_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
