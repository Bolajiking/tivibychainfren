export type LivepeerBroadcastStatus = "idle" | "pending" | "live";

export interface WhipHandshakeSnapshot {
  headStartedAt?: number | null;
  headCompletedAt?: number | null;
  postStartedAt?: number | null;
  postCompletedAt?: number | null;
  lastStatus?: number | null;
  lastHost?: string | null;
  lastError?: string | null;
}

export interface BroadcastStartSnapshot {
  enabled: boolean;
  status: LivepeerBroadcastStatus;
  mediaReady: boolean;
  elapsedMs: number;
  totalElapsedMs?: number;
  retryCount: number;
  maxRetries?: number;
  whip?: WhipHandshakeSnapshot | null;
  peerConnectionState?: string | null;
  iceConnectionState?: string | null;
  outboundBytesSent?: number | null;
  outboundPacketsSent?: number | null;
  sessionConfirmed?: boolean | null;
  obsFallbackMs?: number | null;
}

export const BROADCAST_START_STALL_MS = 9_000;
export const BROADCAST_OBS_FALLBACK_MS = 18_000;
export const BROADCAST_LIVE_RECOVERY_FALLBACK_MS = 7_000;
/**
 * One shared live-drop budget for a whole recovery incident (spec §6.5),
 * anchored at the first unhealthy observation. No recovery step resets it.
 */
export const BROADCAST_LIVE_DROP_BUDGET_MS = 15_000;
export const BROADCAST_MAX_AUTO_RETRIES = 3;
/** Max automatic reconnects after a *live* stream's transport drops, per go-live. */
export const BROADCAST_MAX_LIVE_RECOVERIES = 3;
export const BROADCAST_LIVE_DISCONNECT_RECOVERY_MS = 8_000;

export interface BroadcastMediaTrackSnapshot {
  kind?: string | null;
  readyState?: string | null;
}

export interface BroadcastRtpStatSnapshot {
  id?: string | null;
  type?: string | null;
  kind?: string | null;
  mediaType?: string | null;
  codecId?: string | null;
  mimeType?: string | null;
  isRemote?: boolean | null;
  bytesSent?: number | null;
  packetsSent?: number | null;
}

export interface BroadcastOutboundStats {
  bytesSent: number;
  packetsSent: number;
  audioCodec: string | null;
  videoCodec: string | null;
}

export function summarizeBroadcastOutboundStats(stats: BroadcastRtpStatSnapshot[]): BroadcastOutboundStats {
  const codecs = new Map(
    stats
      .filter((stat) => stat.type === "codec" && stat.id && stat.mimeType)
      .map((stat) => [stat.id as string, stat.mimeType as string]),
  );
  const summary: BroadcastOutboundStats = {
    bytesSent: 0,
    packetsSent: 0,
    audioCodec: null,
    videoCodec: null,
  };

  for (const stat of stats) {
    if (stat.type !== "outbound-rtp" || stat.isRemote) continue;
    const kind = stat.kind ?? stat.mediaType;
    if (kind !== "audio" && kind !== "video") continue;
    summary.bytesSent += positiveNumber(stat.bytesSent);
    summary.packetsSent += positiveNumber(stat.packetsSent);
    const codec = stat.codecId ? codecs.get(stat.codecId) ?? null : null;
    if (kind === "audio" && codec) summary.audioCodec = codec;
    if (kind === "video" && codec) summary.videoCodec = codec;
  }

  return summary;
}

export function hasRequiredBroadcastMedia(
  tracks: BroadcastMediaTrackSnapshot[],
  controls: { audioEnabled: boolean; videoEnabled: boolean },
): boolean {
  const liveKinds = new Set(tracks.filter((track) => track.readyState === "live").map((track) => track.kind));
  const audioReady = !controls.audioEnabled || liveKinds.has("audio");
  const videoRequired = controls.videoEnabled || !controls.audioEnabled;
  const videoReady = !videoRequired || liveKinds.has("video");
  return audioReady && videoReady;
}

export function shouldRecoverBroadcastMedia(snapshot: {
  enabled: boolean;
  status: LivepeerBroadcastStatus;
  mediaReady: boolean;
  recoveryCount?: number | null;
  maxRecoveries?: number | null;
}): boolean {
  const max = snapshot.maxRecoveries ?? BROADCAST_MAX_LIVE_RECOVERIES;
  return snapshot.enabled && snapshot.status === "live" && !snapshot.mediaReady && (snapshot.recoveryCount ?? 0) < max;
}

