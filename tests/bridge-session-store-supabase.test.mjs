import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const supa = await loadTsModule(new URL("../src/lib/bridge/session-store-supabase.ts", import.meta.url));
const box = await loadTsModule(new URL("../src/lib/bridge/secret-box.ts", import.meta.url));

const SECRET = "control-secret-abc";
// Realistic epoch clock: the freshness floor is now - 6h, so a toy clock would
// put the floor in negative time and nothing would ever look stale.
const NOW = 1_784_000_000_000;
const SIX_HOURS_MS = 6 * 60 * 60_000;

/**
 * Minimal in-memory stand-in for the service-role PostgREST client. Only the
 * chain shapes this store actually uses are supported, so an unsupported call
 * throws loudly rather than silently passing.
 */
function fakeClient() {
  const tables = { broadcast_bridge_attempts: [], broadcast_bridge_lease_events: [] };

  function builder(table) {
    let mode = "select";
    let payload = null;
    let conflictKey = null;
    const filters = [];

    // Always read the live array so a delete in one builder is visible to the next.
    const apply = () => tables[table].filter((row) => filters.every((f) => f(row)));

    function run() {
      if (mode === "upsert") {
        const idx = tables[table].findIndex((r) => r[conflictKey] === payload[conflictKey]);
        if (idx >= 0) tables[table][idx] = { ...payload };
        else tables[table].push({ ...payload });
      } else if (mode === "insert") {
        tables[table].push({ ...payload });
      } else if (mode === "update") {
        for (const row of apply()) Object.assign(row, payload);
      } else if (mode === "delete") {
        for (const row of apply()) {
          tables[table].splice(tables[table].indexOf(row), 1);
        }
      }
      return { data: apply(), error: null };
    }

    const chain = {
      select() {
        mode = "select";
        return chain;
      },
      eq(column, value) {
        filters.push((row) => row[column] === value);
        return chain;
      },
      gte(column, value) {
        filters.push((row) => Number(row[column]) >= Number(value));
        return chain;
      },
      upsert(row, opts) {
        mode = "upsert";
        payload = row;
        conflictKey = opts?.onConflict ?? null;
        return chain;
      },
      insert(row) {
        mode = "insert";
        payload = row;
        return chain;
      },
      update(row) {
        mode = "update";
        payload = row;
        return chain;
      },
      delete() {
        mode = "delete";
        return chain;
      },
      maybeSingle() {
        return Promise.resolve({ data: apply()[0] ?? null, error: null });
      },
      // Thenable, so `await client.from(t).upsert(...)` executes the mutation.
      then(resolve, reject) {
        return Promise.resolve()
          .then(run)
          .then(resolve, reject);
      },
    };
    return chain;
  }

  return { client: { from: (table) => builder(table) }, tables };
}

function makeStore(overrides = {}) {
  const { client, tables } = fakeClient();
  let n = 0;
  const store = supa.createSupabaseSessionStore({
    client,
    controlSecret: SECRET,
    mintId: () => `res-${++n}`,
    nowMs: () => NOW,
    ...overrides,
  });
  return { store, tables };
}

function attempt(overrides = {}) {
  return {
    attemptId: "attempt-1",
    creatorId: "0xabc",
    livepeerId: "lp-1",
    category: "mobile",
    leaseId: "lease-1",
    whipUpstreamUrl: "https://bridge.example/whip",
    publishToken: "publish-token-1",
    createdAtMs: NOW,
    ...overrides,
  };
}

test("attempts round-trip through the database unchanged", async () => {
  const { store } = makeStore();
  await store.putAttempt(attempt());
  assert.deepEqual(await store.getAttempt("attempt-1"), attempt());
  assert.deepEqual(await store.getAttemptByCreator("0xabc"), attempt());
});

test("NO credential is written in the clear", async () => {
  const { store, tables } = makeStore();
  await store.putAttempt(attempt());
  const row = tables.broadcast_bridge_attempts[0];
  const serialized = JSON.stringify(row);

  assert.ok(!serialized.includes("publish-token-1"), "publish token must never hit the table in the clear");
  assert.ok(!serialized.includes("bridge.example"), "the WHIP capability url must be sealed too");
  assert.equal(row.publish_token_sealed.split(".")[0], "v1");
  assert.equal(box.openBridgeSecret(row.publish_token_sealed, SECRET), "publish-token-1");
});

