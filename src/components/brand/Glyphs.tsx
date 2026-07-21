/**
 * The 14 custom glyphs (Package 2). Same DNA as Lucide — 2px stroke, round
 * caps, 24 grid, `currentColor` — so they interleave invisibly with the base
 * library. Import these instead of reaching for a Lucide near-miss.
 */

type GlyphProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

function Glyph({ size = 20, className, strokeWidth = 2, children }: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** The viewport with a lit aperture — the channel/on-air glyph. */
export function OnAirGlyph({ live, ...props }: GlyphProps & { live?: boolean }) {
  return (
    <Glyph {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="4.5" />
      <circle cx="12" cy="12" r="2.4" fill={live ? "#EF4444" : "currentColor"} stroke="none" />
    </Glyph>
  );
}

/** Broadcast source radiating — the go-live action. */
export function GoLiveGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
      <path d="M7.6 8.4A5.7 5.7 0 0 0 7.6 15.6" />
      <path d="M16.4 8.4A5.7 5.7 0 0 1 16.4 15.6" />
      <path d="M12 6.5V3.5M10.3 4.8 12 3.2l1.7 1.6" strokeWidth={1.8} />
    </Glyph>
  );
}

export function ReplayGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.5" />
      <path d="M4 4v4.5h4.5" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

export function ClipGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M8.5 6v12M15.5 6v12" strokeWidth={1.8} />
    </Glyph>
  );
}

export function TipGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16.5v-9M9.2 10.3 12 7.5l2.8 2.8" strokeWidth={1.8} />
    </Glyph>
  );
}

export function StoreGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9" />
      <path d="M3.4 6 5 3h14l1.6 3a2.4 2.4 0 0 1-4.5 1.2A2.4 2.4 0 0 1 12 7a2.4 2.4 0 0 1-4.1.2A2.4 2.4 0 0 1 3.4 6Z" />
      <path d="M9.5 20v-5h5v5" strokeWidth={1.8} />
    </Glyph>
  );
}

export function ProductGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12.6 3h6.9a1.5 1.5 0 0 1 1.5 1.5v6.9a1.5 1.5 0 0 1-.44 1.06l-8.5 8.5a1.5 1.5 0 0 1-2.12 0l-6.9-6.9a1.5 1.5 0 0 1 0-2.12l8.5-8.5A1.5 1.5 0 0 1 12.6 3Z" />
      <circle cx="16.5" cy="7.5" r="1.6" />
    </Glyph>
  );
}

export function CheckoutGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="M2.5 9.5h19" strokeWidth={1.8} />
      <path d="M6.5 14.5h4" strokeWidth={1.8} />
    </Glyph>
  );
}

/** A dollar in a circle — never a crypto logo (framework §5). */
export function UsdcGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path
        d="M12 6.2v11.6M15 8.9c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2.1 0 2.9 6 1.5 6 4.4 0 1.3-1.3 2.1-3 2.1-1.4 0-2.5-.5-3-1.5"
        strokeWidth={1.8}
      />
    </Glyph>
  );
}

export function WalletGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M20 7H5a2 2 0 0 1 0-4h13v4" />
      <path d="M3 5v13a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1" />
      <circle cx="16.5" cy="13.5" r="1.4" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

/** Follow / capture — the ownership loop. */
export function CaptureGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="10" cy="8.5" r="3.5" />
      <path d="M4 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M18.5 6.5v5M16 9h5" strokeWidth={1.8} />
    </Glyph>
  );
}

export function ChannelGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="8" width="18" height="12.5" rx="3.5" />
      <path d="m8 3.5 4 4 4-4" strokeWidth={1.8} />
    </Glyph>
  );
}

/** The creator's dashboard — a lit stage. */
export function StageGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4 20.5h16" />
      <path d="M6.5 20.5v-3.5h11v3.5" strokeWidth={1.8} />
      <path d="M12 4.5 7 13h10l-5-8.5Z" opacity="0.5" />
      <circle cx="12" cy="4" r="1.6" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

/**
 * Signal strength — reports connection honestly (low-bandwidth, field mode).
 * `bars` dims the inactive steps rather than hiding them.
 */
export function SignalGlyph({ bars = 3, ...props }: GlyphProps & { bars?: 1 | 2 | 3 }) {
  return (
    <Glyph strokeWidth={2.4} {...props}>
      <path d="M5 20.5v-4" opacity={bars >= 1 ? 1 : 0.35} />
      <path d="M12 20.5v-9" opacity={bars >= 2 ? 1 : 0.35} />
      <path d="M19 20.5V4.5" opacity={bars >= 3 ? 1 : 0.35} />
    </Glyph>
  );
}
