import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const hmac = await loadTsModule(new URL("../src/lib/bridge/hmac.ts", import.meta.url));

const SECRET = "test-control-secret";
const NOW_SECONDS = 1_750_000_000;

function request(overrides = {}) {
  return {
    method: "post",
    path: "/v1/leases",
    timestampSeconds: NOW_SECONDS,
    nonce: "nonce-1",
    body: '{"attemptId":"a1"}',
    ...overrides,
  };
}

test("canonical signing string is method, path, timestamp, nonce, and body hash joined by newlines", () => {
  const canonical = hmac.canonicalBridgeSigningString(request());
  const bodyHash = createHash("sha256").update('{"attemptId":"a1"}', "utf8").digest("hex");
  assert.equal(canonical, `POST\n/v1/leases\n${NOW_SECONDS}\nnonce-1\n${bodyHash}`);
});

test("sign and verify round-trip", () => {
  const signature = hmac.signBridgeRequest(SECRET, request());
  const expected = createHmac("sha256", SECRET).update(hmac.canonicalBridgeSigningString(request()), "utf8").digest("hex");
  assert.equal(signature, expected);
  const verdict = hmac.verifyBridgeSignature(SECRET, {
    ...request(),
    signature,
    nowSeconds: NOW_SECONDS,
    nonceStore: hmac.createBridgeNonceStore(),
  });
  assert.deepEqual(verdict, { ok: true });
});

test("a tampered body is rejected", () => {
  const signature = hmac.signBridgeRequest(SECRET, request());
  const verdict = hmac.verifyBridgeSignature(SECRET, {
    ...request({ body: '{"attemptId":"a2"}' }),
    signature,
    nowSeconds: NOW_SECONDS,
    nonceStore: hmac.createBridgeNonceStore(),
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "bad_signature");
});

test("clock skew is accepted up to ±120 seconds and rejected beyond", () => {
  for (const [drift, ok] of [
    [0, true],
    [120, true],
    [-120, true],
    [121, false],
    [-121, false],
  ]) {
    const req = request({ nonce: `nonce-${drift}` });
    const signature = hmac.signBridgeRequest(SECRET, req);
    const verdict = hmac.verifyBridgeSignature(SECRET, {
      ...req,
      signature,
      nowSeconds: NOW_SECONDS + drift,
      nonceStore: hmac.createBridgeNonceStore(),
    });
    assert.equal(verdict.ok, ok, `drift ${drift}`);
    if (!ok) assert.equal(verdict.reason, "skew");
  }
});

test("a reused nonce within the retention window is rejected as replay", () => {
  const store = hmac.createBridgeNonceStore();
  const signature = hmac.signBridgeRequest(SECRET, request());
  const first = hmac.verifyBridgeSignature(SECRET, {
    ...request(),
    signature,
    nowSeconds: NOW_SECONDS,
    nonceStore: store,
  });
  assert.equal(first.ok, true);
  const replay = hmac.verifyBridgeSignature(SECRET, {
    ...request(),
    signature,
    nowSeconds: NOW_SECONDS + 5,
    nonceStore: store,
  });
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, "replay");
});

test("nonces expire after the ten-minute retention window", () => {
  const store = hmac.createBridgeNonceStore();
  assert.equal(store.seen("n1", NOW_SECONDS * 1000), false);
  assert.equal(store.seen("n1", NOW_SECONDS * 1000 + 10 * 60_000 + 1), false, "expired nonce may be reused");
});

test("the nonce store is bounded to 10000 entries with LRU eviction", () => {
  assert.equal(hmac.BRIDGE_NONCE_MAX_ENTRIES, 10_000);
  const store = hmac.createBridgeNonceStore({ maxEntries: 3 });
  const now = NOW_SECONDS * 1000;
  store.seen("a", now);
  store.seen("b", now);
  store.seen("c", now);
  store.seen("d", now);
  assert.equal(store.size(), 3);
  assert.equal(store.seen("a", now + 1), false, "oldest entry was evicted");
});

test("a bad or wrong-length signature is rejected without throwing", () => {
  for (const signature of ["", "deadbeef", "zz".repeat(32), hmac.signBridgeRequest("other-secret", request())]) {
    const verdict = hmac.verifyBridgeSignature(SECRET, {
      ...request({ nonce: `nonce-${signature.length}-${signature.slice(0, 4)}` }),
      signature,
      nowSeconds: NOW_SECONDS,
      nonceStore: hmac.createBridgeNonceStore(),
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "bad_signature");
  }
});

test("verification checks the nonce only after the signature, so probing cannot burn nonces", () => {
  const store = hmac.createBridgeNonceStore();
  const bad = hmac.verifyBridgeSignature(SECRET, {
    ...request(),
    signature: "00".repeat(32),
    nowSeconds: NOW_SECONDS,
    nonceStore: store,
  });
  assert.equal(bad.ok, false);
  const genuine = hmac.verifyBridgeSignature(SECRET, {
    ...request(),
    signature: hmac.signBridgeRequest(SECRET, request()),
    nowSeconds: NOW_SECONDS,
    nonceStore: store,
  });
  assert.equal(genuine.ok, true, "a failed forgery must not consume the nonce");
});

test("exported constants match the spec table", () => {
  assert.equal(hmac.BRIDGE_HMAC_SKEW_SECONDS, 120);
  assert.equal(hmac.BRIDGE_NONCE_RETENTION_MS, 10 * 60_000);
});
