import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/db/client";
import { rowToVideo } from "@/lib/db/map";
import { authError, resolveOwner } from "@/lib/auth/owner";
import { parseVideoDraftInput, videoDraftToRow, newVideoPlaybackId } from "@/lib/creator-videos";
import { asRecord } from "@/lib/input-normalizers";

/**
 * Create a VOD draft row owned by the authenticated creator. The row is created
 * `processing`; the client then requests a Livepeer upload through the key-holder
 * proxy (which writes back livepeer_id / livepeer_playback_id), uploads the file
 * via tus, and the asset transcodes to `ready`.
 */
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

  const parsed = parseVideoDraftInput(body);
  if (!parsed.ok) return bad(parsed.error);

  const playbackId = newVideoPlaybackId();
  const row = videoDraftToRow(parsed.value, {
    playbackId,
    creatorId: owner.walletAddress,
    thumbColor: typeof record.thumbColor === "string" ? record.thumbColor : undefined,
  });

  const db = supabaseAdmin();
  if (!db) {
    if (!MOCK_MODE) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });
    return NextResponse.json({ ok: true, video: rowToVideo({ ...row, published_at: new Date().toISOString() }) });
  }

  const { data, error } = await db.from("videos").insert(row).select("*").single();
  if (error) {
    // Surface the real cause server-side (FK to creators, enum, constraint, etc.).
    console.error("[api/videos] draft insert failed:", { code: error.code, message: error.message, details: error.details, creatorId: row.creator_id });
    const reason = error.code === "23503" ? "creator_profile_missing" : "video_write_failed";
    return NextResponse.json({ ok: false, error: reason }, { status: 500 });
  }

  return NextResponse.json({ ok: true, video: rowToVideo(data) });
}

function bad(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}
