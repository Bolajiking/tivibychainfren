import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import WebSocket from "ws";
import { startBridgePublisher } from "./livepeer-bridge-publisher.mjs";
import {
  buildTemporaryPublicProfileRows,
  isDecodedVideoFrame,
  playbackRequestKind,
  propagationThresholdsMet,
  relativeTimingMs,
  redactPlaybackUrl,
} from "./livepeer-public-propagation-helpers.mjs";

const LIVEPEER_API = "https://livepeer.studio/api";
const RTMP_SERVER = "rtmp://rtmp.livepeer.com/live";
const baseUrl = process.env.TVINBIO_TEST_BASE_URL ?? "http://localhost:3000";
// "rtmp" (proven OBS-equivalent encoder) or "bridge" (browser WHIP through the
// production bridge agent — closes the §6 browser-live propagation boxes).
const SOURCE = process.env.TVINBIO_PROPAGATION_SOURCE === "bridge" ? "bridge" : "rtmp";
const maxLiveFlipMs = Number(process.env.TVINBIO_LIVE_FLIP_MAX_MS ?? 3_000);
const maxFirstFrameMs = Number(process.env.TVINBIO_FIRST_FRAME_MAX_MS ?? 4_000);

loadEnv();

const livepeerKey = requiredEnv("LIVEPEER_API_KEY");
const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
  global: {
    fetch: (input, init = {}) => fetch(input, {
      ...init,
      signal: boundedSignal(init.signal),
    }),
  },
  realtime: { transport: WebSocket },
});
const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const creatorId = `0x${randomBytes(20).toString("hex")}`;
const username = `tvprop${suffix}`.slice(0, 30);

let browser;
let testPage;
let encoder;
let bridgePublisher = null;
let livepeerStreamId = "";
let livepeerPlaybackId = "";
let appPlaybackId = "";
let databaseRowsInserted = false;
let blockedRealtimeSockets = 0;
let statusRequests = 0;
let currentStatusGate = null;
let liveFlipStartedAt = 0;
let firstFrameStartedAt = 0;
const appFailures = [];
const encoderErrors = [];
const playbackRequestStartedAt = new Map();
const appPlaybackRequestStartedAt = new Map();
const evidence = {
  username,
  phases: {},
  playbackResponses: [],
  statusResponses: [],
  statusRequestTimeline: [],
  playbackNetworkEvents: [],
  playbackNetworkFailures: [],
  controlPlaneFailures: [],
  pageErrors: [],
  consoleErrors: [],
};

