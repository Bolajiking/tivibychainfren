import { cn } from "@/lib/cn";
import { formatCount, formatPrice } from "@/lib/cn";
import { SignalGlyph } from "@/components/brand/Glyphs";
import type { ViewMode } from "@/lib/types";

/**
 * Status chips (Package 3). UPPERCASE 11px / 0.12em, pill geometry.
 * LIVE is the only pulsing element on any screen — reduced motion turns the
 * pulse into a static dot via the global media query.
 */

function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("inline-block size-[6px] rounded-full bg-white animate-[tvLive_1.5s_cubic-bezier(.22,1,.36,1)_infinite]", className)} />
  );
}

const chipBase = "inline-flex items-center gap-1.5 rounded-full font-semibold tracking-[0.12em]";

/** LIVE — solid on media, tinted on surfaces. Live-red, only ever for live. */
export function LivePill({ small, onSurface }: { small?: boolean; onSurface?: boolean }) {
  return (
    <span
      className={cn(
        chipBase,
        onSurface
          ? "border border-live/35 bg-live/[0.12] text-ink-soft"
          : "bg-live/[0.92] text-white",
        small ? "px-2.5 py-1 text-[9.5px]" : "px-3 py-1.5 text-[11px]",
      )}
    >
      <LiveDot className={onSurface ? "bg-live" : undefined} />
      LIVE
    </span>
  );
}

/** REPLAY — a past stream, watchable now. Ink outline, no color. */
export function ReplayPill({ small }: { small?: boolean }) {
  return (
    <span className={cn(chipBase, "border border-white/[0.12] text-ink-dim", small ? "px-2.5 py-1 text-[9px]" : "px-3 py-1.5 text-[11px]")}>
      REPLAY
    </span>
  );
}

/** UPCOMING — scheduled. Beam-soft outline: anticipation, not urgency. */
export function UpcomingPill({ small, accent }: { small?: boolean; accent?: boolean }) {
  return (
    <span
      className={cn(
        chipBase,
        accent ? "border border-accent-line text-accent" : "border border-beam-soft/35 text-beam-soft",
        small ? "px-2.5 py-1 text-[9px]" : "px-3 py-1.5 text-[11px]",
      )}
    >
      UPCOMING
    </span>
  );
}

/** Price chip — receipt layer, always. */
export function PricePill({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <span
      className={cn(
        "receipt inline-flex items-center rounded-full border border-white/[0.12] bg-raised text-ink-soft",
        small ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[12px]",
      )}
    >
      {children}
    </span>
  );
}

/**
 * Viewer count — receipt layer with the signal glyph. On media it sits on the
 * scrim with a text shadow rather than inside a box.
 */
export function ViewerPill({ count, small, bare }: { count: number; small?: boolean; bare?: boolean }) {
  const label = (
    <>
      <SignalGlyph size={small ? 11 : 13} />
      {formatCount(count)}
      {!small && " watching"}
    </>
  );
  if (bare) {
    return (
      <span
        className={cn("receipt inline-flex items-center gap-1.5 text-ink-soft [text-shadow:0_1px_6px_rgba(0,0,0,.7)]", small ? "text-[10px]" : "text-[12px]")}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "receipt inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] text-muted",
        small ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[12px]",
      )}
    >
      {label}
    </span>
  );
}

/** Gating badge: FREE / ONE-TIME / SUBS / $price */
export function GateBadge({ viewMode, amount }: { viewMode: ViewMode; amount: number }) {
  if (viewMode === "free") {
    return <Pill tone="muted">FREE</Pill>;
  }
  return (
    <span className="inline-flex gap-1.5">
      <Pill tone="muted">{viewMode === "monthly" ? "MONTHLY" : "ONE-TIME"}</Pill>
      <Pill tone="beam">{formatPrice(amount)}</Pill>
    </span>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "beam" | "muted" }) {
  const tones = {
    beam: "text-beam-soft border-beam/45 bg-beam/[0.12]",
    muted: "text-muted border-white/[0.16] bg-white/[0.04]",
  } as const;
  return (
    <span className={cn("receipt rounded-full border px-2.5 py-[3px] text-[9.5px] font-medium tracking-[0.04em]", tones[tone])}>
      {children}
    </span>
  );
}

/** Eyebrow — 11px UPPERCASE 0.12em (Chainfren convention, carried over). */
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("text-[11px] font-semibold uppercase tracking-[0.12em] text-faint", className)}>
      {children}
    </div>
  );
}
