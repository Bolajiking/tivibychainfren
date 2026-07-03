import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/config";
import { getVideoComments } from "@/lib/data";
import { supabaseAdmin } from "@/lib/db/client";
import { rowToVodComment } from "@/lib/db/map";
import { requirePrivyUser, PrivyAuthError } from "@/lib/auth/server";
import { normalizeAddress, matchesAny } from "@/lib/access";
import { normalizeChatText } from "@/lib/realtime-state";
import { asRecord, trimBounded } from "@/lib/input-normalizers";

export async function GET(_req: Request, ctx: { params: Promise<{ playbackId: string }> }) {
  const { playbackId } = await ctx.params;
  const comments = await getVideoComments(playbackId);
  return NextResponse.json({ ok: true, comments });
}

export async function POST(req: Request, ctx: { params: Promise<{ playbackId: string }> }) {
  const { playbackId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("invalid_json");
  }
  const record = asRecord(body);
  const message = normalizeChatText(String(record.message ?? ""));
  if (!message) return bad("empty_comment");

  let user;
  try {
    user = await requirePrivyUser(req);
  } catch (error) {
    const status = error instanceof PrivyAuthError ? error.status : 401;
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status });
  }

  const wallet = normalizeAddress(String(record.walletAddress ?? user.walletAddresses[0] ?? ""));
  if (!matchesAny(user.walletAddresses, wallet)) return bad("wallet_not_owned", 403);
  const sender = trimBounded(record.sender, 42) || short(wallet);

  const db = supabaseAdmin();
  if (!db) {
    if (!MOCK_MODE) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });
    return NextResponse.json({
      ok: true,
      comment: {
        id: `comment-${Date.now()}`,
        playbackId,
        walletAddress: wallet,
        sender,
        message,
        timestamp: new Date().toISOString(),
      },
    });
  }

  const video = await db.from("videos").select("playback_id").eq("playback_id", playbackId).maybeSingle();
  if (!video.data) return NextResponse.json({ ok: false, error: "video_not_found" }, { status: 404 });

  const { data, error } = await db
    .from("video_comments")
    .insert({ playback_id: playbackId, wallet_address: wallet, sender, message })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: "comment_write_failed" }, { status: 500 });

  return NextResponse.json({ ok: true, comment: rowToVodComment(data) });
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
