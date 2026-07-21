import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const store = await loadTsModule(new URL("../src/lib/bridge/session-store.ts", import.meta.url));

/**
 * Contract tests for BridgeSessionStore. The in-memory implementation is the
 * reference; any shared implementation (Supabase, for multi-instance serverless)
 * must satisfy exactly these assertions.
 */

function attempt(overrides = {}) {
  return {
    attemptId: "attempt-1",
    creatorId: "0xabc",
    livepeerId: "lp-1",
    category: "mobile",
    leaseId: "lease-1",
    whipUpstreamUrl: "https://bridge.example/whip",
    publishToken: "publish-token-1",
    createdAtMs: 1_000,
    ...overrides,
  };
}

test("attempts round-trip and are retrievable by id and by creator", async () => {
  const s = store.createInMemorySessionStore();
  assert.equal(await s.getAttempt("attempt-1"), null);
  assert.equal(await s.getAttemptByCreator("0xabc"), null);

  await s.putAttempt(attempt());
  assert.deepEqual(await s.getAttempt("attempt-1"), attempt());
  assert.deepEqual(await s.getAttemptByCreator("0xabc"), attempt());
});

test("one live attempt per creator: a newer attempt takes over the creator index", async () => {
  const s = store.createInMemorySessionStore();
  await s.putAttempt(attempt());
  await s.putAttempt(attempt({ attemptId: "attempt-2" }));

  const current = await s.getAttemptByCreator("0xabc");
  assert.equal(current.attemptId, "attempt-2");
});

test("deleting an attempt clears the creator index only when it still owns it", async () => {
  const s = store.createInMemorySessionStore();
  await s.putAttempt(attempt());
  await s.putAttempt(attempt({ attemptId: "attempt-2" }));

  // Deleting the superseded attempt must not orphan the live one.
  await s.deleteAttempt("attempt-1");
  assert.equal(await s.getAttempt("attempt-1"), null);
  assert.equal((await s.getAttemptByCreator("0xabc")).attemptId, "attempt-2");

  await s.deleteAttempt("attempt-2");
  assert.equal(await s.getAttemptByCreator("0xabc"), null);
});

test("deleting an unknown attempt is a no-op", async () => {
  const s = store.createInMemorySessionStore();
  await s.deleteAttempt("nope");
  assert.equal(await s.getAttempt("nope"), null);
});

test("lease events are scoped per creator and filtered to the requested window", async () => {
  const s = store.createInMemorySessionStore();
  await s.recordLeaseEvent("0xabc", 1_000);
  await s.recordLeaseEvent("0xabc", 5_000);
  await s.recordLeaseEvent("0xdef", 6_000);

  const all = await s.leaseEvents("0xabc", 0);
  assert.deepEqual(all.creatorEvents, [1_000, 5_000]);
  assert.deepEqual(all.agentEvents, [1_000, 5_000, 6_000], "agent window spans every creator");

  const recent = await s.leaseEvents("0xabc", 4_000);
  assert.deepEqual(recent.creatorEvents, [5_000], "events older than the window are excluded");
  assert.deepEqual(recent.agentEvents, [5_000, 6_000]);

  const other = await s.leaseEvents("0xdef", 0);
  assert.deepEqual(other.creatorEvents, [6_000], "creator windows never bleed into each other");
});

test("registering a resource returns the replaced upstream url so it can be torn down", async () => {
  let n = 0;
  const s = store.createInMemorySessionStore({ mintId: () => `res-${++n}` });

  const first = await s.registerResource("attempt-1", "https://up/a");
  assert.deepEqual(first, { resourceId: "res-1", replacedUpstreamUrl: null });

  const second = await s.registerResource("attempt-1", "https://up/b");
  assert.deepEqual(second, { resourceId: "res-2", replacedUpstreamUrl: "https://up/a" });
});

test("resources resolve only for the matching attempt and resource id", async () => {
  let n = 0;
  const s = store.createInMemorySessionStore({ mintId: () => `res-${++n}` });
  await s.registerResource("attempt-1", "https://up/a");

  assert.equal(await s.resolveResource("attempt-1", "res-1"), "https://up/a");
  assert.equal(await s.resolveResource("attempt-1", "res-nope"), null, "stale resource id is refused");
  assert.equal(await s.resolveResource("attempt-other", "res-1"), null, "cross-attempt access is refused");
});

test("releasing a resource returns its upstream url once and then clears it", async () => {
  let n = 0;
  const s = store.createInMemorySessionStore({ mintId: () => `res-${++n}` });
  await s.registerResource("attempt-1", "https://up/a");

  assert.equal(await s.releaseResource("attempt-1", "res-1"), "https://up/a");
  assert.equal(await s.releaseResource("attempt-1", "res-1"), null, "release is idempotent");
  assert.equal(await s.resolveResource("attempt-1", "res-1"), null);
});

test("releaseAttemptResources drops whatever resource the attempt still holds", async () => {
  let n = 0;
  const s = store.createInMemorySessionStore({ mintId: () => `res-${++n}` });
  await s.registerResource("attempt-1", "https://up/a");

  assert.equal(await s.releaseAttemptResources("attempt-1"), "https://up/a");
  assert.equal(await s.releaseAttemptResources("attempt-1"), null);
  assert.equal(await s.releaseAttemptResources("attempt-unknown"), null);
});
