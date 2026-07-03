import {
  asRecord,
  clampRoundedNumber,
  isViewMode,
  MAX_PAID_AMOUNT_USD,
  MAX_VIDEO_DURATION_SEC,
  normalizeHttpsUrl,
  normalizePositiveMoneyOrZero,
  trimBounded,
} from "@/lib/input-normalizers";
import type { ValidationResult, Video, ViewMode } from "@/lib/types";

/** Pure validation + row building for a VOD draft (mirrors creator-streams). */
interface VideoDraft {
  title: string;
  viewMode: ViewMode;
  amount: number;
  durationSec: number;
  thumbnailUrl?: string;
}

type VideoDraftResult = ValidationResult<VideoDraft>;

export function parseVideoDraftInput(input: unknown): VideoDraftResult {
  const record = asRecord(input);
  const title = trimBounded(record.title, 100);
  if (!title) return { ok: false, error: "missing_video_title" };

  const viewMode: ViewMode = isViewMode(record.viewMode) ? record.viewMode : "free";
  const amount = viewMode === "free" ? 0 : normalizePositiveMoneyOrZero(record.amount);
  if (viewMode !== "free" && (!amount || amount > MAX_PAID_AMOUNT_USD)) return { ok: false, error: "bad_video_amount" };

  const durationSec = clampRoundedNumber(record.durationSec, 0, MAX_VIDEO_DURATION_SEC);
  const thumbnailUrl = normalizeHttpsUrl(record.thumbnailUrl);

  return { ok: true, value: { title, viewMode, amount, durationSec, ...(thumbnailUrl ? { thumbnailUrl } : {}) } };
}

/** Build a `videos` row. `playbackId` is our stable key; Livepeer ids land later. */
export function videoDraftToRow(
  draft: VideoDraft,
  ids: { playbackId: string; creatorId: string; thumbColor?: string },
) {
  return {
    playback_id: ids.playbackId,
    creator_id: ids.creatorId,
    asset_name: draft.title,
    title: draft.title,
    view_mode: draft.viewMode,
    amount: draft.amount,
    views: 0,
    duration_sec: draft.durationSec,
    thumb_color: ids.thumbColor ?? "#1c2230",
    thumbnail_url: draft.thumbnailUrl ?? null,
    paid_users: [],
    disabled: false,
    status: "processing" as Video["status"],
  };
}

/** A url-safe, collision-resistant playback id for a new VOD. */
export function newVideoPlaybackId(seed = "vod"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${seed}-${Date.now().toString(36)}-${rand}`;
}
