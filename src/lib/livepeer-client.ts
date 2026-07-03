import { getAccessToken } from "@/lib/auth/privy-bridge";
import { livepeerRtmpServerUrl, livepeerWhipIngestUrl } from "@/lib/livepeer/ingest";
import { parseLivepeerStreamSessions, type LivepeerStreamSession } from "@/lib/livepeer/session-client";
import { livepeerSessionProxyPath } from "@/lib/livepeer/sessions";

export type { LivepeerSessionLoader, LivepeerStreamSession } from "@/lib/livepeer/session-client";

/**
 * Client helpers for the broadcast desk. They talk only to our own key-holder
 * proxy (`/api/livepeer/...`); the LIVEPEER_API_KEY stays server-side. The
 * returned `streamKey` is the broadcaster's secret — show it, never log it.
 */
export interface LiveIngest {
  /** Livepeer stream id — used for owner-scoped reads/mutations. */
  id: string;
  /** Livepeer playback id — what viewers resolve HLS against. */
  playbackId: string;
  /** RTMP stream key (secret). */
  streamKey: string;
  /** RTMP server URL for OBS/hardware encoders. The stream key is entered separately. */
  rtmpIngestUrl: string;
  /** WebRTC WHIP ingest URL for browser broadcasting (uses the stream key). */
  whipUrl: string;
}

/** Provision a Livepeer live stream and attach it to the creator's channel. */
export async function provisionLiveIngest(
  tvinbioPlaybackId: string,
  name: string,
  record: boolean,
  walletAddress?: string,
): Promise<LiveIngest> {
  const res = await proxy("stream", "POST", { name, record, tvinbioPlaybackId }, walletAddress);
  return toIngest(await readJson(res));
}

/** Mint a fresh Livepeer stream/key for this channel and replace the stale mapping. */
export async function regenerateLiveIngest(
  tvinbioPlaybackId: string,
  name: string,
  record: boolean,
  walletAddress?: string,
): Promise<LiveIngest> {
  const res = await proxy("stream", "POST", { name, record, tvinbioPlaybackId, forceNew: true }, walletAddress);
  return toIngest(await readJson(res));
}

/** Re-fetch ingest details for an already-provisioned stream (owner only). */
export async function revealLiveIngest(livepeerId: string, walletAddress?: string): Promise<LiveIngest> {
  const res = await proxy(`stream/${encodeURIComponent(livepeerId)}`, "GET", undefined, walletAddress);
  return toIngest(await readJson(res));
}

/** Fetch recent Livepeer sessions for a stream, owner-scoped through our key-holder proxy. */
export async function getLivepeerStreamSessions(livepeerId: string, walletAddress?: string): Promise<LivepeerStreamSession[]> {
  const res = await proxy(livepeerSessionProxyPath(livepeerId), "GET", undefined, walletAddress);
  const data = await readJson(res);
  return parseLivepeerStreamSessions(data);
}

export type BroadcastPlanFetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** Create a broadcast attempt and receive the ordered transport plan (spec §6). */
export async function createBroadcastSession(
  livepeerId: string,
  walletAddress?: string,
  fetcher?: BroadcastPlanFetcher,
): Promise<BroadcastTransportPlanPayload> {
  const response = await authedFetch(
    "/api/livepeer/broadcast-session",
    { method: "POST", body: JSON.stringify({ livepeerId, walletAddress }) },
    walletAddress,
    fetcher,
  );
  const data = asRecord(await readJson(response));
  const plan = asRecord(data.plan);
  if (typeof plan.attemptId !== "string" || !Array.isArray(plan.targets)) {
    throw new Error("broadcast_plan_invalid");
  }
  return plan as unknown as BroadcastTransportPlanPayload;
}

/** Revoke a broadcast attempt (stop, navigation, or failed start). Idempotent. */
export async function revokeBroadcastSession(
  attemptId: string,
  walletAddress?: string,
  fetcher?: BroadcastPlanFetcher,
): Promise<void> {
  await authedFetch(
    `/api/livepeer/broadcast-session/${encodeURIComponent(attemptId)}`,
    { method: "DELETE" },
    walletAddress,
    fetcher,
  ).catch(() => {});
}

