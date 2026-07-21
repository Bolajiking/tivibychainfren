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

test("an unmapped stream is acknowledged, not retried", () => {
  // Livepeer redelivers on any non-2xx and disables a webhook that keeps
  // failing. A stream it knows and we don't (deleted channel, stream created
  // directly in Studio, an e2e test's temp stream) can never produce a row, so
  // a 500 here is an infinite retry loop that takes live status down with it.
  const outcome = wh.streamUpdateOutcome({ updateFailed: false, playbackId: null });
  assert.equal(outcome.status, 200);
  assert.deepEqual(outcome.body, { ok: true, ignored: "unmapped_stream" });
});

test("a database failure still returns 500 so Livepeer redelivers", () => {
  const outcome = wh.streamUpdateOutcome({ updateFailed: true, playbackId: null });
  assert.equal(outcome.status, 500);
  assert.equal(outcome.body.ok, false);
  assert.equal(outcome.body.error, "stream_status_update_failed");
});

test("a mapped stream reports the playback id it flipped", () => {
  const outcome = wh.streamUpdateOutcome({ updateFailed: false, playbackId: "live-ada" });
  assert.equal(outcome.status, 200);
  assert.deepEqual(outcome.body, { ok: true, playbackId: "live-ada" });
});

test("an update failure outranks a matched row", () => {
  const outcome = wh.streamUpdateOutcome({ updateFailed: true, playbackId: "live-ada" });
  assert.equal(outcome.status, 500, "never report success when the write failed");
});

test("parseStreamWebhook extracts event + stream id from varied shapes", () => {
  assert.deepEqual(wh.parseStreamWebhook({ event: "stream.started", stream: { id: "abc" } }), { event: "stream.started", livepeerStreamId: "abc" });
  assert.deepEqual(wh.parseStreamWebhook({ event: "stream.idle", payload: { id: "def" } }), { event: "stream.idle", livepeerStreamId: "def" });
  assert.deepEqual(wh.parseStreamWebhook({ event: "x" }), { event: "x", livepeerStreamId: null });
});