try {
  const serverReadyStartedAt = performance.now();
  await assertServerReady();
  evidence.phases.serverReadyMs = Math.round(performance.now() - serverReadyStartedAt);
  const livepeerStream = await createLivepeerStream();
  livepeerStreamId = livepeerStream.id;
  livepeerPlaybackId = livepeerStream.playbackId;
  if (SOURCE === "bridge") {
    bridgePublisher = await startBridgePublisher({
      streamKey: livepeerStream.streamKey,
      streamId: livepeerStream.id,
    });
    evidence.source = "bridge";
  } else {
    encoder = startEncoder(livepeerStream.streamKey);
    evidence.source = "rtmp";
  }

  const activeEvidence = await waitForLivepeerState(true, 35_000);
  evidence.livepeerActive = activeEvidence;
  if (!activeEvidence.session) throw new Error("Livepeer became active without a matching parent session");

  const rows = buildTemporaryPublicProfileRows({ creatorId, username, livepeerId: livepeerStreamId, livepeerPlaybackId });
  appPlaybackId = rows.stream.playback_id;
  await insertTemporaryRows(rows);
  databaseRowsInserted = true;

  browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  const context = await browser.newContext();
  const page = await context.newPage();
  testPage = page;
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("request", (request) => {
    if (isPlaybackNetworkUrl(request.url())) playbackRequestStartedAt.set(request, performance.now());
    if (request.url().startsWith(baseUrl) && request.url().includes("/api/livepeer/playback/")) {
      appPlaybackRequestStartedAt.set(request, performance.now());
    }
  });
  page.on("requestfailed", (request) => {
    if (isPlaybackNetworkUrl(request.url())) {
      const observedAt = performance.now();
      const requestedAt = playbackRequestStartedAt.get(request);
      playbackRequestStartedAt.delete(request);
      evidence.playbackNetworkFailures.push({
        method: request.method(),
        kind: playbackRequestKind(request.url()),
        url: redactPlaybackUrl(request.url()),
        error: request.failure()?.errorText ?? "unknown",
        requestedSinceTapMs: relativeTimingMs(firstFrameStartedAt, requestedAt),
        failedSinceTapMs: relativeTimingMs(firstFrameStartedAt, observedAt),
        durationMs: relativeTimingMs(requestedAt, observedAt),
      });
    }
  });
  page.on("response", async (response) => {
    const url = response.url();
    const observedAt = performance.now();
    if (url.startsWith(baseUrl) && response.status() >= 400) {
      appFailures.push({ method: response.request().method(), status: response.status(), url });
    }
    if (url.startsWith(baseUrl) && url.includes("/api/livepeer/playback/")) {
      const startedAt = performance.now();
      const requestedAt = appPlaybackRequestStartedAt.get(response.request());
      appPlaybackRequestStartedAt.delete(response.request());
      let state = "unreadable";
      let sources = [];
      try {
        const body = await response.json();
        state = body?.state ?? "missing";
        sources = Array.isArray(body?.sources)
          ? body.sources.map((source) => ({ type: source?.type ?? "unknown", url: redactPlaybackUrl(source?.src ?? "") }))
          : [];
      } catch {}
      evidence.playbackResponses.push({
        status: response.status(),
        state,
        sources,
        observedAtMs: Math.round(startedAt),
        requestedSinceTapMs: relativeTimingMs(firstFrameStartedAt, requestedAt),
        observedSinceTapMs: relativeTimingMs(firstFrameStartedAt, startedAt),
        durationMs: relativeTimingMs(requestedAt, startedAt),
      });
    }
    if (url.startsWith(baseUrl) && url.includes(`/api/channels/${username}/stream`)) {
      let isActive = null;
      try {
        isActive = (await response.json())?.stream?.isActive ?? null;
      } catch {}
      evidence.statusResponses.push({
        status: response.status(),
        isActive,
        observedSinceFlipMs: liveFlipStartedAt ? Math.round(performance.now() - liveFlipStartedAt) : null,
      });
    }
    if (isPlaybackNetworkUrl(url) && response.status() >= 400) {
      evidence.playbackNetworkFailures.push({ method: response.request().method(), status: response.status(), url: redactPlaybackUrl(url) });
    }
    if (isPlaybackNetworkUrl(url) && evidence.playbackNetworkEvents.length < 80) {
      const requestedAt = playbackRequestStartedAt.get(response.request());
      playbackRequestStartedAt.delete(response.request());
      evidence.playbackNetworkEvents.push({
        method: response.request().method(),
        status: response.status(),
        kind: playbackRequestKind(url),
        url: redactPlaybackUrl(url),
        requestedSinceTapMs: relativeTimingMs(firstFrameStartedAt, requestedAt),
        completedSinceTapMs: relativeTimingMs(firstFrameStartedAt, observedAt),
        durationMs: relativeTimingMs(requestedAt, observedAt),
      });
    }
  });
  await page.routeWebSocket((url) => url.pathname.includes("/realtime/"), () => {
    blockedRealtimeSockets += 1;
  });
  await page.route(`**/api/channels/${username}/stream`, async (route) => {
    statusRequests += 1;
    const requestedAt = performance.now();
    const gate = currentStatusGate;
    if (gate) await gate.promise;
    evidence.statusRequestTimeline.push({
      request: statusRequests,
      requestedSinceFlipMs: liveFlipStartedAt ? Math.round(requestedAt - liveFlipStartedAt) : null,
      continuedSinceFlipMs: liveFlipStartedAt ? Math.round(performance.now() - liveFlipStartedAt) : null,
    });
    await route.continue();
  });

  currentStatusGate = deferred();
  const profileNavigationStartedAt = performance.now();
  await page.goto(`${baseUrl}/${username}`, { waitUntil: "domcontentloaded" });
  evidence.phases.profileDomReadyMs = Math.round(performance.now() - profileNavigationStartedAt);
  await page.getByText("OFFLINE", { exact: true }).waitFor({ state: "visible", timeout: 5_000 });
  liveFlipStartedAt = performance.now();
  currentStatusGate.resolve();
  currentStatusGate = null;
  await page.getByText("Live now", { exact: true }).waitFor({ state: "visible", timeout: maxLiveFlipMs + 2_000 });
  const liveFlipMs = Math.round(performance.now() - liveFlipStartedAt);
  evidence.liveFlipMs = liveFlipMs;

  const promotedRow = await readTemporaryStream();
  if (promotedRow.is_active !== true) throw new Error("Public status response did not persist the active stream repair");

  firstFrameStartedAt = performance.now();
  await page.getByRole("button", { name: "Open full player" }).click();
  await page.waitForURL(`${baseUrl}/${username}/live`, { timeout: maxFirstFrameMs + 4_000 });
  evidence.phases.liveRouteDomReadyMs = Math.round(performance.now() - firstFrameStartedAt);
  if (new URL(page.url()).pathname !== `/${username}/live`) {
    throw new Error(`Viewer route redirected instead of joining: ${page.url()}`);
  }
  await page.waitForFunction(
    () => {
      const video = document.querySelector("video");
      return Boolean(video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0);
    },
    undefined,
    { timeout: maxFirstFrameMs + 11_000 },
  );
  const firstFrameMs = Math.round(performance.now() - firstFrameStartedAt);
  evidence.viewerFirstFrameMs = firstFrameMs;
  const videoFrame = await page.locator("video").evaluate((video) => ({
    readyState: video.readyState,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    currentTime: video.currentTime,
    currentSrc: video.currentSrc.replace(/([?&](?:token|jwt|accessKey)=)[^&]+/gi, "$1<redacted>"),
  }));
  if (!isDecodedVideoFrame(videoFrame)) throw new Error("Viewer video element never decoded a real frame");

  await stopEncoder();
  const idleEvidence = await waitForLivepeerState(false, 35_000);
  evidence.livepeerIdle = idleEvidence;
  await forceTemporaryStreamActive();

  currentStatusGate = deferred();
  await page.goto(`${baseUrl}/${username}`, { waitUntil: "domcontentloaded" });
  await page.getByText("Live now", { exact: true }).waitFor({ state: "visible", timeout: 5_000 });
  const idleFlipStartedAt = performance.now();
  currentStatusGate.resolve();
  currentStatusGate = null;
  await page.getByText("OFFLINE", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
  const idleFlipMs = Math.round(performance.now() - idleFlipStartedAt);
  evidence.idleRepairMs = idleFlipMs;
  const repairedIdleRow = await readTemporaryStream();
  if (repairedIdleRow.is_active !== false) throw new Error("Explicit Livepeer idle did not clear stale app live state");

  const thresholdsMet = propagationThresholdsMet({ liveFlipMs, firstFrameMs })
    && liveFlipMs <= maxLiveFlipMs
    && firstFrameMs <= maxFirstFrameMs;
  const result = {
    ...evidence,
    livepeer: {
      active: activeEvidence.active,
      session: activeEvidence.session,
      idle: !idleEvidence.active,
    },
    realtimeSocketsBlocked: blockedRealtimeSockets,
    statusRequests,
    liveFlipMs,
    viewerFirstFrameMs: firstFrameMs,
    idleRepairMs: idleFlipMs,
    video: videoFrame,
    appFailures,
    thresholdsMet,
  };
  console.log(JSON.stringify(result, null, 2));

  if (blockedRealtimeSockets < 1) throw new Error("The viewer never attempted a Realtime connection");
  if (appFailures.length > 0) throw new Error("TVinBio returned one or more failed app responses");
  if (!thresholdsMet) throw new Error("Public propagation missed one or more premium thresholds");
} catch (error) {
  evidence.realtimeSocketsBlocked = blockedRealtimeSockets;
  evidence.statusRequests = statusRequests;
  evidence.appFailures = appFailures;
  if (testPage && !testPage.isClosed()) {
    evidence.videoAtFailure = await testPage.locator("video").first().evaluate((video) => ({
      readyState: video.readyState,
      networkState: video.networkState,
      paused: video.paused,
      muted: video.muted,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      currentTime: video.currentTime,
      sourceType: video.getAttribute("data-livepeer-source-type"),
      currentSrc: redactPlaybackUrl(video.currentSrc),
      mediaError: video.error ? { code: video.error.code, message: video.error.message } : null,
    })).catch(() => null);
  }
  evidence.error = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify(evidence, null, 2));
  throw error;
} finally {
  currentStatusGate?.resolve();
  await stopEncoder();
  await browser?.close().catch(() => {});
  if (databaseRowsInserted) await deleteTemporaryRows();
  if (livepeerStreamId) await deleteLivepeerStream(livepeerStreamId);
  if (encoderErrors.length) console.error(`Encoder diagnostics: ${encoderErrors.slice(-8).join(" | ")}`);
}

