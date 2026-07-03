export const PUBLIC_LIVE_FLIP_MAX_MS = 3_000;
export const VIEWER_FIRST_FRAME_MAX_MS = 4_000;

export function buildTemporaryPublicProfileRows({ creatorId, username, livepeerId, livepeerPlaybackId }) {
  return {
    creator: {
      creator_id: creatorId,
      username,
      display_name: "TVinBio propagation check",
      bio: "Temporary livestream verification channel",
      avatar_color: "#0091ff",
      subscriber_count: 0,
      social_links: [],
      category: "Live verification",
    },
    stream: {
      playback_id: `live-${username}`,
      creator_id: creatorId,
      title: "Live propagation check",
      description: "Temporary end-to-end Livepeer verification",
      view_mode: "free",
      amount: 0,
      is_active: false,
      viewer_count: 0,
      thumb_color: "#0d1c2d",
      paid_users: [],
      donation_presets: [1, 5, 10],
      record: false,
      livepeer_id: livepeerId,
      livepeer_playback_id: livepeerPlaybackId,
    },
  };
}

export function isDecodedVideoFrame({ readyState, videoWidth, videoHeight }) {
  return readyState >= 2 && videoWidth > 0 && videoHeight > 0;
}

export function propagationThresholdsMet({ liveFlipMs, firstFrameMs }) {
  return liveFlipMs <= PUBLIC_LIVE_FLIP_MAX_MS && firstFrameMs <= VIEWER_FIRST_FRAME_MAX_MS;
}

export function playbackRequestKind(value) {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    if (pathname.includes("/webrtc/")) return "webrtc";
    if (pathname.endsWith(".m3u8")) return "hls-manifest";
    if (/\.(?:ts|m4s|mp4|aac)$/.test(pathname)) return "hls-segment";
    if (/\.(?:jpg|jpeg|png|webp)$/.test(pathname)) return "image";
    if (pathname.includes("/analytics/")) return "analytics";
    return "other";
  } catch {
    return "other";
  }
}

export function relativeTimingMs(startedAt, observedAt) {
  if (!Number.isFinite(startedAt) || startedAt <= 0 || !Number.isFinite(observedAt)) return null;
  return Math.max(0, Math.round(observedAt - startedAt));
}

export function redactPlaybackUrl(value) {
  try {
    const url = new URL(value);
    for (const key of ["token", "jwt", "accessKey", "tkn"]) {
      if (url.searchParams.has(key)) url.searchParams.set(key, "<redacted>");
    }
    return url.toString();
  } catch {
    return String(value).replace(/([?&](?:token|jwt|accessKey|tkn)=)[^&]+/gi, "$1<redacted>");
  }
}
