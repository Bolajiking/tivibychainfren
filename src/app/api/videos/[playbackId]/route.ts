import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/db/client";
import { rowToVideo } from "@/lib/db/map";
import { authError, resolveOwner } from "@/lib/auth/owner";
import { matchesAny } from "@/lib/access";
import {
  asRecord,
  clampRoundedNumber,
  isViewMode,
  MAX_VIDEO_DURATION_SEC,
  normalizeHttpsUrl,
  normalizePositiveMoneyOrZero,
  trimBounded,
} from "@/lib/input-normalizers";

const STATUSES = new Set(["ready", "processing", "not_found"]);

interface VideoPatchRow {
  status?: "ready" | "processing" | "not_found";
  duration_sec?: number;
  disabled?: boolean;
  title?: string;
  view_mode?: "free" | "one-time" | "monthly";
  amount?: number;
  thumbnail_url?: string | null;
}

/**
 * Owner-scoped VOD edit. Handles status sync (processing → ready after Livepeer
 * transcodes, with measured duration), rename, view-mode/price changes, and
 * soft-delete (`disabled`). Builds a partial patch from only the provided
 * fields. Owner-scoped against the row's creator_id.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ playbackId: string }> }) {
  const { playbackId } = await ctx.params;
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

  const patch: VideoPatchRow = {};
  if (record.status !== undefined) {
    if (!isVideoStatus(record.status)) return bad("bad_status");
    patch.status = record.status;
  }
  if (record.durationSec != null) patch.duration_sec = clampRoundedNumber(record.durationSec, 0, MAX_VIDEO_DURATION_SEC);
  if (record.disabled !== undefined) patch.disabled = Boolean(record.disabled);
  if (typeof record.title === "string") {
    const title = trimBounded(record.title, 100);
    if (!title) return bad("missing_video_title");
    patch.title = title;
  }
  if (record.viewMode !== undefined && isViewMode(record.viewMode)) {
    patch.view_mode = record.viewMode;
    patch.amount = record.viewMode === "free" ? 0 : normalizePositiveMoneyOrZero(record.amount);
  }
  if (record.thumbnailUrl !== undefined) patch.thumbnail_url = normalizeHttpsUrl(record.thumbnailUrl) ?? null;
  if (Object.keys(patch).length === 0) return bad("empty_patch");

  const db = supabaseAdmin();
  if (!db) {
    if (!MOCK_MODE) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });
    return NextResponse.json({ ok: true, video: { playbackId, ...patch } });
  }

  const current = await db.from("videos").select("creator_id").eq("playback_id", playbackId).maybeSingle();
  if (!current.data || !matchesAny(owner.walletAddresses, current.data.creator_id)) {
    return NextResponse.json({ ok: false, error: "not_video_owner" }, { status: 403 });
  }

  const { data, error } = await db
    .from("videos")
    .update(patch)
    .eq("playback_id", playbackId)
    .eq("creator_id", current.data.creator_id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: "video_update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, video: rowToVideo(data) });
}

function bad(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

function isVideoStatus(value: unknown): value is VideoPatchRow["status"] {
  return typeof value === "string" && STATUSES.has(value);
}
