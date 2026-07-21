import { randomUUID } from "node:crypto";
import type { BridgeAgentClient } from "@/lib/bridge/agent-client";
import { BRIDGE_LEASE_RATE_WINDOW_MS, shouldAllowLeaseCreation } from "@/lib/bridge/lease-policy";
import {
  createInMemorySessionStore,
  type BridgeSessionStore,
  type BroadcastAttempt,
} from "@/lib/bridge/session-store";
import { livepeerRtmpFullUrl, livepeerWhipIngestUrl } from "@/lib/livepeer/ingest";
import {
  classifyBroadcastDevice,
  planTransportTargets,
  type BroadcastTransportTarget,
} from "@/lib/livepeer/transport-policy";

export type { BroadcastAttempt } from "@/lib/bridge/session-store";

export interface BroadcastTransportPlan {
  attemptId: string;
  livepeerId: string;
  targets: BroadcastTransportTarget[];
  obsFallbackAtMs: number;
  unavailableReason?: "bridge_unavailable" | "lease_rate_limited";
  bridgeLeaseId?: string;
  expiresAt?: string;
}

export type BroadcastSessionCreateResult =
  | { ok: true; plan: BroadcastTransportPlan }
  | { ok: false; error: "ingest_unavailable" | "broadcast_in_progress" };

export type BroadcastSessionMutationResult =
  | { ok: true }
  | { ok: false; error: "not_resource_owner" | "attempt_not_found" | "lease_expired" };

/** Server-only lifecycle metadata sink (`broadcast_bridge_leases`); never receives secrets. */
export interface BridgeLeaseRepo {
  record(row: {
    event: "created" | "ended";
    attemptId: string;
    leaseId: string | null;
    creatorId: string;
    livepeerId: string;
    reason: string | null;
    atMs: number;
  }): Promise<void>;
}

export interface BroadcastSessionDeps {
  agent: BridgeAgentClient | null;
  bridgeEnabled: boolean;
  loadStreamKey(livepeerId: string): Promise<string | null>;
  leaseRepo?: BridgeLeaseRepo | null;
  /** Fired when revocation orphans a proxied WHIP resource so the caller can DELETE it upstream. */
  onReleaseResource?: (upstreamUrl: string, publishToken: string | null) => void;
  /**
   * Where attempt/lease/resource state lives. Defaults to per-process memory,
   * which is only correct on a single instance — see `bridgeAllowedInRuntime()`.
   */
  store?: BridgeSessionStore;
  mintId?: () => string;
  nowMs?: () => number;
}

export interface BroadcastSessionManager {
  create(input: {
    creatorId: string;
    livepeerId: string;
    userAgent: string;
  }): Promise<BroadcastSessionCreateResult>;
  revoke(attemptId: string, creatorId: string): Promise<BroadcastSessionMutationResult>;
  heartbeat(attemptId: string, creatorId: string): Promise<BroadcastSessionMutationResult>;
  /** Owner-scoped lease publishing state (spec §6.4 bridge confirmation input). */
  status(
    attemptId: string,
    creatorId: string,
  ): Promise<{ ok: true; publishing: boolean } | { ok: false; error: "attempt_not_found" | "not_resource_owner" }>;
  getAttempt(attemptId: string, creatorId: string): Promise<BroadcastAttempt | null>;
  /**
   * Owner-blind lookup for the WHIP proxy only. Every signaling route MUST
   * verify ownership via getAttempt before proxying; this exists so the proxy
   * core can resolve upstream context without re-threading the owner.
   */
  peekAttempt(attemptId: string): Promise<BroadcastAttempt | null>;
  /** Exposed so the WHIP proxy can map resources through the same storage. */
  store: BridgeSessionStore;
}

