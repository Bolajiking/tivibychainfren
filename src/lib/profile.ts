import {
  asRecord,
  DEFAULT_DONATION_PRESETS,
  normalizeEvmAddress,
  normalizeHexColor,
  trimBounded,
} from "@/lib/input-normalizers";
import { DEFAULT_ACCENT, isThemeVariant, type ThemeVariant } from "@/lib/creator-theme";
import type { ValidationResult } from "@/lib/types";

export interface CreatorProfileDraft {
  creatorId: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarColor: string;
  /** undefined = leave existing avatar untouched; string|null = set/clear it. */
  avatarUrl?: string | null;
  /** undefined = leave existing header untouched; string|null = set/clear it. */
  headerUrl?: string | null;
  /** Tier-1 brand accent — stored raw, contrast-guarded at render time. */
  accentColor: string;
  themeVariant: ThemeVariant;
  socialLinks: { kind: string; url: string }[];
  category?: string;
}

type ParseResult = ValidationResult<CreatorProfileDraft>;

const AVATAR_COLORS = ["#24313f", "#2a2a2a", "#3a2b45", "#1f3a33", "#442f2c", "#273247"];

export function slugifyUsername(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
}

export function parseCreatorProfileInput(input: unknown, ownerWallet: string): ParseResult {
  const record = asRecord(input);
  const creatorId = normalizeEvmAddress(ownerWallet);
  if (!creatorId) return { ok: false, error: "bad_wallet" };

  const displayName = trimBounded(record.displayName, 48);
  if (!displayName) return { ok: false, error: "missing_display_name" };

  const username = slugifyUsername(String(record.username ?? displayName));
  if (username.length < 3) return { ok: false, error: "bad_username" };

  const bio = trimBounded(record.bio, 160);
  const category = trimBounded(record.category, 32)?.toLowerCase();
  const avatarColor = normalizeHexColor(record.avatarColor) ?? defaultAvatarColor(username);
  const avatarUrl = normalizeAvatarUrl(record.avatarUrl);
  const headerUrl = normalizeAvatarUrl(record.headerUrl);
  const accentColor = normalizeHexColor(record.accentColor) ?? DEFAULT_ACCENT;
  const themeVariant = isThemeVariant(record.themeVariant) ? record.themeVariant : "midnight";

  return {
    ok: true,
    value: {
      creatorId,
      username,
      displayName,
      ...(bio ? { bio } : {}),
      avatarColor,
      accentColor,
      themeVariant,
      // Only carry image urls when the caller actually sent the field.
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      ...(headerUrl !== undefined ? { headerUrl } : {}),
      socialLinks: normalizeSocialLinks(record.socialLinks),
      ...(category ? { category } : {}),
    },
  };
}

export function creatorProfileToRow(profile: CreatorProfileDraft) {
  return {
    creator_id: profile.creatorId,
    username: profile.username,
    display_name: profile.displayName,
    bio: profile.bio ?? null,
    avatar_color: profile.avatarColor,
    accent_color: profile.accentColor,
    theme_variant: profile.themeVariant,
    // Omit image urls unless explicitly provided, so an upsert never wipes an
    // already-uploaded image (the dedicated upload route owns those columns).
    ...(profile.avatarUrl !== undefined ? { avatar_url: profile.avatarUrl } : {}),
    ...(profile.headerUrl !== undefined ? { header_url: profile.headerUrl } : {}),
    social_links: profile.socialLinks,
    category: profile.category ?? null,
  };
}

export function buildDefaultStreamRow(profile: Pick<CreatorProfileDraft, "creatorId" | "username" | "displayName" | "avatarColor">) {
  return {
    playback_id: `live-${profile.username}`,
    creator_id: profile.creatorId,
    title: `${profile.displayName} live`,
    description: "A new TVinBio channel.",
    view_mode: "free",
    amount: 0,
    is_active: false,
    viewer_count: 0,
    thumb_color: profile.avatarColor,
    paid_users: [],
    donation_presets: [...DEFAULT_DONATION_PRESETS],
    record: true,
  };
}

function normalizeSocialLinks(value: unknown): { kind: string; url: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      return {
        kind: trimBounded(record.kind, 24)?.toLowerCase() ?? "link",
        url: trimBounded(record.url, 160) ?? "",
      };
    })
    .filter((item) => item.url.startsWith("https://"))
    .slice(0, 5);
}

function normalizeAvatarUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined; // field absent → preserve existing
  if (value === null || value === "") return null; // explicit clear
  const url = String(value).trim();
  return /^https?:\/\//.test(url) ? url.slice(0, 500) : undefined;
}

function defaultAvatarColor(username: string): string {
  let hash = 0;
  for (const char of username) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
