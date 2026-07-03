import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const mod = await loadTsModule(new URL("../src/lib/livepeer/transport-orchestrator.ts", import.meta.url));

const T0 = 1_750_000_000_000;

const DESKTOP_TARGETS = [
  { kind: "livepeer-direct", ingestUrl: "https://livepeer.studio/webrtc/abcd", deadlineMs: 6_000 },
  { kind: "tvinbio-bridge", ingestUrl: "/api/bridge/attempts/a1/whip", deadlineMs: 18_000 },
];
const MOBILE_TARGETS = [{ kind: "tvinbio-bridge", ingestUrl: "/api/bridge/attempts/a1/whip", deadlineMs: 18_000 }];

function createDesktop() {
  return mod.createTransportOrchestrator({ targets: DESKTOP_TARGETS, obsFallbackAtMs: 18_000 });
}

function kinds(commands) {
  return commands.map((command) => command.type);
}

test("start activates the first target with generation 1", () => {
  const orchestrator = createDesktop();
  const commands = orchestrator.start(T0);
  assert.deepEqual(kinds(commands), ["activate"]);
  assert.equal(commands[0].target.kind, "livepeer-direct");
  assert.equal(commands[0].generation, 1);
  assert.equal(commands[0].deadlineAtMs, T0 + 6_000);
  assert.equal(orchestrator.snapshot().phase, "starting");
  assert.equal(orchestrator.snapshot().generation, 1);
});

test("soft-window expiry aborts the direct target and activates the bridge without resetting the global clock", () => {
  const orchestrator = createDesktop();
  orchestrator.start(T0);
  const commands = orchestrator.tick(T0 + 6_000);
  assert.deepEqual(kinds(commands), ["abort", "activate"]);
  assert.equal(commands[0].target.kind, "livepeer-direct");
  assert.equal(commands[0].generation, 1);
  assert.equal(commands[1].target.kind, "tvinbio-bridge");
  assert.equal(commands[1].generation, 2);
  assert.equal(commands[1].deadlineAtMs, T0 + 18_000, "bridge deadline stays anchored to the original start");

  const terminal = orchestrator.tick(T0 + 18_000);
  assert.deepEqual(kinds(terminal), ["abort", "terminal"]);
  assert.equal(terminal[1].outcome, "encoder_handoff");
});

test("target failure before the soft window also switches immediately", () => {
  const orchestrator = createDesktop();
  orchestrator.start(T0);
  const commands = orchestrator.handleTargetFailure(1, "whip_failed", T0 + 2_000);
  assert.deepEqual(kinds(commands), ["abort", "activate"]);
  assert.equal(commands[1].target.kind, "tvinbio-bridge");
  assert.equal(commands[1].generation, 2);
});

test("stale generation callbacks are ignored after a switch", () => {
  const orchestrator = createDesktop();
  orchestrator.start(T0);
  orchestrator.tick(T0 + 6_000);
  assert.deepEqual(orchestrator.handleTargetFailure(1, "whip_failed", T0 + 7_000), []);
  assert.deepEqual(orchestrator.handleConfirmed(1, T0 + 7_000), []);
  assert.equal(orchestrator.snapshot().phase, "starting");
  assert.equal(orchestrator.snapshot().generation, 2);
});

test("confirmation for the current generation goes live and stops deadline handoff", () => {
  const orchestrator = createDesktop();
  orchestrator.start(T0);
  const commands = orchestrator.handleConfirmed(1, T0 + 4_000);
  assert.deepEqual(kinds(commands), ["live"]);
  assert.equal(orchestrator.snapshot().phase, "live");
  assert.deepEqual(orchestrator.tick(T0 + 19_000), []);
});

test("terminal fires exactly once no matter how many deadline ticks arrive", () => {
  const orchestrator = mod.createTransportOrchestrator({ targets: MOBILE_TARGETS, obsFallbackAtMs: 18_000 });
  orchestrator.start(T0);
  const first = orchestrator.tick(T0 + 18_000);
  assert.deepEqual(kinds(first), ["abort", "terminal"]);
  assert.deepEqual(orchestrator.tick(T0 + 19_000), []);
  assert.deepEqual(orchestrator.tick(T0 + 30_000), []);
  assert.equal(orchestrator.snapshot().phase, "ended");
});

