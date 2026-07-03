import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const contract = await loadTsModule(new URL("../src/lib/livepeer/h264-contract.ts", import.meta.url));

test("capability gate fails closed with bridge_unsupported_codec before any signaling", () => {
  for (const capabilities of [
    null,
    undefined,
    {},
    { codecs: [] },
    { codecs: [{ mimeType: "video/VP8" }, { mimeType: "video/VP9" }, { mimeType: "video/AV1" }] },
  ]) {
    const verdict = contract.evaluateBridgeCodecGate(capabilities);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reasonCode, "bridge_unsupported_codec");
  }
});

test("capability gate passes when any H.264 payload variant exists", () => {
  for (const mimeType of ["video/H264", "video/h264", "VIDEO/H264"]) {
    const verdict = contract.evaluateBridgeCodecGate({
      codecs: [{ mimeType: "video/VP8" }, { mimeType }],
    });
    assert.deepEqual(verdict, { ok: true });
  }
});

test("codec preference ordering puts every H.264 variant first and retains the rest in order", () => {
  const codecs = [
    { mimeType: "video/VP8", clockRate: 90000 },
    { mimeType: "video/H264", sdpFmtpLine: "profile-level-id=42e01f" },
    { mimeType: "video/VP9" },
    { mimeType: "video/H264", sdpFmtpLine: "profile-level-id=640c1f" },
    { mimeType: "video/AV1" },
  ];
  const ordered = contract.orderBridgeVideoCodecPreferences(codecs);
  assert.deepEqual(
    ordered.map((codec) => codec.sdpFmtpLine ?? codec.mimeType),
    ["profile-level-id=42e01f", "profile-level-id=640c1f", "video/VP8", "video/VP9", "video/AV1"],
  );
  assert.deepEqual(contract.orderBridgeVideoCodecPreferences([]), []);
  assert.deepEqual(contract.orderBridgeVideoCodecPreferences(undefined), []);
});

test("negotiated codec verdict confirms only outbound video/H264", () => {
  assert.equal(contract.negotiatedBridgeVideoCodecVerdict("video/H264"), "h264");
  assert.equal(contract.negotiatedBridgeVideoCodecVerdict("video/h264"), "h264");
  assert.equal(contract.negotiatedBridgeVideoCodecVerdict(null), "pending");
  assert.equal(contract.negotiatedBridgeVideoCodecVerdict(undefined), "pending");
  assert.equal(contract.negotiatedBridgeVideoCodecVerdict(""), "pending");
  assert.equal(contract.negotiatedBridgeVideoCodecVerdict("video/VP8"), "mismatch");
});

test("a codec mismatch maps to the bridge_codec_mismatch abort reason", () => {
  const verdict = contract.evaluateNegotiatedBridgeVideoCodec("video/VP8");
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reasonCode, "bridge_codec_mismatch");
  assert.deepEqual(contract.evaluateNegotiatedBridgeVideoCodec("video/H264"), { ok: true });
  const pending = contract.evaluateNegotiatedBridgeVideoCodec(null);
  assert.equal(pending.ok, false);
  assert.equal(pending.reasonCode, undefined);
  assert.equal(pending.pending, true);
});
