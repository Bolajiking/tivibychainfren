"use client";

import { useEffect, useRef, useState } from "react";
import { Mark } from "@/components/brand/Logo";
import { shareLink } from "@/lib/share";

/**
 * The go-live sequence (F5) — the brand's hero moment. Fires once when the
 * stream transitions to live: the mark's dot flips live (250ms), a beam scrim
 * sweeps up (250–650ms), the pulse begins, the title card resolves (~700ms).
 * Auto-dismisses after 3.6s or on tap. Reduced motion: crossfade to end frame
 * (globals.css collapses the keyframes).
 */
export function GoLiveMoment({ live, name, handle }: { live: boolean; name: string; handle: string }) {
  const prev = useRef(live);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (live && !prev.current) {
      setShow(true);
      const t = setTimeout(() => setShow(false), 3600);
      return () => clearTimeout(t);
    }
    prev.current = live;
  }, [live]);

  useEffect(() => {
    prev.current = live;
  }, [live]);

  if (!show) return null;
  return (
    <button
      type="button"
      aria-label="Dismiss"
      onClick={() => setShow(false)}
      className="fixed inset-0 z-[90] flex cursor-default flex-col items-center justify-center gap-6 bg-canvas/95 backdrop-blur-sm animate-[tvFadeIn_.25s_both]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(80% 50% at 50% 42%, rgba(239,68,68,0.12), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 h-40 animate-[tvSweep_.4s_cubic-bezier(.22,1,.36,1)_.25s_both]"
        style={{ top: "40%", background: "linear-gradient(0deg, transparent, rgba(64,172,255,0.08), transparent)" }}
      />
      <span className="relative text-ink-soft">
        <Mark size={110} live />
      </span>
      <div className="relative flex flex-col items-center gap-2 text-center animate-[tvRise_.4s_cubic-bezier(.22,1,.36,1)_.5s_both]">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-live">ON AIR</div>
        <div className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink-soft">
          You&apos;re live, {name}
        </div>
        <div className="receipt text-xs text-muted">tvin.bio/{handle}</div>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            void shareLink({ url: `https://tvin.bio/${handle}`, text: `${name} is live now` });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              void shareLink({ url: `https://tvin.bio/${handle}`, text: `${name} is live now` });
            }
          }}
          className="mt-3 inline-flex h-12 cursor-pointer items-center justify-center rounded-full bg-beam px-7 text-sm font-semibold text-canvas transition-transform duration-150 ease-[cubic-bezier(.22,1,.36,1)] hover:bg-beam-deep active:scale-[0.97]"
        >
          Share everywhere
        </span>
      </div>
    </button>
  );
}
