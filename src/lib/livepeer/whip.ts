export function chooseWhipPostUrl(originalUrl: string, resolvedUrl?: string | null): string {
  if (!resolvedUrl) return originalUrl;
  try {
    const original = new URL(originalUrl);
    const resolved = new URL(resolvedUrl);
    const streamKey = original.pathname.split("/").filter(Boolean).pop();
    const resolvedKey = resolved.pathname.split("/").filter(Boolean).pop();
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") return originalUrl;
    if (!resolved.pathname.includes("/webrtc/")) return originalUrl;
    if (!streamKey || !resolvedKey) return originalUrl;
    const originalUsesVideoPrefix = streamKey.startsWith("video+");
    const baseStreamKey = originalUsesVideoPrefix ? streamKey.slice("video+".length) : streamKey;
    if (!baseStreamKey) return originalUrl;
    if (resolvedKey !== baseStreamKey && resolvedKey !== `video+${baseStreamKey}`) return originalUrl;
    if (originalUsesVideoPrefix && resolvedKey === baseStreamKey) {
      const parts = resolved.pathname.split("/");
      parts[parts.length - 1] = `video+${baseStreamKey}`;
      resolved.pathname = parts.join("/");
    }
    return resolved.toString();
  } catch {
    return originalUrl;
  }
}

export function normalizeLivepeerWhipUrlForBroadcast(whipUrl: string): string {
  try {
    const url = new URL(whipUrl);
    const parts = url.pathname.split("/");
    const streamKey = parts.at(-1);
    if (!streamKey || streamKey.startsWith("video+")) return whipUrl;
    const webrtcIndex = parts.findIndex((part) => part === "webrtc");
    if (webrtcIndex < 0 || webrtcIndex !== parts.length - 2) return whipUrl;
    parts[parts.length - 1] = `video+${streamKey}`;
    url.pathname = parts.join("/");
    return url.toString();
  } catch {
    return whipUrl;
  }
}

export function resolveLivepeerWhipBrowserRouting(
  canonicalIngestUrl: string,
  resolvedUrl?: string | null,
): { postUrl: string; iceUrl: string } {
  const postUrl = normalizeLivepeerWhipUrlForBroadcast(canonicalIngestUrl);
  return {
    postUrl,
    iceUrl: chooseWhipPostUrl(postUrl, resolvedUrl),
  };
}

export function rewriteLivepeerWhipPostUrlForCors(requestUrl: string, canonicalIngestUrl: string): string {
  try {
    const request = new URL(requestUrl);
    const canonical = new URL(canonicalIngestUrl);
    if (!isLivepeerWhipUrl(request) || !isLivepeerWhipUrl(canonical)) return requestUrl;
    if (request.origin === canonical.origin && request.pathname === canonical.pathname) return requestUrl;
    if (whipStreamKey(request) !== whipStreamKey(canonical)) return requestUrl;
    return canonical.toString();
  } catch {
    return requestUrl;
  }
}

export function livepeerIceServersFromWhipUrl(whipUrl: string): RTCIceServer[] {
  const url = new URL(whipUrl);
  const host = url.host.split(":")[0];
  return [
    { urls: `stun:${host}` },
    { urls: `turn:${host}`, username: "livepeer", credential: "livepeer" },
  ];
}

function isLivepeerWhipUrl(url: URL): boolean {
  const host = url.host.toLowerCase();
  return (host.includes("livepeer") || host.includes("lp-playback")) && url.pathname.includes("/webrtc/");
}

function whipStreamKey(url: URL): string | null {
  const key = url.pathname.split("/").filter(Boolean).pop();
  return key ? key.replace(/^video\+/, "") : null;
}

/** TURN host parsed from a stun:/turn:/turns: URL (handles optional :port and ?transport). */
export function parseLivepeerIceHost(url: string | string[] | undefined): string | null {
  const first = Array.isArray(url) ? url[0] : url;
  if (typeof first !== "string") return null;
  const match = first.match(/^(?:stun|stuns|turn|turns):([^:?/]+)/i);
  return match ? match[1] : null;
}

/**
 * The Livepeer WebRTC SDK only configures UDP ICE servers (`stun:` + bare
 * `turn:`). On networks that block UDP (corporate firewalls, many ISPs, VPNs)
 * ICE never connects, DTLS times out, and Livepeer never sees media — so the
 * stream never goes active. The catalyst also exposes TURN over TCP (3478) and
 * TLS (443), which traverse UDP-blocking firewalls. This augments the SDK's
 * iceServers with those TCP/TLS relay candidates so the browser can still
 * publish; UDP stays first so good networks are unaffected.
 */
export function augmentLivepeerIceServersForTcp(existing: RTCIceServer[] | undefined): RTCIceServer[] {
  const servers = Array.isArray(existing) ? [...existing] : [];
  const host = servers.map((server) => parseLivepeerIceHost(server.urls)).find((value): value is string => Boolean(value));
  if (!host) return servers;

  const have = new Set<string>();
  for (const server of servers) {
    for (const u of Array.isArray(server.urls) ? server.urls : [server.urls]) have.add(u);
  }

  const tcpRelays: RTCIceServer[] = [
    { urls: `turn:${host}:3478?transport=tcp`, username: "livepeer", credential: "livepeer" },
    { urls: `turns:${host}:5349?transport=tcp`, username: "livepeer", credential: "livepeer" },
  ];
  for (const relay of tcpRelays) {
    if (!have.has(relay.urls as string)) servers.push(relay);
  }
  return servers;
}

