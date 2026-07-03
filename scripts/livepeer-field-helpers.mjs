import { setTimeout as delay } from "node:timers/promises";

export function buildLiveFieldEnvironment(stream, token, baseEnv = process.env) {
  const id = required(stream?.id, "stream id");
  const streamKey = required(stream?.streamKey, "stream key");
  const playbackId = required(stream?.playbackId, "playback id");
  const fieldToken = required(token, "field token");
  required(baseEnv.LIVEPEER_API_KEY, "LIVEPEER_API_KEY");

  return {
    ...baseEnv,
    TVINBIO_FIELD_TOKEN: fieldToken,
    TVINBIO_FIELD_STREAM_ID: id,
    TVINBIO_FIELD_STREAM_KEY: streamKey,
    TVINBIO_FIELD_PLAYBACK_ID: playbackId,
    TVINBIO_FIELD_WHIP_URL: `https://playback.livepeer.studio/webrtc/${encodeURIComponent(streamKey)}`,
  };
}

export function parseQuickTunnelOrigin(output) {
  const origins = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/gi) ?? [];
  return origins.find((origin) => new URL(origin).hostname !== "api.trycloudflare.com") ?? null;
}

export function parseReadyQuickTunnelOrigin(output) {
  if (!/Registered tunnel connection/i.test(output)) return null;
  return parseQuickTunnelOrigin(output);
}

export function buildLiveFieldUrl(origin, token) {
  const url = new URL("/field/live", origin);
  url.searchParams.set("token", required(token, "field token"));
  return url.href;
}

export function waitForFieldRunEnd(tunnel, shutdownPromise) {
  if (tunnel.exitCode !== null || tunnel.signalCode !== null) {
    return Promise.reject(fieldTunnelExitError(tunnel.exitCode, tunnel.signalCode));
  }

  const tunnelExit = new Promise((_, reject) => {
    tunnel.once("exit", (code, signal) => reject(fieldTunnelExitError(code, signal)));
    tunnel.once("error", reject);
  });
  return Promise.race([shutdownPromise, tunnelExit]);
}

export function waitForFieldShutdown(signalSource) {
  return new Promise((resolve) => {
    let requested = false;
    const stop = () => {
      if (requested) return;
      requested = true;
      resolve();
    };
    signalSource.on("SIGINT", stop);
    signalSource.on("SIGTERM", stop);
    signalSource.on("SIGHUP", stop);
  });
}

export function createIdempotentFieldCleanup(cleanup) {
  let cleanupPromise = null;
  return () => {
    cleanupPromise ??= Promise.resolve().then(cleanup);
    return cleanupPromise;
  };
}

export async function waitForFieldPage(url, child, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pollMs = options.pollMs ?? 300;
  const requestTimeoutMs = options.requestTimeoutMs ?? 2_000;
  const label = options.label ?? "Field page host";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${label} exited (${child.exitCode})`);
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (response.status === 200) return;
    } catch {}
    await delay(pollMs);
  }

  throw new Error("Field page did not become reachable");
}

function fieldTunnelExitError(code, signal) {
  return new Error(`Cloudflare Quick Tunnel exited (${code ?? signal ?? "unknown"})`);
}

function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} missing`);
  return value.trim();
}
