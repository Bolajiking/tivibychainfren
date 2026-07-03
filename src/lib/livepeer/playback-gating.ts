export type PlaybackMode = "live" | "vod";

export function playbackTransportPolicy(mode: PlaybackMode, autoPlay: boolean) {
  if (mode === "live") {
    return {
      lowLatency: true as const,
      timeoutMs: 1_800,
      webRtcFailureCacheMs: 60_000,
      volume: autoPlay ? 0 : 0.85,
    };
  }
  return {
    lowLatency: false as const,
    timeoutMs: 10_000,
    webRtcFailureCacheMs: 0,
    volume: 0.85,
  };
}

export function shouldHealthCheckHlsSource(mode: PlaybackMode): boolean {
  return mode === "vod";
}

export function shouldExposePlaybackSources({
  mode,
  live,
  sourceCount,
}: {
  mode: PlaybackMode;
  live: boolean;
  sourceCount: number;
}): boolean {
  if (sourceCount <= 0) return false;
  return mode === "vod" || live;
}

export function shouldMountLivePlayback({
  isActive,
  locked,
  playbackId,
}: {
  isActive: boolean;
  locked: boolean;
  playbackId?: string | null;
}): boolean {
  return isActive && !locked && Boolean(playbackId);
}
