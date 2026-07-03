import { readFileSync } from "node:fs";
import { chromium, firefox, webkit } from "playwright";
import {
  browserContextProfile,
  browserLaunchProfile,
  harnessScenario,
  readyRoomPreflightPassed,
} from "./dashboard-obs-fallback-helpers.mjs";

const API = "https://livepeer.studio/api";
const baseUrl = process.env.TVINBIO_TEST_BASE_URL ?? "http://localhost:3001";
const runCount = positiveInt(process.env.TVINBIO_FALLBACK_RUNS ?? "1");
const maxHandoffMs = positiveInt(process.env.TVINBIO_FALLBACK_MAX_MS ?? "20000");
const browserName = process.env.TVINBIO_BROWSER ?? "chromium";
const viewportName = process.env.TVINBIO_VIEWPORT ?? "desktop";
const scenario = harnessScenario(process.env.TVINBIO_SCENARIO ?? "fallback");
const realMedia = process.env.TVINBIO_MEDIA === "real";

loadEnv();
if (!process.env.LIVEPEER_API_KEY) throw new Error("LIVEPEER_API_KEY missing");

const authHeaders = { authorization: `Bearer ${process.env.LIVEPEER_API_KEY}` };
const stream = await createTemporaryStream();
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`);
const { grantMediaPermissions, syntheticMedia = false, ...launchOptions } = browserLaunchProfile(browserName, { realMedia });
const mediaSource = realMedia ? "real" : syntheticMedia ? "synthetic" : "browser";
const browser = await browserType.launch(launchOptions);

const outcomes = [];
try {
  for (let run = 1; run <= runCount; run += 1) {
    outcomes.push(await runFallbackCheck(run));
  }
} finally {
  await browser.close();
  await livepeer(`/stream/${encodeURIComponent(stream.id)}`, { method: "DELETE" }).catch(() => null);
}

const passed = outcomes.filter((outcome) => outcome.passed).length;
console.log(JSON.stringify({
  mode: "dashboard-obs-fallback",
  browser: browserName,
  viewport: viewportName,
  scenario,
  mediaSource,
  passed,
  total: outcomes.length,
  maxHandoffMs,
  outcomes,
}, null, 2));
process.exit(passed === outcomes.length ? 0 : 2);

async function runFallbackCheck(run) {
  const context = await browser.newContext(browserContextProfile(viewportName));
  if (grantMediaPermissions && scenario !== "permission-denied") {
    await context.grantPermissions(["camera", "microphone"], { origin: new URL(baseUrl).origin });
  }
  if (syntheticMedia || scenario === "permission-denied") {
    await context.addInitScript(installMediaHarness, {
      permissionDenied: scenario === "permission-denied",
      syntheticMedia,
    });
  }
  await context.addInitScript(({ creator, user }) => {
    localStorage.setItem("tvinbio-session", JSON.stringify({
      state: {
        user,
        subscribedTo: [],
        subscriptions: [],
        unlocked: [],
        creator,
        persona: "owner",
        navCollapsed: false,
        transactions: [],
      },
      version: 0,
    }));
  }, { creator: fixtureCreator(), user: fixtureUser() });

  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const navigations = [];
  const failedResponses = [];
  const whipResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(redact(message.text()));
  });
  page.on("pageerror", (error) => pageErrors.push(redact(error.message)));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  page.on("response", (response) => {
    if (response.url().includes("/webrtc/")) {
      whipResponses.push({ method: response.request().method(), status: response.status(), url: redact(response.url()) });
    }
    if (response.status() >= 400) {
      failedResponses.push({ method: response.request().method(), status: response.status(), url: redact(response.url()) });
    }
  });
  await installAppApiFixtures(page);

  try {
    await page.goto(`${baseUrl}/dashboard/broadcast`, { waitUntil: "domcontentloaded" });
    const goLive = page.getByRole("button", { name: "Go live" });
    await goLive.waitFor({ state: "visible", timeout: 20_000 });
    if (scenario === "permission-denied") {
      return await verifyPermissionDenied({
        run,
        page,
        goLive,
        consoleErrors,
        pageErrors,
        navigations,
        failedResponses,
        whipResponses,
      });
    }
    const preflightStartedAt = Date.now();
    await page.waitForFunction(() => {
      const video = document.querySelector("video");
      const stream = video?.srcObject;
      const ready = stream instanceof MediaStream
        && stream.getAudioTracks().some((track) => track.readyState === "live")
        && stream.getVideoTracks().some((track) => track.readyState === "live")
        && video.readyState >= 2;
      if (!ready) {
        window.__tvinbioReadyRoomSample = null;
        return false;
      }
      const previous = window.__tvinbioReadyRoomSample;
      if (!previous || previous.streamId !== stream.id) {
        window.__tvinbioReadyRoomSample = { streamId: stream.id, since: performance.now() };
        return false;
      }
      return performance.now() - previous.since >= 500;
    }, undefined, { timeout: 20_000 });
    const readyRoom = await page.locator("video").evaluate((video) => {
      const stream = video.srcObject instanceof MediaStream ? video.srcObject : null;
      return {
        readyState: video.readyState,
        audioTracks: stream?.getAudioTracks().filter((track) => track.readyState === "live").length ?? 0,
        videoTracks: stream?.getVideoTracks().filter((track) => track.readyState === "live").length ?? 0,
        audioLabels: stream?.getAudioTracks().map((track) => track.label) ?? [],
        videoLabels: stream?.getVideoTracks().map((track) => track.label) ?? [],
        muted: video.muted,
        autoplay: video.autoplay,
        playsInline: video.hasAttribute("playsinline"),
      };
    });
    const preflightMs = Date.now() - preflightStartedAt;
    if (!readyRoomPreflightPassed(readyRoom)) throw new Error(`Ready-room preflight failed: ${JSON.stringify(readyRoom)}`);
    const interruptedTrack = scenario === "track-interruption" ? await interruptCameraTrack(page) : null;
    const startedAt = Date.now();
    await goLive.click();
    const interruption = interruptedTrack ? await awaitMediaRecovery(page, interruptedTrack) : null;

    await page.getByText(stream.streamKey, { exact: true }).waitFor({ state: "visible", timeout: maxHandoffMs + 5_000 });
    await page.getByText("Browser live needs attention", { exact: true }).waitFor({ state: "visible", timeout: 2_000 });
    const handoffMs = Date.now() - startedAt;
    const appApiErrors = failedResponses.filter((response) => response.url.startsWith(`${baseUrl}/api/`));
    return {
      run,
      browser: browserName,
      viewport: viewportName,
      scenario,
      mediaSource,
      preflightMs,
      readyRoom,
      interruption,
      handoffMs,
      keyVisible: true,
      obsPanelVisible: await page.getByText(/STREAM WITH OBS/).isVisible(),
      passed: handoffMs <= maxHandoffMs && appApiErrors.length === 0,
      consoleErrors,
      pageErrors,
      navigations,
      failedResponses,
      appApiErrors,
      whipResponses,
    };
  } catch (error) {
    const pageState = await readDashboardState(page).catch(() => null);
    return {
      run,
      handoffMs: null,
      keyVisible: false,
      obsPanelVisible: false,
      passed: false,
      error: redact(error instanceof Error ? error.message : String(error)),
      pageState,
      consoleErrors,
      pageErrors,
      navigations,
      failedResponses,
      whipResponses,
    };
  } finally {
    await context.close();
  }
}

async function verifyPermissionDenied({
  run,
  page,
  goLive,
  consoleErrors,
  pageErrors,
  navigations,
  failedResponses,
  whipResponses,
}) {
  await page.getByText("Browser live needs attention", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  await page.getByText("Camera or microphone access was blocked. Allow access, then start again.", { exact: true })
    .waitFor({ state: "visible", timeout: 2_000 });
  const pageState = await readDashboardState(page);
  const passed = pageState.status === "idle"
    && pageState.enabled === "false"
    && whipResponses.length === 0
    && await goLive.isVisible();
  return {
    run,
    browser: browserName,
    viewport: viewportName,
    scenario,
    mediaSource,
    handoffMs: null,
    keyVisible: false,
    obsPanelVisible: await page.getByText(/STREAM WITH OBS/).isVisible(),
    passed,
    pageState,
    consoleErrors,
    pageErrors,
    navigations,
    failedResponses,
    appApiErrors: failedResponses.filter((response) => response.url.startsWith(`${baseUrl}/api/`)),
    whipResponses,
  };
}

async function interruptCameraTrack(page) {
  return page.locator("video").evaluate((video) => {
    const stream = video.srcObject instanceof MediaStream ? video.srcObject : null;
    const videoTrack = stream?.getVideoTracks().find((track) => track.readyState === "live");
    if (!stream || !videoTrack) throw new Error("No live camera track available to interrupt");
    const snapshot = { streamId: stream.id, videoTrackId: videoTrack.id };
    videoTrack.stop();
    return snapshot;
  });
}

async function awaitMediaRecovery(page, before) {
  await page.waitForFunction(({ streamId, videoTrackId }) => {
    const video = document.querySelector("video");
    const stream = video?.srcObject;
    if (!(stream instanceof MediaStream)) return false;
    return stream.id !== streamId
      && stream.getAudioTracks().some((track) => track.readyState === "live")
      && stream.getVideoTracks().some((track) => track.readyState === "live" && track.id !== videoTrackId);
  }, before, { timeout: 10_000 });
  const after = await page.locator("video").evaluate((video) => {
    const stream = video.srcObject instanceof MediaStream ? video.srcObject : null;
    return {
      streamId: stream?.id ?? null,
      audioTracks: stream?.getAudioTracks().filter((track) => track.readyState === "live").length ?? 0,
      videoTracks: stream?.getVideoTracks().filter((track) => track.readyState === "live").length ?? 0,
    };
  });
  return { before, after, recovered: before.streamId !== after.streamId && after.audioTracks > 0 && after.videoTracks > 0 };
}

function installMediaHarness({ permissionDenied, syntheticMedia }) {
  if (!navigator.mediaDevices) return;
  const state = { installed: true, permissionDenied, syntheticMedia, calls: 0, lastError: null };
  Object.defineProperty(window, "__tvinbioMediaHarness", { configurable: true, value: state });
  if (permissionDenied) {
    const deny = async () => {
      state.calls += 1;
      throw new DOMException("Permission denied by dashboard harness", "NotAllowedError");
    };
    patchGetUserMedia(deny);
    return;
  }
  if (!syntheticMedia) return;
  const resources = [];
  Object.defineProperty(window, "__tvinbioSyntheticMedia", { configurable: true, value: resources });
  const getSyntheticMedia = async (constraints = {}) => {
    state.calls += 1;
    try {
      const tracks = [];
      if (constraints.video !== false) {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 360;
        const context = canvas.getContext("2d");
        let frame = 0;
        const paint = () => {
          if (!context) return;
          context.fillStyle = frame % 2 === 0 ? "#101820" : "#123a48";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = "#5ee7f2";
          context.fillRect((frame * 7) % canvas.width, 150, 56, 56);
          frame += 1;
        };
        paint();
        const timer = window.setInterval(paint, 66);
        const stream = canvas.captureStream(15);
        tracks.push(...stream.getVideoTracks());
        resources.push({ canvas, stream, timer });
      }
      if (constraints.audio !== false) {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioContextCtor();
        const oscillator = audioContext.createOscillator();
        const destination = audioContext.createMediaStreamDestination();
        oscillator.connect(destination);
        oscillator.start();
        tracks.push(...destination.stream.getAudioTracks());
        resources.push({ audioContext, oscillator, destination });
      }
      return new MediaStream(tracks);
    } catch (error) {
      state.lastError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      throw error;
    }
  };
  patchGetUserMedia(getSyntheticMedia);

  function patchGetUserMedia(getUserMedia) {
    if (typeof MediaDevices !== "undefined") {
      Object.defineProperty(MediaDevices.prototype, "getUserMedia", { configurable: true, value: getUserMedia });
    }
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: getUserMedia });
  }
}

async function readDashboardState(page) {
  return page.evaluate(() => {
    const surface = document.querySelector("[data-tvinbio-broadcast-status]");
    if (!surface) {
      return {
        url: location.href,
        surfaceMissing: true,
        title: document.title,
        bodyText: document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 1200),
        mainText: document.querySelector("main")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 1200) ?? "",
        htmlTail: document.body.innerHTML.slice(-1200),
      };
    }
    const video = surface.querySelector("video");
    const stream = video?.srcObject instanceof MediaStream ? video.srcObject : null;
    return {
      url: location.href,
      surfaceMissing: false,
      status: surface.getAttribute("data-tvinbio-broadcast-status"),
      enabled: surface.getAttribute("data-tvinbio-broadcast-enabled"),
      peer: surface.getAttribute("data-tvinbio-broadcast-peer"),
      visibleText: surface.textContent?.replace(/\s+/g, " ").trim().slice(0, 800) ?? "",
      audioTracks: stream?.getAudioTracks().map((track) => ({ readyState: track.readyState, enabled: track.enabled })) ?? [],
      videoTracks: stream?.getVideoTracks().map((track) => ({ readyState: track.readyState, enabled: track.enabled })) ?? [],
      videoReadyState: video?.readyState ?? null,
      whipInitialized: video?.getAttribute("data-livepeer-video-whip-initialized") ?? null,
      mediaHarness: window.__tvinbioMediaHarness ?? null,
    };
  });
}

async function installAppApiFixtures(page) {
  const payload = fixtureProfile();
  await page.route("**/api/profile", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ...payload }) }));
  await page.route("**/api/livepeer/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/api/livepeer/stream/${stream.id}`) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(stream) });
      return;
    }
    if (url.pathname === "/api/livepeer/session") {
      const response = await livepeer(`/session?parentId=${encodeURIComponent(stream.id)}`);
      await route.fulfill({ status: response.status, contentType: "application/json", body: response.text });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/stream", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, stream: fixtureProfile().stream }),
  }));
}

