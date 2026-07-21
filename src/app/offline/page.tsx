import { Mark } from "@/components/brand/Logo";
import { OfflineChannels } from "@/components/pwa/OfflineChannels";

export const metadata = { title: "No signal · TVinBio" };

// F8 — offline keeps the TV voice: "No signal", the idle mark as the glyph
// (the dot unfilled is literally "nothing is on air"), cached channels stay
// reachable, and the install prompt appears at a moment of real intent.
export default function Offline() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-12 text-center">
      <Mark size={44} className="text-ghost" />
      <h1 className="font-display mt-5 text-[22px] font-semibold tracking-[-0.02em] text-white">No signal</h1>
      <p className="mt-2 max-w-[300px] text-[13px] leading-relaxed text-muted">
        You&apos;re offline. Your channels are saved — they&apos;ll reload the moment you&apos;re back.
      </p>
      <OfflineChannels />
    </div>
  );
}
