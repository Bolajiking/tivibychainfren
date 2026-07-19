import Link from "next/link";

/**
 * The Viewport mark — "the screen that goes on air" (Identity Package 1, final).
 * One geometry, two states: idle (dot in ink) and live (dot flips live-red,
 * glows, pulses). State is driven by the `data-live` attribute + CSS vars in
 * globals.css — a single fill change, no redraw.
 */
export function Mark({ size = 24, live = false, className }: { size?: number; live?: boolean; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      data-live={live ? "on" : "off"}
      className={className}
      aria-hidden
    >
      <rect x="3" y="4.5" width="18" height="15" rx="4.5" stroke="currentColor" strokeWidth="2" />
      <circle
        cx="12"
        cy="12"
        r="2.4"
        style={{
          fill: "var(--live-fill, currentColor)",
          filter: "var(--live-glow, none)",
          transition: "fill .25s var(--ease-expo), filter .25s var(--ease-expo)",
          animation: "var(--live-anim, none)",
          transformBox: "fill-box",
          transformOrigin: "center",
        }}
      />
    </svg>
  );
}

export function Logo({
  size = 32,
  withWordmark = false,
  href = "/explore",
  live = false,
}: {
  size?: number;
  withWordmark?: boolean;
  href?: string;
  live?: boolean;
}) {
  const content = withWordmark ? (
    <span className="inline-flex items-center gap-2 text-ink-soft">
      <Mark size={Math.round(size * 0.82)} live={live} />
      <Wordmark fontSize={Math.round(size * 0.68)} />
    </span>
  ) : (
    <span className="inline-flex text-ink-soft">
      <Mark size={size} live={live} />
    </span>
  );
  return href ? (
    <Link href={href} className="inline-flex items-center" aria-label="TVinBio">
      {content}
    </Link>
  ) : (
    content
  );
}

function Wordmark({ fontSize = 22 }: { fontSize?: number }) {
  return (
    <span
      className="font-display inline-flex select-none font-semibold leading-none text-ink-soft"
      style={{ fontSize, letterSpacing: "-0.02em" }}
    >
      TVinBio
    </span>
  );
}

/** Footer stamp for creator pages — the platform's entire tier-2 presence. */
export function PlatformStamp() {
  return (
    <Link
      href="/"
      className="inline-flex items-center justify-center gap-1.5 text-faint transition-colors hover:text-muted"
      aria-label="on TVinBio"
    >
      <Mark size={14} />
      <span className="text-[11px]">on TVinBio</span>
    </Link>
  );
}
