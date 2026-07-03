import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const clientModule = await loadTsModule(new URL("../src/lib/bridge/agent-client.ts", import.meta.url));
const hmac = await loadTsModule(new URL("../src/lib/bridge/hmac.ts", import.meta.url));

const SECRET = "control-secret";
const NOW_SECONDS = 1_750_000_000;

function createClient(handler, overrides = {}) {
  const calls = [];
  const client = clientModule.createBridgeAgentClient({
    controlUrl: "https://bridge.example.com:8443",
    controlSecret: SECRET,
    nowSeconds: () => NOW_SECONDS,
    mintNonce: () => "nonce-fixed",
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return handler(url, init);
    },
    ...overrides,
  });
  return { client, calls };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("createLease signs the request so the agent can verify it", async () => {
  const { client, calls } = createClient(() =>
    jsonResponse(201, {
      leaseId: "lease-1",
      whipUrl: "https://127.0.0.1:8889/opaque-path/whip",
      publishToken: "publish-token",
      expiresAt: "2026-07-03T00:01:00Z",
    }),
  );
  const lease = await client.createLease({
    leaseId: "lease-1",
    attemptId: "attempt-1",
    creatorId: "0xabc",
    rtmpUrl: "rtmp://rtmp.livepeer.com/live/streamkey",
  });
  assert.equal(lease.leaseId, "lease-1");
  assert.equal(lease.whipUrl, "https://127.0.0.1:8889/opaque-path/whip");

  const [{ url, init }] = calls;
  assert.equal(url, "https://bridge.example.com:8443/v1/leases");
  assert.equal(init.method, "POST");
  const verdict = hmac.verifyBridgeSignature(SECRET, {
    method: "POST",
    path: "/v1/leases",
    timestampSeconds: Number(init.headers["x-tvinbio-timestamp"]),
    nonce: init.headers["x-tvinbio-nonce"],
    body: init.body,
    signature: init.headers["x-tvinbio-signature"],
    nowSeconds: NOW_SECONDS,
    nonceStore: hmac.createBridgeNonceStore(),
  });
  assert.deepEqual(verdict, { ok: true }, "agent-side verification of the client signature succeeds");
});

test("createLease failure surfaces as null without throwing", async () => {
  const { client } = createClient(() => jsonResponse(503, { error: "overloaded" }));
  assert.equal(await client.createLease({ leaseId: "l", attemptId: "a", creatorId: "c", rtmpUrl: "rtmp://x/y/z" }), null);
  const { client: down } = createClient(() => {
    throw new Error("connect refused");
  });
  assert.equal(await down.createLease({ leaseId: "l", attemptId: "a", creatorId: "c", rtmpUrl: "rtmp://x/y/z" }), null);
});

test("revokeLease is fire-safe: 204 and 404 and network errors all resolve", async () => {
  for (const handler of [() => new Response(null, { status: 204 }), () => new Response(null, { status: 404 }), () => { throw new Error("down"); }]) {
    const { client } = createClient(handler);
    await assert.doesNotReject(() => client.revokeLease("lease-1"));
  }
});

test("health reflects the agent healthz endpoint", async () => {
  const { client, calls } = createClient(() => jsonResponse(200, { ok: true }));
  assert.equal(await client.health(), true);
  assert.equal(new URL(calls[0].url).pathname, "/healthz");

  const { client: sick } = createClient(() => jsonResponse(500, {}));
  assert.equal(await sick.health(), false);
  const { client: dead } = createClient(() => {
    throw new Error("down");
  });
  assert.equal(await dead.health(), false);
});

test("leaseStatus reports publishing state and null when unknown", async () => {
  const { client } = createClient(() => jsonResponse(200, { leaseId: "lease-1", status: "publishing", publishing: true }));
  assert.deepEqual(await client.leaseStatus("lease-1"), { status: "publishing", publishing: true });
  const { client: missing } = createClient(() => jsonResponse(404, {}));
  assert.equal(await missing.leaseStatus("lease-1"), null);
});

test("heartbeatLease returns false when the lease is gone", async () => {
  const { client } = createClient(() => new Response(null, { status: 204 }));
  assert.equal(await client.heartbeatLease("lease-1"), true);
  const { client: gone } = createClient(() => new Response(null, { status: 404 }));
  assert.equal(await gone.heartbeatLease("lease-1"), false);
});

test("the RTMP destination never appears in client logs or errors", async () => {
  const logged = [];
  const { client } = createClient(() => jsonResponse(500, {}), {
    log: (entry) => logged.push(entry),
  });
  await client.createLease({
    leaseId: "l",
    attemptId: "a",
    creatorId: "c",
    rtmpUrl: "rtmp://rtmp.livepeer.com/live/super-secret-key",
  });
  const serialized = JSON.stringify(logged);
  assert.ok(!serialized.includes("super-secret-key"));
  assert.ok(!serialized.toLowerCase().includes("rtmp://"));
});
