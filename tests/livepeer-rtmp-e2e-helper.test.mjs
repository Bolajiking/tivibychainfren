import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRtmpEncoderArgs,
  firstHlsVariantUri,
  redactRtmpSecret,
  rtmpE2ePassed,
} from "../scripts/livepeer-rtmp-e2e-helpers.mjs";

test("RTMP encoder publishes baseline H264 and AAC without exposing the key in arguments", () => {
  const key = "secret-stream-key";
  const args = buildRtmpEncoderArgs(key);

  assert.deepEqual(args.slice(-3), ["-f", "flv", "rtmp://rtmp.livepeer.com/live/secret-stream-key"]);
  assert.ok(args.includes("libx264"));
  assert.ok(args.includes("baseline"));
  assert.ok(args.includes("aac"));
  assert.equal(args.filter((value) => value.includes(key)).length, 1);
});

test("RTMP evidence passes only with active state, matching session, and playable HLS", () => {
  const healthy = {
    isActive: true,
    matchingSessions: 1,
    playbackSources: 3,
    manifestOk: true,
    segments: 2,
  };

  assert.equal(rtmpE2ePassed(healthy), true);
  for (const key of Object.keys(healthy)) {
    const value = key === "isActive" || key === "manifestOk" ? false : 0;
    assert.equal(rtmpE2ePassed({ ...healthy, [key]: value }), false, key);
  }
});

test("HLS variant parsing accepts signed query and hash suffixes", () => {
  assert.equal(
    firstHlsVariantUri("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nindex.m3u8?tkn=abc#live\n"),
    "index.m3u8?tkn=abc#live",
  );
  assert.equal(firstHlsVariantUri("#EXTM3U\nsegment.ts\n"), null);
});

test("RTMP diagnostics redact stream keys from URLs and plain text", () => {
  const key = "secret-stream-key";
  const input = `publish rtmp://rtmp.livepeer.com/live/${key} key=${key}`;
  const redacted = redactRtmpSecret(input, key);

  assert.equal(redacted.includes(key), false);
  assert.match(redacted, /<redacted>/);
});
