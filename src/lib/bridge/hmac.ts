import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const BRIDGE_HMAC_SKEW_SECONDS = 120;
export const BRIDGE_NONCE_RETENTION_MS = 10 * 60_000;
export const BRIDGE_NONCE_MAX_ENTRIES = 10_000;

export interface BridgeSignableRequest {
  method: string;
  path: string;
  timestampSeconds: number;
  nonce: string;
  body: string;
}

export interface BridgeNonceStore {
  /** Records the nonce; returns true when it was already seen inside the retention window. */
  seen(nonce: string, nowMs: number): boolean;
  size(): number;
}

export type BridgeSignatureVerdict =
  | { ok: true }
  | { ok: false; reason: "skew" | "replay" | "bad_signature" };

export function canonicalBridgeSigningString(request: BridgeSignableRequest): string {
  const bodyHash = createHash("sha256").update(request.body ?? "", "utf8").digest("hex");
  return [
    String(request.method ?? "").toUpperCase(),
    request.path,
    String(request.timestampSeconds),
    request.nonce,
    bodyHash,
  ].join("\n");
}

export function signBridgeRequest(secret: string, request: BridgeSignableRequest): string {
  return createHmac("sha256", secret).update(canonicalBridgeSigningString(request), "utf8").digest("hex");
}

export function createBridgeNonceStore(opts?: {
  maxEntries?: number;
  retentionMs?: number;
}): BridgeNonceStore {
  const maxEntries = opts?.maxEntries ?? BRIDGE_NONCE_MAX_ENTRIES;
  const retentionMs = opts?.retentionMs ?? BRIDGE_NONCE_RETENTION_MS;
  const entries = new Map<string, number>();

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
    size() {
      return entries.size;
    },
  };
}

export function verifyBridgeSignature(
  secret: string,
  input: BridgeSignableRequest & {
    signature: string;
    nowSeconds: number;
    nonceStore: BridgeNonceStore;
  },
): BridgeSignatureVerdict {
  if (Math.abs(input.nowSeconds - input.timestampSeconds) > BRIDGE_HMAC_SKEW_SECONDS) {
    return { ok: false, reason: "skew" };
  }

  const expected = Buffer.from(signBridgeRequest(secret, input), "hex");
  let provided: Buffer;
  try {
    provided = Buffer.from(String(input.signature ?? ""), "hex");
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  if (
    provided.length !== expected.length ||
    provided.length === 0 ||
    !timingSafeEqual(provided, expected)
  ) {
    return { ok: false, reason: "bad_signature" };
  }

  if (input.nonceStore.seen(input.nonce, input.nowSeconds * 1000)) {
    return { ok: false, reason: "replay" };
  }
  return { ok: true };
}
