#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import WebSocket from "ws";
import { parseQuickTunnelOrigin } from "./livepeer-field-helpers.mjs";
import { startBridgePublisher } from "./livepeer-bridge-publisher.mjs";
import { buildTemporaryPublicProfileRows } from "./livepeer-public-propagation-helpers.mjs";
import { buildRtmpEncoderArgs, redactRtmpSecret } from "./livepeer-rtmp-e2e-helpers.mjs";
import {
  buildTemporaryWebhookInput,
  classifyWebhookConsoleMessage,
  redactWebhookDiagnostic,
  webhookPropagationPassed,
} from "./livepeer-webhook-e2e-helpers.mjs";

const LIVEPEER_API = "https://livepeer.studio/api";
const PORT = Number(process.env.TVINBIO_WEBHOOK_TEST_PORT ?? 3001);
// "rtmp" (OBS-equivalent) or "bridge" (browser WHIP via the production bridge agent).
const SOURCE = process.env.TVINBIO_PROPAGATION_SOURCE === "bridge" ? "bridge" : "rtmp";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TIMEOUT_MS = 35_000;

loadEnv();
const livepeerKey = requiredEnv("LIVEPEER_API_KEY");
const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!existsSync(".next/BUILD_ID")) throw new Error("Production build missing. Run npm run build first.");

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
  global: { fetch: (input, init = {}) => fetch(input, { ...init, signal: boundedSignal(init.signal) }) },
  realtime: { transport: WebSocket },
});
const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const creatorId = `0x${randomBytes(20).toString("hex")}`;
const username = `tvhook${suffix}`.slice(0, 30);
const sharedSecret = randomBytes(32).toString("base64url");

let stream = null;
let webhook = null;
let appServer = null;
let tunnel = null;
let encoder = null;
let bridgePublisher = null;
let browser = null;
let rowsInserted = false;
let failure = null;
const serverLogs = [];
const encoderLogs = [];
const evidence = {
  mode: "livepeer-webhook-propagation",
  username,
  livepeerActive: false,
  livepeerIdle: false,
  startedWebhookSuccess: false,
  idleWebhookSuccess: false,
  databaseLive: false,
  databaseIdle: false,
  profileLiveMs: null,
  profileIdleMs: null,
  encoderToProfileMs: null,
  pollingRequestsAborted: 0,
  expectedPollConsoleErrors: 0,
  realtimeSockets: 0,
  webhookLogs: [],
  consoleErrors: [],
  pageErrors: [],
};
const cleanup = {
  encoderStopped: false,
  webhookDeleted: false,
  rowsDeleted: false,
  streamDeleted: false,
  tunnelStopped: false,
  serverStopped: false,
};