export interface LivepeerSessionSnapshot {
  id?: string | null;
  parentId?: string | null;
  createdAt?: number | null;
  lastSeen?: number | null;
  sourceBytes?: number | null;
  sourceSegments?: number | null;
  ingestRate?: number | null;
  isHealthy?: boolean | null;
  issues?: string[] | null;
}

export function broadcastStartPhase(snapshot: BroadcastStartSnapshot): string | null {
  if (snapshot.status === "live") return "Broadcast live";
  if (!snapshot.enabled) return null;
  if (!snapshot.mediaReady) return "Preparing camera";

  const whip = snapshot.whip ?? {};
  if (whip.lastError) return "Recovering live connection";
  if (!whip.postStartedAt) return "Contacting live ingest";
  if (!whip.postCompletedAt) return "Confirming broadcast";
  if (isSuccessfulStatus(whip.lastStatus) && snapshot.sessionConfirmed === false) return "Waiting for Livepeer session";
  if (isSuccessfulStatus(whip.lastStatus) && isIceConnected(snapshot.iceConnectionState)) return "Confirming live media";
  if (isSuccessfulStatus(whip.lastStatus)) return "Waiting for Livepeer session";
  return "Reconnecting live ingest";
}

export function shouldAutoRetryBroadcastStart(snapshot: BroadcastStartSnapshot): boolean {
  const maxRetries = snapshot.maxRetries ?? BROADCAST_MAX_AUTO_RETRIES;
  return (
    snapshot.enabled &&
    snapshot.status !== "live" &&
    snapshot.mediaReady &&
    !shouldHandOffBrowserStartToObs(snapshot) &&
    snapshot.retryCount < maxRetries &&
    snapshot.elapsedMs >= BROADCAST_START_STALL_MS
  );
}

export function shouldFailBroadcastStart(snapshot: BroadcastStartSnapshot): boolean {
  const maxRetries = snapshot.maxRetries ?? BROADCAST_MAX_AUTO_RETRIES;
  return (
    shouldHandOffBrowserStartToObs(snapshot) ||
    (
      snapshot.enabled &&
      snapshot.status !== "live" &&
      snapshot.mediaReady &&
      snapshot.retryCount >= maxRetries &&
      snapshot.elapsedMs >= BROADCAST_START_STALL_MS
    )
  );
}

export function shouldHandOffBrowserStartToObs(snapshot: BroadcastStartSnapshot): boolean {
  const fallbackMs = snapshot.obsFallbackMs ?? BROADCAST_OBS_FALLBACK_MS;
  return (
    snapshot.enabled &&
    snapshot.status !== "live" &&
    snapshot.mediaReady &&
    snapshot.sessionConfirmed !== true &&
    (snapshot.totalElapsedMs ?? snapshot.elapsedMs) >= fallbackMs
  );
}

/**
 * A live stream whose peer connection has dropped to a terminal/transient-failed
 * state should auto-reconnect (re-publish) rather than silently going dark, up to
 * a bounded number of recoveries per go-live. `"failed"` is the WebRTC terminal
 * state; `"disconnected"` often self-heals, so only act on it once it persists
 * (the caller passes the sustained state).
 */
export function shouldRecoverLiveDrop(snapshot: {
  enabled: boolean;
  status: LivepeerBroadcastStatus;
  peerConnectionState?: string | null;
  recoveryCount?: number | null;
  maxRecoveries?: number | null;
}): boolean {
  const max = snapshot.maxRecoveries ?? BROADCAST_MAX_LIVE_RECOVERIES;
  const dropped = snapshot.peerConnectionState === "failed" || snapshot.peerConnectionState === "disconnected";
  return Boolean(snapshot.enabled) && snapshot.status === "live" && dropped && (snapshot.recoveryCount ?? 0) < max;
}

export function isSustainedLiveDisconnect(snapshot: {
  peerConnectionState?: string | null;
  disconnectedForMs?: number | null;
  minDisconnectedMs?: number | null;
}): boolean {
  const min = snapshot.minDisconnectedMs ?? BROADCAST_LIVE_DISCONNECT_RECOVERY_MS;
  return snapshot.peerConnectionState === "disconnected" && (snapshot.disconnectedForMs ?? 0) >= min;
}

/** The single deadline for a live-drop incident (spec §6.5). */
export function liveRecoveryDeadlineAtMs(dropObservedAtMs: number): number {
  return dropObservedAtMs + BROADCAST_LIVE_DROP_BUDGET_MS;
}

