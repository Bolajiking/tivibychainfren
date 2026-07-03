import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const policy = await loadTsModule(new URL("../src/lib/bridge/whip-proxy-policy.ts", import.meta.url));

test("method and content-type gates follow spec §7.5", () => {
  assert.deepEqual(
    policy.evaluateWhipProxyRequest({ method: "POST", contentType: "application/sdp", bodyBytes: 2_000 }),
    { ok: true },
  );
  assert.deepEqual(
    policy.evaluateWhipProxyRequest({
      method: "PATCH",
      contentType: "application/trickle-ice-sdpfrag",
      bodyBytes: 500,
    }),
    { ok: true },
  );
  assert.deepEqual(policy.evaluateWhipProxyRequest({ method: "DELETE", contentType: null, bodyBytes: 0 }), {
    ok: true,
  });

  const wrongType = policy.evaluateWhipProxyRequest({
    method: "POST",
    contentType: "application/json",
    bodyBytes: 100,
  });
  assert.equal(wrongType.ok, false);
  assert.equal(wrongType.status, 415);

  const patchWrong = policy.evaluateWhipProxyRequest({ method: "PATCH", contentType: "application/sdp", bodyBytes: 10 });
  assert.equal(patchWrong.status, 415);

  const badMethod = policy.evaluateWhipProxyRequest({ method: "GET", contentType: null, bodyBytes: 0 });
  assert.equal(badMethod.ok, false);
  assert.equal(badMethod.status, 405);
});

test("content types tolerate parameters and casing", () => {
  assert.deepEqual(
    policy.evaluateWhipProxyRequest({ method: "post", contentType: "Application/SDP; charset=utf-8", bodyBytes: 10 }),
    { ok: true },
  );
});

test("body limits: POST 128 KB, PATCH 32 KB", () => {
  assert.equal(policy.WHIP_PROXY_MAX_POST_BODY_BYTES, 128 * 1024);
  assert.equal(policy.WHIP_PROXY_MAX_PATCH_BODY_BYTES, 32 * 1024);
  const bigPost = policy.evaluateWhipProxyRequest({
    method: "POST",
    contentType: "application/sdp",
    bodyBytes: 128 * 1024 + 1,
  });
  assert.equal(bigPost.ok, false);
  assert.equal(bigPost.status, 413);
  const bigPatch = policy.evaluateWhipProxyRequest({
    method: "PATCH",
    contentType: "application/trickle-ice-sdpfrag",
    bodyBytes: 32 * 1024 + 1,
  });
  assert.equal(bigPatch.status, 413);
});

test("upstream status mapping: POST passes 201 only", () => {
  assert.deepEqual(policy.mapWhipUpstreamOutcome({ method: "POST", upstreamStatus: 201 }), {
    kind: "success",
    status: 201,
  });
  for (const upstreamStatus of [200, 202, 301]) {
    const outcome = policy.mapWhipUpstreamOutcome({ method: "POST", upstreamStatus });
    assert.equal(outcome.kind, "error");
    assert.equal(outcome.reasonCode, "bridge_signaling_rejected");
    assert.equal(outcome.status, 502);
  }
});

test("upstream 4xx maps to bridge_signaling_rejected, 5xx and timeouts to bridge_unavailable", () => {
  for (const upstreamStatus of [400, 401, 403, 404]) {
    const outcome = policy.mapWhipUpstreamOutcome({ method: "POST", upstreamStatus });
    assert.deepEqual(outcome, { kind: "error", status: 502, reasonCode: "bridge_signaling_rejected" });
  }
  for (const upstreamStatus of [500, 502, 503, null]) {
    const outcome = policy.mapWhipUpstreamOutcome({ method: "POST", upstreamStatus });
    assert.deepEqual(outcome, { kind: "error", status: 503, reasonCode: "bridge_unavailable" });
  }
});

test("PATCH passes 204; DELETE treats 200, 204, and 404 as success", () => {
  assert.deepEqual(policy.mapWhipUpstreamOutcome({ method: "PATCH", upstreamStatus: 204 }), {
    kind: "success",
    status: 204,
  });
  assert.equal(policy.mapWhipUpstreamOutcome({ method: "PATCH", upstreamStatus: 200 }).kind, "error");
  for (const upstreamStatus of [200, 204, 404]) {
    assert.deepEqual(policy.mapWhipUpstreamOutcome({ method: "DELETE", upstreamStatus }), {
      kind: "success",
      status: 204,
    });
  }
});

test("response headers are allow-listed to content-type, location, etag, link", () => {
  const filtered = policy.filterWhipResponseHeaders({
    "Content-Type": "application/sdp",
    Location: "/rewritten",
    ETag: '"abc"',
    Link: '<stun:stun.example.com>; rel="ice-server"',
    "Set-Cookie": "session=leak",
    Server: "mediamtx",
    "X-Internal": "leak",
  });
  assert.deepEqual(filtered, {
    "content-type": "application/sdp",
    location: "/rewritten",
    etag: '"abc"',
    link: '<stun:stun.example.com>; rel="ice-server"',
  });
});

test("upstream request headers forward only content-type and content-length", () => {
  const filtered = policy.filterWhipUpstreamRequestHeaders({
    "content-type": "application/sdp",
    "content-length": "1234",
    authorization: "Bearer browser-token",
    cookie: "privy=secret",
    "user-agent": "Mozilla/5.0",
  });
  assert.deepEqual(filtered, { "content-type": "application/sdp", "content-length": "1234" });
});

test("location rewrite yields the same-origin resource path", () => {
  assert.equal(
    policy.rewriteWhipLocation("attempt-1", "res-9"),
    "/api/bridge/attempts/attempt-1/whip/resource/res-9",
  );
});

test("resource map mints opaque ids, replaces the previous resource, and releases idempotently", () => {
  let counter = 0;
  const map = policy.createWhipResourceMap({ mintId: () => `res-${++counter}` });
  const upstream = "https://127.0.0.1:8889/lease-path/whip/rand-uuid";

  const first = map.register("attempt-1", upstream);
  assert.equal(first.resourceId, "res-1");
  assert.equal(first.replacedUpstreamUrl, null);
  assert.ok(!first.resourceId.includes("lease-path"));
  assert.equal(map.resolve("attempt-1", "res-1"), upstream);
  assert.equal(map.resolve("attempt-1", "res-404"), null);
  assert.equal(map.resolve("attempt-2", "res-1"), null);

  const second = map.register("attempt-1", "https://127.0.0.1:8889/lease-path/whip/other");
  assert.equal(second.replacedUpstreamUrl, upstream, "one live resource per attempt: caller must tear the old one down");
  assert.equal(map.resolve("attempt-1", "res-1"), null, "the replaced resource is gone");

  assert.equal(map.release("attempt-1", "res-2"), "https://127.0.0.1:8889/lease-path/whip/other");
  assert.equal(map.release("attempt-1", "res-2"), null, "release is idempotent");
  assert.equal(map.resolve("attempt-1", "res-2"), null);
});

test("releasing an attempt clears its mapping and returns the upstream URL for teardown", () => {
  const map = policy.createWhipResourceMap({ mintId: () => "res-a" });
  map.register("attempt-9", "https://127.0.0.1:8889/p/whip/x");
  assert.equal(map.releaseAttempt("attempt-9"), "https://127.0.0.1:8889/p/whip/x");
  assert.equal(map.releaseAttempt("attempt-9"), null);
});