function loadEnv() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} missing`);
  return value;
}

async function assertServerReady() {
  const response = await fetch(`${baseUrl}/api/channels/definitely-missing-${suffix}/stream`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 404) throw new Error(`Expected TVinBio dev server at ${baseUrl}, received ${response.status}`);
}

async function livepeerApi(path, init = {}) {
  const response = await fetch(`${LIVEPEER_API}${path}`, {
    ...init,
    signal: boundedSignal(init.signal),
    headers: {
      authorization: `Bearer ${livepeerKey}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  return { ok: response.ok, status: response.status, data, text };
}

async function createLivepeerStream() {
  const response = await livepeerApi("/stream", {
    method: "POST",
    body: JSON.stringify({ name: `tvinbio-public-propagation-${suffix}`, record: false }),
  });
  if (!response.ok || !response.data?.id || !response.data?.playbackId || !response.data?.streamKey) {
    throw new Error(`Temporary Livepeer stream creation failed (${response.status})`);
  }
  return response.data;
}

function startEncoder(streamKey) {
  const child = spawn("ffmpeg", [
    "-hide_banner",
    "-loglevel", "warning",
    "-re",
    "-f", "lavfi",
    "-i", "testsrc2=size=1280x720:rate=30",
    "-f", "lavfi",
    "-i", "sine=frequency=880:sample_rate=48000",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-profile:v", "baseline",
    "-pix_fmt", "yuv420p",
    "-g", "60",
    "-keyint_min", "60",
    "-b:v", "2200k",
    "-maxrate", "2200k",
    "-bufsize", "4400k",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", "48000",
    "-f", "flv",
    `${RTMP_SERVER}/${streamKey}`,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    encoderErrors.push(...String(chunk).split(/\r?\n/).filter(Boolean));
  });
  return child;
}

