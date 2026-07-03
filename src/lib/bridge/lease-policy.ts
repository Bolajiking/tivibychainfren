export const BRIDGE_LEASE_UNPUBLISHED_TTL_MS = 60_000;
export const BRIDGE_LEASE_HEARTBEAT_INTERVAL_MS = 10_000;
export const BRIDGE_LEASE_HEARTBEAT_TIMEOUT_MS = 30_000;
export const BRIDGE_LEASE_PUBLISH_EXTENSION_MS = 15_000;
export const BRIDGE_LEASE_MAX_DURATION_MS = 6 * 60 * 60_000;
export const BRIDGE_LEASE_CREATOR_RATE_PER_MINUTE = 10;
export const BRIDGE_LEASE_AGENT_RATE_PER_MINUTE = 60;
export const BRIDGE_LEASE_RATE_WINDOW_MS = 60_000;

export interface BridgeLeaseTimestamps {
  createdAtMs: number;
  lastHeartbeatAtMs: number | null;
  publishing: boolean;
  lastPublisherSeenAtMs: number | null;
}

export type BridgeLeaseExpiryReason =
  | "unpublished_ttl"
  | "heartbeat_timeout"
  | "publisher_lost"
  | "max_duration";

export interface BridgeLeaseVerdict {
  expired: boolean;
  reason: BridgeLeaseExpiryReason | null;
}

export function evaluateBridgeLease(lease: BridgeLeaseTimestamps, nowMs: number): BridgeLeaseVerdict {
  if (nowMs - lease.createdAtMs >= BRIDGE_LEASE_MAX_DURATION_MS) {
    return { expired: true, reason: "max_duration" };
  }

  if (lease.publishing) {
    const seenAt = lease.lastPublisherSeenAtMs ?? lease.createdAtMs;
    if (nowMs - seenAt > BRIDGE_LEASE_PUBLISH_EXTENSION_MS) {
      return { expired: true, reason: "publisher_lost" };
    }
    return { expired: false, reason: null };
  }

  const heartbeatReference = lease.lastHeartbeatAtMs ?? lease.createdAtMs;
  if (nowMs - heartbeatReference > BRIDGE_LEASE_HEARTBEAT_TIMEOUT_MS) {
    return { expired: true, reason: "heartbeat_timeout" };
  }
  if (nowMs - lease.createdAtMs > BRIDGE_LEASE_UNPUBLISHED_TTL_MS) {
    return { expired: true, reason: "unpublished_ttl" };
  }
  return { expired: false, reason: null };
}

function countInWindow(events: number[], nowMs: number): number {
  return (Array.isArray(events) ? events : []).filter(
    (atMs) => nowMs - atMs < BRIDGE_LEASE_RATE_WINDOW_MS && atMs <= nowMs,
  ).length;
}

export type LeaseRateVerdict = { allowed: true } | { allowed: false; reason: "lease_rate_limited" };

export function shouldAllowLeaseCreation(input: {
  creatorEvents: number[];
  agentEvents: number[];
  nowMs: number;
}): LeaseRateVerdict {
  if (countInWindow(input.creatorEvents, input.nowMs) >= BRIDGE_LEASE_CREATOR_RATE_PER_MINUTE) {
    return { allowed: false, reason: "lease_rate_limited" };
  }
  if (countInWindow(input.agentEvents, input.nowMs) >= BRIDGE_LEASE_AGENT_RATE_PER_MINUTE) {
    return { allowed: false, reason: "lease_rate_limited" };
  }
  return { allowed: true };
}
