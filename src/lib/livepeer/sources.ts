// HLS manifests that contain these markers are dead/erroring, so the playback
// seam filters them out before handing sources to `@livepeer/react`'s player.
const HLS_ERROR_MARKERS = ["#EXT-X-ERROR", "stream open failed", "not allowed to view this stream"];

export function isHlsManifestHealthy(manifest: string): boolean {
  const lower = manifest.toLowerCase();
  return !HLS_ERROR_MARKERS.some((m) => lower.includes(m.toLowerCase()));
}

export function firstHlsVariantUri(manifest: string): string | null {
  return manifest
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#") && /\.m3u8(?:$|[?#])/i.test(line)) ?? null;
}
