import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/db/client";
import { authError, resolveOwner } from "@/lib/auth/owner";
import { uploadImage } from "@/lib/storage";

/**
 * Owner-scoped product-image upload. Stores the image in the public bucket and
 * returns its URL; the product create/edit call carries the URL onto the row.
 * (Avatar has its own route because it also writes creators.avatar_url.)
 */
export async function POST(req: Request) {
  let owner;
  try {
    owner = await resolveOwner(req);
  } catch (error) {
    return authError(error);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 });

  const db = supabaseAdmin();
  if (!db) {
    if (!MOCK_MODE) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });
    return NextResponse.json({ ok: true, url: null });
  }

  const result = await uploadImage(db, `products/${owner.walletAddress}`, file);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true, url: result.url });
}