/** Keep the attempt's bridge lease alive pre-publish (10 s cadence). */
export async function heartbeatBroadcastSession(
  attemptId: string,
  walletAddress?: string,
  fetcher?: BroadcastPlanFetcher,
): Promise<boolean> {
  try {
    const response = await authedFetch(
      `/api/livepeer/broadcast-session/${encodeURIComponent(attemptId)}/heartbeat`,
      { method: "POST", body: "{}" },
      walletAddress,
      fetcher,
    );
    return response.ok;
  } catch {
    return false;
  }
}

/** Owner-scoped lease publishing state (spec §6.4 bridge confirmation input). */
export async function getBroadcastSessionStatus(
  attemptId: string,
  walletAddress?: string,
  fetcher?: BroadcastPlanFetcher,
): Promise<{ publishing: boolean } | null> {
  try {
    const response = await authedFetch(
      `/api/livepeer/broadcast-session/${encodeURIComponent(attemptId)}`,
      { method: "GET" },
      walletAddress,
      fetcher,
    );
    if (!response.ok) return null;
    const data = asRecord(await response.json().catch(() => null));
    return { publishing: data.publishing === true };
  } catch {
    return null;
  }
}

/** Explicit upstream ACTIVE state through the owner proxy (spec §9.1 item 2). */
export async function getLivepeerStreamActive(livepeerId: string, walletAddress?: string): Promise<boolean> {
  try {
    const res = await proxy(`stream/${encodeURIComponent(livepeerId)}`, "GET", undefined, walletAddress);
    if (!res.ok) return false;
    const data = asRecord(await res.json().catch(() => null));
    return data.isActive === true;
  } catch {
    return false;
  }
}

export interface BroadcastTransportPlanPayload {
  attemptId: string;
  livepeerId: string;
  targets: Array<{ kind: "livepeer-direct" | "tvinbio-bridge"; ingestUrl: string; deadlineMs: number }>;
  obsFallbackAtMs: number;
  unavailableReason?: string;
  bridgeLeaseId?: string;
  expiresAt?: string;
}

async function authedFetch(
  url: string,
  init: RequestInit,
  walletAddress?: string,
  fetcher?: BroadcastPlanFetcher,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!fetcher) {
    const token = await getAccessToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
  }
  if (walletAddress) headers.set("x-tvinbio-wallet", walletAddress.toLowerCase());
  if (init.body) headers.set("content-type", "application/json");
  return (fetcher ?? fetch)(url, { ...init, headers, cache: "no-store" });
}

function toIngest(data: unknown): LiveIngest {
  const record = asRecord(data);
  const id = normalizeNonEmpty(record.id);
  const playbackId = normalizeNonEmpty(record.playbackId);
  const streamKey = normalizeNonEmpty(record.streamKey);
  if (!id || !playbackId || !streamKey) throw new Error("livepeer_response_invalid");
  const whipUrl = livepeerWhipIngestUrl(streamKey);
  if (!whipUrl) throw new Error("livepeer_ingest_unavailable");
  return {
    id,
    playbackId,
    streamKey,
    rtmpIngestUrl: livepeerRtmpServerUrl(),
    // Authoritative WHIP ingest URL from the Livepeer SDK (playback.livepeer.studio/webrtc/<key>).
    whipUrl,
  };
}

async function proxy(path: string, method: "GET" | "POST", body?: unknown, walletAddress?: string) {
  const token = await getAccessToken();
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (walletAddress) headers.set("x-tvinbio-wallet", walletAddress.toLowerCase());
  if (method !== "GET") headers.set("content-type", "application/json");

  return fetch(`/api/livepeer/${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify({ ...asRecord(body), walletAddress }),
  });
}

async function readJson(response: Response): Promise<unknown> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    if (response.ok) throw new Error("livepeer_response_invalid");
  }
  if (!response.ok) {
    throw new Error(String(asRecord(data).error ?? "livepeer_request_failed"));
  }
  return data;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeNonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
