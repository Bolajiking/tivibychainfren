import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const controllerModule = await loadTsModule(new URL("../src/lib/livepeer/transport-controller.ts", import.meta.url));
const client = await loadTsModule(new URL("../src/lib/livepeer-client.ts", import.meta.url));

const T0 = 1_750_000_000_000;
const PLAN = {
  attemptId: "attempt-1",
  livepeerId: "lp-1",
  targets: [
    { kind: "livepeer-direct", ingestUrl: "https://playback.livepeer.studio/webrtc/key", deadlineMs: 6_000 },
    { kind: "tvinbio-bridge", ingestUrl: "/api/bridge/attempts/attempt-1/whip", deadlineMs: 18_000 },
  ],
  obsFallbackAtMs: 18_000,
  bridgeLeaseId: "lease-1",
};

function createController(overrides = {}) {
  const events = [];
  let now = T0;
  const timers = [];
  const controller = controllerModule.createBroadcastTransportController({
    plan: overrides.plan ?? PLAN,
    nowMs: () => now,
    scheduleTick: (fn) => {
      timers.push(fn);
      return () => {};
    },
    callbacks: {
      activate: (target, generation) => events.push({ type: "activate", kind: target.kind, generation }),
      abort: (target, generation, reason) => events.push({ type: "abort", kind: target.kind, generation, reason }),
      live: (generation) => events.push({ type: "live", generation }),
      terminal: (outcome, reasonCode) => events.push({ type: "terminal", outcome, reasonCode }),
    },
  });
  return {
    controller,
    events,
    advance(ms) {
      now += ms;
      for (const fn of timers) fn();
    },
  };
}

test("controller activates the first target and switches at the soft window without resetting the clock", () => {
  const { controller, events, advance } = createController();
  controller.start();
  assert.deepEqual(events[0], { type: "activate", kind: "livepeer-direct", generation: 1 });

  advance(6_000);
  assert.deepEqual(events.slice(1), [
    { type: "abort", kind: "livepeer-direct", generation: 1, reason: "soft_window_expired" },
    { type: "activate", kind: "tvinbio-bridge", generation: 2 },
  ]);

  advance(12_000); // 18 s total from the original start
  const terminal = events.at(-1);
  assert.deepEqual(terminal, { type: "terminal", outcome: "encoder_handoff", reasonCode: "start_deadline" });
});

test("stale events are ignored and confirmation goes live", () => {
  const { controller, events, advance } = createController();
  controller.start();
  advance(6_000);
  controller.reportFailure(1, "whip_failed");
  controller.reportConfirmed(1);
  assert.ok(!events.some((event) => event.type === "live"), "stale generation cannot confirm");

  controller.reportConfirmed(2);
  assert.deepEqual(events.at(-1), { type: "live", generation: 2 });
  advance(20_000);
  assert.ok(!events.some((event) => event.type === "terminal"), "no handoff after live");
});

test("live drop runs the shared budget and ends exactly once", () => {
  const { controller, events, advance } = createController();
  controller.start();
  controller.reportConfirmed(1);
  advance(60_000);
  controller.reportLiveDrop(1, "failed");
  assert.deepEqual(events.at(-1), { type: "activate", kind: "livepeer-direct", generation: 2 });

  advance(15_000);
  assert.deepEqual(events.at(-1), { type: "terminal", outcome: "recovery_exhausted", reasonCode: "recovery_deadline" });
  advance(10_000);
  assert.equal(events.filter((event) => event.type === "terminal").length, 1);
});

test("end() aborts and reports terminal ended", () => {
  const { controller, events } = createController();
  controller.start();
  controller.reportConfirmed(1);
  controller.end();
  assert.deepEqual(events.at(-1), { type: "terminal", outcome: "ended", reasonCode: null });
});

test("an empty-target plan is terminal immediately with the plan's unavailable reason", () => {
  const { controller, events } = createController({
    plan: { ...PLAN, targets: [], unavailableReason: "bridge_unavailable" },
  });
  controller.start();
  assert.deepEqual(events, [{ type: "terminal", outcome: "encoder_handoff", reasonCode: "bridge_unavailable" }]);
});

test("broadcast-session client calls hit the control-plane routes", async () => {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true, plan: PLAN }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const plan = await client.createBroadcastSession("lp-1", "0xabc", fetcher);
  assert.equal(plan.attemptId, "attempt-1");
  assert.equal(calls[0].url, "/api/livepeer/broadcast-session");
  assert.equal(calls[0].init.method, "POST");
  assert.match(calls[0].init.body, /"livepeerId":"lp-1"/);

  await client.revokeBroadcastSession("attempt-1", "0xabc", fetcher);
  assert.equal(calls[1].url, "/api/livepeer/broadcast-session/attempt-1");
  assert.equal(calls[1].init.method, "DELETE");

  await client.heartbeatBroadcastSession("attempt-1", "0xabc", fetcher);
  assert.equal(calls[2].url, "/api/livepeer/broadcast-session/attempt-1/heartbeat");
  assert.equal(calls[2].init.method, "POST");
});
