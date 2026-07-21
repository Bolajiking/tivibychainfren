/**
 * Tier-1 creator theming (framework §8, Package 5).
 *
 * The creator's brand leads on `/{username}`: accent, cover, avatar, theme
 * variant. Everything else — chrome, sheets, checkout — stays in system tokens.
 * Customization is deliberately constrained; constraint is what keeps every
 * page looking expensive.
 *
 * Guardrails enforced here, so no caller can violate them:
 *   • accent auto-tuned to ≥4.5:1 against the canvas for text use
 *   • live-red and earn-green are not pickable (they mean LIVE and money)
 *   • money/checkout surfaces never receive these vars (see CreatorTheme)
 */

export type ThemeVariant = "midnight" | "dim" | "voltage";

export const THEME_VARIANTS: ThemeVariant[] = ["midnight", "dim", "voltage"];

/** The onboarding palette (F4) — all five already clear the contrast floor. */
export const ACCENT_PRESETS = [
  "#FFB43D",
  "#5ACDFF",
  "#C8EB6D",
  "#FF8AB3",
  "#B79CFF",
] as const;

export const DEFAULT_ACCENT = "#FFB43D";

/** Canvas luminance (#060606) — the surface every accent is measured against. */
const CANVAS_LUMINANCE = 0.00304;
/** Minimum relative luminance an accent needs for 4.5:1 on the canvas. */
const MIN_LUMINANCE = 4.5 * (CANVAS_LUMINANCE + 0.05) - 0.05;

export function isThemeVariant(value: unknown): value is ThemeVariant {
  return typeof value === "string" && (THEME_VARIANTS as string[]).includes(value);
}

/* ── color math ─────────────────────────────────────────────────────── */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb | null {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const channel = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** WCAG relative luminance. */
function luminance({ r, g, b }: Rgb): number {
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / delta + 2) / 6;
  else h = ((rn - gn) / delta + 4) / 6;
  return { h: h * 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const hn = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const toChannel = (t: number) => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  return {
    r: toChannel(hn + 1 / 3) * 255,
    g: toChannel(hn) * 255,
    b: toChannel(hn - 1 / 3) * 255,
  };
}

/* ── guardrails ─────────────────────────────────────────────────────── */

/**
 * Live-red and earn-green are reserved semantics. A saturated hue sitting in
 * either band would read as "this channel is live" or "money moved" — so it is
 * rotated out of the reserved band rather than silently allowed.
 */
function avoidReservedHues(h: number, s: number): number {
  if (s < 0.35) return h; // desaturated enough to never read as a status color
  // live-red band
  if (h >= 344 || h <= 14) return h >= 344 ? 330 : 26;
  // earn-green band
  if (h >= 100 && h <= 160) return h < 130 ? 88 : 172;
  return h;
}

/** Raise lightness until the accent clears 4.5:1 on the canvas. */
function liftToContrast(h: number, s: number, l: number): Rgb {
  let lightness = l;
  let rgb = hslToRgb(h, s, lightness);
  let guard = 0;
  while (luminance(rgb) < MIN_LUMINANCE && lightness < 0.97 && guard < 60) {
    lightness += 0.02;
    rgb = hslToRgb(h, s, lightness);
    guard += 1;
  }
  return rgb;
}

export interface CreatorAccent {
  /** Contrast-guarded accent — safe for text and fills on the canvas. */
  accent: string;
  /** Lighter tint for secondary emphasis. */
  soft: string;
  /** Darker step for pressed/hover on accent fills. */
  deep: string;
  /** Ambient light — accent at low alpha. */
  glow: string;
  /** Hairline border tint. */
  line: string;
  /** Ink color that sits legibly on top of an accent fill. */
  on: string;
}

/**
 * Normalize any picked color into the full, guarded accent ramp.
 * Invalid input falls back to the default accent rather than throwing.
 */
export function resolveCreatorAccent(input?: string | null): CreatorAccent {
  const parsed = parseHex(input ?? "") ?? parseHex(DEFAULT_ACCENT)!;
  const { h, s, l } = rgbToHsl(parsed);
  const hue = avoidReservedHues(h, s);
  const guarded = liftToContrast(hue, s, l);
  const { l: finalL } = rgbToHsl(guarded);

  const accent = toHex(guarded);
  const soft = toHex(hslToRgb(hue, Math.min(s, 0.7), Math.min(finalL + 0.16, 0.92)));
  const deep = toHex(hslToRgb(hue, s, Math.max(finalL - 0.1, 0.24)));
  // Accent fills carry canvas-dark ink; the guard above guarantees the contrast.
  return {
    accent,
    soft,
    deep,
    glow: rgba(guarded, 0.18),
    line: rgba(guarded, 0.4),
    on: "#060606",
  };
}

function rgba({ r, g, b }: Rgb, alpha: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

/* ── theme variants ─────────────────────────────────────────────────── */

interface VariantSurfaces {
  canvas: string;
  card: string;
  raised: string;
  /** voltage uses the accent more assertively (chips, rings) — same layout. */
  assertive: boolean;
}

const VARIANT_SURFACES: Record<ThemeVariant, VariantSurfaces> = {
  midnight: { canvas: "#060606", card: "#0b0b0b", raised: "#0f0f12", assertive: false },
  dim: { canvas: "#0a0a0c", card: "#101014", raised: "#15151a", assertive: false },
  voltage: { canvas: "#060606", card: "#0b0b0b", raised: "#0f0f12", assertive: true },
};

export function variantSurfaces(variant: ThemeVariant | undefined): VariantSurfaces {
  return VARIANT_SURFACES[variant ?? "midnight"];
}

/**
 * The CSS custom properties a creator surface sets. Deliberately scoped: money
 * surfaces render outside this scope and therefore never theme.
 */
export function creatorThemeVars(
  accentInput?: string | null,
  variant?: ThemeVariant | null,
): React.CSSProperties {
  const a = resolveCreatorAccent(accentInput);
  const s = variantSurfaces(variant ?? undefined);
  return {
    "--creator-accent": a.accent,
    "--creator-accent-soft": a.soft,
    "--creator-accent-deep": a.deep,
    "--creator-accent-glow": a.glow,
    "--creator-accent-line": a.line,
    "--creator-accent-on": a.on,
    "--creator-canvas": s.canvas,
    "--creator-card": s.card,
    "--creator-raised": s.raised,
  } as React.CSSProperties;
}
