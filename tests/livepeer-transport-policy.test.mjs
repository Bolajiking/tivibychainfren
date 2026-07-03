import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const policy = await loadTsModule(new URL("../src/lib/livepeer/transport-policy.ts", import.meta.url));

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const DIRECT_URL = "https://livepeer.studio/webrtc/abcd-1234";
const BRIDGE_URL = "/api/bridge/attempts/attempt-1/whip";

test("device classification retains only the category, never the raw user agent", () => {
  assert.equal(policy.classifyBroadcastDevice(ANDROID_UA), "mobile");
  assert.equal(policy.classifyBroadcastDevice(IOS_UA), "mobile");
  assert.equal(policy.classifyBroadcastDevice(MAC_UA), "desktop");
  assert.equal(policy.classifyBroadcastDevice(WINDOWS_UA), "desktop");
  assert.equal(policy.classifyBroadcastDevice(""), "desktop");
});

test("mobile receives bridge-first only when the bridge is healthy", () => {
  const result = policy.planTransportTargets({
    category: "mobile",
    directIngestUrl: DIRECT_URL,
    bridgeIngestUrl: BRIDGE_URL,
    bridgeHealthy: true,
  });
  assert.deepEqual(
    result.targets.map((target) => target.kind),
    ["tvinbio-bridge"],
  );
  assert.equal(result.targets[0].ingestUrl, BRIDGE_URL);
  assert.equal(result.targets[0].deadlineMs, 18_000);
  assert.equal(result.obsFallbackAtMs, 18_000);
  assert.equal(result.unavailableReason, undefined);
});

test("desktop receives direct with a six-second soft window then bridge", () => {
  const result = policy.planTransportTargets({
    category: "desktop",
    directIngestUrl: DIRECT_URL,
    bridgeIngestUrl: BRIDGE_URL,
    bridgeHealthy: true,
  });
  assert.deepEqual(
    result.targets.map((target) => target.kind),
    ["livepeer-direct", "tvinbio-bridge"],
  );
  assert.equal(result.targets[0].ingestUrl, DIRECT_URL);
  assert.equal(result.targets[0].deadlineMs, policy.BROADCAST_DIRECT_SOFT_WINDOW_MS);
  assert.equal(policy.BROADCAST_DIRECT_SOFT_WINDOW_MS, 6_000);
  assert.equal(result.targets[1].deadlineMs, 18_000);
});

test("desktop falls back to direct-only when the bridge is unhealthy", () => {
  for (const bridge of [
    { bridgeIngestUrl: BRIDGE_URL, bridgeHealthy: false },
    { bridgeIngestUrl: null, bridgeHealthy: true },
  ]) {
    const result = policy.planTransportTargets({
      category: "desktop",
      directIngestUrl: DIRECT_URL,
      ...bridge,
    });
    assert.deepEqual(
      result.targets.map((target) => target.kind),
      ["livepeer-direct"],
    );
    assert.equal(result.targets[0].deadlineMs, 18_000);
    assert.equal(result.unavailableReason, undefined);
  }
});

test("mobile without a healthy bridge receives an explicit unavailable result, not a direct target", () => {
  for (const bridge of [
    { bridgeIngestUrl: BRIDGE_URL, bridgeHealthy: false },
    { bridgeIngestUrl: null, bridgeHealthy: true },
  ]) {
    const result = policy.planTransportTargets({
      category: "mobile",
      directIngestUrl: DIRECT_URL,
      ...bridge,
    });
    assert.deepEqual(result.targets, []);
    assert.equal(result.unavailableReason, "bridge_unavailable");
    assert.equal(result.obsFallbackAtMs, 18_000);
  }
});

test("plan output never embeds the raw user agent or an RTMP destination", () => {
  const result = policy.planTransportTargets({
    category: "mobile",
    directIngestUrl: DIRECT_URL,
    bridgeIngestUrl: BRIDGE_URL,
    bridgeHealthy: true,
  });
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("Mozilla"));
  assert.ok(!serialized.toLowerCase().includes("rtmp"));
});
