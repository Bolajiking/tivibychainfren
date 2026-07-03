import { chromium } from "playwright";

const baseUrl = process.env.TVINBIO_TEST_BASE_URL ?? "http://localhost:3000";
const username = process.env.TVINBIO_TEST_USERNAME ?? "kalashnikov";
const maxFlipMs = positiveInt(process.env.TVINBIO_LIVE_FLIP_MAX_MS ?? "3000");
const trigger = process.env.TVINBIO_LIVE_FLIP_TRIGGER === "focus" ? "focus" : "poll";
const statusUrl = `${baseUrl}/api/channels/${encodeURIComponent(username)}/stream`;

const initialResponse = await fetch(statusUrl, { cache: "no-store" });
const initialPayload = await initialResponse.json();
if (!initialResponse.ok || !initialPayload?.stream) throw new Error("Public stream fixture unavailable");

const offlineStream = { ...initialPayload.stream, isActive: false, startedAt: undefined };
const activeStream = { ...offlineStream, isActive: true, startedAt: new Date().toISOString() };
let serveActive = false;
let statusReads = 0;
let activeResponses = 0;
let realtimeSocketsBlocked = 0;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.routeWebSocket((url) => url.pathname.includes("/realtime/"), () => {
  realtimeSocketsBlocked += 1;
});
await page.route(`**/api/channels/${username}/stream`, async (route) => {
  statusReads += 1;
  if (serveActive) activeResponses += 1;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "cache-control": "no-store" },
    body: JSON.stringify({ ok: true, stream: serveActive ? activeStream : offlineStream }),
  });
});

let outcome;
try {
  await page.goto(`${baseUrl}/${encodeURIComponent(username)}`, { waitUntil: "domcontentloaded" });
  await page.getByText("OFFLINE", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(250);
  const startedAt = Date.now();
  serveActive = true;
  if (trigger === "focus") await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByText("Live now", { exact: true }).waitFor({ state: "visible", timeout: maxFlipMs + 2_000 });
  const flipMs = Date.now() - startedAt;
  outcome = {
    flipMs,
    statusReads,
    activeResponses,
    realtimeSocketsBlocked,
    liveVisible: true,
    passed: flipMs <= maxFlipMs && activeResponses > 0 && realtimeSocketsBlocked > 0,
  };
} catch (error) {
  outcome = {
    flipMs: null,
    statusReads,
    activeResponses,
    realtimeSocketsBlocked,
    liveVisible: false,
    passed: false,
    error: error instanceof Error ? error.message : String(error),
  };
} finally {
  await browser.close();
}

console.log(JSON.stringify({ mode: "public-live-polling", trigger, maxFlipMs, outcome }, null, 2));
process.exit(outcome.passed ? 0 : 2);

function positiveInt(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`Expected a positive integer, received ${value}`);
  return number;
}
