import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Authenticated encryption for bridge credentials held at rest.
 *
 * `0015_broadcast_bridge_leases` deliberately stores no publish credential:
 * they lived only in process memory. Moving attempt state to shared storage
 * (so the bridge can run on multi-instance serverless) would put a working
 * credential on disk, so credentials are sealed with a key derived from
 * `TVINBIO_BRIDGE_CONTROL_SECRET` — a server-only value the bridge already
 * requires. A database compromise alone therefore yields nothing usable.
 *
 * Format: `v1.<iv-b64url>.<tag-b64url>.<ciphertext-b64url>`. The version prefix
 * exists so the scheme can be rotated without ambiguity.
 */

const VERSION = "v1";
const IV_BYTES = 12; // AES-GCM standard nonce length.
const TAG_BYTES = 16;

/** AES-256 needs exactly 32 bytes; the control secret is an arbitrary-length string. */
function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(`tvinbio-bridge-secret-box/${secret}`, "utf8").digest();
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function sealBridgeSecret(plaintext: string, secret: string): string {
  if (!secret) throw new Error("bridge_secret_box_missing_key");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, b64url(iv), b64url(cipher.getAuthTag()), b64url(ciphertext)].join(".");
}

/**
 * Returns null for anything that is not a well-formed, authentic envelope —
 * wrong key, tampered ciphertext, truncated value, or a future version. Callers
 * treat null as "credential unavailable" and fail the attempt closed rather
 * than proceeding with a partially-decrypted session.
 */
export function openBridgeSecret(sealed: string | null | undefined, secret: string): string | null {
  if (!sealed || !secret) return null;
  const parts = String(sealed).split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;

    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Auth tag mismatch (wrong key or tampering) throws on final(). Fail closed.
    return null;
  }
}

/** Constant-time compare for opaque bridge identifiers. */
export function bridgeSecretEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
