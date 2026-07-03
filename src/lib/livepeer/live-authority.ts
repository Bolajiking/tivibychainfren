import {
  findConfirmedLivepeerSession,
  type LivepeerSessionSnapshot,
} from "@/lib/livepeer/broadcast-health";
import type { BroadcastTransportKind } from "@/lib/livepeer/transport-policy";

export const LIVE_AUTHORITY_MIN_PROBE_GAP_MS = 2_000;

export interface LiveAuthorityProbe {
  atMs: number;
  generation: number;
  sourceBytes?: number | null;
  sourceSegments?: number | null;
  ingestRate?: number | null;
}

export type LiveAuthorityRequirement =
  | "matching_session"
  | "upstream_active"
  | "media_progression"
  | "bridge_publishing";

export interface LiveAuthorityInput {
  livepeerId: string;
  generation: number;
  generationStartedAtMs: number;
  nowMs?: number;
  sessions: LivepeerSessionSnapshot[];
  upstreamActive: boolean;
  probes: LiveAuthorityProbe[];
  targetKind: BroadcastTransportKind;
  bridgePublishing?: boolean;
}

export interface LiveAuthorityVerdict {
  confirmed: boolean;
  missing: LiveAuthorityRequirement[];
  session: LivepeerSessionSnapshot | null;
}

function counter(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export function hasMediaProgression(
  probes: LiveAuthorityProbe[],
  opts: { generation: number; minGapMs?: number },
): boolean {
  const minGapMs = opts.minGapMs ?? LIVE_AUTHORITY_MIN_PROBE_GAP_MS;
  const current = (Array.isArray(probes) ? probes : [])
    .filter((probe) => probe.generation === opts.generation)
    .sort((a, b) => a.atMs - b.atMs);

  for (let later = 1; later < current.length; later += 1) {
    for (let earlier = 0; earlier < later; earlier += 1) {
      const first = current[earlier];
      const second = current[later];
      if (second.atMs - first.atMs < minGapMs) continue;
      if (counter(second.ingestRate) > 0) return true;
      if (counter(second.sourceBytes) > counter(first.sourceBytes)) return true;
      if (counter(second.sourceSegments) > counter(first.sourceSegments)) return true;
    }
  }
  return false;
}

export function evaluateLiveAuthority(input: LiveAuthorityInput): LiveAuthorityVerdict {
  const missing: LiveAuthorityRequirement[] = [];
  const nowMs = input.nowMs ?? Date.now();

  const session = findConfirmedLivepeerSession(input.sessions ?? [], {
    livepeerId: input.livepeerId,
    startedAtMs: input.generationStartedAtMs,
    nowMs,
  });
  if (!session) missing.push("matching_session");

  if (input.upstreamActive !== true) missing.push("upstream_active");

  if (!hasMediaProgression(input.probes, { generation: input.generation })) {
    missing.push("media_progression");
  }

  if (input.targetKind === "tvinbio-bridge" && input.bridgePublishing !== true) {
    missing.push("bridge_publishing");
  }

  return { confirmed: missing.length === 0, missing, session };
}
