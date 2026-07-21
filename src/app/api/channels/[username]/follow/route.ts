import { NextResponse } from "next/server";
import { getCreatorByUsername } from "@/lib/data";
import { supabaseAdmin } from "@/lib/db/client";
import { resolveOwner, authError } from "@/lib/auth/owner";

export const dynamic = "force-dynamic";

/**
 * Persist a free follow. The "Follow" button was previously client-only — it
 * updated local state but never the database, so `subscriber_count` stayed 0
 * and every surface showed a creator with real fans as having none.
 *
 * This writes a free-tier `subscriptions` row (no expiry) and increments the
 * denormalised `subscriber_count` exactly once per fan, race-safe via the
 * `increment_subscriber_count` RPC. Idempotent: a fan who already follows (free
 * or paid) never double-counts.
 */
export async function POST(req: Request, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine (real Privy auth carries the token in the header) */
  }

  let fan;
  try {
    fan = await resolveOwner(req, body);
  } catch (error) {
    return authError(error);
  }

  const creator = await getCreatorByUsername(username);
  if (!creator) return NextResponse.json({ ok: false, error: "channel_not_found" }, { status: 404 });

  const creatorId = creator.creatorId.toLowerCase();
  const fanAddress = fan.walletAddress.toLowerCase();

  // A creator following themselves would inflate their own count.
  if (creatorId === fanAddress) {
    return NextResponse.json({ ok: true, following: true, subscriberCount: creator.subscriberCount });
  }

  const db = supabaseAdmin();
  if (!db) {
    // Mock / unconfigured — the client keeps the optimistic local count.
    return NextResponse.json({ ok: true, following: true, subscriberCount: creator.subscriberCount + 1 });
  }

  // Only a fan's first follow inserts a row and bumps the count.
  const existing = await db
    .from("subscriptions")
    .select("id")
    .eq("creator_id", creatorId)
    .eq("subscriber_address", fanAddress)
    .limit(1)
    .maybeSingle();

  if (!existing.data) {
    const inserted = await db.from("subscriptions").insert({
      creator_id: creatorId,
      subscriber_address: fanAddress,
      view_mode: "free",
      amount: 0,
      expires_at: null,
    });
    if (!inserted.error) {
      await db.rpc("increment_subscriber_count", { p_creator_id: creatorId });
    }
  }

  const refreshed = await db.from("creators").select("subscriber_count").eq("creator_id", creatorId).maybeSingle();
  const subscriberCount = Number(refreshed.data?.subscriber_count ?? creator.subscriberCount + 1);

  return NextResponse.json({ ok: true, following: true, subscriberCount }, { headers: { "cache-control": "no-store" } });
}