export function createBroadcastSessionManager(deps: BroadcastSessionDeps): BroadcastSessionManager {
  const mintId = deps.mintId ?? (() => randomUUID());
  const nowMs = deps.nowMs ?? (() => Date.now());
  const store = deps.store ?? createInMemorySessionStore();

  async function recordLifecycle(row: Parameters<BridgeLeaseRepo["record"]>[0]): Promise<void> {
    try {
      await deps.leaseRepo?.record(row);
    } catch {
      // Lifecycle metadata is best-effort; the in-memory lease remains authoritative.
    }
  }

  async function releaseAttemptResources(attempt: BroadcastAttempt): Promise<void> {
    const upstreamUrl = await store.releaseAttemptResources(attempt.attemptId);
    if (upstreamUrl) deps.onReleaseResource?.(upstreamUrl, attempt.publishToken);
  }

  async function dropAttempt(attempt: BroadcastAttempt, reason: string): Promise<void> {
    await releaseAttemptResources(attempt);
    await store.deleteAttempt(attempt.attemptId);
    if (attempt.leaseId && deps.agent) await deps.agent.revokeLease(attempt.leaseId);
    await recordLifecycle({
      event: "ended",
      attemptId: attempt.attemptId,
      leaseId: attempt.leaseId,
      creatorId: attempt.creatorId,
      livepeerId: attempt.livepeerId,
      reason,
      atMs: nowMs(),
    });
  }

  async function leaseRateVerdict(creatorId: string, atMs: number) {
    const { creatorEvents, agentEvents } = await store.leaseEvents(
      creatorId,
      atMs - BRIDGE_LEASE_RATE_WINDOW_MS,
    );
    return shouldAllowLeaseCreation({ creatorEvents, agentEvents, nowMs: atMs });
  }

  return {
    store,

    async create({ creatorId, livepeerId, userAgent }) {
      const category = classifyBroadcastDevice(userAgent);
      const now = nowMs();

      // Only one active bridge publisher per stream: a confirmed publishing
      // lease is never silently evicted; an unpublished predecessor is revoked.
      const existing = await store.getAttemptByCreator(creatorId);
      if (existing) {
        const status =
          existing.leaseId && deps.agent ? await deps.agent.leaseStatus(existing.leaseId) : null;
        if (status?.publishing === true) return { ok: false, error: "broadcast_in_progress" };
        await dropAttempt(existing, "superseded");
      }

      const streamKey = await deps.loadStreamKey(livepeerId);
      if (!streamKey) return { ok: false, error: "ingest_unavailable" };

      const attemptId = mintId();
      let lease: { leaseId: string; whipUrl: string; publishToken: string; expiresAt: string | null } | null = null;
      let rateLimited = false;

      if (deps.bridgeEnabled && deps.agent) {
        const rate = await leaseRateVerdict(creatorId, now);
        if (!rate.allowed) {
          rateLimited = true;
        } else if (await deps.agent.health()) {
          await store.recordLeaseEvent(creatorId, now);
          lease = await deps.agent.createLease({
            leaseId: mintId(),
            attemptId,
            creatorId,
            rtmpUrl: livepeerRtmpFullUrl(streamKey),
          });
        }
      }

      const policy = planTransportTargets({
        category,
        directIngestUrl: livepeerWhipIngestUrl(streamKey),
        bridgeIngestUrl: lease ? `/api/bridge/attempts/${attemptId}/whip` : null,
        bridgeHealthy: lease !== null,
      });

      const attempt: BroadcastAttempt = {
        attemptId,
        creatorId,
        livepeerId,
        category,
        leaseId: lease?.leaseId ?? null,
        whipUpstreamUrl: lease?.whipUrl ?? null,
        publishToken: lease?.publishToken ?? null,
        createdAtMs: now,
      };
      await store.putAttempt(attempt);
      await recordLifecycle({
        event: "created",
        attemptId,
        leaseId: attempt.leaseId,
        creatorId,
        livepeerId,
        reason: null,
        atMs: now,
      });

      const plan: BroadcastTransportPlan = {
        attemptId,
        livepeerId,
        targets: policy.targets,
        obsFallbackAtMs: policy.obsFallbackAtMs,
      };
      if (policy.unavailableReason) {
        plan.unavailableReason = rateLimited ? "lease_rate_limited" : policy.unavailableReason;
      }
      if (lease) {
        plan.bridgeLeaseId = lease.leaseId;
        if (lease.expiresAt) plan.expiresAt = lease.expiresAt;
      }
      return { ok: true, plan };
    },

    async revoke(attemptId, creatorId) {
      const attempt = await store.getAttempt(attemptId);
      if (!attempt) return { ok: true };
      if (attempt.creatorId !== creatorId) return { ok: false, error: "not_resource_owner" };
      await dropAttempt(attempt, "revoked");
      return { ok: true };
    },

    async heartbeat(attemptId, creatorId) {
      const attempt = await store.getAttempt(attemptId);
      if (!attempt) return { ok: false, error: "attempt_not_found" };
      if (attempt.creatorId !== creatorId) return { ok: false, error: "not_resource_owner" };
      if (attempt.leaseId && deps.agent) {
        const alive = await deps.agent.heartbeatLease(attempt.leaseId);
        if (!alive) return { ok: false, error: "lease_expired" };
      }
      return { ok: true };
    },

    async status(attemptId, creatorId) {
      const attempt = await store.getAttempt(attemptId);
      if (!attempt) return { ok: false, error: "attempt_not_found" };
      if (attempt.creatorId !== creatorId) return { ok: false, error: "not_resource_owner" };
      if (!attempt.leaseId || !deps.agent) return { ok: true, publishing: false };
      const status = await deps.agent.leaseStatus(attempt.leaseId);
      return { ok: true, publishing: status?.publishing === true };
    },

    async getAttempt(attemptId, creatorId) {
      const attempt = await store.getAttempt(attemptId);
      return attempt && attempt.creatorId === creatorId ? attempt : null;
    },

    async peekAttempt(attemptId) {
      return store.getAttempt(attemptId);
    },
  };
}
