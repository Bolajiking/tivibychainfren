import { findConfirmedLivepeerSession, type LivepeerSessionSnapshot } from "@/lib/livepeer/broadcast-health";
import type { Stream } from "@/lib/types";

export const PUBLIC_LIVEPEER_STATUS_TIMEOUT_MS = 2_500;

export function promoteStreamFromLivepeerSessions(
  stream: Stream,
  sessions: LivepeerSessionSnapshot[],
  opts: { livepeerStreamActive: boolean; nowMs?: number; freshnessMs?: number },
): Stream {
  if (stream.isActive || !stream.livepeerId) return stream;
  if (!opts.livepeerStreamActive) return stream;
  const session = findConfirmedLivepeerSession(sessions, {
    livepeerId: stream.livepeerId,
    startedAtMs: 0,
    nowMs: opts.nowMs,
    freshnessMs: opts.freshnessMs ?? 60_000,
  });
  if (!session) return stream;
  return {
    ...stream,
    isActive: true,
    startedAt: sessionStartedAtIso(session, opts.nowMs),
  };
}

export function isLivepeerStreamActive(payload: unknown): boolean {
  return parseLivepeerStreamActive(payload) === true;
}

export function parseLivepeerStreamActive(payload: unknown): boolean | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as { isActive?: unknown }).isActive;
  return typeof value === "boolean" ? value : null;
}

export function reconcileStreamFromLivepeerActivity(
  stream: Stream,
  livepeerActive: boolean | null,
  options: { nowMs?: number } = {},
): Stream {
  if (livepeerActive === true && !stream.isActive) {
    return { ...stream, isActive: true, startedAt: new Date(options.nowMs ?? Date.now()).toISOString() };
  }
  if (livepeerActive === false && stream.isActive) {
    return { ...stream, isActive: false, viewerCount: 0 };
  }
  return stream;
}

export async function loadLivepeerReconciliationEvidence<Activity, Sessions>({
  streamIsActive,
  readActivity,
  readSessions,
}: {
  streamIsActive: boolean;
  readActivity: () => Promise<Activity>;
  readSessions: () => Promise<Sessions>;
}): Promise<{ activity: Activity; sessions: Sessions | null }> {
  const [activity, sessions] = await Promise.all([
    readActivity(),
    streamIsActive ? Promise.resolve(null) : readSessions(),
  ]);
  return { activity, sessions };
}

function sessionStartedAtIso(session: LivepeerSessionSnapshot, nowMs = Date.now()): string {
  const timestamp = positiveNumber(session.createdAt) || positiveNumber(session.lastSeen) || nowMs;
  return new Date(timestamp).toISOString();
}

function positiveNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
