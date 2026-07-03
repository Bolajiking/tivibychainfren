import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getCreatorByUsername, getCreatorStream } from "@/lib/data";
import { supabaseAdmin } from "@/lib/db/client";
import { LIVEPEER_API } from "@/lib/livepeer/policy";
import {
  parseLivepeerStreamActive,
  PUBLIC_LIVEPEER_STATUS_TIMEOUT_MS,
  reconcileStreamFromLivepeerActivity,
} from "@/lib/livepeer/public-live-status";
import type { Stream } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const creator = await getCreatorByUsername(username);
  if (!creator) return NextResponse.json({ ok: false, error: "channel_not_found" }, { status: 404 });

  // getCreatorStream already ranks active rows first, so a second active-only
  // database round trip only adds latency to the public live flip.
  const stream = await getCreatorStream(creator.creatorId);
  const resolved = stream ? await reconcileFromLivepeer(stream) : null;
  return NextResponse.json({ ok: true, stream: resolved }, { headers: { "cache-control": "no-store" } });
}

async function reconcileFromLivepeer(stream: Stream): Promise<Stream> {
  const livepeerId = stream.livepeerId;
  if (!livepeerId || !config.livepeer.enabled || !process.env.LIVEPEER_API_KEY) {
    return stream;
  }
  try {
    const headers = { authorization: `Bearer ${process.env.LIVEPEER_API_KEY}` };
    const statusResponse = await fetch(`${LIVEPEER_API}/stream/${encodeURIComponent(livepeerId)}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(PUBLIC_LIVEPEER_STATUS_TIMEOUT_MS),
    });
    if (!statusResponse.ok) return stream;
    const livepeerActive = parseLivepeerStreamActive(await statusResponse.json().catch(() => null));
    const reconciled = reconcileStreamFromLivepeerActivity(stream, livepeerActive);
    if (reconciled !== stream) {
      await repairStreamActiveState(reconciled);
      return reconciled;
    }
    return stream;
  } catch {
    return stream;
  }
}

async function repairStreamActiveState(stream: Stream) {
  const db = supabaseAdmin();
  if (!db || !stream.livepeerId) return;
  const update = stream.isActive
    ? { is_active: true, started_at: stream.startedAt ?? new Date().toISOString() }
    : { is_active: false, viewer_count: 0 };
  const { error } = await db
    .from("streams")
    .update(update)
    .eq("playback_id", stream.playbackId)
    .eq("livepeer_id", stream.livepeerId);
  if (error) console.error("[channel stream status] Livepeer session repair failed:", error);
}
