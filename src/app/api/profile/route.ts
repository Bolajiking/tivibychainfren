import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/db/client";
import {
  rowToCreator,
  rowToFeatured,
  rowToNotification,
  rowToOrder,
  rowToProduct,
  rowToStream,
  rowToVideo,
  type FeaturedProductRow,
  type ProductRow,
} from "@/lib/db/map";
import { authError, resolveOwner } from "@/lib/auth/owner";
import { buildDefaultStreamRow, creatorProfileToRow, parseCreatorProfileInput, type CreatorProfileDraft } from "@/lib/profile";
import { selectCanonicalStreamRow } from "@/lib/stream-selection";
import type { CreatorProfilePayload } from "@/lib/types";

type FeaturedProductJoinRow = FeaturedProductRow & { product?: ProductRow | null };

export async function GET(req: Request) {
  let owner;
  try {
    owner = await resolveOwner(req);
  } catch (error) {
    return authError(error);
  }

  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: MOCK_MODE ? 404 : 503 });

  const payload = await loadCreatorPayload(db, owner.walletAddress);
  if (!payload) return NextResponse.json({ ok: false, error: "profile_not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, ...payload });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("invalid_json");
  }

  let owner;
  try {
    owner = await resolveOwner(req, body);
  } catch (error) {
    return authError(error);
  }

  const parsed = parseCreatorProfileInput(body, owner.walletAddress);
  if (!parsed.ok) return bad(parsed.error);

  const db = supabaseAdmin();
  if (!db) {
    if (!MOCK_MODE) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });
    return NextResponse.json({
      ok: true,
      creator: parsed.value,
      stream: mockStream(parsed.value),
      videos: [],
      products: [],
      featuredProducts: [],
      notifications: [],
      orders: [],
    });
  }

  const usernameTaken = await db
    .from("creators")
    .select("creator_id")
    .eq("username", parsed.value.username)
    .maybeSingle();

  if (usernameTaken.data && usernameTaken.data.creator_id !== parsed.value.creatorId) {
    return NextResponse.json({ ok: false, error: "username_taken" }, { status: 409 });
  }

  const { error: creatorError } = await db
    .from("creators")
    .upsert(creatorProfileToRow(parsed.value), { onConflict: "creator_id" });

  if (creatorError) {
    console.error("[profile] creator upsert failed:", creatorError);
    return NextResponse.json({ ok: false, error: "profile_write_failed" }, { status: 500 });
  }

  const existingStream = await db
    .from("streams")
    .select("playback_id")
    .eq("creator_id", parsed.value.creatorId)
    .limit(1)
    .maybeSingle();

  if (!existingStream.data) {
    const { error: streamError } = await db.from("streams").insert(buildDefaultStreamRow(parsed.value));
    if (streamError) {
      console.error("[profile] default stream insert failed:", streamError);
      return NextResponse.json({ ok: false, error: "stream_write_failed" }, { status: 500 });
    }
  }

  const payload = await loadCreatorPayload(db, parsed.value.creatorId);
  return NextResponse.json({ ok: true, ...payload });
}

async function loadCreatorPayload(
  db: NonNullable<ReturnType<typeof supabaseAdmin>>,
  creatorId: string,
): Promise<CreatorProfilePayload | null> {
  const creator = await db.from("creators").select("*").eq("creator_id", creatorId).maybeSingle();
  if (!creator.data) return null;

  const streams = await db.from("streams").select("*").eq("creator_id", creatorId);
  const stream = selectCanonicalStreamRow(streams.data ?? []);
  const streamPlaybackId = typeof stream?.playback_id === "string" ? stream.playback_id : "";

  const [videos, products, featuredProducts, notifications, orders, subscriptions] = await Promise.all([
    db.from("videos").select("*").eq("creator_id", creatorId).eq("disabled", false).order("published_at", { ascending: false }).limit(100),
    db.from("products").select("*").eq("creator_id", creatorId).neq("status", "archived").order("created_at"),
    streamPlaybackId
      ? db.from("featured_products").select("*, product:products(*)").eq("playback_id", streamPlaybackId).order("sort_order")
      : Promise.resolve({ data: [] as FeaturedProductJoinRow[] }),
    db.from("notifications").select("*").eq("creator_id", creatorId).order("created_at", { ascending: false }).limit(100),
    db.from("orders").select("*").eq("seller_address", creatorId).order("created_at", { ascending: false }).limit(100),
    db.from("subscriptions").select("subscriber_address,expires_at").eq("creator_id", creatorId).limit(1000),
  ]);
  const creatorProfile = rowToCreator(creator.data);
  const activeSubscribers = new Set(
    (subscriptions.data ?? [])
      .filter((s) => !s.expires_at || new Date(String(s.expires_at)).getTime() > Date.now())
      .map((s) => String(s.subscriber_address ?? "").toLowerCase())
      .filter(Boolean),
  );

  return {
    creator: { ...creatorProfile, subscriberCount: Math.max(creatorProfile.subscriberCount, activeSubscribers.size) },
    stream: stream ? rowToStream(stream) : null,
    videos: (videos.data ?? []).map(rowToVideo),
    products: (products.data ?? []).map(rowToProduct),
    featuredProducts: (featuredProducts.data ?? [])
      .filter((r: FeaturedProductJoinRow): r is FeaturedProductJoinRow & { product: ProductRow } => Boolean(r.product))
      .map((r) => ({ ...rowToFeatured(r), product: rowToProduct(r.product) })),
    notifications: (notifications.data ?? []).map(rowToNotification),
    orders: (orders.data ?? []).map(rowToOrder),
  };
}

function mockStream(profile: CreatorProfileDraft) {
  const row = buildDefaultStreamRow(profile);
  return {
    playbackId: row.playback_id,
    creatorId: row.creator_id,
    title: row.title,
    description: row.description,
    viewMode: row.view_mode,
    amount: row.amount,
    isActive: row.is_active,
    viewerCount: row.viewer_count,
    thumbColor: row.thumb_color,
    paidUsers: row.paid_users,
    donationPresets: row.donation_presets,
    record: row.record,
  };
}

function bad(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}
