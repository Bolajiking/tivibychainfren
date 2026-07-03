import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test, after } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const appHmac = await loadTsModule(new URL("../src/lib/bridge/hmac.ts", import.meta.url));
const serverModule = await import("../bridge/agent/server.mjs");
const leasesModule = await import("../bridge/agent/leases.mjs");

const SECRET = "control-secret";
const servers = [];

after(() => {
  for (const server of servers) server.close();
});

async function startAgent(overrides = {}) {
  let counter = 0;
  const store = leasesModule.createLeaseStore({
    mintPath: () => `path-${++counter}`,
    mintToken: () => `token-${counter}`,
  });
  const revoked = [];
  const app = serverModule.createAgentApp({
    controlSecret: SECRET,
    store,
    publicWhipBase: "https://bridge.example.com:8443",
    checkMediamtx: overrides.checkMediamtx ?? (async () => true),
    onLeaseEnded: (leaseId, reason) => revoked.push({ leaseId, reason }),
    nowSeconds: overrides.nowSeconds,
  });
  const server = createServer(app.control);
  const loopback = createServer(app.loopback);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  await new Promise((resolve) => loopback.listen(0, "127.0.0.1", resolve));
  servers.push(server, loopback);
  return {
    store,
    revoked,
    controlUrl: `http://127.0.0.1:${server.address().port}`,
    loopbackUrl: `http://127.0.0.1:${loopback.address().port}`,
  };
}

function signedHeaders(method, path, body, { secret = SECRET, timestampSeconds, nonce } = {}) {
  const ts = timestampSeconds ?? Math.floor(Date.now() / 1000);
  const usedNonce = nonce ?? `nonce-${Math.random()}`;
  return {
    ...(body ? { "content-type": "application/json" } : {}),
    "x-tvinbio-timestamp": String(ts),
    "x-tvinbio-nonce": usedNonce,
    "x-tvinbio-signature": appHmac.signBridgeRequest(secret, {
      method,
      path,
      timestampSeconds: ts,
      nonce: usedNonce,
      body: body ?? "",
    }),
  };
}

const LEASE_BODY = JSON.stringify({
  leaseId: "lease-1",
  attemptId: "attempt-1",
  creatorId: "0xabc",
  rtmpUrl: "rtmp://rtmp.livepeer.com/live/secret-key",
});

test("a lease create signed by the app-side client is accepted (cross-module interop)", async () => {
  const { controlUrl } = await startAgent();
  const response = await fetch(`${controlUrl}/v1/leases`, {
    method: "POST",
    headers: signedHeaders("POST", "/v1/leases", LEASE_BODY),
    body: LEASE_BODY,
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.leaseId, "lease-1");
  assert.equal(payload.whipUrl, "https://bridge.example.com:8443/path-1/whip");
  assert.equal(payload.publishToken, "token-1");
});

test("unsigned, tampered, wrong-secret, replayed, and skewed requests are rejected", async () => {
  const { controlUrl } = await startAgent();

  const unsigned = await fetch(`${controlUrl}/v1/leases`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: LEASE_BODY,
  });
  assert.equal(unsigned.status, 401);

  const wrongSecret = await fetch(`${controlUrl}/v1/leases`, {
    method: "POST",
    headers: signedHeaders("POST", "/v1/leases", LEASE_BODY, { secret: "other" }),
    body: LEASE_BODY,
  });
  assert.equal(wrongSecret.status, 401);

  const headers = signedHeaders("POST", "/v1/leases", LEASE_BODY);
  const tampered = await fetch(`${controlUrl}/v1/leases`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...JSON.parse(LEASE_BODY), rtmpUrl: "rtmp://evil/exfil" }),
  });
  assert.equal(tampered.status, 401);

  const first = await fetch(`${controlUrl}/v1/leases`, { method: "POST", headers, body: LEASE_BODY });
  assert.equal(first.status, 201);
  const replayed = await fetch(`${controlUrl}/v1/leases`, { method: "POST", headers, body: LEASE_BODY });
  assert.equal(replayed.status, 401, "nonce replay is rejected");

  const skewed = await fetch(`${controlUrl}/v1/leases`, {
    method: "POST",
    headers: signedHeaders("POST", "/v1/leases", LEASE_BODY, {
      timestampSeconds: Math.floor(Date.now() / 1000) - 200,
    }),
    body: LEASE_BODY,
  });
  assert.equal(skewed.status, 401);
});

