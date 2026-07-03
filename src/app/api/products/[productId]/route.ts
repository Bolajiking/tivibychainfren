import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/config";
import { authError, resolveOwner } from "@/lib/auth/owner";
import { supabaseAdmin } from "@/lib/db/client";
import { rowToProduct } from "@/lib/db/map";
import { parseCreatorProductEditInput } from "@/lib/creator-products";

export async function PATCH(req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
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

  const parsed = parseCreatorProductEditInput(body);
  if (!parsed.ok) return bad(parsed.error);

  const db = supabaseAdmin();
  if (!db) {
    if (!MOCK_MODE) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });
    return NextResponse.json({ ok: true, product: { id: productId, creatorId: owner.walletAddress, ...parsed.value } });
  }

  const { data, error } = await db
    .from("products")
    .update(parsed.value)
    .eq("id", productId)
    .eq("creator_id", owner.walletAddress)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: "product_update_failed" }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "product_not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, product: rowToProduct(data) });
}

function bad(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}