/** Remaining budget for the next recovery action; never negative, never extended. */
export function remainingLiveRecoveryBudgetMs(dropObservedAtMs: number, nowMs: number): number {
  return Math.max(0, liveRecoveryDeadlineAtMs(dropObservedAtMs) - nowMs);
}

export function shouldConfirmBroadcastLive(snapshot: BroadcastStartSnapshot): boolean {
  return (
    snapshot.enabled &&
    snapshot.status !== "live" &&
    snapshot.mediaReady &&
    snapshot.sessionConfirmed !== false &&
    isSuccessfulStatus(snapshot.whip?.lastStatus) &&
    Boolean(snapshot.whip?.postCompletedAt) &&
    isIceConnected(snapshot.iceConnectionState) &&
    ((snapshot.outboundBytesSent ?? 0) > 0 || (snapshot.outboundPacketsSent ?? 0) > 0)
  );
}

export function shouldRefreshBroadcastMediaForRetry(snapshot: BroadcastStartSnapshot): boolean {
  return (
    snapshot.enabled &&
    snapshot.status !== "live" &&
    snapshot.mediaReady &&
    snapshot.sessionConfirmed !== true &&
    isSuccessfulStatus(snapshot.whip?.lastStatus) &&
    Boolean(snapshot.whip?.postCompletedAt) &&
    isIceConnected(snapshot.iceConnectionState) &&
    !hasOutboundMedia(snapshot)
  );
}

export function findConfirmedLivepeerSession(
  sessions: LivepeerSessionSnapshot[],
  opts: { livepeerId: string; startedAtMs: number; nowMs?: number; freshnessMs?: number },
): LivepeerSessionSnapshot | null {
  const startedAtMs = Math.max(0, opts.startedAtMs - 10_000);
  const nowMs = opts.nowMs ?? Date.now();
  const freshnessMs = opts.freshnessMs ?? 5 * 60_000;
  return sessions
    .filter((session) => !session.parentId || session.parentId === opts.livepeerId)
    .filter((session) => {
      const createdAt = positiveNumber(session.createdAt);
      const lastSeen = positiveNumber(session.lastSeen);
      const isFresh = (createdAt > 0 && createdAt >= startedAtMs) || (lastSeen > 0 && lastSeen >= startedAtMs);
      const recentlySeen =
        (lastSeen > 0 && nowMs - lastSeen <= freshnessMs) ||
        (createdAt > 0 && nowMs - createdAt <= freshnessMs);
      return isFresh && recentlySeen;
    })
    .sort((a, b) => Math.max(positiveNumber(b.lastSeen), positiveNumber(b.createdAt)) - Math.max(positiveNumber(a.lastSeen), positiveNumber(a.createdAt)))[0] ?? null;
}

export function stalledBroadcastMessage(snapshot: BroadcastStartSnapshot): string {
  const whip = snapshot.whip ?? {};
  const status = whip.lastStatus ?? null;

  if (!snapshot.mediaReady) {
    return "Camera preview did not become ready. Check camera and microphone permissions, then start again.";
  }
  if (status === 401 || status === 403) {
    return "Livepeer rejected the stream key. Reveal or regenerate ingest, then start again.";
  }
  if (status === 404) {
    return "Livepeer could not find this stream. Regenerate ingest, then start again.";
  }
  if (whip.lastError) {
    return "The live session could not connect. Check the network, then try again or use OBS with the stream key.";
  }
  if (!whip.postStartedAt) {
    return "The browser could not reach Livepeer ingest. Check the network, then try again or use OBS with the stream key.";
  }
  if (isSuccessfulStatus(status) && isIceConnected(snapshot.iceConnectionState)) {
    return "Livepeer accepted the start request and ICE connected, but outbound media was not confirmed. Try again, or use OBS with the stream key.";
  }
  if (isSuccessfulStatus(status)) {
    return "Livepeer accepted the start request but did not confirm a live session. Try again, or use OBS with the stream key.";
  }
  return "The live session could not connect. Try again, or use OBS with the stream key.";
}

function isSuccessfulStatus(status: number | null | undefined): boolean {
  return typeof status === "number" && status >= 200 && status < 300;
}

function isIceConnected(state: string | null | undefined): boolean {
  return state === "connected" || state === "completed";
}

function hasOutboundMedia(snapshot: BroadcastStartSnapshot): boolean {
  return (snapshot.outboundBytesSent ?? 0) > 0 || (snapshot.outboundPacketsSent ?? 0) > 0;
}

function positiveNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
