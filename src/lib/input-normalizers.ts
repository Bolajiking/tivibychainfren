import type { ViewMode } from "@/lib/types";

type InputRecord = Record<string, unknown>;

export const DEFAULT_DONATION_PRESETS = [3, 5, 10, 25];
export const MAX_PAID_AMOUNT_USD = 50000;
export const MAX_VIDEO_DURATION_SEC = 86400;
const VIEW_MODES = ["free", "one-time", "monthly"] as const satisfies readonly ViewMode[];

export function asRecord(value: unknown): InputRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as InputRecord : {};
}

export function trimBounded(value: unknown, max: number): string | undefined {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text ? text.slice(0, max) : undefined;
}

export function normalizeEvmAddress(value: unknown): string | null {
  const address = String(value ?? "").toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(address) ? address : null;
}

export function normalizePositiveMoney(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

export function normalizePositiveMoneyOrZero(value: unknown): number {
  return normalizePositiveMoney(value) ?? 0;
}

export function normalizeHttpsUrl(value: unknown, max = 240): string | undefined {
  const url = trimBounded(value, max);
  return url?.startsWith("https://") ? url : undefined;
}

export function normalizeHexColor(value: unknown): string | null {
  const color = String(value ?? "").trim();
  return /^#[a-fA-F0-9]{6}$/.test(color) ? color.toLowerCase() : null;
}

export function clampRoundedNumber(value: unknown, min: number, max: number): number {
  const amount = Math.round(Number(value) || 0);
  return Math.max(min, Math.min(max, amount));
}

export function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

export function isViewMode(value: unknown): value is ViewMode {
  return isOneOf(value, VIEW_MODES);
}
