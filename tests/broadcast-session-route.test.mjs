import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const mod = await loadTsModule(new URL("../src/lib/bridge/broadcast-session.ts", import.meta.url));

const T0 = 1_750_000_000_000;
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0.0.0 Mobile Safari/537.36";
const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0.0.0 Safari/537.36";

function fakeAgent(overrides = {}) {
  const calls = { created: [], revoked: [], heartbeats: [], statusQueries: [] };
  const agent = {
    health: async () => true,
    createLease: async (input) => {
      calls.created.push(input);
      return {
        leaseId: input.leaseId,
        whipUrl: `https://127.0.0.1:8889/${input.leaseId}/whip`,
        publishToken: `token-${input.leaseId}`,
        expiresAt: null,
      };
    },
    heartbeatLease: async (leaseId) => {
      calls.heartbeats.push(leaseId);
      return true;
    },
    revokeLease: async (leaseId) => {
      calls.revoked.push(leaseId);
    },
    leaseStatus: async (leaseId) => {
      calls.statusQueries.push(leaseId);
      return { status: "created", publishing: false };
    },
    ...overrides,
  };
  return { agent, calls };
}

function createManager(overrides = {}) {
  const { agent, calls } = fakeAgent(overrides.agentOverrides ?? {});
  let counter = 0;
  const repoRows = [];
  const manager = mod.createBroadcastSessionManager({
    agent: overrides.agent === null ? null : agent,
    bridgeEnabled: overrides.bridgeEnabled ?? true,
    loadStreamKey: overrides.loadStreamKey ?? (async () => "stream-key-xyz"),
    leaseRepo: {
      record: async (row) => {
        repoRows.push(row);
      },
    },
    mintId: () => `id-${++counter}`,
    nowMs: overrides.nowMs ?? (() => T0),
  });
  return { manager, calls, repoRows };
}

test("mobile create returns a bridge-first plan with a lease and no secrets", async () => {
  const { manager, calls } = createManager();
  const result = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: MOBILE_UA });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.plan.targets.map((t) => t.kind),
    ["tvinbio-bridge"],
  );
  assert.equal(result.plan.livepeerId, "lp-1");
  assert.equal(result.plan.obsFallbackAtMs, 18_000);
  assert.ok(result.plan.bridgeLeaseId);
  assert.match(result.plan.targets[0].ingestUrl, /^\/api\/bridge\/attempts\/[^/]+\/whip$/);

  const serialized = JSON.stringify(result.plan);
  assert.ok(!serialized.toLowerCase().includes("rtmp"));
  assert.ok(!serialized.includes("stream-key-xyz"));
  assert.ok(!serialized.includes("token-"), "publish credential stays server-side");
  assert.ok(!serialized.includes("127.0.0.1"), "upstream MediaMTX URL never reaches the browser");

  assert.equal(calls.created.length, 1);
  assert.equal(calls.created[0].rtmpUrl, "rtmp://rtmp.livepeer.com/live/stream-key-xyz");
});

test("desktop create orders direct before bridge and includes the owner WHIP url", async () => {
  const { manager } = createManager();
  const result = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: DESKTOP_UA });
  assert.deepEqual(
    result.plan.targets.map((t) => t.kind),
    ["livepeer-direct", "tvinbio-bridge"],
  );
  assert.equal(result.plan.targets[0].ingestUrl, "https://playback.livepeer.studio/webrtc/stream-key-xyz");
  assert.equal(result.plan.targets[0].deadlineMs, 6_000);
});

test("bridge disabled: desktop gets direct-only, mobile gets bridge_unavailable", async () => {
  const { manager } = createManager({ agent: null, bridgeEnabled: false });
  const desktop = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: DESKTOP_UA });
  assert.deepEqual(
    desktop.plan.targets.map((t) => t.kind),
    ["livepeer-direct"],
  );
  const mobile = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: MOBILE_UA });
  assert.deepEqual(mobile.plan.targets, []);
  assert.equal(mobile.plan.unavailableReason, "bridge_unavailable");
});

test("an unhealthy agent removes the bridge target", async () => {
  const { manager, calls } = createManager({ agentOverrides: { health: async () => false } });
  const result = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: DESKTOP_UA });
  assert.deepEqual(
    result.plan.targets.map((t) => t.kind),
    ["livepeer-direct"],
  );
  assert.equal(calls.created.length, 0, "no lease is created against an unhealthy agent");
});

test("a failed lease create degrades the plan instead of failing the start", async () => {
  const { manager } = createManager({ agentOverrides: { createLease: async () => null } });
  const desktop = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: DESKTOP_UA });
  assert.deepEqual(
    desktop.plan.targets.map((t) => t.kind),
    ["livepeer-direct"],
  );
  const mobile = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: MOBILE_UA });
  assert.equal(mobile.plan.unavailableReason, "bridge_unavailable");
});

test("a missing stream key fails cleanly", async () => {
  const { manager } = createManager({ loadStreamKey: async () => null });
  const result = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: DESKTOP_UA });
  assert.deepEqual(result, { ok: false, error: "ingest_unavailable" });
});

