import {
  createTransportOrchestrator,
  type TransportOrchestratorCommand,
  type TransportTerminalOutcome,
} from "@/lib/livepeer/transport-orchestrator";
import type { BroadcastTransportTarget } from "@/lib/livepeer/transport-policy";

export interface BroadcastTransportPlanLike {
  attemptId: string;
  targets: BroadcastTransportTarget[];
  obsFallbackAtMs: number;
  unavailableReason?: string;
}

export interface TransportShellCallbacks {
  /** Start the publisher for this target. All later reports carry the generation. */
  activate(target: BroadcastTransportTarget, generation: number, deadlineAtMs: number): void;
  /** Close the peer connection, send the WHIP DELETE, and (bridge) drop the resource. */
  abort(target: BroadcastTransportTarget, generation: number, reason: string): void;
  live(generation: number): void;
  terminal(outcome: TransportTerminalOutcome, reasonCode: string | null): void;
}

export interface BroadcastTransportController {
  start(): void;
  reportFailure(generation: number, reasonCode: string): void;
  reportConfirmed(generation: number): void;
  reportLiveDrop(generation: number, kind: "disconnected" | "failed"): void;
  end(): void;
  dispose(): void;
  currentGeneration(): number;
  phase(): string;
}

const TICK_MS = 250;

export function createBroadcastTransportController(opts: {
  plan: BroadcastTransportPlanLike;
  callbacks: TransportShellCallbacks;
  nowMs?: () => number;
  scheduleTick?: (fn: () => void) => () => void;
}): BroadcastTransportController {
  const nowMs = opts.nowMs ?? (() => Date.now());
  const scheduleTick =
    opts.scheduleTick ??
    ((fn: () => void) => {
      const timer = setInterval(fn, TICK_MS);
      return () => clearInterval(timer);
    });

  const orchestrator = createTransportOrchestrator({
    targets: opts.plan.targets,
    obsFallbackAtMs: opts.plan.obsFallbackAtMs,
  });

  let cancelTick: (() => void) | null = null;
  let disposed = false;

  function stopTicking(): void {
    cancelTick?.();
    cancelTick = null;
  }

  function execute(commands: TransportOrchestratorCommand[]): void {
    if (disposed) return;
    for (const command of commands) {
      if (command.type === "activate") {
        opts.callbacks.activate(command.target, command.generation, command.deadlineAtMs);
      } else if (command.type === "abort") {
        opts.callbacks.abort(command.target, command.generation, command.reason);
      } else if (command.type === "live") {
        opts.callbacks.live(command.generation);
      } else {
        stopTicking();
        opts.callbacks.terminal(command.outcome, command.reasonCode);
      }
    }
  }

  return {
    start() {
      if (opts.plan.targets.length === 0) {
        opts.callbacks.terminal("encoder_handoff", opts.plan.unavailableReason ?? "no_targets");
        return;
      }
      execute(orchestrator.start(nowMs()));
      cancelTick = scheduleTick(() => execute(orchestrator.tick(nowMs())));
    },
    reportFailure(generation, reasonCode) {
      execute(orchestrator.handleTargetFailure(generation, reasonCode, nowMs()));
    },
    reportConfirmed(generation) {
      execute(orchestrator.handleConfirmed(generation, nowMs()));
    },
    reportLiveDrop(generation, kind) {
      execute(orchestrator.handleLiveDrop(generation, kind, nowMs()));
    },
    end() {
      execute(orchestrator.end(nowMs()));
      stopTicking();
    },
    dispose() {
      disposed = true;
      stopTicking();
    },
    currentGeneration() {
      return orchestrator.snapshot().generation;
    },
    phase() {
      return orchestrator.snapshot().phase;
    },
  };
}