test("a rotated or wrong control secret fails closed instead of leaking a broken session", async () => {
  const sealed = makeStore();
  await sealed.store.putAttempt(attempt());

  // Same row, read back by a store holding a different key (post-rotation).
  const wrongKey = makeStore({ controlSecret: "different-secret" });
  wrongKey.tables.broadcast_bridge_attempts.push(sealed.tables.broadcast_bridge_attempts[0]);

  const got = await wrongKey.store.getAttempt("attempt-1");
  assert.equal(got.publishToken, null, "unusable credential surfaces as null, not garbage");
  assert.equal(got.whipUpstreamUrl, null, "the proxy then fails closed with bridge_unavailable");
});

test("a new attempt replaces the creator's previous one atomically", async () => {
  const { store, tables } = makeStore();
  await store.putAttempt(attempt());
  await store.putAttempt(attempt({ attemptId: "attempt-2" }));

  assert.equal(tables.broadcast_bridge_attempts.length, 1, "one live attempt per creator");
  assert.equal((await store.getAttemptByCreator("0xabc")).attemptId, "attempt-2");
});

test("attempts older than the max lease duration are treated as gone", async () => {
  const { store } = makeStore();
  await store.putAttempt(attempt({ createdAtMs: NOW - SIX_HOURS_MS - 60_000 }));
  assert.equal(await store.getAttempt("attempt-1"), null, "stale rows never resurrect a broadcast");
  assert.equal(await store.getAttemptByCreator("0xabc"), null);
});

test("deleting an attempt removes the row", async () => {
  const { store, tables } = makeStore();
  await store.putAttempt(attempt());
  await store.deleteAttempt("attempt-1");
  assert.equal(tables.broadcast_bridge_attempts.length, 0);
  assert.equal(await store.getAttempt("attempt-1"), null);
});

test("lease events partition into creator and agent windows", async () => {
  const { store } = makeStore();
  await store.recordLeaseEvent("0xabc", 1_000);
  await store.recordLeaseEvent("0xabc", 5_000);
  await store.recordLeaseEvent("0xdef", 6_000);

  const all = await store.leaseEvents("0xabc", 0);
  assert.deepEqual(all.creatorEvents, [1_000, 5_000]);
  assert.deepEqual(all.agentEvents, [1_000, 5_000, 6_000]);

  const recent = await store.leaseEvents("0xabc", 4_000);
  assert.deepEqual(recent.creatorEvents, [5_000]);
  assert.deepEqual(recent.agentEvents, [5_000, 6_000]);
});

test("resource registration returns the replaced upstream and seals the new one", async () => {
  const { store, tables } = makeStore();
  await store.putAttempt(attempt());

  const first = await store.registerResource("attempt-1", "https://up/a");
  assert.deepEqual(first, { resourceId: "res-1", replacedUpstreamUrl: null });

  const second = await store.registerResource("attempt-1", "https://up/b");
  assert.deepEqual(second, { resourceId: "res-2", replacedUpstreamUrl: "https://up/a" });

  const row = tables.broadcast_bridge_attempts[0];
  assert.ok(!JSON.stringify(row).includes("https://up/b"), "resource upstream is sealed at rest");
});

test("resources resolve only for the matching attempt and resource id", async () => {
  const { store } = makeStore();
  await store.putAttempt(attempt());
  await store.registerResource("attempt-1", "https://up/a");

  assert.equal(await store.resolveResource("attempt-1", "res-1"), "https://up/a");
  assert.equal(await store.resolveResource("attempt-1", "res-nope"), null);
  assert.equal(await store.resolveResource("attempt-other", "res-1"), null);
});

test("releasing a resource clears it and is idempotent", async () => {
  const { store } = makeStore();
  await store.putAttempt(attempt());
  await store.registerResource("attempt-1", "https://up/a");

  assert.equal(await store.releaseResource("attempt-1", "res-1"), "https://up/a");
  assert.equal(await store.releaseResource("attempt-1", "res-1"), null);
  assert.equal(await store.resolveResource("attempt-1", "res-1"), null);
});

test("releaseAttemptResources drops whatever the attempt still holds", async () => {
  const { store } = makeStore();
  await store.putAttempt(attempt());
  await store.registerResource("attempt-1", "https://up/a");

  assert.equal(await store.releaseAttemptResources("attempt-1"), "https://up/a");
  assert.equal(await store.releaseAttemptResources("attempt-1"), null);
  assert.equal(await store.releaseAttemptResources("attempt-unknown"), null);
});

test("a missing client is a loud failure, never a silent no-op", async () => {
  const store = supa.createSupabaseSessionStore({ client: null, controlSecret: SECRET });
  await assert.rejects(() => store.getAttempt("attempt-1"), /bridge_session_store_unavailable/);
});
