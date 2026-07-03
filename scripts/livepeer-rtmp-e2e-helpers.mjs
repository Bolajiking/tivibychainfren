const RTMP_INGEST = "rtmp://rtmp.livepeer.com/live";

export function buildRtmpEncoderArgs(streamKey) {
  const key = String(streamKey ?? "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new Error("Invalid Livepeer stream key");

  return [
    "-hide_banner",
    "-loglevel", "warning",
    "-re",
    "-f", "lavfi",
    "-i", "testsrc2=size=640x360:rate=30",
    "-f", "lavfi",
    "-i", "sine=frequency=880:sample_rate=48000",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-profile:v", "baseline",
    "-pix_fmt", "yuv420p",
    "-g", "60",
    "-keyint_min", "60",
    "-b:v", "900k",
    "-maxrate", "900k",
    "-bufsize", "1800k",
    "-c:a", "aac",
    "-b:a", "96k",
    "-ar", "48000",
    "-f", "flv",
    `${RTMP_INGEST}/${key}`,
  ];
}

export function firstHlsVariantUri(manifest) {
  return String(manifest ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#") && /\.m3u8(?:$|[?#])/i.test(line)) ?? null;
}

export function rtmpE2ePassed(evidence) {
  return evidence?.isActive === true
    && Number(evidence?.matchingSessions) > 0
    && Number(evidence?.playbackSources) > 0
    && evidence?.manifestOk === true
    && Number(evidence?.segments) > 0;
}

export function redactRtmpSecret(value, streamKey) {
  const key = String(streamKey ?? "");
  if (!key) return String(value ?? "");
  return String(value ?? "").split(key).join("<redacted>");
}