test("creating a new attempt revokes the owner's previous unpublished attempt", async () => {
  const { manager, calls } = createManager();
  const first = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: MOBILE_UA });
  const second = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: MOBILE_UA });
  assert.equal(calls.revoked.length, 1);
  assert.equal(calls.revoked[0], first.plan.bridgeLeaseId);
  assert.equal(manager.getAttempt(first.plan.attemptId, "0xabc"), null, "old attempt is gone");
  assert.ok(manager.getAttempt(second.plan.attemptId, "0xabc"));
});

test("a publishing attempt is not silently evicted by a new create", async () => {
  const { manager, calls } = createManager({
    agentOverrides: { leaseStatus: async () => ({ status: "publishing", publishing: true }) },
  });
  const first = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: MOBILE_UA });
  const second = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: MOBILE_UA });
  assert.equal(second.ok, false);
  assert.equal(second.error, "broadcast_in_progress");
  assert.deepEqual(calls.revoked, [], "the active lease was not revoked");
  assert.ok(manager.getAttempt(first.plan.attemptId, "0xabc"));
});

test("attempt access is owner-scoped", async () => {
  const { manager } = createManager();
  const { plan } = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: MOBILE_UA });
  assert.ok(manager.getAttempt(plan.attemptId, "0xabc"));
  assert.equal(manager.getAttempt(plan.attemptId, "0xother"), null);
  assert.equal(manager.getAttempt("attempt-unknown", "0xabc"), null);
});

test("revoke is idempotent, owner-checked, and releases the lease", async () => {
  const { manager, calls } = createManager();
  const { plan } = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: MOBILE_UA });

  const wrongOwner = await manager.revoke(plan.attemptId, "0xother");
  assert.deepEqual(wrongOwner, { ok: false, error: "not_resource_owner" });

  const revoked = await manager.revoke(plan.attemptId, "0xabc");
  assert.deepEqual(revoked, { ok: true });
  assert.deepEqual(calls.revoked, [plan.bridgeLeaseId]);

  const again = await manager.revoke(plan.attemptId, "0xabc");
  assert.deepEqual(again, { ok: true }, "second revoke is a no-op success");
  assert.equal(calls.revoked.length, 1);
});

test("heartbeat forwards to the agent for the owner only", async () => {
  const { manager, calls } = createManager();
  const { plan } = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: MOBILE_UA });
  assert.deepEqual(await manager.heartbeat(plan.attemptId, "0xabc"), { ok: true });
  assert.deepEqual(calls.heartbeats, [plan.bridgeLeaseId]);
  assert.deepEqual(await manager.heartbeat(plan.attemptId, "0xother"), { ok: false, error: "not_resource_owner" });
  assert.deepEqual(await manager.heartbeat("attempt-unknown", "0xabc"), { ok: false, error: "attempt_not_found" });
});

test("lease creation is rate limited per creator without blocking the direct path", async () => {
  let now = T0;
  const { manager } = createManager({ nowMs: () => now });
  for (let i = 0; i < 10; i += 1) {
    now += 100;
    const result = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: MOBILE_UA });
    assert.equal(result.ok, true, `create ${i} allowed`);
    await manager.revoke(result.plan.attemptId, "0xabc");
  }
  now += 100;
  const limited = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: MOBILE_UA });
  assert.equal(limited.ok, true);
  assert.deepEqual(limited.plan.targets, []);
  assert.equal(limited.plan.unavailableReason, "lease_rate_limited");

  const desktop = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: DESKTOP_UA });
  assert.deepEqual(
    desktop.plan.targets.map((t) => t.kind),
    ["livepeer-direct"],
    "desktop still starts direct while lease creation is limited",
  );
});

test("lease lifecycle rows are recorded without secrets", async () => {
  const { manager, repoRows } = createManager();
  const { plan } = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: MOBILE_UA });
  await manager.revoke(plan.attemptId, "0xabc");
  assert.ok(repoRows.length >= 2, "created + ended rows recorded");
  const serialized = JSON.stringify(repoRows);
  assert.ok(!serialized.toLowerCase().includes("rtmp"));
  assert.ok(!serialized.includes("token-"));
  assert.ok(!serialized.includes("stream-key-xyz"));
});

test("status reports lease publishing state, owner-scoped", async () => {
  const { manager } = createManager({
    agentOverrides: { leaseStatus: async () => ({ status: "publishing", publishing: true }) },
  });
  const { plan } = await manager.create({ creatorId: "0xabc", livepeerId: "lp-1", userAgent: MOBILE_UA });
  assert.deepEqual(await manager.status(plan.attemptId, "0xabc"), { ok: true, publishing: true });
  assert.deepEqual(await manager.status(plan.attemptId, "0xother"), { ok: false, error: "not_resource_owner" });
  assert.deepEqual(await manager.status("nope", "0xabc"), { ok: false, error: "attempt_not_found" });
});
