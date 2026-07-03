import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/db/client";
import { rowToProduct } from "@/lib/db/map";
import { authError, resolveOwner } from "@/lib/auth/owner";
import { creatorProductToRow, parseCreatorProductInput } from "@/lib/creator-products";
import { asRecord } from "@/lib/input-normalizers";

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

  const db = supabaseAdmin();
  if (!db) {
    if (!MOCK_MODE) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });
    const parsed = parseCreatorProductInput(body, {
      creatorId: owner.walletAddress,
      playbackId: String(record.playbackId ?? ""),
    });
    if (!parsed.ok) return bad(parsed.error);
    return NextResponse.json({
      ok: true,
      product: mockProduct(creatorProductToRow(parsed.value, `prod-${Date.now()}`)),
    });
  }

  const streamQuery = db
    .from("streams")
    .select("playback_id")
    .eq("creator_id", owner.walletAddress)
    .order("created_at", { ascending: false })
    .limit(1);

  if (record.playbackId) streamQuery.eq("playback_id", String(record.playbackId));
  const stream = await streamQuery.maybeSingle();
  if (!stream.data) return NextResponse.json({ ok: false, error: "stream_not_found" }, { status: 404 });

  const parsed = parseCreatorProductInput(body, {
    creatorId: owner.walletAddress,
    playbackId: stream.data.playback_id,
  });
  if (!parsed.ok) return bad(parsed.error);

  const row = creatorProductToRow(parsed.value, `prod-${randomUUID()}`);
  const { data, error } = await db.from("products").insert(row).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: "product_write_failed" }, { status: 500 });

  return NextResponse.json({ ok: true, product: rowToProduct(data) });
}

function mockProduct(row: ReturnType<typeof creatorProductToRow>) {
  return {
    id: row.id,
    playbackId: row.playback_id,
    creatorId: row.creator_id,
    name: row.name,
    description: row.description ?? undefined,
    price: Number(row.price),
    currency: "USDC",
    imageColor: row.image_color,
    imageUrl: row.image_url ?? undefined,
    productType: row.product_type,
    inventory: Number(row.inventory),
    subsOnly: row.subs_only,
    status: row.status,
  };
}

function bad(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}