async function createTemporaryStream() {
  const response = await livepeer("/stream", {
    method: "POST",
    body: JSON.stringify({ name: `tvinbio-dashboard-fallback-${Date.now()}`, record: false }),
  });
  if (!response.ok) throw new Error(`Livepeer stream create failed (${response.status})`);
  const value = JSON.parse(response.text);
  if (!value?.id || !value?.playbackId || !value?.streamKey) throw new Error("Livepeer stream response incomplete");
  return value;
}

async function livepeer(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...authHeaders, ...(init.body ? { "content-type": "application/json" } : {}) },
  });
  return { ok: response.ok, status: response.status, text: await response.text() };
}

function fixtureProfile() {
  const creator = fixtureCreator();
  return {
    creator,
    stream: {
      playbackId: "dashboard-fallback-stream",
      creatorId: creator.creatorId,
      title: "Fallback verification",
      description: "Restricted-network browser-live verification",
      viewMode: "free",
      amount: 0,
      isActive: false,
      viewerCount: 0,
      thumbColor: "#1f2937",
      paidUsers: [],
      donationPresets: [3, 5, 10],
      record: false,
      livepeerId: stream.id,
      livepeerPlaybackId: stream.playbackId,
    },
    videos: [],
    products: [],
    featuredProducts: [],
    notifications: [],
    orders: [],
  };
}

function fixtureCreator() {
  return {
    creatorId: "0xfa9d00000000000000000000000000000000e2e1",
    username: "fallback-check",
    displayName: "Fallback Check",
    avatarColor: "#2563eb",
    subscriberCount: 0,
  };
}

function fixtureUser() {
  const walletAddress = fixtureCreator().creatorId;
  return { walletAddress, walletAddresses: [walletAddress], displayName: "Fallback Check", balanceUsd: 0 };
}

function loadEnv() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function positiveInt(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`Expected a positive integer, received ${value}`);
  return number;
}

function redact(value) {
  return String(value).split(stream.streamKey).join("<redacted-stream-key>");
}
