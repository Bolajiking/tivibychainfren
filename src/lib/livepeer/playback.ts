import { getSrc, type LivepeerPlaybackInfo, type LivepeerSource } from "@livepeer/react/external";
import { config } from "@/lib/config";
import {
  shouldExposePlaybackSources,
  shouldHealthCheckHlsSource,
  type PlaybackMode,
} from "@/lib/livepeer/playback-gating";
import { LIVEPEER_API } from "@/lib/livepeer/policy";
import { isHlsManifestHealthy } from "@/lib/livepeer/sources";

/** The normalized source array `@livepeer/react`'s Player.Root consumes. */
export type PlaybackSrc = NonNullable<ReturnType<typeof getSrc>>;

/**
 * The playback seam. Resolves a playback id to the `getSrc` source array — the
 * exact shape `Player.Root` consumes (so it can pick WebRTC for low latency and
 * fall back to HLS). HLS manifests are health-checked server-side (the reference
 * keeps this so the player never attaches to a dead/erroring manifest). `mock`
 * keeps the no-key prototype on its placeholder; `starting` = live but no source
 * yet (keep polling).
 */
export type PlaybackInfo =
  | { state: "ready"; sources: PlaybackSrc; live: boolean }
  | { state: "starting" }
  | { state: "processing" }
  | { state: "not_found" }
  | { state: "mock" };

type PlaybackPayload = {
  meta?: { live?: number | boolean; source?: LivepeerSource[] };
};

export async function getPlaybackInfo(playbackId: string, options: { mode?: PlaybackMode } = {}): Promise<PlaybackInfo> {
  if (!config.livepeer.enabled) return { state: "mock" };
  if (!playbackId) return { state: "not_found" };

  let data: PlaybackPayload;
  try {
    const res = await fetch(`${LIVEPEER_API}/playback/${encodeURIComponent(playbackId)}`, {
      headers: { authorization: `Bearer ${process.env.LIVEPEER_API_KEY}` },
      cache: "no-store",
    });
    if (res.status === 404) return { state: "not_found" };
    if (res.status === 422) return { state: "processing" };
    if (!res.ok) return { state: "processing" };
    data = playbackPayload(await res.json());
  } catch {
    return { state: "processing" };
  }

  const live = data?.meta?.live === 1 || data?.meta?.live === true;
  const all = getSrc(data as LivepeerPlaybackInfo) ?? [];
  if (!all.length) return live ? { state: "starting" } : { state: "processing" };

  const mode = options.mode ?? "vod";
  // A confirmed-live source must reach the player immediately. HLS.js performs
  // its own manifest/segment recovery; VOD keeps the stricter server preflight.
  const healthy: PlaybackSrc = [];
  for (const s of all) {
    if (s.type !== "hls" || !shouldHealthCheckHlsSource(mode)) {
      healthy.push(s);
      continue;
    }
    if (await isHlsSourceReady(s.src)) healthy.push(s);
  }

  if (!healthy.length) return live ? { state: "starting" } : { state: "processing" };
  if (!shouldExposePlaybackSources({ mode, live, sourceCount: healthy.length })) {
    return { state: "starting" };
  }
  return { state: "ready", sources: healthy, live };
}

function playbackPayload(value: unknown): PlaybackPayload {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function isHlsSourceReady(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return false;
    return isHlsManifestHealthy(await res.text());
  } catch {
    return false;
  }
}
