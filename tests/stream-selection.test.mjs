import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const selection = await loadTsModule(new URL("../src/lib/stream-selection.ts", import.meta.url));

test("selectActiveStreamRow chooses the newest active stream when duplicate active rows exist", () => {
  const rows = [
    streamRow("live-old", true, "2026-06-20T08:00:00.000Z", "2026-06-19T10:00:00.000Z"),
    streamRow("live-offline-newer-created", false, null, "2026-06-20T08:30:00.000Z"),
    streamRow("live-current", true, "2026-06-20T08:20:00.000Z", "2026-06-18T10:00:00.000Z"),
  ];

  assert.equal(selection.selectActiveStreamRow(rows)?.playback_id, "live-current");
});

test("selectCanonicalStreamRow prefers active streams before offline latest rows", () => {
  const rows = [
    streamRow("live-offline-newer-created", false, null, "2026-06-20T08:30:00.000Z"),
    streamRow("live-current", true, "2026-06-20T08:20:00.000Z", "2026-06-18T10:00:00.000Z"),
  ];

  assert.equal(selection.selectCanonicalStreamRow(rows)?.playback_id, "live-current");
});

function streamRow(playbackId, isActive, startedAt, createdAt) {
  return {
    playback_id: playbackId,
    creator_id: "0xcreator",
    title: playbackId,
    is_active: isActive,
    started_at: startedAt,
    created_at: createdAt,
  };
}
