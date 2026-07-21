import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Livepeer webhook signature (SERVER-ONLY).
 *
 * DOC-DERIVED — verify against https://docs.livepeer.org webhooks guide:
 * Livepeer signs the request with the header `Livepeer-Signature`, value shaped
 * like `t=<unix>,v1=<hex hmac-sha256>` (Stripe-style), where the signature is
 * HMAC-SHA256(secret, `<t>.<rawBody>`). Because the exact string-to-sign has
 * varied across versions, we accept any of a few candidate schemes — all still
 * require knowledge of the shared secret, so this can't be forged.
 */
export function verifyLivepeerSignature(rawBody: string, header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;

  const { t, v1 } = parseSignatureHeader(header);
  if (!v1) return false;

  const candidates = [t ? `${t}.${rawBody}` : null, rawBody, t ? `${t}${rawBody}` : null].filter(
    (c): c is string => c !== null,
  );

  for (const payload of candidates) {
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    if (timingSafeHexEqual(expected, v1)) return true;
  }
  return false;
}

function parseSignatureHeader(header: string): { t?: string; v1?: string } {
  // `t=123,v1=abc` → parts; or a bare hex signature → treat as v1.
  if (!header.includes("=")) return { v1: header.trim() };
  const out: Record<string, string> = {};
  for (const part of header.split(",")) {
    const [k, ...rest] = part.split("=");
    if (k && rest.length) out[k.trim()] = rest.join("=").trim();
  }
  return { t: out.t, v1: out.v1 ?? out.sig ?? out.signature };
}

function timingSafeHexEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a.toLowerCase(), "hex");
  const bb = Buffer.from(b.toLowerCase(), "hex");
  if (ab.length === 0 || ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export type StreamWebhookOutcome =
  | { status: 200; body: { ok: true; playbackId: string } }
  | { status: 200; body: { ok: true; ignored: string } }
  | { status: 500; body: { ok: false; error: string } };

/**
 * What to answer Livepeer after attempting the `streams.is_active` flip.
 *
 * The distinction that matters is retryable vs not. Livepeer re-delivers on any
 * non-2xx and disables a webhook that keeps failing, which would take live
 * status down with it.
 *
 *  - update failed  → 500. A transient database fault; redelivery may succeed.
 *  - no row matched → 200. The stream exists in Livepeer but not in our DB: a
 *    channel deleted here, a stream created directly in Studio, or an e2e
 *    test's temporary stream. That is not our error and no number of retries
 *    will produce a row, so acknowledging it keeps the webhook healthy. Treated
 *    exactly like the unknown-event case the route already ignores.
 */
export function streamUpdateOutcome(input: {
  updateFailed: boolean;
  playbackId: string | null;
}): StreamWebhookOutcome {
  if (input.updateFailed) return { status: 500, body: { ok: false, error: "stream_status_update_failed" } };
  if (!input.playbackId) return { status: 200, body: { ok: true, ignored: "unmapped_stream" } };
  return { status: 200, body: { ok: true, playbackId: input.playbackId } };
}

interface StreamWebhookBody {
  event?: unknown;
  stream?: unknown;
  payload?: unknown;
  streamId?: unknown;
  id?: unknown;
}

interface StreamWebhookResource {
  id?: unknown;
}

/** Extract the Livepeer stream id + event name from a webhook body (shape-tolerant). */
export function parseStreamWebhook(body: unknown): { event: string; livepeerStreamId: string | null } {
  const record = webhookBody(body);
  const event = String(record.event ?? "");
  const stream = webhookResource(record.stream) ?? webhookResource(record.payload) ?? {};
  const livepeerStreamId = stream.id ?? record.streamId ?? record.id ?? null;
  return { event, livepeerStreamId: livepeerStreamId ? String(livepeerStreamId) : null };
}

function webhookBody(value: unknown): StreamWebhookBody {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function webhookResource(value: unknown): StreamWebhookResource | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
