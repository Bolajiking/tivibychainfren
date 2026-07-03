import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const v = await loadTsModule(new URL("../src/lib/creator-videos.ts", import.meta.url));

test("parseVideoDraftInput requires a title and defaults to free", () => {
  assert.deepEqual(v.parseVideoDraftInput({ title: "   " }), { ok: false, error: "missing_video_title" });
  const ok = v.parseVideoDraftInput({ title: "  My  Replay  " });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.title, "My Replay");
  assert.equal(ok.value.viewMode, "free");
  assert.equal(ok.value.amount, 0);
});

test("parseVideoDraftInput validates a paid amount", () => {
  assert.deepEqual(v.parseVideoDraftInput({ title: "x", viewMode: "one-time", amount: 0 }), { ok: false, error: "bad_video_amount" });
  const ok = v.parseVideoDraftInput({ title: "x", viewMode: "monthly", amount: "12.5" });
  assert.equal(ok.value.amount, 12.5);
  assert.equal(ok.value.viewMode, "monthly");
});

test("parseVideoDraftInput clamps duration", () => {
  assert.equal(v.parseVideoDraftInput({ title: "x", durationSec: -5 }).value.durationSec, 0);
  assert.equal(v.parseVideoDraftInput({ title: "x", durationSec: 999999 }).value.durationSec, 86400);
});

test("parseVideoDraftInput accepts only https thumbnail urls", () => {
  assert.equal(v.parseVideoDraftInput({ title: "x", thumbnailUrl: "https://cdn.example/poster.jpg" }).value.thumbnailUrl, "https://cdn.example/poster.jpg");
  assert.equal(v.parseVideoDraftInput({ title: "x", thumbnailUrl: "blob:http://local/poster" }).value.thumbnailUrl, undefined);
});

test("videoDraftToRow builds a processing row with our ids", () => {
  const row = v.videoDraftToRow(
    { title: "Clip", viewMode: "free", amount: 0, durationSec: 30, thumbnailUrl: "https://cdn.example/poster.jpg" },
    { playbackId: "vod-1", creatorId: "0xabc", thumbColor: "#123456" },
  );
  assert.equal(row.playback_id, "vod-1");
  assert.equal(row.creator_id, "0xabc");
  assert.equal(row.status, "processing");
  assert.equal(row.thumb_color, "#123456");
  assert.equal(row.thumbnail_url, "https://cdn.example/poster.jpg");
  assert.equal(row.view_mode, "free");
});

test("newVideoPlaybackId is unique and url-safe", () => {
  const a = v.newVideoPlaybackId();
  const b = v.newVideoPlaybackId();
  assert.notEqual(a, b);
  assert.match(a, /^vod-[a-z0-9-]+$/);
});
