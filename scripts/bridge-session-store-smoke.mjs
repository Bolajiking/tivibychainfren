/**
 * Manual smoke test: BridgeSessionStore against a REAL Postgres.
 *
 * The unit suite covers this store against a fake PostgREST client, which
 * verifies query *shapes* but not real database behaviour. Two things can only
 * be proven here:
 *   - upsert(..., { onConflict: "creator_id" }) actually landing on the unique
 *     constraint (the one-live-publisher rule)
 *   - maybeSingle() returning null rather than erroring when no row matches
 *
 * Not part of `npm test` — needs live credentials. Run after migration 0019 or
 * any later change to the bridge session schema.
 *
 *   node scripts/bridge-session-store-smoke.mjs
 *
 * Writes only rows whose creator_id is namespaced `smoke-test-*`, and removes
 * them in a finally block. It cannot touch a real creator's broadcast.
 */
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { loadTsModule } from "../tests/helpers/load-ts-module.mjs";

const SIX_HOURS_MS = 6 * 60 * 60_000;

async function loadEnv() {
  const raw = await readFile(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const env = await loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  // supabase-js builds a realtime client in its constructor; Node < 22 has no
  // global WebSocket, so hand it `ws` exactly as src/lib/db/client.ts does.
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });
  const { createSupabaseSessionStore } = await loadTsModule(
    new URL("../src/lib/bridge/session-store-supabase.ts", import.meta.url),
  );

  const CREATOR = `smoke-test-${randomUUID()}`;
  const CREATOR_B = `smoke-test-${randomUUID()}`;
  const NOW = Date.now();
  const SECRET = `smoke-secret-${randomUUID()}`;

  let n = 0;
  const store = createSupabaseSessionStore({
    client,
    controlSecret: SECRET,
    mintId: () => `smoke-res-${++n}`,
    nowMs: () => NOW,
  });

  const attempt = (over = {}) => ({
    attemptId: `smoke-attempt-${randomUUID()}`,
    creatorId: CREATOR,
    livepeerId: "smoke-lp",
    category: "mobile",
    leaseId: "smoke-lease",
    whipUpstreamUrl: "https://bridge.invalid/whip/opaque",
    publishToken: "smoke-publish-token",
    createdAtMs: NOW,
    ...over,
  });

  console.log(`\nBridgeSessionStore smoke test\n  target: ${url}\n  creator: ${CREATOR}\n`);

  try {
    // --- maybeSingle() on an empty result -------------------------------
    console.log("maybeSingle() with no matching row");
    let missing;
    try {
      missing = await store.getAttempt(`smoke-absent-${randomUUID()}`);
      check("returns null instead of throwing", missing === null, `got ${JSON.stringify(missing)}`);
    } catch (error) {
      check("returns null instead of throwing", false, `threw ${error.message}`);
    }
    check("getAttemptByCreator on unknown creator is null", (await store.getAttemptByCreator(CREATOR_B)) === null);

    // --- round trip -----------------------------------------------------
    console.log("\nround trip");
    const first = attempt();
    await store.putAttempt(first);
    const readBack = await store.getAttempt(first.attemptId);
    check("getAttempt round-trips every field", JSON.stringify(readBack) === JSON.stringify(first), JSON.stringify(readBack));
    const byCreator = await store.getAttemptByCreator(CREATOR);
    check("getAttemptByCreator finds it", byCreator?.attemptId === first.attemptId);

    // --- credentials sealed at rest -------------------------------------
    console.log("\ncredentials at rest");
    const { data: rawRows } = await client
      .from("broadcast_bridge_attempts")
      .select("*")
      .eq("creator_id", CREATOR);
    const raw = JSON.stringify(rawRows ?? []);
    check("publish token is NOT stored in the clear", !raw.includes("smoke-publish-token"));
    check("WHIP capability url is NOT stored in the clear", !raw.includes("bridge.invalid"));
    check("sealed envelope is versioned v1", (rawRows?.[0]?.publish_token_sealed ?? "").startsWith("v1."));

    // --- upsert onConflict creator_id (THE risky one) -------------------
    console.log("\nupsert(onConflict: creator_id) against the unique constraint");
    const second = attempt();
    let upsertError = null;
    try {
      await store.putAttempt(second);
    } catch (error) {
      upsertError = error;
    }
    check("second attempt for same creator does not error", upsertError === null, upsertError?.message);
    const { data: afterUpsert } = await client
      .from("broadcast_bridge_attempts")
      .select("attempt_id")
      .eq("creator_id", CREATOR);
    check("exactly ONE live attempt per creator", (afterUpsert?.length ?? 0) === 1, `rows=${afterUpsert?.length}`);
    check("the newer attempt won", afterUpsert?.[0]?.attempt_id === second.attemptId);
    check("the superseded attempt is unreachable", (await store.getAttempt(first.attemptId)) === null);

    // --- resource mapping ----------------------------------------------
    console.log("\nWHIP resource mapping");
    const r1 = await store.registerResource(second.attemptId, "https://up.invalid/a");
    check("first register has no predecessor", r1.replacedUpstreamUrl === null);
    const r2 = await store.registerResource(second.attemptId, "https://up.invalid/b");
    check("second register returns the replaced upstream", r2.replacedUpstreamUrl === "https://up.invalid/a", JSON.stringify(r2));
    check("resolve matches the current resource id", (await store.resolveResource(second.attemptId, r2.resourceId)) === "https://up.invalid/b");
    check("resolve rejects a stale resource id", (await store.resolveResource(second.attemptId, r1.resourceId)) === null);
    check("release returns the upstream once", (await store.releaseResource(second.attemptId, r2.resourceId)) === "https://up.invalid/b");
    check("release is idempotent", (await store.releaseResource(second.attemptId, r2.resourceId)) === null);

    // --- lease events ---------------------------------------------------
    console.log("\nlease-rate events");
    await store.recordLeaseEvent(CREATOR, NOW - 5_000);
    await store.recordLeaseEvent(CREATOR, NOW - 1_000);
    await store.recordLeaseEvent(CREATOR_B, NOW - 1_000);
    const win = await store.leaseEvents(CREATOR, NOW - 10_000);
    check("creator window counts only this creator", win.creatorEvents.length === 2, JSON.stringify(win.creatorEvents));
    check("agent window spans creators", win.agentEvents.length >= 3, `${win.agentEvents.length}`);
    const narrow = await store.leaseEvents(CREATOR, NOW - 2_000);
    check("older events fall out of a narrower window", narrow.creatorEvents.length === 1, JSON.stringify(narrow.creatorEvents));

    // --- staleness ------------------------------------------------------
    console.log("\nstale attempts");
    await store.deleteAttempt(second.attemptId);
    const stale = attempt({ createdAtMs: NOW - SIX_HOURS_MS - 60_000 });
    await store.putAttempt(stale);
    check("an attempt past max lease duration reads as gone", (await store.getAttempt(stale.attemptId)) === null);

    // --- prune function --------------------------------------------------
    console.log("\nprune function");
    const { error: pruneError } = await client.rpc("prune_bridge_session_state");
    check("prune_bridge_session_state() is callable", !pruneError, pruneError?.message);
  } finally {
    console.log("\ncleanup");
    const { error: e1 } = await client
      .from("broadcast_bridge_attempts")
      .delete()
      .in("creator_id", [CREATOR, CREATOR_B]);
    const { error: e2 } = await client
      .from("broadcast_bridge_lease_events")
      .delete()
      .in("creator_id", [CREATOR, CREATOR_B]);
    const { data: leftAttempts } = await client
      .from("broadcast_bridge_attempts")
      .select("attempt_id")
      .in("creator_id", [CREATOR, CREATOR_B]);
    const { data: leftEvents } = await client
      .from("broadcast_bridge_lease_events")
      .select("id")
      .in("creator_id", [CREATOR, CREATOR_B]);
    check("all smoke-test rows removed", (leftAttempts?.length ?? 0) === 0 && (leftEvents?.length ?? 0) === 0, `${e1?.message ?? ""} ${e2?.message ?? ""}`);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nsmoke test aborted:", error.message);
  process.exit(1);
});
