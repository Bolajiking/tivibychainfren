#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import {
  buildLiveFieldEnvironment,
  buildLiveFieldUrl,
  createIdempotentFieldCleanup,
  parseReadyQuickTunnelOrigin,
  waitForFieldPage,
  waitForFieldRunEnd,
  waitForFieldShutdown,
} from "./livepeer-field-helpers.mjs";

const LIVEPEER_API = "https://livepeer.studio/api";
const PORT = Number(process.env.TVINBIO_FIELD_PORT ?? 3001);
const LOCAL_ORIGIN = `http://127.0.0.1:${PORT}`;

loadEnv();
if (!process.env.LIVEPEER_API_KEY) throw new Error("LIVEPEER_API_KEY missing");
if (!existsSync(".next/BUILD_ID")) throw new Error("Production build missing. Run npm run build first.");

let stream = null;
let fieldToken = null;
let appServer = null;
let tunnel = null;
const logs = [];
const cleanup = createIdempotentFieldCleanup(cleanupOwnedResources);
const shutdownPromise = waitForFieldShutdown(process);

try {
  stream = await createTemporaryStream();
  fieldToken = randomBytes(32).toString("base64url");
  const env = buildLiveFieldEnvironment(stream, fieldToken, process.env);

  appServer = spawn("npm", ["run", "start", "--", "--port", String(PORT)], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  captureAppOutput(appServer.stdout, logs);
  captureAppOutput(appServer.stderr, logs);
  await waitForFieldPage(buildLiveFieldUrl(LOCAL_ORIGIN, fieldToken), appServer, {
    label: "Field app server",
  });

  tunnel = spawn("cloudflared", ["tunnel", "--url", LOCAL_ORIGIN, "--no-autoupdate"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const publicOrigin = await waitForTunnelOrigin(tunnel);
  const publicUrl = buildLiveFieldUrl(publicOrigin, fieldToken);

  console.log("\nTVinBio browser-live field run is ready.");
  console.log(publicUrl);
  console.log("\nOpen this HTTPS URL on the physical phone, allow camera and microphone, then tap Go live.");
  console.log("Press Ctrl-C here when the run is complete; the temporary stream will be deleted.\n");

  await waitForFieldRunEnd(tunnel, shutdownPromise);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const detail = redact(logs.slice(-20).join(""));
  console.error(detail ? `${message}\n${detail}` : message);
  process.exitCode = 1;
} finally {
  await cleanup();
}

async function createTemporaryStream() {
  const response = await livepeer("/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `tvinbio-browser-field-${Date.now()}`, record: false }),
  });
  if (!response.ok) throw new Error(`Livepeer stream creation failed (${response.status})`);
  if (!response.data?.id || !response.data?.streamKey || !response.data?.playbackId) {
    throw new Error("Livepeer stream creation returned incomplete ingest data");
  }
  return response.data;
}

async function deleteTemporaryStream(streamId) {
  const response = await livepeer(`/stream/${encodeURIComponent(streamId)}`, { method: "DELETE" });
  return response.ok || response.status === 404;
}

async function livepeer(path, init = {}) {
  const response = await fetch(`${LIVEPEER_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${process.env.LIVEPEER_API_KEY}`,
      ...init.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  return { ok: response.ok, status: response.status, data };
}

function waitForTunnelOrigin(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("Cloudflare Quick Tunnel did not become ready")), 30_000);
    const consume = (chunk) => {
      output = `${output}${chunk.toString()}`.slice(-24_000);
      const origin = parseReadyQuickTunnelOrigin(output);
      if (!origin) return;
      clearTimeout(timeout);
      resolve(origin);
    };
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Cloudflare Quick Tunnel exited (${code ?? "signal"})`));
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function cleanupOwnedResources() {
  await stopChild(tunnel);
  await stopChild(appServer);
  if (stream?.id) {
    const deleted = await deleteTemporaryStream(stream.id).catch(() => false);
    console.log(deleted ? "Temporary Livepeer stream deleted." : "Warning: temporary Livepeer stream cleanup failed.");
  }
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(3_000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

function captureAppOutput(streamHandle, destination) {
  if (!streamHandle) return;
  let pending = "";
  streamHandle.on("data", (chunk) => {
    const text = chunk.toString();
    destination.push(text);
    pending += text;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const marker = line.indexOf("[field-evidence]");
      if (marker >= 0) console.log(line.slice(marker));
    }
  });
}

function redact(value) {
  let output = String(value);
  for (const secret of [process.env.LIVEPEER_API_KEY, stream?.streamKey, fieldToken]) {
    if (secret) output = output.split(secret).join("[redacted]");
  }
  return output.trim();
}

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}