try {
  stream = await createLivepeerStream();
  const rows = buildTemporaryPublicProfileRows({
    creatorId,
    username,
    livepeerId: stream.id,
    livepeerPlaybackId: stream.playbackId,
  });
  await insertTemporaryRows(rows);
  rowsInserted = true;

  appServer = spawn("npm", ["run", "start", "--", "--port", String(PORT)], {
    cwd: process.cwd(),
    env: { ...process.env, LIVEPEER_WEBHOOK_SECRET: sharedSecret },
    stdio: ["ignore", "pipe", "pipe"],
  });
  capture(appServer.stdout, serverLogs);
  capture(appServer.stderr, serverLogs);
  await waitForServer(appServer);

  tunnel = spawn("cloudflared", ["tunnel", "--url", BASE_URL, "--no-autoupdate"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const publicOrigin = await waitForTunnelOrigin(tunnel);
  webhook = await createWebhook(`${publicOrigin}/api/livepeer/webhook`, stream.id);

  browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = redact(message.text());
    if (classifyWebhookConsoleMessage(text) === "expected_poll_block") {
      evidence.expectedPollConsoleErrors += 1;
    } else {
      evidence.consoleErrors.push(text);
    }
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(redact(error.message)));
  page.on("websocket", (socket) => {
    if (socket.url().includes("/realtime/")) evidence.realtimeSockets += 1;
  });
  await page.route(`**/api/channels/${username}/stream`, async (route) => {
    evidence.pollingRequestsAborted += 1;
    await route.abort("blockedbyclient");
  });

  await page.goto(`${BASE_URL}/${username}`, { waitUntil: "domcontentloaded" });
  await page.getByText("OFFLINE", { exact: true }).waitFor({ state: "visible", timeout: 8_000 });
  await waitFor(() => evidence.pollingRequestsAborted > 0, 8_000, "profile status polling did not start");
  await waitFor(() => evidence.realtimeSockets > 0, 8_000, "profile did not open a Realtime socket");

  const encoderStartedAt = Date.now();
  if (SOURCE === "bridge") {
    // Browser WHIP through the production bridge agent — closes the
    // browser-live realtime propagation box instead of the OBS one.
    bridgePublisher = await startBridgePublisher({ streamKey: stream.streamKey, streamId: stream.id });
    evidence.source = "bridge";
  } else {
    encoder = spawn("ffmpeg", buildRtmpEncoderArgs(stream.streamKey), { stdio: ["pipe", "ignore", "pipe"] });
    captureEncoder(encoder.stderr, encoderLogs);
    evidence.source = "rtmp";
  }
  const [activeState, startedLog, profileVisibleAt] = await Promise.all([
    waitForLivepeerState(true),
    waitForWebhookLog("stream.started", encoderStartedAt),
    waitForVisibleAt(page.getByText("Live now", { exact: true }), 20_000),
  ]);
  evidence.livepeerActive = activeState.active && activeState.session;
  evidence.startedWebhookSuccess = startedLog.success === true && startedLog.responseStatus === 200;
  evidence.webhookLogs.push(startedLog);
  evidence.profileLiveMs = eventToUiMs(startedLog.createdAt, profileVisibleAt);
  evidence.encoderToProfileMs = Math.max(0, profileVisibleAt - encoderStartedAt);
  evidence.databaseLive = (await readTemporaryStream()).is_active === true;

  cleanup.encoderStopped = await stopEncoder();
  const encoderStoppedAt = Date.now();
  const [idleState, idleLog, profileIdleAt] = await Promise.all([
    waitForLivepeerState(false),
    waitForWebhookLog("stream.idle", encoderStoppedAt),
    waitForVisibleAt(page.getByText("OFFLINE", { exact: true }), 20_000),
  ]);
  evidence.livepeerIdle = idleState.active === false;
  evidence.idleWebhookSuccess = idleLog.success === true && idleLog.responseStatus === 200;
  evidence.webhookLogs.push(idleLog);
  evidence.profileIdleMs = eventToUiMs(idleLog.createdAt, profileIdleAt);
  evidence.databaseIdle = (await readTemporaryStream()).is_active === false;
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  if (webhook?.id) {
    evidence.webhookLogs = await readSafeWebhookLogs(webhook.id).catch(() => evidence.webhookLogs);
  }
} finally {
  cleanup.encoderStopped = cleanup.encoderStopped || await stopEncoder();
  await browser?.close().catch(() => undefined);
  cleanup.webhookDeleted = webhook?.id ? await deleteWebhook(webhook.id) : true;
  cleanup.rowsDeleted = rowsInserted ? await deleteTemporaryRows(stream?.id) : true;
  cleanup.streamDeleted = stream?.id ? await deleteLivepeerStream(stream.id) : true;
  cleanup.tunnelStopped = await stopChild(tunnel);
  cleanup.serverStopped = await stopChild(appServer);
}

const report = {
  ...evidence,
  cleanup,
  passed: failure === null && webhookPropagationPassed({ ...evidence, cleanup }),
  error: failure,
  serverErrors: redact(serverLogs.join(""), sharedSecret).split(/\r?\n/).filter(Boolean).slice(-12),
  encoderErrors: encoderLogs.slice(-12),
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 2;

async function createLivepeerStream() {
  const response = await livepeerApi("/stream", {
    method: "POST",
    body: JSON.stringify({ name: `tvinbio-webhook-e2e-${suffix}`, record: false }),
  });
  if (!response.ok || !response.data?.id || !response.data?.playbackId || !response.data?.streamKey) {
    throw new Error(`Temporary Livepeer stream creation failed (${response.status})`);
  }
  return response.data;
}

async function createWebhook(url, streamId) {
  const response = await livepeerApi("/webhook", {
    method: "POST",
    body: JSON.stringify(buildTemporaryWebhookInput({
      name: `tvinbio-webhook-e2e-${suffix}`,
      url,
      sharedSecret,
      streamId,
    })),
  });
  if (!response.ok || !response.data?.id) throw new Error(`Temporary webhook creation failed (${response.status})`);
  return response.data;
}

async function deleteWebhook(id) {
  const response = await livepeerApi(`/webhook/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
  return Boolean(response && (response.ok || response.status === 404));
}

async function deleteLivepeerStream(id) {
  const response = await livepeerApi(`/stream/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
  return Boolean(response && (response.ok || response.status === 404));
}

async function livepeerApi(path, init = {}) {
  const response = await fetch(`${LIVEPEER_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${livepeerKey}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    signal: boundedSignal(init.signal),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  return { ok: response.ok, status: response.status, data };
}

async function waitForLivepeerState(expectedActive) {
  const deadline = Date.now() + TIMEOUT_MS;
  let last = { active: false, session: false };
  while (Date.now() < deadline) {
    const [streamResponse, sessionsResponse] = await Promise.all([
      livepeerApi(`/stream/${encodeURIComponent(stream.id)}`),
      livepeerApi(`/session?parentId=${encodeURIComponent(stream.id)}`),
    ]);
    const rows = Array.isArray(sessionsResponse.data)
      ? sessionsResponse.data
      : Array.isArray(sessionsResponse.data?.data) ? sessionsResponse.data.data : [];
    last = {
      active: streamResponse.data?.isActive === true,
      session: rows.some((row) => row?.parentId === stream.id),
    };
    if (last.active === expectedActive && (!expectedActive || last.session)) return last;
    await delay(750);
  }
  throw new Error(`Livepeer did not become ${expectedActive ? "active" : "idle"}`);
}

async function waitForWebhookLog(event, afterMs) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const logs = await readSafeWebhookLogs(webhook.id);
    const match = logs.find((log) => log.event === event && (!log.createdAt || log.createdAt >= afterMs - 2_000));
    if (match) return match;
    await delay(750);
  }
  throw new Error(`${event} webhook was not delivered`);
}

async function readSafeWebhookLogs(id) {
  const response = await livepeerApi(`/webhook/${encodeURIComponent(id)}/log`);
  const rows = Array.isArray(response.data) ? response.data : Array.isArray(response.data?.data) ? response.data.data : [];
  return rows.map((log) => ({
    id: log?.id ?? null,
    event: log?.event ?? null,
    createdAt: Number.isFinite(log?.createdAt) ? log.createdAt : null,
    success: log?.success === true,
    responseStatus: Number.isFinite(log?.response?.status) ? log.response.status : null,
  }));
}

async function insertTemporaryRows(rows) {
  const creator = await db.from("creators").insert(rows.creator);
  if (creator.error) throw new Error(`Temporary creator insert failed: ${creator.error.message}`);
  const streamInsert = await db.from("streams").insert(rows.stream);
  if (streamInsert.error) {
    await db.from("creators").delete().eq("creator_id", creatorId).eq("username", username);
    throw new Error(`Temporary stream insert failed: ${streamInsert.error.message}`);
  }
}

async function readTemporaryStream() {
  const result = await db
    .from("streams")
    .select("is_active")
    .eq("creator_id", creatorId)
    .eq("livepeer_id", stream.id)
    .single();
  if (result.error || !result.data) throw new Error(`Temporary stream read failed: ${result.error?.message ?? "missing"}`);
  return result.data;
}

async function deleteTemporaryRows(livepeerId) {
  const streamDelete = await db.from("streams").delete().eq("creator_id", creatorId).eq("livepeer_id", livepeerId);
  const creatorDelete = await db.from("creators").delete().eq("creator_id", creatorId).eq("username", username);
  if (streamDelete.error || creatorDelete.error) return false;
  const remaining = await db.from("streams").select("playback_id", { count: "exact", head: true }).eq("creator_id", creatorId);
  return !remaining.error && remaining.count === 0;
}

async function waitForServer(child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Test server exited (${child.exitCode})`);
    try {
      const response = await fetch(`${BASE_URL}/api/channels/definitely-missing-${suffix}/stream`, {
        cache: "no-store",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status === 404) return;
    } catch {}
    await delay(250);
  }
  throw new Error("Test server did not become ready");
}

function waitForTunnelOrigin(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("Cloudflare Quick Tunnel did not become ready")), 30_000);
    const consume = (chunk) => {
      output = `${output}${chunk.toString()}`.slice(-24_000);
      const origin = parseQuickTunnelOrigin(output);
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
    child.once("error", reject);
  });
}

