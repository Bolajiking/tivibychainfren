import assert from "node:assert/strict";
import { test } from "node:test";

const helpers = await import("../scripts/livepeer-e2e-helpers.mjs");

test("sessionConfirmPath uses Livepeer Sessions parentId filtering", () => {
  assert.equal(helpers.sessionConfirmPath("stream-123"), "/session?parentId=stream-123");
  assert.equal(helpers.sessionConfirmPath("  stream with/slash  "), "/session?parentId=stream+with%2Fslash");
});

test("selectParentSession never falls back to an unrelated session", () => {
  const payload = {
    data: [
      { id: "other", parentId: "other-stream" },
      { id: "match", parentId: "stream-123" },
    ],
  };
  assert.deepEqual(helpers.selectParentSession(payload, "stream-123"), { id: "match", parentId: "stream-123" });
  assert.equal(helpers.selectParentSession(payload, "missing-stream"), null);
});
