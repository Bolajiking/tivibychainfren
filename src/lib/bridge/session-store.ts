import { createWhipResourceMap } from "@/lib/bridge/whip-proxy-policy";

/**
 * One in-flight browser broadcast attempt.
 *
 * `publishToken` is a bridge publish credential. Any store implementation that
 * persists this record outside process memory MUST keep it server-only and
 * unreadable by the anon/authenticated roles (see `0015_broadcast_bridge_leases`,
 * which deliberately stores no credential at all).
 */
export interface BroadcastAttempt {
  attemptId: string;
  creatorId: string;
  livepeerId: string;
  category: "mobile" | "desktop";
  leaseId: string | null;
  whipUpstreamUrl: string | null;
  publishToken: string | null;
  createdAtMs: number;
}

export interface BridgeLeaseEventWindow {
  creatorEvents: number[];
  agentEvents: number[];
}

/**
 * Storage seam for bridge session state.
 *
 * The in-memory implementation is the historical behaviour and is correct for
 * single-process deploys. A shared implementation (Supabase) is what allows the
 * bridge to run on multi-instance serverless, where WHIP signaling for one
 * attempt can land on an instance that never created it — the reason
 * `bridgeAllowedInRuntime()` refuses to enable the bridge on Vercel.
 *
 * Every method is async so an implementation can be network-backed. The manager
 * holds no attempt state of its own.
 */
export interface BridgeSessionStore {
  getAttempt(attemptId: string): Promise<BroadcastAttempt | null>;
  /** Enforces one live attempt per creator. */
  getAttemptByCreator(creatorId: string): Promise<BroadcastAttempt | null>;
  putAttempt(attempt: BroadcastAttempt): Promise<void>;
  deleteAttempt(attemptId: string): Promise<void>;

  /** Lease-rate accounting for `shouldAllowLeaseCreation`. */
  leaseEvents(creatorId: string, sinceMs: number): Promise<BridgeLeaseEventWindow>;
  recordLeaseEvent(creatorId: string, atMs: number): Promise<void>;

  /** WHIP resource mapping — same lifetime as the attempt that owns it. */
  registerResource(
    attemptId: string,
    upstreamUrl: string,
  ): Promise<{ resourceId: string; replacedUpstreamUrl: string | null }>;
  resolveResource(attemptId: string, resourceId: string): Promise<string | null>;
  releaseResource(attemptId: string, resourceId: string): Promise<string | null>;
  releaseAttemptResources(attemptId: string): Promise<string | null>;
}

/** Bounded history retained per creator / per agent for rate-limit windows. */
const CREATOR_EVENT_HISTORY = 100;
const AGENT_EVENT_HISTORY = 1000;

export function createInMemorySessionStore(opts?: { mintId?: () => string }): BridgeSessionStore {
  const attempts = new Map<string, BroadcastAttempt>();
  const attemptByCreator = new Map<string, string>();
  const creatorLeaseEvents = new Map<string, number[]>();
  const agentLeaseEvents: number[] = [];
  const resourceMap = createWhipResourceMap(opts?.mintId ? { mintId: opts.mintId } : undefined);

  return {
    async getAttempt(attemptId) {
      return attempts.get(attemptId) ?? null;
    },

    async getAttemptByCreator(creatorId) {
      const attemptId = attemptByCreator.get(creatorId);
      return attemptId ? (attempts.get(attemptId) ?? null) : null;
    },

    async putAttempt(attempt) {
      attempts.set(attempt.attemptId, attempt);
      attemptByCreator.set(attempt.creatorId, attempt.attemptId);
    },

    async deleteAttempt(attemptId) {
      const attempt = attempts.get(attemptId);
      if (!attempt) return;
      attempts.delete(attemptId);
      if (attemptByCreator.get(attempt.creatorId) === attemptId) {
        attemptByCreator.delete(attempt.creatorId);
      }
    },

    async leaseEvents(creatorId, sinceMs) {
      return {
        creatorEvents: (creatorLeaseEvents.get(creatorId) ?? []).filter((at) => at >= sinceMs),
        agentEvents: agentLeaseEvents.filter((at) => at >= sinceMs),
      };
    },

    async recordLeaseEvent(creatorId, atMs) {
      const events = creatorLeaseEvents.get(creatorId) ?? [];
      events.push(atMs);
      creatorLeaseEvents.set(creatorId, events.slice(-CREATOR_EVENT_HISTORY));
      agentLeaseEvents.push(atMs);
      if (agentLeaseEvents.length > AGENT_EVENT_HISTORY) {
        agentLeaseEvents.splice(0, agentLeaseEvents.length - AGENT_EVENT_HISTORY);
      }
    },

    async registerResource(attemptId, upstreamUrl) {
      return resourceMap.register(attemptId, upstreamUrl);
    },

    async resolveResource(attemptId, resourceId) {
      return resourceMap.resolve(attemptId, resourceId);
    },

    async releaseResource(attemptId, resourceId) {
      return resourceMap.release(attemptId, resourceId);
    },

    async releaseAttemptResources(attemptId) {
      return resourceMap.releaseAttempt(attemptId);
    },
  };
}
