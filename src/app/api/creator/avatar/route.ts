import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/db/client";
import { authError, resolveOwner } from "@/lib/auth/owner";
import { uploadImage } from "@/lib/storage";

/**
 * Owner-scoped channel-art upload. Stores the image in the public `channel-art`
 * bucket via service-role and writes the public URL onto the caller's own
 * creator row — `field=avatar` (default) → avatar_url, `field=header` →
 * header_url (the stage header shown when offline). Wallet-scoped to own channel.
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
    return bad("invalid_form");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return bad("missing_file");
  const column = form.get("field") === "header" ? "header_url" : "avatar_url";

  const db = supabaseAdmin();
  if (!db) {
    if (!MOCK_MODE) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });
    return NextResponse.json({ ok: true, url: null }); // mock: client keeps local preview
  }

  const result = await uploadImage(db, `${owner.walletAddress}/${column === "header_url" ? "header" : "avatar"}`, file);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });

  const { error } = await db.from("creators").update({ [column]: result.url }).eq("creator_id", owner.walletAddress);
  if (error) return NextResponse.json({ ok: false, error: "profile_update_failed" }, { status: 500 });

  // avatarUrl kept for the existing avatar client; url is the generic field.
  return NextResponse.json({ ok: true, url: result.url, avatarUrl: result.url });
}

function bad(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}
