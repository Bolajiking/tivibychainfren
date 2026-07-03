import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const state = await loadTsModule(new URL("../src/lib/channel-stream-state.ts", import.meta.url));

const baseStream = {
  playbackId: "live-a",
  creatorId: "creator",
  title: "Morning show",
  viewMode: "free",
  amount: 0,
  isActive: false,
  viewerCount: 0,
  thumbColor: "#111",
  paidUsers: [],
  donationPresets: [],
  record: true,
};

test("applyCreatorStreamChange promotes a newly active stream for an open public channel", () => {
  const active = { ...baseStream, playbackId: "live-b", isActive: true, startedAt: "2026-06-25T09:00:00Z" };
  assert.deepEqual(
    state.applyCreatorStreamChange(baseStream, { type: "upsert", stream: active }),
    active,
  );
});

test("applyCreatorStreamChange updates the current stream when OBS/webhook marks it idle", () => {
  const current = { ...baseStream, isActive: true, startedAt: "2026-06-25T09:00:00Z" };
  const idle = { ...current, isActive: false, viewerCount: 0 };
  assert.deepEqual(
    state.applyCreatorStreamChange(current, { type: "upsert", stream: idle }),
    idle,
  );
});

test("mergePolledCreatorStream does not replace the visible stream with an unrelated offline row", () => {
  const current = { ...baseStream, playbackId: "live-a", isActive: true };
  const unrelatedOffline = { ...baseStream, playbackId: "live-old", isActive: false };
  assert.deepEqual(state.mergePolledCreatorStream(current, unrelatedOffline), current);
});

test("mergePolledCreatorStream accepts the initial stream from the polling fallback", () => {
  assert.deepEqual(state.mergePolledCreatorStream(null, baseStream), baseStream);
});
