import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const gating = await loadTsModule(new URL("../src/lib/livepeer/playback-gating.ts", import.meta.url));

test("live playback sources are hidden until Livepeer reports the stream live", () => {
  assert.equal(gating.shouldExposePlaybackSources({ mode: "live", live: false, sourceCount: 2 }), false);
  assert.equal(gating.shouldExposePlaybackSources({ mode: "live", live: true, sourceCount: 2 }), true);
});

test("vod playback sources can resolve when the asset is not live", () => {
  assert.equal(gating.shouldExposePlaybackSources({ mode: "vod", live: false, sourceCount: 2 }), true);
});

test("playback sources are hidden when Livepeer has no usable source", () => {
  assert.equal(gating.shouldExposePlaybackSources({ mode: "live", live: true, sourceCount: 0 }), false);
  assert.equal(gating.shouldExposePlaybackSources({ mode: "vod", live: false, sourceCount: 0 }), false);
});

test("live watch player only mounts for an active, unlocked stream with a playback id", () => {
  assert.equal(gating.shouldMountLivePlayback({ isActive: true, locked: false, playbackId: "playback-123" }), true);
  assert.equal(gating.shouldMountLivePlayback({ isActive: false, locked: false, playbackId: "playback-123" }), false);
  assert.equal(gating.shouldMountLivePlayback({ isActive: true, locked: true, playbackId: "playback-123" }), false);
  assert.equal(gating.shouldMountLivePlayback({ isActive: true, locked: false, playbackId: "" }), false);
});

test("live playback bounds WebRTC fallback inside the first-frame budget and autoplays muted", () => {
  const policy = gating.playbackTransportPolicy("live", true);
  assert.equal(policy.lowLatency, true);
  assert.ok(policy.timeoutMs <= 2_000);
  assert.ok(policy.webRtcFailureCacheMs >= 30_000);
  assert.equal(policy.volume, 0);
});

test("VOD playback skips WebRTC and preserves audible user-initiated playback", () => {
  assert.deepEqual(gating.playbackTransportPolicy("vod", false), {
    lowLatency: false,
    timeoutMs: 10_000,
    webRtcFailureCacheMs: 0,
    volume: 0.85,
  });
});

test("live playback exposes Livepeer sources immediately while VOD keeps manifest validation", () => {
  assert.equal(gating.shouldHealthCheckHlsSource("live"), false);
  assert.equal(gating.shouldHealthCheckHlsSource("vod"), true);
});
