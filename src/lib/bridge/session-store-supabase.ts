import { randomUUID } from "node:crypto";
import { BRIDGE_LEASE_MAX_DURATION_MS } from "@/lib/bridge/lease-policy";
import { bridgeSecretEquals, openBridgeSecret, sealBridgeSecret } from "@/lib/bridge/secret-box";
import type { BridgeLeaseEventWindow, BridgeSessionStore, BroadcastAttempt } from "@/lib/bridge/session-store";

/**
 * Shared bridge session state (migration 0019).
 *
 * This is what lets the bridge run on multi-instance serverless: WHIP signaling
 * for an attempt can land on any instance and still resolve. Credentials are
 * sealed at rest — see `secret-box.ts` and the 0019 header.
 */

const ATTEMPT_TABLE = "broadcast_bridge_attempts";
const EVENT_TABLE = "broadcast_bridge_lease_events";

interface AttemptRow {
  attempt_id: string;
  creator_id: string;
  livepeer_id: string;
  category: string;
  lease_id: string | null;
  whip_upstream_sealed: string | null;
  publish_token_sealed: string | null;
  resource_id: string | null;
  resource_upstream_sealed: string | null;
  created_at_ms: number | string;
}

const ATTEMPT_COLUMNS =
  "attempt_id, creator_id, livepeer_id, category, lease_id, whip_upstream_sealed, publish_token_sealed, resource_id, resource_upstream_sealed, created_at_ms";

/**
 * The service-role client surface this store needs. Structural and injected —
 * the module must not import `@/lib/db/client`, because a bare npm import in
 * its graph would make it unloadable by the test harness, and credential
 * handling is exactly the code that has to stay testable.
 */
export interface BridgeSessionDbClient {
  from(table: string): any;
}

export interface SupabaseSessionStoreOptions {
  /** Service-role client; resolved by the caller (see `runtime.ts`). */
  client: BridgeSessionDbClient | null;
  /** Key for sealing credentials at rest; the bridge already requires it. */
  controlSecret: string;
  mintId?: () => string;
  nowMs?: () => number;
}

