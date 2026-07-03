import assert from "node:assert/strict";
import { test } from "node:test";

const leases = await import("../bridge/agent/leases.mjs");

const T0 = 1_750_000_000_000;

function createStore(overrides = {}) {
  let now = T0;
  let counter = 0;
  const store = leases.createLeaseStore({
    nowMs: () => now,
    mintPath: () => `path-${++counter}`,
    mintToken: () => `token-${counter}`,
    ...overrides,
  });
  return { store, advance: (ms) => (now += ms), setNow: (ms) => (now = ms) };
}

function create(store, id = "lease-1") {
  return store.createLease({
    leaseId: id,
    attemptId: `attempt-${id}`,
    creatorId: "0xabc",
    rtmpUrl: "rtmp://rtmp.livepeer.com/live/secret-key",
  });
}

test("lease lifecycle: created → publishing → ended", () => {
  const { store } = createStore();
  const lease = create(store);
  assert.equal(lease.path, "path-1");
  assert.equal(lease.publishToken, "token-1");
  assert.equal(store.get("lease-1").status, "created");

  assert.equal(store.markPublishing("path-1"), true);
  assert.equal(store.get("lease-1").status, "publishing");
  assert.equal(store.get("lease-1").publishing, true);

  assert.equal(store.revoke("lease-1", "creator_stop"), true);
  assert.equal(store.get("lease-1"), null, "ended leases are dropped so credentials die");
});

test("duplicate lease ids are rejected", () => {
  const { store } = createStore();
  create(store);
  assert.equal(create(store), null);
});

test("publish authorization requires the exact live path and credential", () => {
  const { store } = createStore();
  create(store);
  assert.equal(store.authorizePublish("path-1", "token-1"), true);
  assert.equal(store.authorizePublish("path-1", "wrong"), false);
  assert.equal(store.authorizePublish("path-404", "token-1"), false);
  store.revoke("lease-1", "revoked");
  assert.equal(store.authorizePublish("path-1", "token-1"), false, "revoked lease no longer publishes");
});

test("destination is served only for a live path and never appears in describe()", () => {
  const { store } = createStore();
  create(store);
  assert.equal(store.destinationFor("path-1"), "rtmp://rtmp.livepeer.com/live/secret-key");
  assert.equal(store.destinationFor("path-404"), null);

  const described = JSON.stringify(store.describe());
  assert.ok(!described.includes("secret-key"));
  assert.ok(!described.toLowerCase().includes("rtmp://"));
  assert.ok(!described.includes("token-1"), "publish credential is not described");
});

test("sweeper: unpublished lease dies at the 60 s TTL", () => {
  const { store, advance } = createStore();
  create(store);
  advance(59_000);
  store.heartbeat("lease-1");
  assert.deepEqual(store.sweep(), []);
  advance(1_001);
  const swept = store.sweep();
  assert.equal(swept.length, 1);
  assert.equal(swept[0].leaseId, "lease-1");
  assert.equal(swept[0].reason, "unpublished_ttl");
  assert.equal(store.get("lease-1"), null);
});

test("sweeper: missed heartbeats kill an unpublished lease at 30 s", () => {
  const { store, advance } = createStore();
  create(store);
  advance(30_001);
  assert.equal(store.sweep()[0].reason, "heartbeat_timeout");
});

test("sweeper: a publishing lease survives on publisher presence and dies 15 s after it is lost", () => {
  const { store, advance } = createStore();
  create(store);
  store.markPublishing("path-1");
  for (let i = 0; i < 10; i += 1) {
    advance(10_000);
    store.publisherSeen("path-1");
  }
  assert.deepEqual(store.sweep(), [], "publisher presence extends far past the unpublished TTL");
  advance(15_001);
  assert.equal(store.sweep()[0].reason, "publisher_lost");
});

test("sweeper: the six-hour cap ends even a healthy publishing lease", () => {
  const { store, advance } = createStore();
  create(store);
  store.markPublishing("path-1");
  const sixHours = 6 * 60 * 60_000;
  let elapsed = 0;
  while (elapsed < sixHours) {
    advance(10_000);
    elapsed += 10_000;
    store.publisherSeen("path-1");
    if (elapsed < sixHours && store.sweep().length > 0) assert.fail("swept before the cap");
  }
  assert.equal(store.sweep()[0].reason, "max_duration");
});

test("publisher gone flips publishing off and rearms the unpublished countdown", () => {
  const { store, advance } = createStore();
  create(store);
  store.markPublishing("path-1");
  advance(120_000);
  store.publisherSeen("path-1");
  assert.equal(store.markPublisherGone("path-1"), true);
  assert.equal(store.get("lease-1").publishing, false);
  advance(30_001);
  assert.equal(store.sweep()[0].reason, "heartbeat_timeout", "a dropped publisher does not keep the lease alive");
});

test("revoke is idempotent and stats track created vs ended", () => {
  const { store } = createStore();
  create(store);
  assert.equal(store.revoke("lease-1", "x"), true);
  assert.equal(store.revoke("lease-1", "x"), false);
  const stats = store.stats();
  assert.equal(stats.active, 0);
  assert.equal(stats.created, 1);
  assert.equal(stats.ended, 1);
});
