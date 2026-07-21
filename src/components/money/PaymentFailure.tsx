"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * F2 failure state. Three obligations, all non-negotiable:
 *   1. say plainly whether the balance moved (it didn't)
 *   2. name the cause in language a fan on a bus in Lagos can act on
 *   3. never dead-end — retry plus a way to reach a human
 *
 * Error red is `--color-error`, never live-red: live-red means LIVE.
 */
export function PaymentFailure({
  title = "That didn't go through",
  detail = "Your balance wasn't charged. The network dropped mid-payment — this happens on slow connections.",
  onRetry,
  className,
}: {
  title?: string;
  detail?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2.5 border-t border-white/[0.08] pt-3.5", className)}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-[26px] place-items-center rounded-full border border-error/40 bg-error/[0.12] text-[13px] font-semibold text-error">
          !
        </span>
        <span className="text-sm font-semibold text-ink-soft">{title}</span>
      </div>
      <p className="text-[12.5px] leading-relaxed text-muted">{detail}</p>
      <div className="flex gap-2">
        {onRetry && (
          <Button size="sm" className="flex-1" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button asChild variant="secondary" size="sm">
          <a href="mailto:help@tvin.bio?subject=Payment%20trouble">Get help</a>
        </Button>
      </div>
    </div>
  );
}
