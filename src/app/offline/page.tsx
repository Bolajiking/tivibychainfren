import { Mark } from "@/components/brand/Logo";

export const metadata = { title: "No signal · TVinBio" };

// F8 — offline keeps the TV voice: "No signal", the idle mark as the glyph,
// cached channels stay reachable via the PWA shell around this page.
export default function Offline() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
      <span className="text-ghost">
        <Mark size={44} />
      </span>
      <h1 className="mt-5 font-display text-[22px] font-semibold tracking-[-0.02em] text-white">No signal</h1>
      <p className="mt-2 max-w-[300px] text-[13px] leading-relaxed text-muted">
        You&apos;re offline. Your channels are saved — they&apos;ll reload the moment you&apos;re back.
      </p>
    </div>
  );
}
