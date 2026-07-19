import { Eye } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCount, formatPrice } from "@/lib/cn";
import type { ViewMode } from "@/lib/types";

function LiveDot({ className }: { className?: string }) {
  return <span className={cn("inline-block size-[6px] rounded-full bg-white animate-[tvLive_1.4s_infinite]", className)} />;
}

export function LivePill({ small }: { small?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-live/90 font-semibold tracking-[0.12em] text-white",
        small ? "px-2.5 py-1 text-[9.5px]" : "px-3 py-1.5 text-[11px]",
      )}
    >
      <LiveDot />
      LIVE
    </span>
  );
}

export function ViewerPill({ count, small }: { count: number; small?: boolean }) {
  return (
    <span
      className={cn(
        "receipt inline-flex items-center gap-1.5 rounded-full bg-black/45 font-medium text-ink-dim backdrop-blur",
        small ? "px-2.5 py-1 text-[9.5px]" : "px-3 py-1.5 text-[11.5px]",
      )}
    >
      <Eye className="size-3" />
      {formatCount(count)}
      {!small && " watching"}
    </span>
  );
}

/** Gating badge: FREE / ONE-TIME / SUBS / $price */
export function GateBadge({ viewMode, amount }: { viewMode: ViewMode; amount: number }) {
  if (viewMode === "free") {
    return <Pill tone="green">FREE</Pill>;
  }
  return (
    <span className="inline-flex gap-1.5">
      <Pill tone="muted">{viewMode === "monthly" ? "MONTHLY" : "ONE-TIME"}</Pill>
      <Pill tone="blue">{formatPrice(amount)}</Pill>
    </span>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "green" | "blue" | "muted" }) {
  const tones = {
    green: "text-earn border-earn/40 bg-earn/[0.08]",
    blue: "text-beam-soft border-beam/45 bg-beam/[0.12]",
    muted: "text-muted border-white/[0.16] bg-white/[0.04]",
  } as const;
  return (
    <span className={cn("receipt rounded-full border px-2.5 py-[3px] text-[9.5px] font-medium tracking-[0.04em]", tones[tone])}>
      {children}
    </span>
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("text-[11px] font-semibold uppercase tracking-[0.12em] text-ghost", className)}>
      {children}
    </div>
  );
}
