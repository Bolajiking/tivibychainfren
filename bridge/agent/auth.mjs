// Control-plane HMAC verification. Mirrors src/lib/bridge/hmac.ts exactly —
// canonical string `METHOD\npath\nunix-seconds\nnonce\nsha256(body)` — and the
// repo test suite cross-verifies both implementations against each other.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const HMAC_SKEW_SECONDS = 120;
export const NONCE_RETENTION_MS = 10 * 60_000;
export const NONCE_MAX_ENTRIES = 10_000;

export function canonicalSigningString({ method, path, timestampSeconds, nonce, body }) {
  const bodyHash = createHash("sha256").update(body ?? "", "utf8").digest("hex");
  return [String(method ?? "").toUpperCase(), path, String(timestampSeconds), nonce, bodyHash].join("\n");
}

export function createNonceStore({ maxEntries = NONCE_MAX_ENTRIES, retentionMs = NONCE_RETENTION_MS } = {}) {
  const entries = new Map();
  return {
    seen(nonce, nowMs) {
      const recordedAt = entries.get(nonce);
      if (recordedAt !== undefined && nowMs - recordedAt <= retentionMs) {
        entries.delete(nonce);
        entries.set(nonce, recordedAt);
        return true;
      }
      entries.delete(nonce);
      entries.set(nonce, nowMs);
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      return false;
    },
  };
}

export function verifySignedRequest({ secret, method, path, headers, body, nowSeconds, nonceStore }) {
  const timestampSeconds = Number(headers["x-tvinbio-timestamp"]);
  const nonce = headers["x-tvinbio-nonce"];
  const signature = headers["x-tvinbio-signature"];
  if (!Number.isFinite(timestampSeconds) || !nonce || !signature) return false;
  if (Math.abs(nowSeconds - timestampSeconds) > HMAC_SKEW_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(canonicalSigningString({ method, path, timestampSeconds, nonce, body }), "utf8")
    .digest();
  let provided;
  try {
    provided = Buffer.from(String(signature), "hex");
  } catch {
    return false;
  }
  if (provided.length !== expected.length || provided.length === 0 || !timingSafeEqual(provided, expected)) {
    return false;
  }
  return !nonceStore.seen(nonce, nowSeconds * 1000);
}
