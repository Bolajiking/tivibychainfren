import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/config";
import { authError, resolveOwner } from "@/lib/auth/owner";
import { supabaseAdmin } from "@/lib/db/client";
import { rowToFeatured, rowToProduct } from "@/lib/db/map";
import { buildFeaturedProductRow } from "@/lib/creator-products";
import { asRecord } from "@/lib/input-normalizers";
import { canFeatureProduct } from "@/lib/product-availability";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("invalid_json");
  }
  const record = asRecord(body);

  let owner;
  try {
    owner = await resolveOwner(req, body);
  } catch (error) {
    return authError(error);
  }

  const playbackId = String(record.playbackId ?? "");
  const productId = record.productId ? String(record.productId) : "";
  if (!playbackId) return bad("missing_playback_id");

  const db = supabaseAdmin();
  if (!db) {
    if (!MOCK_MODE) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });
    return NextResponse.json({ ok: true, featured: productId ? buildFeaturedProductRow({ creatorId: owner.walletAddress, playbackId, productId }) : null });
  }

  const stream = await db
    .from("streams")
    .select("playback_id")
    .eq("playback_id", playbackId)
    .eq("creator_id", owner.walletAddress)
    .maybeSingle();
  if (!stream.data) return NextResponse.json({ ok: false, error: "stream_not_found" }, { status: 404 });

  let product = null;
  if (productId) {
    product = await db
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("creator_id", owner.walletAddress)
      .maybeSingle();
    if (!product.data) return NextResponse.json({ ok: false, error: "product_not_found" }, { status: 404 });
    if (!canFeatureProduct(rowToProduct(product.data))) {
      return NextResponse.json({ ok: false, error: "product_unavailable" }, { status: 409 });
    }
  }

  await db.from("featured_products").delete().eq("playback_id", playbackId).eq("creator_id", owner.walletAddress);
  if (!productId || !product?.data) return NextResponse.json({ ok: true, featured: null });

  const { data, error } = await db
    .from("featured_products")
    .upsert(buildFeaturedProductRow({ creatorId: owner.walletAddress, playbackId, productId }), { onConflict: "playback_id,product_id" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: "feature_write_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, featured: { ...rowToFeatured(data), product: rowToProduct(product.data) } });
}

function bad(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}
