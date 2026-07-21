import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const proxyModule = await loadTsModule(new URL("../src/lib/bridge/whip-proxy.ts", import.meta.url));
const storeModule = await loadTsModule(new URL("../src/lib/bridge/session-store.ts", import.meta.url));

const UPSTREAM_WHIP = "https://127.0.0.1:8889/opaque-lease/whip";

function createProxy(handler, overrides = {}) {
  const upstreamCalls = [];
  let counter = 0;
  const store = storeModule.createInMemorySessionStore({ mintId: () => `res-${++counter}` });
  const attempts = new Map([
    ["attempt-1", { whipUpstreamUrl: UPSTREAM_WHIP, publishToken: "publish-token-1" }],
    ["attempt-nolease", { whipUpstreamUrl: null, publishToken: null }],
  ]);
  const proxy = proxyModule.createWhipProxy({
    resolveAttempt: async (attemptId) => attempts.get(attemptId) ?? null,
    resources: store,
    upstreamFetch: async (url, init) => {
      upstreamCalls.push({ url, init });
      return handler(url, init);
    },
    ...overrides,
  });
  return { proxy, upstreamCalls, store };
}

function sdpCreated(location = `${UPSTREAM_WHIP}/session-xyz`) {
  return new Response("v=0 answer", {
    status: 201,
    headers: {
      "content-type": "application/sdp",
      location,
      etag: '"tag"',
      server: "mediamtx/1.19.2",
      "set-cookie": "leak=1",
    },
  });
}

test("POST proxies the offer, rewrites Location to same-origin, and filters headers", async () => {
  const { proxy, upstreamCalls } = createProxy(() => sdpCreated());
  const result = await proxy.post({ attemptId: "attempt-1", contentType: "application/sdp", body: "v=0 offer" });

  assert.equal(result.status, 201);
  assert.equal(result.body, "v=0 answer");
  assert.equal(result.headers.location, "/api/bridge/attempts/attempt-1/whip/resource/res-1");
  assert.equal(result.headers["content-type"], "application/sdp");
  assert.equal(result.headers.etag, '"tag"');
  assert.equal(result.headers["set-cookie"], undefined);
  assert.equal(result.headers.server, undefined);

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, UPSTREAM_WHIP);
  assert.equal(upstreamCalls[0].init.method, "POST");
  assert.equal(upstreamCalls[0].init.headers.authorization, "Bearer publish-token-1");
  assert.equal(upstreamCalls[0].init.headers["content-type"], "application/sdp");
});

test("request gates reject before any upstream contact", async () => {
  const { proxy, upstreamCalls } = createProxy(() => sdpCreated());
  const badType = await proxy.post({ attemptId: "attempt-1", contentType: "application/json", body: "{}" });
  assert.equal(badType.status, 415);
  const tooBig = await proxy.post({
    attemptId: "attempt-1",
    contentType: "application/sdp",
    body: "x".repeat(128 * 1024 + 1),
  });
  assert.equal(tooBig.status, 413);
  assert.equal(upstreamCalls.length, 0);
});

test("an attempt without a bridge lease yields bridge_unavailable", async () => {
  const { proxy, upstreamCalls } = createProxy(() => sdpCreated());
  const result = await proxy.post({ attemptId: "attempt-nolease", contentType: "application/sdp", body: "v=0" });
  assert.equal(result.status, 503);
  assert.equal(result.reasonCode, "bridge_unavailable");
  assert.equal(upstreamCalls.length, 0);
});

test("an unknown attempt yields attempt_not_found", async () => {
  const { proxy } = createProxy(() => sdpCreated());
  const result = await proxy.post({ attemptId: "attempt-404", contentType: "application/sdp", body: "v=0" });
  assert.equal(result.status, 404);
  assert.equal(result.reasonCode, "attempt_not_found");
});

test("upstream failure maps per policy: 5xx/timeout → 503, 4xx → 502 without upstream detail", async () => {
  const { proxy } = createProxy(() => new Response("boom", { status: 500 }));
  const unavailable = await proxy.post({ attemptId: "attempt-1", contentType: "application/sdp", body: "v=0" });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.reasonCode, "bridge_unavailable");
  assert.equal(unavailable.body, null, "upstream body is not leaked");

  const { proxy: rejecting } = createProxy(() => new Response("denied", { status: 403 }));
  const rejected = await rejecting.post({ attemptId: "attempt-1", contentType: "application/sdp", body: "v=0" });
  assert.equal(rejected.status, 502);
  assert.equal(rejected.reasonCode, "bridge_signaling_rejected");

  const { proxy: down } = createProxy(() => {
    throw new Error("timeout");
  });
  const timedOut = await down.post({ attemptId: "attempt-1", contentType: "application/sdp", body: "v=0" });
  assert.equal(timedOut.status, 503);
});

