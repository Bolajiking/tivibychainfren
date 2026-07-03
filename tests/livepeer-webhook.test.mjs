import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const wh = await loadTsModule(new URL("../src/lib/livepeer/webhook.ts", import.meta.url));

const SECRET = "whsec_test";
const sign = (payload) => createHmac("sha256", SECRET).update(payload).digest("hex");

test("verifyLivepeerSignature accepts the t.body scheme", () => {
  const body = '{"event":"stream.started"}';
  const t = "1700000000";
  const header = `t=${t},v1=${sign(`${t}.${body}`)}`;
  assert.equal(wh.verifyLivepeerSignature(body, header, SECRET), true);
});

test("verifyLivepeerSignature accepts a bare body signature", () => {
  const body = '{"event":"stream.idle"}';
  assert.equal(wh.verifyLivepeerSignature(body, sign(body), SECRET), true);
});

test("verifyLivepeerSignature rejects wrong secret, tampered body, and missing inputs", () => {
  const body = '{"event":"stream.started"}';
  const header = `t=1,v1=${sign(`1.${body}`)}`;
  assert.equal(wh.verifyLivepeerSignature(body, header, "wrong"), false);
  assert.equal(wh.verifyLivepeerSignature('{"event":"x"}', header, SECRET), false);
  assert.equal(wh.verifyLivepeerSignature(body, header, undefined), false);
  assert.equal(wh.verifyLivepeerSignature(body, null, SECRET), false);
});

test("parseStreamWebhook extracts event + stream id from varied shapes", () => {
  assert.deepEqual(wh.parseStreamWebhook({ event: "stream.started", stream: { id: "abc" } }), { event: "stream.started", livepeerStreamId: "abc" });
  assert.deepEqual(wh.parseStreamWebhook({ event: "stream.idle", payload: { id: "def" } }), { event: "stream.idle", livepeerStreamId: "def" });
  assert.deepEqual(wh.parseStreamWebhook({ event: "x" }), { event: "x", livepeerStreamId: null });
});
