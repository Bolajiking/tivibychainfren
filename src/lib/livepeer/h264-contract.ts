export interface BridgeVideoCodecLike {
  mimeType?: string | null;
}

export interface BridgeVideoCapabilitiesLike {
  codecs?: BridgeVideoCodecLike[] | null;
}

export type BridgeCodecGateVerdict =
  | { ok: true }
  | { ok: false; reasonCode: "bridge_unsupported_codec" };

export type NegotiatedBridgeCodecVerdict =
  | { ok: true }
  | { ok: false; pending: true; reasonCode?: undefined }
  | { ok: false; reasonCode: "bridge_codec_mismatch" };

function isH264(codec: BridgeVideoCodecLike | null | undefined): boolean {
  return String(codec?.mimeType ?? "").toLowerCase() === "video/h264";
}

export function evaluateBridgeCodecGate(
  capabilities: BridgeVideoCapabilitiesLike | null | undefined,
): BridgeCodecGateVerdict {
  const codecs = capabilities?.codecs;
  if (Array.isArray(codecs) && codecs.some(isH264)) return { ok: true };
  return { ok: false, reasonCode: "bridge_unsupported_codec" };
}

export function orderBridgeVideoCodecPreferences<T extends BridgeVideoCodecLike>(
  codecs: T[] | null | undefined,
): T[] {
  const values = Array.isArray(codecs) ? [...codecs] : [];
  return [...values.filter(isH264), ...values.filter((codec) => !isH264(codec))];
}

export function negotiatedBridgeVideoCodecVerdict(
  videoCodec: string | null | undefined,
): "h264" | "mismatch" | "pending" {
  const value = String(videoCodec ?? "").trim();
  if (!value) return "pending";
  return value.toLowerCase() === "video/h264" ? "h264" : "mismatch";
}

export function evaluateNegotiatedBridgeVideoCodec(
  videoCodec: string | null | undefined,
): NegotiatedBridgeCodecVerdict {
  const verdict = negotiatedBridgeVideoCodecVerdict(videoCodec);
  if (verdict === "h264") return { ok: true };
  if (verdict === "pending") return { ok: false, pending: true };
  return { ok: false, reasonCode: "bridge_codec_mismatch" };
}
