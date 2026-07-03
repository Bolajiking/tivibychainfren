// Bridge agent HTTP surfaces (spec §5.1): an HMAC-protected control API used
// only by TVinBio, and a loopback-only auth/destination API used by MediaMTX
// and the forwarder. Structured logs carry lease/attempt ids, never secrets.
import { createNonceStore, verifySignedRequest } from "./auth.mjs";

const MAX_BODY_BYTES = 64 * 1024;
const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, status, payload) {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  res.writeHead(status, body ? { "content-type": "application/json" } : {});
  res.end(body);
}

function parseJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return null;
  }
}

export function createAgentApp({
  controlSecret,
  store,
  publicWhipBase,
  checkMediamtx = async () => true,
  onLeaseEnded = () => {},
  nowSeconds = () => Math.floor(Date.now() / 1000),
  log = () => {},
}) {
  const nonceStore = createNonceStore();
  const whipBase = String(publicWhipBase ?? "").replace(/\/$/, "");

  async function control(req, res) {
    let body = "";
    try {
      body = await readBody(req);
    } catch {
      return json(res, 413, { error: "body_too_large" });
    }
    const url = new URL(req.url, "http://agent.local");
    const path = url.pathname;

    if (req.method === "GET" && path === "/healthz") {
      const mediamtxOk = await checkMediamtx().catch(() => false);
      return json(res, mediamtxOk ? 200 : 503, { ok: mediamtxOk, leases: store.stats() });
    }

    const verified = verifySignedRequest({
      secret: controlSecret,
      method: req.method,
      path,
      headers: req.headers,
      body,
      nowSeconds: nowSeconds(),
      nonceStore,
    });
    if (!verified) {
      log({ event: "control_auth_rejected", path });
      return json(res, 401, { error: "unauthorized" });
    }

    if (req.method === "POST" && path === "/v1/leases") {
      const payload = parseJson(body);
      if (!payload?.leaseId || !payload.attemptId || !payload.creatorId || !payload.rtmpUrl) {
        return json(res, 400, { error: "invalid_lease_request" });
      }
      const lease = store.createLease({
        leaseId: String(payload.leaseId),
        attemptId: String(payload.attemptId),
        creatorId: String(payload.creatorId),
        rtmpUrl: String(payload.rtmpUrl),
      });
      if (!lease) return json(res, 409, { error: "lease_exists" });
      log({ event: "lease_created", leaseId: lease.leaseId, attemptId: payload.attemptId });
      return json(res, 201, {
        leaseId: lease.leaseId,
        whipUrl: `${whipBase}/${lease.path}/whip`,
        publishToken: lease.publishToken,
        expiresAt: new Date(lease.expiresAtMs).toISOString(),
      });
    }

    const heartbeatMatch = path.match(/^\/v1\/leases\/([^/]+)\/heartbeat$/);
    if (req.method === "POST" && heartbeatMatch) {
      return store.heartbeat(decodeURIComponent(heartbeatMatch[1]))
        ? json(res, 204)
        : json(res, 404, { error: "lease_not_found" });
    }

    const leaseMatch = path.match(/^\/v1\/leases\/([^/]+)$/);
    if (leaseMatch) {
      const leaseId = decodeURIComponent(leaseMatch[1]);
      if (req.method === "GET") {
        const lease = store.get(leaseId);
        if (!lease) return json(res, 404, { error: "lease_not_found" });
        return json(res, 200, { leaseId: lease.leaseId, status: lease.status, publishing: lease.publishing });
      }
      if (req.method === "DELETE") {
        if (store.revoke(leaseId, "revoked")) {
          log({ event: "lease_revoked", leaseId });
          onLeaseEnded(leaseId, "revoked");
        }
        return json(res, 204);
      }
    }

    return json(res, 404, { error: "not_found" });
  }

  async function loopback(req, res) {
    let body = "";
    try {
      body = await readBody(req);
    } catch {
      return json(res, 413, { error: "body_too_large" });
    }
    const url = new URL(req.url, "http://agent.local");
    const path = url.pathname;

    if (req.method === "POST" && path === "/internal/auth") {
      const payload = parseJson(body) ?? {};
      const action = String(payload.action ?? "");
      if (action === "publish") {
        return store.authorizePublish(String(payload.path ?? ""), String(payload.password ?? ""))
          ? json(res, 200, {})
          : json(res, 401, { error: "publish_denied" });
      }
      // Reads (the forwarder's RTSP pull) and API access stay loopback-only.
      const ip = String(payload.ip ?? "");
      return LOOPBACK_IPS.has(ip) ? json(res, 200, {}) : json(res, 401, { error: "denied" });
    }

    if (req.method === "GET" && path === "/internal/destination") {
      const rtmpUrl = store.destinationFor(String(url.searchParams.get("path") ?? ""));
      return rtmpUrl ? json(res, 200, { rtmpUrl }) : json(res, 404, { error: "no_destination" });
    }

    if (req.method === "POST" && path === "/internal/ready") {
      const payload = parseJson(body) ?? {};
      return store.markPublishing(String(payload.path ?? "")) ? json(res, 204) : json(res, 404, {});
    }

    if (req.method === "POST" && path === "/internal/not-ready") {
      const payload = parseJson(body) ?? {};
      return store.markPublisherGone(String(payload.path ?? "")) ? json(res, 204) : json(res, 404, {});
    }

    if (req.method === "POST" && path === "/internal/publisher-seen") {
      const payload = parseJson(body) ?? {};
      return store.publisherSeen(String(payload.path ?? "")) ? json(res, 204) : json(res, 404, {});
    }

    return json(res, 404, { error: "not_found" });
  }

  return { control, loopback };
}
