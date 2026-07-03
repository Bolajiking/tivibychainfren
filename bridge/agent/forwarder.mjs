// Path-scoped RTMP forwarder (spec §5.1, §6.3 step 3). Before ffmpeg spawns,
// the negotiated video codec is read from the loopback MediaMTX API; anything
// but H.264 rejects the lease instead of pushing broken video into RTMP/FLV.
// Video is copied, Opus is transcoded to AAC — the proven 20/20 + 3/3 boundary.

export function ffmpegForwardArgs(rtspUrl, rtmpUrl) {
  return [
    "-nostdin",
    "-loglevel",
    "warning",
    "-rtsp_transport",
    "tcp",
    "-i",
    rtspUrl,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-f",
    "flv",
    rtmpUrl,
  ];
}

function hasH264Track(info) {
  const tracks = Array.isArray(info?.tracks) ? info.tracks : [];
  return tracks.some((track) => String(track).toUpperCase().includes("H264"));
}

export async function resolveForwarderPlan({ path, rtspBase, fetchPathInfo, fetchDestination }) {
  let info;
  try {
    info = await fetchPathInfo(`/v3/paths/get/${encodeURIComponent(path)}`);
  } catch {
    return { action: "reject", reason: "path_unavailable" };
  }
  if (!hasH264Track(info)) return { action: "reject", reason: "unsupported_codec" };

  const rtmpUrl = await fetchDestination(path).catch(() => null);
  if (!rtmpUrl) return { action: "reject", reason: "no_destination" };

  const rtspUrl = `${String(rtspBase).replace(/\/$/, "")}/${path}`;
  return { action: "forward", args: ffmpegForwardArgs(rtspUrl, rtmpUrl) };
}

export function createForwarderRunner({
  rtspBase,
  fetchPathInfo,
  fetchDestination,
  spawn,
  onReject,
  log = () => {},
}) {
  const running = new Map();

  return {
    async start(path) {
      if (running.has(path)) return;
      const plan = await resolveForwarderPlan({ path, rtspBase, fetchPathInfo, fetchDestination });
      if (plan.action === "reject") {
        log({ event: "forwarder_rejected", path, reason: plan.reason });
        onReject(path, plan.reason);
        return;
      }
      // Args carry the RTMP destination; they are never logged.
      const child = spawn("ffmpeg", plan.args, { stdio: ["ignore", "ignore", "inherit"] });
      running.set(path, child);
      log({ event: "forwarder_started", path });
      child.on?.("exit", (code) => {
        if (running.get(path) === child) running.delete(path);
        log({ event: "forwarder_exited", path, code });
      });
    },

    stop(path) {
      const child = running.get(path);
      if (!child) return;
      running.delete(path);
      child.kill("SIGTERM");
      log({ event: "forwarder_stopped", path });
    },

    stopAll() {
      for (const path of [...running.keys()]) this.stop(path);
    },

    activePaths() {
      return [...running.keys()];
    },
  };
}
