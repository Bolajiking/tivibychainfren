import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/client";
import { verifyLivepeerSignature, parseStreamWebhook, streamUpdateOutcome } from "@/lib/livepeer/webhook";

/**
 * Livepeer webhook receiver. Subscribe a webhook in Livepeer Studio to
 * `stream.started` / `stream.idle` pointing at this URL, with the signing secret
 * in `LIVEPEER_WEBHOOK_SECRET`. When the encoder connects/disconnects Livepeer
 * calls us, and we flip `streams.is_active` for the mapped channel — so a stream
 * auto-goes-live and auto-goes-offline without the creator clicking End.
 *
 * Fail-closed: rejects unless the signature verifies against the shared secret.
 */
export async function POST(req: Request) {
  const secret = process.env.LIVEPEER_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "webhook_unconfigured" }, { status: 503 });

  const raw = await req.text();
  if (!verifyLivepeerSignature(raw, req.headers.get("livepeer-signature"), secret)) {
    return NextResponse.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { event, livepeerStreamId } = parseStreamWebhook(body);
  if (!livepeerStreamId) return NextResponse.json({ ok: true, ignored: "no_stream_id" });

  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });

  let result;
  if (event === "stream.started") {
    result = await db
      .from("streams")
      .update({ is_active: true, started_at: new Date().toISOString() })
      .eq("livepeer_id", livepeerStreamId)
      .select("playback_id")
      .maybeSingle();
  } else if (event === "stream.idle") {
    result = await db
      .from("streams")
      .update({ is_active: false, viewer_count: 0 })
      .eq("livepeer_id", livepeerStreamId)
      .select("playback_id")
      .maybeSingle();
  } else {
    return NextResponse.json({ ok: true, ignored: "event" });
  }

  const outcome = streamUpdateOutcome({
    updateFailed: Boolean(result.error),
    playbackId: result.data?.playback_id ?? null,
  });

  if (result.error) {
    console.error("[livepeer webhook] stream status update failed:", result.error);
  } else if (!result.data) {
    // Not an error: Livepeer knows this stream, we don't. Acknowledged rather
    // than 500'd so redelivery doesn't loop and get the webhook disabled.
    console.warn("[livepeer webhook] ignoring unmapped stream:", livepeerStreamId);
  }

  return NextResponse.json(outcome.body, { status: outcome.status });
}
