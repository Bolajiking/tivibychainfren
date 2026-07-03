import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const status = await loadTsModule(new URL("../src/lib/livepeer/public-live-status.ts", import.meta.url));

test("public Livepeer reconciliation bounds each control-plane read", () => {
  assert.equal(status.PUBLIC_LIVEPEER_STATUS_TIMEOUT_MS, 2_500);
});

const stream = {
  playbackId: "live-a",
  creatorId: "creator",
  title: "Live",
  viewMode: "free",
  amount: 0,
  isActive: false,
  viewerCount: 0,
  thumbColor: "#111",
  paidUsers: [],
  donationPresets: [],
  record: true,
  livepeerId: "lp-1",
};

test("isLivepeerStreamActive only accepts Livepeer's explicit active state", () => {
  assert.equal(status.isLivepeerStreamActive({ isActive: true }), true);
  assert.equal(status.isLivepeerStreamActive({ isActive: false }), false);
  assert.equal(status.isLivepeerStreamActive({ isActive: "true" }), false);
  assert.equal(status.isLivepeerStreamActive(null), false);
});

test("parseLivepeerStreamActive distinguishes explicit idle from an invalid response", () => {
  assert.equal(status.parseLivepeerStreamActive({ isActive: true }), true);
  assert.equal(status.parseLivepeerStreamActive({ isActive: false }), false);
  assert.equal(status.parseLivepeerStreamActive({ isActive: "false" }), null);
  assert.equal(status.parseLivepeerStreamActive({}), null);
  assert.equal(status.parseLivepeerStreamActive(null), null);
});

test("reconcileStreamFromLivepeerActivity clears stale public live state only on explicit idle", () => {
  const activeStream = { ...stream, isActive: true, viewerCount: 42 };

  const idle = status.reconcileStreamFromLivepeerActivity(activeStream, false);
  assert.equal(idle.isActive, false);
  assert.equal(idle.viewerCount, 0);

  assert.equal(status.reconcileStreamFromLivepeerActivity(activeStream, null), activeStream);
  assert.equal(status.reconcileStreamFromLivepeerActivity(activeStream, true), activeStream);
});

test("reconcileStreamFromLivepeerActivity promotes only an explicit active Livepeer stream", () => {
  const promoted = status.reconcileStreamFromLivepeerActivity(stream, true, { nowMs: 1_700_000_000_000 });
  assert.equal(promoted.isActive, true);
  assert.equal(promoted.startedAt, "2023-11-14T22:13:20.000Z");
  assert.equal(status.reconcileStreamFromLivepeerActivity(stream, null), stream);
});

test("loadLivepeerReconciliationEvidence starts activity and session reads together for an inactive row", async () => {
  const calls = [];
  let resolveActivity;
  let resolveSessions;
  const activity = new Promise((resolve) => { resolveActivity = resolve; });
  const sessions = new Promise((resolve) => { resolveSessions = resolve; });

  const resultPromise = status.loadLivepeerReconciliationEvidence({
    streamIsActive: false,
    readActivity: () => { calls.push("activity"); return activity; },
    readSessions: () => { calls.push("sessions"); return sessions; },
  });

  assert.deepEqual(calls, ["activity", "sessions"]);
  resolveActivity("active-response");
  resolveSessions("session-response");
  assert.deepEqual(await resultPromise, {
    activity: "active-response",
    sessions: "session-response",
  });
});

test("loadLivepeerReconciliationEvidence skips sessions when only idle repair is needed", async () => {
  let sessionReads = 0;
  const result = await status.loadLivepeerReconciliationEvidence({
    streamIsActive: true,
    readActivity: async () => "active-response",
    readSessions: async () => { sessionReads += 1; return "session-response"; },
  });
  assert.equal(sessionReads, 0);
  assert.deepEqual(result, { activity: "active-response", sessions: null });
});

test("promoteStreamFromLivepeerSessions flips an inactive public stream when Livepeer has fresh media", () => {
  const next = status.promoteStreamFromLivepeerSessions(
    stream,
    [{ id: "session-1", parentId: "lp-1", createdAt: 1_700_000_000_000, lastSeen: 1_700_000_030_000, sourceBytes: 1024 }],
    { livepeerStreamActive: true, nowMs: 1_700_000_035_000 },
  );
  assert.equal(next.isActive, true);
  assert.equal(next.startedAt, "2023-11-14T22:13:20.000Z");
});

test("promoteStreamFromLivepeerSessions does not revive a recently ended stream", () => {
  const next = status.promoteStreamFromLivepeerSessions(
    stream,
    [{ id: "session-1", parentId: "lp-1", createdAt: 1_700_000_000_000, lastSeen: 1_700_000_030_000, sourceBytes: 1024 }],
    { livepeerStreamActive: false, nowMs: 1_700_000_035_000 },
  );
  assert.equal(next.isActive, false);
});

test("promoteStreamFromLivepeerSessions ignores stale or wrong-stream sessions", () => {
  assert.equal(
    status.promoteStreamFromLivepeerSessions(
      stream,
      [{ id: "old", parentId: "lp-1", createdAt: 1_000, lastSeen: 2_000, sourceBytes: 1024 }],
      { livepeerStreamActive: true, nowMs: 1_700_000_035_000 },
    ).isActive,
    false,
  );
  assert.equal(
    status.promoteStreamFromLivepeerSessions(
      stream,
      [{ id: "wrong", parentId: "lp-2", createdAt: 1_700_000_000_000, lastSeen: 1_700_000_030_000, sourceBytes: 1024 }],
      { livepeerStreamActive: true, nowMs: 1_700_000_035_000 },
    ).isActive,
    false,
  );
});
