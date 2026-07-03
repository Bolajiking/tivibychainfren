import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/db/client";
import { authError, resolveOwner } from "@/lib/auth/owner";
import { uploadImage } from "@/lib/storage";

/** Owner-scoped VOD thumbnail upload. The returned URL is saved on videos.thumbnail_url. */
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
    return bad("invalid_form");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return bad("missing_file");

  const db = supabaseAdmin();
  if (!db) {
    if (!MOCK_MODE) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });
    return NextResponse.json({ ok: true, url: null });
  }

  const result = await uploadImage(db, `videos/${owner.walletAddress}/thumbnails`, file);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, url: result.url });
}

function bad(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}