export interface WhipOfferSummary {
  audioMLineCount: number;
  videoMLineCount: number;
  hasAudioSend: boolean;
  hasVideoSend: boolean;
  audioSendonlyCount: number;
  videoSendonlyCount: number;
}

export interface BroadcastDiagnosticInput {
  mediaReady: boolean;
  whip?: {
    headStartedAt?: number | null;
    headCompletedAt?: number | null;
    postStartedAt?: number | null;
    postCompletedAt?: number | null;
    lastStatus?: number | null;
    lastHost?: string | null;
    lastError?: string | null;
  } | null;
  peerConnectionState?: string | null;
  iceConnectionState?: string | null;
  offer?: WhipOfferSummary | null;
  outboundPacketsSent?: number | null;
  sessionConfirmed?: boolean | null;
}

export function summarizeWhipOfferSdp(sdp: string): WhipOfferSummary {
  const sections = sdp
    .split(/\r?\nm=/)
    .map((section, index) => (index === 0 ? section : `m=${section}`))
    .filter((section) => section.startsWith("m="));
  let audioMLineCount = 0;
  let videoMLineCount = 0;
  let hasAudioSend = false;
  let hasVideoSend = false;
  let audioSendonlyCount = 0;
  let videoSendonlyCount = 0;

  for (const section of sections) {
    const lines = section.split(/\r?\n/).map((line) => line.trim().toLowerCase());
    const mediaLine = lines[0] ?? "";
    const isAudio = mediaLine.startsWith("m=audio ");
    const isVideo = mediaLine.startsWith("m=video ");
    if (!isAudio && !isVideo) continue;

    const sendsMedia = !lines.includes("a=inactive") && !lines.includes("a=recvonly");
    if (isAudio) {
      audioMLineCount += 1;
      hasAudioSend ||= sendsMedia;
      if (lines.includes("a=sendonly")) audioSendonlyCount += 1;
    }
    if (isVideo) {
      videoMLineCount += 1;
      hasVideoSend ||= sendsMedia;
      if (lines.includes("a=sendonly")) videoSendonlyCount += 1;
    }
  }

  return { audioMLineCount, videoMLineCount, hasAudioSend, hasVideoSend, audioSendonlyCount, videoSendonlyCount };
}

export function buildBroadcastDiagnosticText(input: BroadcastDiagnosticInput): string {
  const parts: string[] = [input.mediaReady ? "Camera ready" : "Camera pending"];
  const whip = input.whip ?? {};

  if (whip.lastError) {
    parts.push("Ingest error");
  } else if (whip.headStartedAt) {
    parts.push(`Ingest HEAD ${formatWhipStep(whip.headCompletedAt, whip.lastStatus)}`);
  } else if (whip.postStartedAt) {
    parts.push("Ingest cached");
  } else {
    parts.push("Ingest pending");
  }

  if (whip.postStartedAt) {
    parts.push(`WHIP POST ${formatWhipStep(whip.postCompletedAt, whip.lastStatus)}`);
  }

  if (input.peerConnectionState) parts.push(`Connection ${input.peerConnectionState}`);
  if (input.iceConnectionState) parts.push(`ICE ${input.iceConnectionState}`);

  const offer = input.offer;
  if (offer && (offer.audioMLineCount || offer.videoMLineCount)) {
    parts.push(
      `Offer ${offer.hasAudioSend ? "audio" : "no audio"}/${offer.hasVideoSend ? "video" : "no video"}${
        offer.audioSendonlyCount || offer.videoSendonlyCount ? " sendonly" : ""
      }`,
    );
  }

  const outboundPackets = positiveNumber(input.outboundPacketsSent);
  if (outboundPackets > 0) parts.push(`Media ${outboundPackets}`);
  parts.push(input.sessionConfirmed ? "Session found" : "Session pending");

  return parts.join(" · ");
}

export function needsRelaxedMediaConstraints(error: unknown): boolean {
  const name = errorName(error);
  return name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError" || name === "NotFoundError";
}

export function broadcastPublishErrorMessage(error: unknown): string {
  const name = errorName(error);
  const message = errorMessage(error);
  if (name === "NotAllowedError" || message.includes("permission") || message.includes("not allowed")) {
    return "Camera or microphone access was blocked. Allow access, then start again.";
  }
  if (name === "NotFoundError") return "No usable camera or microphone was found on this device.";
  if (message.includes("401") || message.includes("403") || message.includes("unauthorized")) {
    return "The stream key was rejected. Regenerate ingest or reveal the encoder key, then try again.";
  }
  if (message.includes("404")) return "The live stream was not found upstream. Regenerate ingest and try again.";
  if (message.includes("whip_offer_missing_sendable_media") || message.includes("no_sendable_media")) {
    return "The browser prepared a live connection without camera or mic media. Turn one on, then start again.";
  }
  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    message.includes("timeout") ||
    message.includes("failed to fetch") ||
    message.includes("failed to connect to peer") ||
    message.includes("failed to gather ice candidates") ||
    message.includes("peer connection not defined") ||
    message.includes("no rtcpeerconnection") ||
    message.includes("network")
  ) {
    return "The live session could not connect. Check the network, then try again or use OBS with the stream key.";
  }
  return "The live session did not start. Try again, or use the encoder key below.";
}

function errorName(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error ? String((error as { name?: unknown }).name) : "";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.toLowerCase();
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message ?? "").toLowerCase();
  }
  return String(error ?? "").toLowerCase();
}

function formatWhipStep(completedAt: number | null | undefined, status: number | null | undefined): string {
  if (!completedAt) return "pending";
  return typeof status === "number" ? String(status) : "complete";
}

function positiveNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