async function stopEncoder() {
  if (bridgePublisher) {
    const publisher = bridgePublisher;
    bridgePublisher = null;
    await publisher.stop();
    return true;
  }
  const child = encoder;
  encoder = null;
  if (!child || child.exitCode !== null || child.signalCode) return true;
  child.stdin.write("q\n");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(5_000).then(() => {
      if (child.exitCode === null) child.kill("SIGTERM");
    }),
  ]);
  return child.exitCode === 0 || child.signalCode === "SIGTERM";
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return true;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(3_000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
  return child.exitCode !== null || child.signalCode !== null;
}

async function waitForVisibleAt(locator, timeout) {
  await locator.waitFor({ state: "visible", timeout });
  return Date.now();
}

async function waitFor(predicate, timeout, message) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(100);
  }
  throw new Error(message);
}

function eventToUiMs(eventCreatedAt, visibleAt) {
  return Number.isFinite(eventCreatedAt) ? Math.max(0, visibleAt - eventCreatedAt) : null;
}

function capture(streamHandle, destination) {
  streamHandle?.on("data", (chunk) => destination.push(chunk.toString()));
}

function captureEncoder(streamHandle, destination) {
  streamHandle?.on("data", (chunk) => {
    destination.push(...redactRtmpSecret(chunk.toString(), stream?.streamKey).split(/\r?\n/).filter(Boolean));
  });
}

function redact(value) {
  return redactWebhookDiagnostic(redactRtmpSecret(value, stream?.streamKey), sharedSecret);
}

function boundedSignal(existing, timeoutMs = 15_000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return existing ? AbortSignal.any([existing, timeout]) : timeout;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} missing`);
  return value;
}

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].replace(/^(?:["'])(.*)(?:["'])$/, "$1");
    }
  }
}
