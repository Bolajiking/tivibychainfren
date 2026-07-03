import { BROADCAST_OBS_FALLBACK_MS } from "@/lib/livepeer/broadcast-health";
import { describeLiveFieldBrowser } from "@/lib/livepeer/field-client";

export type BroadcastTransportKind = "livepeer-direct" | "tvinbio-bridge";

export type BroadcastDeviceCategory = "mobile" | "desktop";

export interface BroadcastTransportTarget {
  kind: BroadcastTransportKind;
  ingestUrl: string;
  deadlineMs: number;
}

export interface BroadcastTransportPolicyInput {
  category: BroadcastDeviceCategory;
  directIngestUrl: string;
  bridgeIngestUrl: string | null;
  bridgeHealthy: boolean;
}

export interface BroadcastTransportPolicyResult {
  targets: BroadcastTransportTarget[];
  obsFallbackAtMs: number;
  unavailableReason?: "bridge_unavailable";
}

export const BROADCAST_DIRECT_SOFT_WINDOW_MS = 6_000;

export function classifyBroadcastDevice(userAgent: string): BroadcastDeviceCategory {
  return describeLiveFieldBrowser(userAgent ?? "").mobile ? "mobile" : "desktop";
}

export function planTransportTargets(input: BroadcastTransportPolicyInput): BroadcastTransportPolicyResult {
  const bridgeUsable = input.bridgeHealthy && typeof input.bridgeIngestUrl === "string" && input.bridgeIngestUrl.length > 0;

  if (input.category === "mobile") {
    if (!bridgeUsable) {
      return { targets: [], obsFallbackAtMs: BROADCAST_OBS_FALLBACK_MS, unavailableReason: "bridge_unavailable" };
    }
    return {
      targets: [{ kind: "tvinbio-bridge", ingestUrl: input.bridgeIngestUrl as string, deadlineMs: BROADCAST_OBS_FALLBACK_MS }],
      obsFallbackAtMs: BROADCAST_OBS_FALLBACK_MS,
    };
  }

  const targets: BroadcastTransportTarget[] = [
    {
      kind: "livepeer-direct",
      ingestUrl: input.directIngestUrl,
      deadlineMs: bridgeUsable ? BROADCAST_DIRECT_SOFT_WINDOW_MS : BROADCAST_OBS_FALLBACK_MS,
    },
  ];
  if (bridgeUsable) {
    targets.push({ kind: "tvinbio-bridge", ingestUrl: input.bridgeIngestUrl as string, deadlineMs: BROADCAST_OBS_FALLBACK_MS });
  }
  return { targets, obsFallbackAtMs: BROADCAST_OBS_FALLBACK_MS };
}
