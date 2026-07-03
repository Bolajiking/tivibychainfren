import {
  asRecord,
  DEFAULT_DONATION_PRESETS,
  isViewMode,
  MAX_PAID_AMOUNT_USD,
  normalizePositiveMoneyOrZero,
  trimBounded,
} from "@/lib/input-normalizers";
import type { Stream, ValidationResult, ViewMode } from "@/lib/types";

interface StreamControlDraft {
  title: string;
  description?: string | null;
  viewMode: ViewMode;
  amount: number;
  isActive: boolean;
  startedAt?: string | null;
  viewerCount: number;
  donationPresets: number[];
  record: boolean;
}

type StreamControlResult = ValidationResult<StreamControlDraft>;
type StreamActivationSource = "livepeer_status";

interface StreamControlOptions {
  requireActivationSource?: boolean;
  activationSource?: StreamActivationSource;
}

export function parseStreamControlInput(
  input: unknown,
  current: Stream,
  now = new Date().toISOString(),
  options: StreamControlOptions = {},
): StreamControlResult {
  const record = asRecord(input);
  const title = trimBounded(record.title, 80) ?? current.title;
  if (!title) return { ok: false, error: "missing_stream_title" };

  const description =
    record.description === undefined
      ? current.description
      : trimBounded(record.description, 180) ?? null;
  const viewMode = isViewMode(record.viewMode) ? record.viewMode : current.viewMode;
  const amount = viewMode === "free" ? 0 : normalizePositiveMoneyOrZero(record.amount ?? current.amount);
  if (viewMode !== "free" && (!amount || amount > MAX_PAID_AMOUNT_USD)) return { ok: false, error: "bad_stream_amount" };

  const isActive = typeof record.isActive === "boolean" ? record.isActive : current.isActive;
  const activationSource =
    record.activationSource === "livepeer_status"
      ? "livepeer_status"
      : options.activationSource;
  if (!current.isActive && isActive && options.requireActivationSource && activationSource !== "livepeer_status") {
    return { ok: false, error: "stream_activation_requires_ingest" };
  }
  const startedAt = isActive ? current.startedAt ?? now : null;
  const viewerCount = isActive ? Math.max(0, current.viewerCount) : 0;
  const donationPresets = normalizeDonationPresets(record.donationPresets, current.donationPresets);
  const shouldRecord = typeof record.record === "boolean" ? record.record : current.record;

  return {
    ok: true,
    value: {
      title,
      description,
      viewMode,
      amount,
      isActive,
      startedAt,
      viewerCount,
      donationPresets,
      record: shouldRecord,
    },
  };
}

export function streamControlToRow(control: StreamControlDraft) {
  return {
    title: control.title,
    description: control.description ?? null,
    view_mode: control.viewMode,
    amount: control.amount,
    is_active: control.isActive,
    started_at: control.startedAt ?? null,
    viewer_count: control.viewerCount,
    donation_presets: control.donationPresets,
    record: control.record,
  };
}

function normalizeDonationPresets(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback.length ? fallback : [...DEFAULT_DONATION_PRESETS];
  const unique = new Set<number>();
  for (const item of value) {
    const amount = normalizePositiveMoneyOrZero(item);
    if (amount > 0 && amount <= 50) unique.add(amount);
  }
  const next = [...unique].slice(0, 5);
  return next.length ? next : fallback;
}
