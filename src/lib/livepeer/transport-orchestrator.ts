import { BROADCAST_LIVE_DROP_BUDGET_MS } from "@/lib/livepeer/broadcast-health";
import type { BroadcastTransportTarget } from "@/lib/livepeer/transport-policy";

export { BROADCAST_LIVE_DROP_BUDGET_MS };

export type TransportOrchestratorPhase = "idle" | "starting" | "live" | "recovering" | "ended";

export type TransportTerminalOutcome = "encoder_handoff" | "recovery_exhausted" | "ended";

export type TransportOrchestratorCommand =
  | { type: "activate"; target: BroadcastTransportTarget; generation: number; deadlineAtMs: number }
  | { type: "abort"; target: BroadcastTransportTarget; generation: number; reason: string }
  | { type: "live"; generation: number }
  | { type: "terminal"; outcome: TransportTerminalOutcome; reasonCode: string | null };

export interface TransportOrchestratorSnapshot {
  phase: TransportOrchestratorPhase;
  generation: number;
  targetKind: BroadcastTransportTarget["kind"] | null;
  startedAtMs: number | null;
  dropObservedAtMs: number | null;
  recoveryDeadlineAtMs: number | null;
}

export interface TransportOrchestrator {
  start(nowMs: number): TransportOrchestratorCommand[];
  tick(nowMs: number): TransportOrchestratorCommand[];
  handleTargetFailure(generation: number, reasonCode: string, nowMs: number): TransportOrchestratorCommand[];
  handleConfirmed(generation: number, nowMs: number): TransportOrchestratorCommand[];
  handleLiveDrop(generation: number, kind: "disconnected" | "failed", nowMs: number): TransportOrchestratorCommand[];
  end(nowMs: number): TransportOrchestratorCommand[];
  snapshot(): TransportOrchestratorSnapshot;
}

export function createTransportOrchestrator(opts: {
  targets: BroadcastTransportTarget[];
  obsFallbackAtMs: number;
  liveDropBudgetMs?: number;
}): TransportOrchestrator {
  const targets = [...opts.targets];
  const liveDropBudgetMs = opts.liveDropBudgetMs ?? BROADCAST_LIVE_DROP_BUDGET_MS;

  let phase: TransportOrchestratorPhase = "idle";
  let generation = 0;
  let startedAtMs: number | null = null;
  let targetIndex = -1;
  let currentDeadlineAtMs: number | null = null;
  let dropObservedAtMs: number | null = null;
  let recoveryDeadlineAtMs: number | null = null;
  let recoveryQueue: number[] = [];

  function currentTarget(): BroadcastTransportTarget | null {
    return targetIndex >= 0 && targetIndex < targets.length ? targets[targetIndex] : null;
  }

  function activate(index: number, deadlineAtMs: number): TransportOrchestratorCommand {
    targetIndex = index;
    generation += 1;
    currentDeadlineAtMs = deadlineAtMs;
    return { type: "activate", target: targets[index], generation, deadlineAtMs };
  }

  function abortCurrent(reason: string): TransportOrchestratorCommand[] {
    const target = currentTarget();
    if (!target || generation === 0) return [];
    return [{ type: "abort", target, generation, reason }];
  }

  function terminal(outcome: TransportTerminalOutcome, reasonCode: string | null, reason: string): TransportOrchestratorCommand[] {
    const commands = [...abortCurrent(reason), { type: "terminal", outcome, reasonCode } as TransportOrchestratorCommand];
    phase = "ended";
    currentDeadlineAtMs = null;
    recoveryDeadlineAtMs = null;
    return commands;
  }

  function startDeadlineFor(index: number): number {
    const anchor = startedAtMs ?? 0;
    return anchor + Math.min(targets[index].deadlineMs, opts.obsFallbackAtMs);
  }

  function advanceStartTarget(reason: string, reasonCode: string | null, nowMs: number): TransportOrchestratorCommand[] {
    const globalDeadlineAtMs = (startedAtMs ?? 0) + opts.obsFallbackAtMs;
    const nextIndex = targetIndex + 1;
    if (nextIndex >= targets.length || nowMs >= globalDeadlineAtMs) {
      return terminal("encoder_handoff", reasonCode, reason);
    }
    return [...abortCurrent(reason), activate(nextIndex, startDeadlineFor(nextIndex))];
  }

  function advanceRecoveryTarget(reason: string, reasonCode: string | null): TransportOrchestratorCommand[] {
    const nextIndex = recoveryQueue.shift();
    if (nextIndex === undefined) {
      return terminal("recovery_exhausted", reasonCode, reason);
    }
    const aborts = abortCurrent(reason);
    return [...aborts, activate(nextIndex, recoveryDeadlineAtMs ?? 0)];
  }

  return {
    start(nowMs) {
      if (phase !== "idle" || targets.length === 0) return [];
      phase = "starting";
      startedAtMs = nowMs;
      return [activate(0, startDeadlineFor(0))];
    },

    tick(nowMs) {
      if (phase === "starting") {
        const globalDeadlineAtMs = (startedAtMs ?? 0) + opts.obsFallbackAtMs;
        if (nowMs >= globalDeadlineAtMs) return terminal("encoder_handoff", "start_deadline", "start_deadline");
        if (currentDeadlineAtMs !== null && nowMs >= currentDeadlineAtMs) {
          return advanceStartTarget("soft_window_expired", null, nowMs);
        }
        return [];
      }
      if (phase === "recovering") {
        if (recoveryDeadlineAtMs !== null && nowMs >= recoveryDeadlineAtMs) {
          return terminal("recovery_exhausted", "recovery_deadline", "recovery_deadline");
        }
        return [];
      }
      return [];
    },

    handleTargetFailure(eventGeneration, reasonCode, nowMs) {
      if (eventGeneration !== generation) return [];
      if (phase === "starting") return advanceStartTarget(reasonCode, reasonCode, nowMs);
      if (phase === "recovering") return advanceRecoveryTarget(reasonCode, reasonCode);
      return [];
    },

    handleConfirmed(eventGeneration, _nowMs) {
      if (eventGeneration !== generation) return [];
      if (phase !== "starting" && phase !== "recovering") return [];
      phase = "live";
      currentDeadlineAtMs = null;
      dropObservedAtMs = null;
      recoveryDeadlineAtMs = null;
      recoveryQueue = [];
      return [{ type: "live", generation }];
    },

    handleLiveDrop(eventGeneration, _kind, nowMs) {
      if (eventGeneration !== generation) return [];
      if (phase !== "live") return [];
      phase = "recovering";
      dropObservedAtMs = nowMs;
      recoveryDeadlineAtMs = nowMs + liveDropBudgetMs;
      recoveryQueue = [
        targetIndex,
        ...targets.map((_, index) => index).filter((index) => index !== targetIndex),
      ];
      return advanceRecoveryTarget("live_drop", null);
    },

    end(_nowMs) {
      if (phase === "ended" || phase === "idle") {
        phase = "ended";
        return [];
      }
      return terminal("ended", null, "ended_by_creator");
    },

    snapshot() {
      return {
        phase,
        generation,
        targetKind: currentTarget()?.kind ?? null,
        startedAtMs,
        dropObservedAtMs,
        recoveryDeadlineAtMs,
      };
    },
  };
}
