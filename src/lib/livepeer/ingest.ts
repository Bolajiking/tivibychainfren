// Livepeer ingest endpoints. The RTMP host is the dedicated ingest gateway
// `rtmp.livepeer.com` — NOT `livepeer.studio` (the API/dashboard host), which
// does not accept RTMP and is unreachable on many networks. This is the host
// OBS / hardware encoders must use.
export const LIVEPEER_RTMP_SERVER_URL = "rtmp://rtmp.livepeer.com/live";
export const LIVEPEER_WHIP_INGEST_BASE_URL = "https://playback.livepeer.studio/webrtc";

export function livepeerRtmpServerUrl(): string {
  return LIVEPEER_RTMP_SERVER_URL;
}

export function livepeerRtmpFullUrl(streamKey: string): string {
  return `${LIVEPEER_RTMP_SERVER_URL}/${streamKey.trim()}`;
}

export function livepeerWhipIngestUrl(streamKey: string): string {
  const key = streamKey.trim();
  return key ? `${LIVEPEER_WHIP_INGEST_BASE_URL}/${key}` : "";
}
