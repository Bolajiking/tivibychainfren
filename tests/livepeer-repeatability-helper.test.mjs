import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRepeatabilityPlan,
  formatRepeatabilityReport,
  summarizeRepeatabilityRuns,
} from "../scripts/livepeer-repeatability-helpers.mjs";

test("buildRepeatabilityPlan rejects invalid counts before running network checks", () => {
  assert.throws(
    () => buildRepeatabilityPlan({ mode: "rtmp", count: "0" }),
    /count must be a positive integer/,
  );
  assert.throws(
    () => buildRepeatabilityPlan({ mode: "browser-whip", count: "1.5" }),
    /count must be a positive integer/,
  );
});

test("buildRepeatabilityPlan describes the intended Livepeer gate without secrets", () => {
  const plan = buildRepeatabilityPlan({ mode: "rtmp", count: "20" });

  assert.equal(plan.mode, "rtmp");
  assert.equal(plan.count, 20);
  assert.equal(plan.label, "RTMP Livepeer session repeatability");
  assert.deepEqual(plan.commands, [
    "node scripts/livepeer-rtmp-e2e-test.mjs",
  ]);
});

test("summarizeRepeatabilityRuns requires every run to pass consecutively", () => {
  const summary = summarizeRepeatabilityRuns([
    { ok: true, label: "run 1", durationMs: 120 },
    { ok: true, label: "run 2", durationMs: 140 },
    { ok: false, label: "run 3", durationMs: 90, error: "session pending" },
    { ok: true, label: "run 4", durationMs: 110 },
  ]);

  assert.equal(summary.total, 4);
  assert.equal(summary.passed, 3);
  assert.equal(summary.failed, 1);
  assert.equal(summary.consecutivePasses, 1);
  assert.equal(summary.ok, false);
});

test("formatRepeatabilityReport is checklist-friendly", () => {
  const summary = summarizeRepeatabilityRuns([
    { ok: true, label: "run 1", durationMs: 120 },
    { ok: true, label: "run 2", durationMs: 140 },
  ]);

  assert.equal(
    formatRepeatabilityReport("RTMP Livepeer session repeatability", summary),
    "RTMP Livepeer session repeatability: 2/2 passed, 2 consecutive, 0 failed.",
  );
});

test("VOD repeatability uses the cleanup-safe playable-asset verifier", () => {
  const plan = buildRepeatabilityPlan({ mode: "vod", count: "20" });

  assert.deepEqual(plan.commands, [
    "node scripts/livepeer-vod-e2e-test.mjs <small-mp4-file>",
  ]);
});

test("bridge WHIP repeatability is labeled separately from direct Livepeer WHIP", () => {
  const plan = buildRepeatabilityPlan({ mode: "bridge-whip", count: "20" });

  assert.equal(plan.label, "Authenticated WHIP-to-RTMP bridge repeatability");
  assert.deepEqual(plan.commands, [
    "node scripts/livepeer-bridge-local-test.mjs",
  ]);
});
