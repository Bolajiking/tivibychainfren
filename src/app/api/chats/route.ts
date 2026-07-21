import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/db/client";
import { requirePrivyUser, PrivyAuthError } from "@/lib/auth/server";
import { matchesAny, normalizeAddress } from "@/lib/access";
import { asRecord } from "@/lib/input-normalizers";
import { normalizeChatText } from "@/lib/realtime-state";
import { rowToChat } from "@/lib/db/map";

/**
 * Authenticated chat insert. Signed-in users only (D4). The poster's wallet is
 * taken from the VERIFIED Privy identity — never the request body — so no one can
 * post as another wallet. `kind` is forced to "message" and `role` is computed
 * server-side (host only if the verified wallet owns the stream's channel), so
 * donation forgery and fake host badges are impossible. Donations still arrive
 * as real chat rows via the settle route (service-role), unaffected by this.
 */
export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return bad("invalid_json"); }
  const record = asRecord(body);

  const streamId = String(record.streamId ?? "");
  const sender = String(record.sender ?? "").slice(0, 80);
  const message = normalizeChatText(String(record.message ?? ""));
  if (!streamId) return bad("missing_stream");
  if (!sender) return bad("missing_sender");
  if (!message) return bad("empty_message");

  // Authenticate. In mock mode there is no Privy — echo an optimistic row so the
  // local UI keeps working without a backend.
  const db = supabaseAdmin();
  if (!db) {
    if (!MOCK_MODE) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });
    return NextResponse.json({
      ok: true,
      message: {
        id: randomUUID(), streamId, sender, walletAddress: "",
        message, kind: "message", role: "viewer", timestamp: new Date().toISOString(),
      },
    });
  }

  let user;
  try {
    user = await requirePrivyUser(req);
  } catch (e) {
    const status = e instanceof PrivyAuthError ? e.status : 401;
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status });
  }
  const wallet = normalizeAddress(user.walletAddress);

  // role = host only if the verified wallet owns this channel.
  const stream = await db.from("streams").select("creator_id").eq("playback_id", streamId).maybeSingle();
  const isHost = Boolean(stream.data && matchesAny(user.walletAddresses, stream.data.creator_id));
  const role = isHost ? "host" : "viewer";

  const { data, error } = await db
    .from("chats")
    .insert({
      stream_id: streamId,
      sender,
      wallet_address: wallet,
      message,
      kind: "message",
      role,
      name_color: isHost ? "#40acff" : "#9fd3ff",
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: "chat_write_failed" }, { status: 500 });

  return NextResponse.json({ ok: true, message: rowToChat(data) });
}

function bad(error: string) { return NextResponse.json({ ok: false, error }, { status: 400 }); }
