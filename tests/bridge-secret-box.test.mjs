import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const box = await loadTsModule(new URL("../src/lib/bridge/secret-box.ts", import.meta.url));

const KEY = "control-secret-abc";
const OTHER_KEY = "control-secret-xyz";

test("sealed credentials round-trip under the same key", () => {
  const sealed = box.sealBridgeSecret("publish-token-1", KEY);
  assert.equal(box.openBridgeSecret(sealed, KEY), "publish-token-1");
});

test("the envelope never contains the plaintext and is versioned", () => {
  const sealed = box.sealBridgeSecret("publish-token-1", KEY);
  assert.ok(!sealed.includes("publish-token-1"), "plaintext must not survive into the envelope");
  assert.equal(sealed.split(".").length, 4);
  assert.equal(sealed.split(".")[0], "v1");
});

test("the same plaintext seals differently every time (fresh nonce)", () => {
  const a = box.sealBridgeSecret("publish-token-1", KEY);
  const b = box.sealBridgeSecret("publish-token-1", KEY);
  assert.notEqual(a, b, "a reused nonce would leak equality across rows");
  assert.equal(box.openBridgeSecret(a, KEY), box.openBridgeSecret(b, KEY));
});

test("a wrong key fails closed rather than returning garbage", () => {
  const sealed = box.sealBridgeSecret("publish-token-1", KEY);
  assert.equal(box.openBridgeSecret(sealed, OTHER_KEY), null);
});

test("tampered ciphertext, tag, or nonce fails closed", () => {
  const sealed = box.sealBridgeSecret("publish-token-1", KEY);
  const [version, iv, tag, ct] = sealed.split(".");

  const flip = (s) => (s.startsWith("A") ? `B${s.slice(1)}` : `A${s.slice(1)}`);
  assert.equal(box.openBridgeSecret([version, iv, tag, flip(ct)].join("."), KEY), null, "ciphertext");
  assert.equal(box.openBridgeSecret([version, iv, flip(tag), ct].join("."), KEY), null, "auth tag");
  assert.equal(box.openBridgeSecret([version, flip(iv), tag, ct].join("."), KEY), null, "nonce");
});

test("malformed, empty, and future-version envelopes return null", () => {
  for (const bad of [null, undefined, "", "not-an-envelope", "v1.a.b", "v2.a.b.c"]) {
    assert.equal(box.openBridgeSecret(bad, KEY), null, String(bad));
  }
});

test("opening without a key returns null instead of throwing", () => {
  const sealed = box.sealBridgeSecret("publish-token-1", KEY);
  assert.equal(box.openBridgeSecret(sealed, ""), null);
});

test("sealing without a key is a hard error, never a plaintext passthrough", () => {
  assert.throws(() => box.sealBridgeSecret("publish-token-1", ""), /bridge_secret_box_missing_key/);
});

test("bridgeSecretEquals compares safely and rejects non-strings", () => {
  assert.equal(box.bridgeSecretEquals("res-1", "res-1"), true);
  assert.equal(box.bridgeSecretEquals("res-1", "res-2"), false);
  assert.equal(box.bridgeSecretEquals("res-1", "res-1-longer"), false);
  assert.equal(box.bridgeSecretEquals(null, null), false);
  assert.equal(box.bridgeSecretEquals(undefined, "res-1"), false);
});
