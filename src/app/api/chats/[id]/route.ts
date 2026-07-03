import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/db/client";
import { authError, resolveOwner } from "@/lib/auth/owner";
import { matchesAny } from "@/lib/access";

/**
 * Owner-scoped chat moderation. The `chats` RLS is intentionally permissive for
 * v1 live chat, so deletes go through this authenticated route instead: we load
 * the message, confirm its stream belongs to the caller's creator, then delete
 * via service-role. The realtime DELETE event removes it from every viewer.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return bad("missing_id");

  let owner;
  try {
    owner = await resolveOwner(req);
  } catch (error) {
    return authError(error);
  }

  const db = supabaseAdmin();
  if (!db) {
    if (!MOCK_MODE) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });
    return NextResponse.json({ ok: true, id });
  }

  const chat = await db.from("chats").select("id, stream_id").eq("id", id).maybeSingle();
  if (!chat.data) return NextResponse.json({ ok: false, error: "message_not_found" }, { status: 404 });

  // The chat's stream_id is the channel's playback_id — its creator must be the caller.
  const stream = await db.from("streams").select("creator_id").eq("playback_id", chat.data.stream_id).maybeSingle();
  if (!stream.data || !matchesAny(owner.walletAddresses, stream.data.creator_id)) {
    return NextResponse.json({ ok: false, error: "not_chat_owner" }, { status: 403 });
  }

  const { error } = await db.from("chats").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });

  return NextResponse.json({ ok: true, id });
}

function bad(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}
