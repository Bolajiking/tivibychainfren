import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTemporaryPublicProfileRows,
  isDecodedVideoFrame,
  playbackRequestKind,
  propagationThresholdsMet,
  relativeTimingMs,
  redactPlaybackUrl,
} from "../scripts/livepeer-public-propagation-helpers.mjs";

test("buildTemporaryPublicProfileRows maps an inactive public channel to the real Livepeer stream", () => {
  const rows = buildTemporaryPublicProfileRows({
    creatorId: "0x1111111111111111111111111111111111111111",
    username: "tvprop-test",
    livepeerId: "lp-stream",
    livepeerPlaybackId: "lp-playback",
  });

  assert.equal(rows.creator.creator_id, "0x1111111111111111111111111111111111111111");
  assert.equal(rows.creator.username, "tvprop-test");
  assert.equal(rows.stream.playback_id, "live-tvprop-test");
  assert.equal(rows.stream.creator_id, rows.creator.creator_id);
  assert.equal(rows.stream.livepeer_id, "lp-stream");
  assert.equal(rows.stream.livepeer_playback_id, "lp-playback");
  assert.equal(rows.stream.is_active, false);
});

test("isDecodedVideoFrame requires decoded dimensions and current media data", () => {
  assert.equal(isDecodedVideoFrame({ readyState: 2, videoWidth: 1280, videoHeight: 720 }), true);
  assert.equal(isDecodedVideoFrame({ readyState: 1, videoWidth: 1280, videoHeight: 720 }), false);
  assert.equal(isDecodedVideoFrame({ readyState: 4, videoWidth: 0, videoHeight: 0 }), false);
});

test("propagationThresholdsMet enforces the public flip and viewer first-frame budgets", () => {
  assert.equal(propagationThresholdsMet({ liveFlipMs: 2_999, firstFrameMs: 3_999 }), true);
  assert.equal(propagationThresholdsMet({ liveFlipMs: 3_001, firstFrameMs: 3_999 }), false);
  assert.equal(propagationThresholdsMet({ liveFlipMs: 2_999, firstFrameMs: 4_001 }), false);
});

test("redactPlaybackUrl removes signed playback query values from diagnostics", () => {
  assert.equal(
    redactPlaybackUrl("https://cdn.example/live.m3u8?token=secret&jwt=claim&tkn=edge&quality=high"),
    "https://cdn.example/live.m3u8?token=%3Credacted%3E&jwt=%3Credacted%3E&tkn=%3Credacted%3E&quality=high",
  );
  assert.equal(redactPlaybackUrl("not a url?accessKey=secret"), "not a url?accessKey=<redacted>");
});

test("playbackRequestKind identifies transport boundaries without query tokens", () => {
  assert.equal(playbackRequestKind("https://cdn.test/webrtc/video+abc?tkn=secret"), "webrtc");
  assert.equal(playbackRequestKind("https://cdn.test/hls/video+abc/index.m3u8?tkn=secret"), "hls-manifest");
  assert.equal(playbackRequestKind("https://cdn.test/hls/video+abc/1.ts?tkn=secret"), "hls-segment");
  assert.equal(playbackRequestKind("https://cdn.test/source/latest.jpg"), "image");
  assert.equal(playbackRequestKind("https://cdn.test/analytics/log"), "analytics");
  assert.equal(playbackRequestKind("not a url"), "other");
});

test("relativeTimingMs reports tap-relative milliseconds only after timing starts", () => {
  assert.equal(relativeTimingMs(0, 9_000), null);
  assert.equal(relativeTimingMs(1_000.4, 2_251.1), 1_251);
});
