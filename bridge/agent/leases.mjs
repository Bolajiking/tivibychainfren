// In-memory bridge lease store (spec §7.3/§7.4). Restart clears all leases by
// design: the auth hook then denies unknown paths, MediaMTX ends the publisher,
// and the browser creates a new lease. RTMP destinations and publish
// credentials exist only inside this process and die with the lease.
import { randomBytes, timingSafeEqual } from "node:crypto";

export const LEASE_UNPUBLISHED_TTL_MS = 60_000;
export const LEASE_HEARTBEAT_TIMEOUT_MS = 30_000;
export const LEASE_PUBLISH_EXTENSION_MS = 15_000;
export const LEASE_MAX_DURATION_MS = 6 * 60 * 60_000;

function opaqueId() {
  return randomBytes(18).toString("base64url");
}

function constantTimeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ""), "utf8");
  const bufB = Buffer.from(String(b ?? ""), "utf8");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createLeaseStore({ nowMs = () => Date.now(), mintPath = opaqueId, mintToken = opaqueId } = {}) {
  const byId = new Map();
  const byPath = new Map();
  let createdCount = 0;
  let endedCount = 0;

  function drop(lease, reason) {
    byId.delete(lease.leaseId);
    byPath.delete(lease.path);
    lease.rtmpUrl = null;
    lease.publishToken = null;
    lease.endedReason = reason;
    endedCount += 1;
  }

  function expiryReason(lease, now) {
    if (now - lease.createdAtMs >= LEASE_MAX_DURATION_MS) return "max_duration";
    if (lease.publishing) {
      return now - lease.lastPublisherSeenAtMs > LEASE_PUBLISH_EXTENSION_MS ? "publisher_lost" : null;
    }
    const heartbeatReference = lease.lastHeartbeatAtMs ?? lease.createdAtMs;
    if (now - heartbeatReference > LEASE_HEARTBEAT_TIMEOUT_MS) return "heartbeat_timeout";
    if (now - lease.createdAtMs > LEASE_UNPUBLISHED_TTL_MS) return "unpublished_ttl";
    return null;
  }

  return {
    createLease({ leaseId, attemptId, creatorId, rtmpUrl }) {
      if (!leaseId || byId.has(leaseId)) return null;
      const now = nowMs();
      const lease = {
        leaseId,
        attemptId,
        creatorId,
        rtmpUrl,
        path: mintPath(),
        publishToken: mintToken(),
        status: "created",
        publishing: false,
        createdAtMs: now,
        lastHeartbeatAtMs: null,
        lastPublisherSeenAtMs: null,
        expiresAtMs: now + LEASE_UNPUBLISHED_TTL_MS,
      };
      byId.set(leaseId, lease);
      byPath.set(lease.path, lease);
      createdCount += 1;
      return { leaseId, path: lease.path, publishToken: lease.publishToken, expiresAtMs: lease.expiresAtMs };
    },

    get(leaseId) {
      const lease = byId.get(leaseId);
      if (!lease) return null;
      return {
        leaseId: lease.leaseId,
        attemptId: lease.attemptId,
        status: lease.status,
        publishing: lease.publishing,
        path: lease.path,
      };
    },

    heartbeat(leaseId) {
      const lease = byId.get(leaseId);
      if (!lease) return false;
      lease.lastHeartbeatAtMs = nowMs();
      return true;
    },

    authorizePublish(path, credential) {
      const lease = byPath.get(path);
      if (!lease) return false;
      return constantTimeEqual(lease.publishToken, credential);
    },

    destinationFor(path) {
      return byPath.get(path)?.rtmpUrl ?? null;
    },

    markPublishing(path) {
      const lease = byPath.get(path);
      if (!lease) return false;
      lease.status = "publishing";
      lease.publishing = true;
      lease.lastPublisherSeenAtMs = nowMs();
      return true;
    },

    publisherSeen(path) {
      const lease = byPath.get(path);
      if (!lease || !lease.publishing) return false;
      lease.lastPublisherSeenAtMs = nowMs();
      return true;
    },

    markPublisherGone(path) {
      const lease = byPath.get(path);
      if (!lease) return false;
      lease.publishing = false;
      lease.status = "created";
      // The unpublished clocks restart from the drop so recovery gets a fair window.
      lease.lastHeartbeatAtMs = nowMs();
      return true;
    },

    revoke(leaseId, reason) {
      const lease = byId.get(leaseId);
      if (!lease) return false;
      drop(lease, reason);
      return true;
    },

    sweep() {
      const now = nowMs();
      const swept = [];
      for (const lease of [...byId.values()]) {
        const reason = expiryReason(lease, now);
        if (reason) {
          drop(lease, reason);
          swept.push({ leaseId: lease.leaseId, path: lease.path, reason });
        }
      }
      return swept;
    },

    /** Secret-free view for logs and health: no rtmpUrl, no publishToken. */
    describe() {
      return [...byId.values()].map((lease) => ({
        leaseId: lease.leaseId,
        attemptId: lease.attemptId,
        status: lease.status,
        publishing: lease.publishing,
        createdAtMs: lease.createdAtMs,
      }));
    },

    stats() {
      return { active: byId.size, created: createdCount, ended: endedCount };
    },

    activePaths() {
      return [...byPath.keys()];
    },
  };
}