test("exhausting every target before the deadline is terminal with the last reason", () => {
  const orchestrator = mod.createTransportOrchestrator({ targets: MOBILE_TARGETS, obsFallbackAtMs: 18_000 });
  orchestrator.start(T0);
  const commands = orchestrator.handleTargetFailure(1, "bridge_unsupported_codec", T0 + 100);
  assert.deepEqual(kinds(commands), ["abort", "terminal"]);
  assert.equal(commands[1].outcome, "encoder_handoff");
  assert.equal(commands[1].reasonCode, "bridge_unsupported_codec");
});

test("a live drop anchors one shared budget that recovery steps never extend", () => {
  const orchestrator = createDesktop();
  orchestrator.start(T0);
  orchestrator.handleConfirmed(1, T0 + 4_000);

  const dropAt = T0 + 60_000;
  const commands = orchestrator.handleLiveDrop(1, "failed", dropAt);
  assert.deepEqual(kinds(commands), ["abort", "activate"]);
  assert.equal(commands[1].generation, 2);
  assert.equal(commands[1].target.kind, "livepeer-direct", "recovery retries the current target first");
  assert.equal(commands[1].deadlineAtMs, dropAt + 15_000);
  assert.equal(orchestrator.snapshot().phase, "recovering");

  const failover = orchestrator.handleTargetFailure(2, "whip_failed", dropAt + 5_000);
  assert.deepEqual(kinds(failover), ["abort", "activate"]);
  assert.equal(failover[1].target.kind, "tvinbio-bridge");
  assert.equal(failover[1].generation, 3);
  assert.equal(failover[1].deadlineAtMs, dropAt + 15_000, "alternate target inherits the remaining budget");

  const terminal = orchestrator.tick(dropAt + 15_000);
  assert.deepEqual(kinds(terminal), ["abort", "terminal"]);
  assert.equal(terminal[1].outcome, "recovery_exhausted");
  assert.deepEqual(orchestrator.tick(dropAt + 16_000), []);
});

test("recovery confirmation returns to live and a later drop anchors a fresh incident", () => {
  const orchestrator = createDesktop();
  orchestrator.start(T0);
  orchestrator.handleConfirmed(1, T0 + 4_000);
  const dropAt = T0 + 60_000;
  orchestrator.handleLiveDrop(1, "failed", dropAt);
  const commands = orchestrator.handleConfirmed(2, dropAt + 6_000);
  assert.deepEqual(kinds(commands), ["live"]);
  assert.equal(orchestrator.snapshot().phase, "live");

  const secondDrop = dropAt + 120_000;
  const second = orchestrator.handleLiveDrop(2, "failed", secondDrop);
  assert.equal(second[1].deadlineAtMs, secondDrop + 15_000);
});

test("end stream aborts the current generation and is terminal exactly once", () => {
  const orchestrator = createDesktop();
  orchestrator.start(T0);
  orchestrator.handleConfirmed(1, T0 + 4_000);
  const commands = orchestrator.end(T0 + 30_000);
  assert.deepEqual(kinds(commands), ["abort", "terminal"]);
  assert.equal(commands[1].outcome, "ended");
  assert.deepEqual(orchestrator.end(T0 + 31_000), []);
  assert.deepEqual(orchestrator.tick(T0 + 40_000), []);
});

test("stale live-drop reports from an abandoned generation are ignored", () => {
  const orchestrator = createDesktop();
  orchestrator.start(T0);
  orchestrator.handleConfirmed(1, T0 + 4_000);
  const dropAt = T0 + 60_000;
  orchestrator.handleLiveDrop(1, "failed", dropAt);
  assert.deepEqual(orchestrator.handleLiveDrop(1, "failed", dropAt + 2_000), []);
});