async function stopEncoder() {
  if (bridgePublisher) {
    const publisher = bridgePublisher;
    bridgePublisher = null;
    await publisher.stop();
    return;
  }
  const child = encoder;
  if (!child || child.exitCode !== null || child.signalCode) return;
  child.stdin.write("q\n");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(5_000).then(() => child.kill("SIGTERM")),
  ]);
}

async function waitForLivepeerState(expectedActive, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = { active: false, session: false };
  while (Date.now() < deadline) {
    try {
      const [stream, sessions] = await Promise.all([
        livepeerApi(`/stream/${encodeURIComponent(livepeerStreamId)}`),
        livepeerApi(`/session?parentId=${encodeURIComponent(livepeerStreamId)}`),
      ]);
      const sessionRows = Array.isArray(sessions.data) ? sessions.data : Array.isArray(sessions.data?.data) ? sessions.data.data : [];
      last = {
        active: stream.data?.isActive === true,
        session: sessionRows.some((session) => session?.parentId === livepeerStreamId),
      };
    } catch (error) {
      evidence.controlPlaneFailures.push({
        phase: expectedActive ? "active" : "idle",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (last.active === expectedActive && (!expectedActive || last.session)) return last;
    await sleep(1_000);
  }
  throw new Error(`Livepeer did not become ${expectedActive ? "active" : "idle"}: ${JSON.stringify(last)}`);
}

async function insertTemporaryRows(rows) {
  const creator = await db.from("creators").insert(rows.creator);
  if (creator.error) throw new Error(`Temporary creator insert failed: ${creator.error.message}`);
  const stream = await db.from("streams").insert(rows.stream);
  if (stream.error) {
    await db.from("creators").delete().eq("creator_id", creatorId).eq("username", username);
    throw new Error(`Temporary stream insert failed: ${stream.error.message}`);
  }
}

async function readTemporaryStream() {
  const result = await db
    .from("streams")
    .select("is_active,viewer_count")
    .eq("playback_id", appPlaybackId)
    .eq("creator_id", creatorId)
    .eq("livepeer_id", livepeerStreamId)
    .single();
  if (result.error || !result.data) throw new Error(`Temporary stream read failed: ${result.error?.message ?? "missing"}`);
  return result.data;
}

async function forceTemporaryStreamActive() {
  const result = await db
    .from("streams")
    .update({ is_active: true, viewer_count: 27 })
    .eq("playback_id", appPlaybackId)
    .eq("creator_id", creatorId)
    .eq("livepeer_id", livepeerStreamId);
  if (result.error) throw new Error(`Could not stage stale active state: ${result.error.message}`);
}

async function deleteTemporaryRows() {
  const stream = await db
    .from("streams")
    .delete()
    .eq("playback_id", appPlaybackId)
    .eq("creator_id", creatorId)
    .eq("livepeer_id", livepeerStreamId);
  if (stream.error) console.error(`Temporary stream cleanup failed: ${stream.error.message}`);
  const creator = await db.from("creators").delete().eq("creator_id", creatorId).eq("username", username);
  if (creator.error) console.error(`Temporary creator cleanup failed: ${creator.error.message}`);
}

async function deleteLivepeerStream(id) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await livepeerApi(`/stream/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (response.ok || response.status === 404) return;
      lastError = new Error(`Livepeer returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(1_000 * (attempt + 1));
  }
  console.error(`Temporary Livepeer cleanup failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPlaybackNetworkUrl(value) {
  try {
    const host = new URL(value).hostname;
    return host === "livepeercdn.studio" || host.endsWith("livepeer.studio") || host.endsWith("lp-playback.studio");
  } catch {
    return false;
  }
}

function boundedSignal(existing, timeoutMs = 15_000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return existing ? AbortSignal.any([existing, timeout]) : timeout;
}
