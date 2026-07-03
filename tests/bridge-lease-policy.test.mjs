import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const policy = await loadTsModule(new URL("../src/lib/bridge/lease-policy.ts", import.meta.url));

const T0 = 1_750_000_000_000;

function lease(overrides = {}) {
  return {
    createdAtMs: T0,
    lastHeartbeatAtMs: null,
    publishing: false,
    lastPublisherSeenAtMs: null,
    ...overrides,
  };
}

test("spec §7.4 constants", () => {
  assert.equal(policy.BRIDGE_LEASE_UNPUBLISHED_TTL_MS, 60_000);
  assert.equal(policy.BRIDGE_LEASE_HEARTBEAT_INTERVAL_MS, 10_000);
  assert.equal(policy.BRIDGE_LEASE_HEARTBEAT_TIMEOUT_MS, 30_000);
  assert.equal(policy.BRIDGE_LEASE_PUBLISH_EXTENSION_MS, 15_000);
  assert.equal(policy.BRIDGE_LEASE_MAX_DURATION_MS, 6 * 60 * 60_000);
  assert.equal(policy.BRIDGE_LEASE_CREATOR_RATE_PER_MINUTE, 10);
  assert.equal(policy.BRIDGE_LEASE_AGENT_RATE_PER_MINUTE, 60);
});

test("an unpublished lease with heartbeats expires at the 60 s TTL", () => {
  const heartbeats = lease({ lastHeartbeatAtMs: T0 + 55_000 });
  assert.deepEqual(policy.evaluateBridgeLease(heartbeats, T0 + 60_000), { expired: false, reason: null });
  assert.deepEqual(policy.evaluateBridgeLease(heartbeats, T0 + 60_001), {
    expired: true,
    reason: "unpublished_ttl",
  });
});

test("a lease whose app-side owner stops heartbeating expires after 30 s", () => {
  const abandoned = lease({ lastHeartbeatAtMs: T0 + 10_000 });
  assert.deepEqual(policy.evaluateBridgeLease(abandoned, T0 + 40_000), { expired: false, reason: null });
  assert.deepEqual(policy.evaluateBridgeLease(abandoned, T0 + 40_001), {
    expired: true,
    reason: "heartbeat_timeout",
  });
  const neverBeat = lease();
  assert.equal(policy.evaluateBridgeLease(neverBeat, T0 + 30_001).reason, "heartbeat_timeout");
});

test("a publishing lease is extended by publisher presence, not browser heartbeats", () => {
  const publishing = lease({ publishing: true, lastPublisherSeenAtMs: T0 + 90_000, lastHeartbeatAtMs: T0 + 5_000 });
  assert.deepEqual(policy.evaluateBridgeLease(publishing, T0 + 100_000), { expired: false, reason: null });
  assert.deepEqual(policy.evaluateBridgeLease(publishing, T0 + 105_001), {
    expired: true,
    reason: "publisher_lost",
  });
});

test("the six-hour hard cap bounds even a healthy publishing lease", () => {
  const sixHours = 6 * 60 * 60_000;
  const capped = lease({ publishing: true, lastPublisherSeenAtMs: T0 + sixHours - 1_000 });
  assert.deepEqual(policy.evaluateBridgeLease(capped, T0 + sixHours), {
    expired: true,
    reason: "max_duration",
  });
});

test("creator lease creation is limited to 10 per minute", () => {
  const events = Array.from({ length: 10 }, (_, i) => T0 + i * 1_000);
  const denied = policy.shouldAllowLeaseCreation({ creatorEvents: events, agentEvents: events, nowMs: T0 + 30_000 });
  assert.deepEqual(denied, { allowed: false, reason: "lease_rate_limited" });
  const allowed = policy.shouldAllowLeaseCreation({
    creatorEvents: events.slice(0, 9),
    agentEvents: events,
    nowMs: T0 + 30_000,
  });
  assert.deepEqual(allowed, { allowed: true });
});

test("agent-wide lease creation is limited to 60 per minute", () => {
  const agentEvents = Array.from({ length: 60 }, (_, i) => T0 + i * 500);
  const denied = policy.shouldAllowLeaseCreation({ creatorEvents: [], agentEvents, nowMs: T0 + 40_000 });
  assert.deepEqual(denied, { allowed: false, reason: "lease_rate_limited" });
});

test("rate-limit windows slide: events older than one minute stop counting", () => {
  const events = Array.from({ length: 10 }, (_, i) => T0 + i * 1_000);
  const verdict = policy.shouldAllowLeaseCreation({
    creatorEvents: events,
    agentEvents: events,
    nowMs: T0 + 9_000 + 60_001,
  });
  assert.deepEqual(verdict, { allowed: true });
});