test("a second POST replaces the first resource and tears the old one down upstream", async () => {
  const { proxy, upstreamCalls } = createProxy((url, init) =>
    init.method === "DELETE" ? new Response(null, { status: 204 }) : sdpCreated(`${UPSTREAM_WHIP}/session-${upstreamCalls.length}`),
  );
  await proxy.post({ attemptId: "attempt-1", contentType: "application/sdp", body: "v=0" });
  const second = await proxy.post({ attemptId: "attempt-1", contentType: "application/sdp", body: "v=0" });
  assert.equal(second.status, 201);
  assert.equal(second.headers.location, "/api/bridge/attempts/attempt-1/whip/resource/res-2");
  const deletes = upstreamCalls.filter((call) => call.init.method === "DELETE");
  assert.equal(deletes.length, 1);
  assert.ok(deletes[0].url.startsWith(`${UPSTREAM_WHIP}/session-`));
});

test("PATCH forwards trickle ICE to the stored upstream resource", async () => {
  const { proxy, upstreamCalls } = createProxy((url, init) =>
    init.method === "PATCH" ? new Response(null, { status: 204 }) : sdpCreated(),
  );
  await proxy.post({ attemptId: "attempt-1", contentType: "application/sdp", body: "v=0" });
  const result = await proxy.patch({
    attemptId: "attempt-1",
    resourceId: "res-1",
    contentType: "application/trickle-ice-sdpfrag",
    body: "a=candidate",
  });
  assert.equal(result.status, 204);
  const patch = upstreamCalls.find((call) => call.init.method === "PATCH");
  assert.equal(patch.url, `${UPSTREAM_WHIP}/session-xyz`);

  const unknown = await proxy.patch({
    attemptId: "attempt-1",
    resourceId: "res-404",
    contentType: "application/trickle-ice-sdpfrag",
    body: "a=candidate",
  });
  assert.equal(unknown.status, 404);
});

test("DELETE is idempotent and clears the mapping even when upstream fails", async () => {
  const { proxy, store } = createProxy((url, init) =>
    init.method === "DELETE" ? new Response("err", { status: 500 }) : sdpCreated(),
  );
  await proxy.post({ attemptId: "attempt-1", contentType: "application/sdp", body: "v=0" });
  const result = await proxy.del({ attemptId: "attempt-1", resourceId: "res-1" });
  assert.equal(result.status, 204, "teardown reports success to the browser; revoking the lease kicks the publisher anyway");
  assert.equal(await store.resolveResource("attempt-1", "res-1"), null, "mapping cleared despite upstream 500");

  const again = await proxy.del({ attemptId: "attempt-1", resourceId: "res-1" });
  assert.equal(again.status, 204, "second DELETE is still success");
});

test("relative upstream Location headers resolve against the lease WHIP url", async () => {
  const { proxy, upstreamCalls } = createProxy((url, init) => {
    if (init.method === "PATCH") return new Response(null, { status: 204 });
    return sdpCreated("/opaque-lease/whip/session-relative");
  });
  const result = await proxy.post({ attemptId: "attempt-1", contentType: "application/sdp", body: "v=0" });
  assert.equal(result.status, 201);
  await proxy.patch({
    attemptId: "attempt-1",
    resourceId: "res-1",
    contentType: "application/trickle-ice-sdpfrag",
    body: "a=candidate",
  });
  const patch = upstreamCalls.find((call) => call.init.method === "PATCH");
  assert.equal(patch.url, "https://127.0.0.1:8889/opaque-lease/whip/session-relative");
});

test("a POST without an upstream Location cannot mint a resource", async () => {
  const { proxy } = createProxy(
    () => new Response("v=0 answer", { status: 201, headers: { "content-type": "application/sdp" } }),
  );
  const result = await proxy.post({ attemptId: "attempt-1", contentType: "application/sdp", body: "v=0" });
  assert.equal(result.status, 502);
  assert.equal(result.reasonCode, "bridge_signaling_rejected");
});