export function createSupabaseSessionStore(opts: SupabaseSessionStoreOptions): BridgeSessionStore {
  const mintId = opts.mintId ?? (() => randomUUID());
  const nowMs = opts.nowMs ?? (() => Date.now());
  const secret = opts.controlSecret;

  function db(): BridgeSessionDbClient {
    if (!opts.client) throw new Error("bridge_session_store_unavailable");
    return opts.client;
  }

  /** Attempts older than the max lease duration are dead regardless of cleanup state. */
  function freshFloorMs(): number {
    return nowMs() - BRIDGE_LEASE_MAX_DURATION_MS;
  }

  function toAttempt(row: AttemptRow | null | undefined): BroadcastAttempt | null {
    if (!row) return null;
    const createdAtMs = Number(row.created_at_ms);
    if (!Number.isFinite(createdAtMs) || createdAtMs < freshFloorMs()) return null;
    return {
      attemptId: row.attempt_id,
      creatorId: row.creator_id,
      livepeerId: row.livepeer_id,
      category: row.category === "mobile" ? "mobile" : "desktop",
      leaseId: row.lease_id,
      // A credential that will not unseal (rotated or tampered key) surfaces as
      // null, and the proxy then fails the attempt closed with bridge_unavailable.
      whipUpstreamUrl: openBridgeSecret(row.whip_upstream_sealed, secret),
      publishToken: openBridgeSecret(row.publish_token_sealed, secret),
      createdAtMs,
    };
  }

  async function readAttemptRow(attemptId: string): Promise<AttemptRow | null> {
    const { data } = await db()
      .from(ATTEMPT_TABLE)
      .select(ATTEMPT_COLUMNS)
      .eq("attempt_id", attemptId)
      .maybeSingle();
    return (data as AttemptRow | null) ?? null;
  }

  return {
    async getAttempt(attemptId) {
      return toAttempt(await readAttemptRow(attemptId));
    },

    async getAttemptByCreator(creatorId) {
      const { data } = await db()
        .from(ATTEMPT_TABLE)
        .select(ATTEMPT_COLUMNS)
        .eq("creator_id", creatorId)
        .maybeSingle();
      return toAttempt(data as AttemptRow | null);
    },

    async putAttempt(attempt) {
      // Upsert on creator_id, not attempt_id: a new attempt REPLACES that
      // creator's previous one atomically, which is the one-live-publisher rule.
      await db()
        .from(ATTEMPT_TABLE)
        .upsert(
          {
            attempt_id: attempt.attemptId,
            creator_id: attempt.creatorId,
            livepeer_id: attempt.livepeerId,
            category: attempt.category,
            lease_id: attempt.leaseId,
            whip_upstream_sealed: attempt.whipUpstreamUrl
              ? sealBridgeSecret(attempt.whipUpstreamUrl, secret)
              : null,
            publish_token_sealed: attempt.publishToken
              ? sealBridgeSecret(attempt.publishToken, secret)
              : null,
            resource_id: null,
            resource_upstream_sealed: null,
            created_at_ms: attempt.createdAtMs,
          },
          { onConflict: "creator_id" },
        );
    },

    async deleteAttempt(attemptId) {
      await db().from(ATTEMPT_TABLE).delete().eq("attempt_id", attemptId);
    },

    async leaseEvents(creatorId, sinceMs): Promise<BridgeLeaseEventWindow> {
      // One round trip: the agent window is every creator's events, the creator
      // window is the subset. Partitioned client-side.
      const { data } = await db()
        .from(EVENT_TABLE)
        .select("creator_id, at_ms")
        .gte("at_ms", sinceMs);
      const rows = (data as { creator_id: string; at_ms: number | string }[] | null) ?? [];
      const agentEvents: number[] = [];
      const creatorEvents: number[] = [];
      for (const row of rows) {
        const at = Number(row.at_ms);
        if (!Number.isFinite(at)) continue;
        agentEvents.push(at);
        if (row.creator_id === creatorId) creatorEvents.push(at);
      }
      return { creatorEvents, agentEvents };
    },

    async recordLeaseEvent(creatorId, atMs) {
      await db().from(EVENT_TABLE).insert({ creator_id: creatorId, at_ms: atMs });
    },

    async registerResource(attemptId, upstreamUrl) {
      const row = await readAttemptRow(attemptId);
      const replacedUpstreamUrl = openBridgeSecret(row?.resource_upstream_sealed, secret);
      const resourceId = mintId();
      await db()
        .from(ATTEMPT_TABLE)
        .update({
          resource_id: resourceId,
          resource_upstream_sealed: sealBridgeSecret(upstreamUrl, secret),
        })
        .eq("attempt_id", attemptId);
      return { resourceId, replacedUpstreamUrl };
    },

    async resolveResource(attemptId, resourceId) {
      const row = await readAttemptRow(attemptId);
      if (!row || !bridgeSecretEquals(row.resource_id, resourceId)) return null;
      return openBridgeSecret(row.resource_upstream_sealed, secret);
    },

    async releaseResource(attemptId, resourceId) {
      const row = await readAttemptRow(attemptId);
      if (!row || !bridgeSecretEquals(row.resource_id, resourceId)) return null;
      const upstreamUrl = openBridgeSecret(row.resource_upstream_sealed, secret);
      await db()
        .from(ATTEMPT_TABLE)
        .update({ resource_id: null, resource_upstream_sealed: null })
        .eq("attempt_id", attemptId);
      return upstreamUrl;
    },

    async releaseAttemptResources(attemptId) {
      const row = await readAttemptRow(attemptId);
      if (!row || !row.resource_id) return null;
      const upstreamUrl = openBridgeSecret(row.resource_upstream_sealed, secret);
      await db()
        .from(ATTEMPT_TABLE)
        .update({ resource_id: null, resource_upstream_sealed: null })
        .eq("attempt_id", attemptId);
      return upstreamUrl;
    },
  };
}
