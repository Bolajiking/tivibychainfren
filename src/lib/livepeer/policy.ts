// Pure, side-effect-free policy for the Livepeer key-holder proxy.
// The LIVEPEER_API_KEY never reaches the browser; every Livepeer call goes
// through /api/livepeer/[...path], which is constrained by the rules below.
// Spec §8.1: allow-list the surface, owner-scope mutations, and strip stream
// secrets (ingest keys) from any response a non-owner can read.

export const LIVEPEER_API = "https://livepeer.studio/api";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface ProxyRule {
  method: HttpMethod;
  /** Matches the path segments after /api/livepeer/. */
  segments: (string | "*")[];
  /** Mutations and key-bearing reads require an authenticated owner. */
  requireOwner: boolean;
  /** Strip ingest secrets from the response unless the caller owns the resource. */
  redactSecrets: boolean;
}

// The entire allowed Livepeer surface. Anything not matched here is rejected.
const PROXY_RULES: ProxyRule[] = [
  // Public playback info — no secrets exist here; redact as belt-and-suspenders.
  { method: "GET", segments: ["playback", "*"], requireOwner: false, redactSecrets: true },
  // Read a stream/asset — the per-id ownership check (route handler) is the gate,
  // so the verified owner legitimately receives their ingest key here.
  { method: "GET", segments: ["stream", "*"], requireOwner: true, redactSecrets: false },
  { method: "GET", segments: ["stream", "*", "sessions"], requireOwner: true, redactSecrets: true },
  { method: "GET", segments: ["session"], requireOwner: true, redactSecrets: true },
  { method: "GET", segments: ["asset", "*"], requireOwner: true, redactSecrets: false },
  // Create live stream — owner only.
  { method: "POST", segments: ["stream"], requireOwner: true, redactSecrets: false },
  // Update a stream (suspend / record toggle) — owner only.
  { method: "PATCH", segments: ["stream", "*"], requireOwner: true, redactSecrets: false },
  // Request a resumable VOD upload URL — owner only.
  { method: "POST", segments: ["asset", "request-upload"], requireOwner: true, redactSecrets: false },
];

export function matchProxyRoute(method: string, segments: string[]): ProxyRule | null {
  const m = method.toUpperCase();
  for (const rule of PROXY_RULES) {
    if (rule.method !== m) continue;
    if (rule.segments.length !== segments.length) continue;
    const ok = rule.segments.every((seg, i) => seg === "*" || seg === segments[i]);
    if (ok) return rule;
  }
  return null;
}

// Keys that are ingest secrets and must never leave the server for a non-owner.
const SENSITIVE_KEYS = new Set([
  "streamKey",
  "secret",
  "createdByTokenName",
  "srtIngestUrl",
  "rtmpIngestUrl",
]);

/** Deep-clone a Livepeer response with all ingest secrets removed. */
export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k)) continue;
      out[k] = redactSecrets(v);
    }
    return out as T;
  }
  return value;
}

/** Only a small allow-list of fields may be forwarded on a PATCH stream. */
const WRITABLE_STREAM_FIELDS = new Set(["suspended", "record", "name"]);

export function filterWritableStreamFields(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (WRITABLE_STREAM_FIELDS.has(k)) out[k] = v;
  }
  return out;
}
