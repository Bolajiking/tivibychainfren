import { createHash, timingSafeEqual } from "node:crypto";

type Environment = Record<string, string | undefined>;

export interface LiveFieldConfig {
  apiKey: string;
  token: string;
  streamId: string;
  streamKey: string;
  playbackId: string;
  whipUrl: string;
}

export type LiveFieldPublicConfig = Omit<LiveFieldConfig, "apiKey">;

export type LiveFieldEvidenceEvent =
  | "page_ready"
  | "broadcast_status"
  | "media_state"
  | "go_live_gesture"
  | "network_state"
  | "camera_interrupted"
  | "obs_fallback";

export interface LiveFieldEvidence {
  event: LiveFieldEvidenceEvent;
  status?: string;
  peer?: string;
  enabled?: boolean;
  browser?: string;
  platform?: string;
  mobile?: boolean;
  secureContext?: boolean;
  mediaDevices?: boolean;
  playsInline?: boolean;
  muted?: boolean;
  autoPlay?: boolean;
  userActivated?: boolean;
  mediaReady?: boolean;
  camera?: string;
  microphone?: string;
  videoCodec?: string;
  audioCodec?: string;
  error?: string;
  online?: boolean;
  effectiveType?: string;
  occurredAt: number;
}

export function readLiveFieldConfig(env: Environment): LiveFieldConfig | null {
  const config: LiveFieldConfig = {
    apiKey: normalize(env.LIVEPEER_API_KEY),
    token: normalize(env.TVINBIO_FIELD_TOKEN),
    streamId: normalize(env.TVINBIO_FIELD_STREAM_ID),
    streamKey: normalize(env.TVINBIO_FIELD_STREAM_KEY),
    playbackId: normalize(env.TVINBIO_FIELD_PLAYBACK_ID),
    whipUrl: normalize(env.TVINBIO_FIELD_WHIP_URL),
  };

  return Object.values(config).every(Boolean) ? config : null;
}

export function authorizeLiveFieldRequest(
  config: LiveFieldConfig | null,
  token: string | null | undefined,
  streamId: string | null | undefined,
): boolean {
  if (!config || !token || streamId !== config.streamId) return false;
  return constantTimeEqual(token, config.token);
}

export function toLiveFieldPublicConfig(config: LiveFieldConfig | null): LiveFieldPublicConfig | null {
  if (!config) return null;
  return {
    token: config.token,
    streamId: config.streamId,
    streamKey: config.streamKey,
    playbackId: config.playbackId,
    whipUrl: config.whipUrl,
  };
}

export function parseLiveFieldEvidence(config: LiveFieldConfig | null, value: unknown): LiveFieldEvidence | null {
  if (!config || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.streamId !== config.streamId || !isEvidenceEvent(record.event)) return null;
  const occurredAt = typeof record.occurredAt === "number" && Number.isFinite(record.occurredAt)
    ? Math.trunc(record.occurredAt)
    : Date.now();
  const strings = pickBoundedStrings(record, [
    "status",
    "peer",
    "browser",
    "platform",
    "camera",
    "microphone",
    "videoCodec",
    "audioCodec",
    "error",
    "effectiveType",
  ]);
  const booleans = pickBooleans(record, [
    "enabled",
    "mobile",
    "secureContext",
    "mediaDevices",
    "playsInline",
    "muted",
    "autoPlay",
    "userActivated",
    "mediaReady",
    "online",
  ]);
  return {
    event: record.event,
    ...strings,
    ...booleans,
    occurredAt,
  };
}

function normalize(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function isEvidenceEvent(value: unknown): value is LiveFieldEvidenceEvent {
  return value === "page_ready"
    || value === "broadcast_status"
    || value === "media_state"
    || value === "go_live_gesture"
    || value === "network_state"
    || value === "camera_interrupted"
    || value === "obs_fallback";
}

function boundedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 40) : null;
}

function pickBoundedStrings(record: Record<string, unknown>, keys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = boundedString(record[key]);
    if (value) result[key] = value;
  }
  return result;
}

function pickBooleans(record: Record<string, unknown>, keys: string[]): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const key of keys) {
    if (typeof record[key] === "boolean") result[key] = record[key];
  }
  return result;
}