test("heartbeat, status, and revoke round-trip; revoke is idempotent and reported", async () => {
  const { controlUrl, revoked } = await startAgent();
  await fetch(`${controlUrl}/v1/leases`, {
    method: "POST",
    headers: signedHeaders("POST", "/v1/leases", LEASE_BODY),
    body: LEASE_BODY,
  });

  const beat = await fetch(`${controlUrl}/v1/leases/lease-1/heartbeat`, {
    method: "POST",
    headers: signedHeaders("POST", "/v1/leases/lease-1/heartbeat", "{}"),
    body: "{}",
  });
  assert.equal(beat.status, 204);

  const status = await fetch(`${controlUrl}/v1/leases/lease-1`, {
    headers: signedHeaders("GET", "/v1/leases/lease-1", ""),
  });
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), {
    leaseId: "lease-1",
    status: "created",
    publishing: false,
  });

  const revoke = await fetch(`${controlUrl}/v1/leases/lease-1`, {
    method: "DELETE",
    headers: signedHeaders("DELETE", "/v1/leases/lease-1", ""),
  });
  assert.equal(revoke.status, 204);
  assert.deepEqual(revoked, [{ leaseId: "lease-1", reason: "revoked" }]);

  const again = await fetch(`${controlUrl}/v1/leases/lease-1`, {
    method: "DELETE",
    headers: signedHeaders("DELETE", "/v1/leases/lease-1", ""),
  });
  assert.equal(again.status, 204, "revoke is idempotent");

  const gone = await fetch(`${controlUrl}/v1/leases/lease-1`, {
    headers: signedHeaders("GET", "/v1/leases/lease-1", ""),
  });
  assert.equal(gone.status, 404);
});

test("healthz is unsigned and reports lease stats without secrets", async () => {
  const { controlUrl } = await startAgent();
  const response = await fetch(`${controlUrl}/healthz`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.leases, { active: 0, created: 0, ended: 0 });

  const { controlUrl: sickUrl } = await startAgent({ checkMediamtx: async () => false });
  const sick = await fetch(`${sickUrl}/healthz`);
  assert.equal(sick.status, 503);
});

test("loopback auth allows publish only for a live lease path and credential", async () => {
  const { controlUrl, loopbackUrl } = await startAgent();
  await fetch(`${controlUrl}/v1/leases`, {
    method: "POST",
    headers: signedHeaders("POST", "/v1/leases", LEASE_BODY),
    body: LEASE_BODY,
  });

  async function authenticate(payload) {
    const response = await fetch(`${loopbackUrl}/internal/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.status;
  }

  assert.equal(await authenticate({ action: "publish", path: "path-1", user: "", password: "token-1" }), 200);
  assert.equal(await authenticate({ action: "publish", path: "path-1", user: "", password: "wrong" }), 401);
  assert.equal(await authenticate({ action: "publish", path: "path-404", user: "", password: "token-1" }), 401);
  assert.equal(
    await authenticate({ action: "read", path: "path-1", ip: "127.0.0.1" }),
    200,
    "loopback reader (forwarder RTSP pull) is allowed",
  );
  assert.equal(
    await authenticate({ action: "read", path: "path-1", ip: "203.0.113.9" }),
    401,
    "public RTSP reads stay closed",
  );
  assert.equal(await authenticate({ action: "api", ip: "127.0.0.1" }), 200);

  const revoke = await fetch(`${controlUrl}/v1/leases/lease-1`, {
    method: "DELETE",
    headers: signedHeaders("DELETE", "/v1/leases/lease-1", ""),
  });
  assert.equal(revoke.status, 204);
  assert.equal(
    await authenticate({ action: "publish", path: "path-1", user: "", password: "token-1" }),
    401,
    "a revoked lease can no longer publish",
  );
});

test("loopback lifecycle hooks track publisher presence and destination access", async () => {
  const { controlUrl, loopbackUrl, store } = await startAgent();
  await fetch(`${controlUrl}/v1/leases`, {
    method: "POST",
    headers: signedHeaders("POST", "/v1/leases", LEASE_BODY),
    body: LEASE_BODY,
  });

  const ready = await fetch(`${loopbackUrl}/internal/ready`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "path-1" }),
  });
  assert.equal(ready.status, 204);
  assert.equal(store.get("lease-1").publishing, true);

  const destination = await fetch(`${loopbackUrl}/internal/destination?path=path-1`);
  assert.equal(destination.status, 200);
  assert.deepEqual(await destination.json(), { rtmpUrl: "rtmp://rtmp.livepeer.com/live/secret-key" });
  assert.equal((await fetch(`${loopbackUrl}/internal/destination?path=path-404`)).status, 404);

  const notReady = await fetch(`${loopbackUrl}/internal/not-ready`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "path-1" }),
  });
  assert.equal(notReady.status, 204);
  assert.equal(store.get("lease-1").publishing, false);
});
