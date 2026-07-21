import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";

/**
 * F9 — the cross-cutting system-state inventory, in the product voice.
 *
 * Rules, non-negotiable:
 *   • errors are never live-red (live-red means LIVE, everywhere, forever)
 *   • blame the network, never the fan
 *   • every dead end has a next step
 *   • skeletons on surface-2, never a spinner over video
 *   • money states are always explicit about whether the balance moved
 */

/** Something broke and it isn't the user's fault. Plain language + retry. */
export function ErrorState({
  title,
  detail,
  onRetry,
  retryLabel = "Retry now",
  secondary,
  className,
}: {
  title: string;
  detail: string;
  onRetry?: () => void;
  retryLabel?: string;
  secondary?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2.5 rounded-[14px] border border-white/[0.08] bg-surface-2 p-[14px]", className)}>
      <div className="text-[13px] font-medium text-ink-soft">{title}</div>
      <div className="text-[12px] leading-relaxed text-muted">{detail}</div>
      {(onRetry || secondary) && (
        <div className="flex gap-2">
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
          {secondary}
        </div>
      )}
    </div>
  );
}

/**
 * A capability the browser is withholding. Name the actual fix — a permission
 * error that just says "failed" is a dead end.
 */
export function PermissionState({
  title,
  fix,
  className,
}: {
  title: string;
  fix: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-[14px] border border-white/[0.08] bg-surface-2 p-[14px]", className)}>
      <div className="text-[13px] font-medium text-ink-soft">{title}</div>
      <div className="text-[12px] leading-relaxed text-muted">{fix}</div>
    </div>
  );
}

/** Skeleton block — surface-2, resolves progressively. Never over video. */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("rounded-[8px] bg-raised", className)} style={style} />;
}

/** Identity-first skeleton: avatar + name + bio, the <1.5s paint on 3G. */
export function IdentitySkeleton() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="size-14 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-[18px] w-[130px] rounded-md" />
        <Skeleton className="h-[11px] w-[190px] rounded-md opacity-70" />
      </div>
    </div>
  );
}

/**
 * Money in flight. Always says whether the balance has moved — an ambiguous
 * payment state is the one thing a fan cannot be left holding.
 */
export function PaymentPending({ amount, note, className }: { amount: string; note?: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="size-[7px] shrink-0 rounded-full bg-beam" />
      <span className="flex-1 text-[12.5px] text-ink-dim">
        Confirming your <span className="receipt">{amount}</span> — {note ?? "balance not yet charged"}
      </span>
    </div>
  );
}

/**
 * The low-bandwidth notice (F8). Reports the connection honestly and offers the
 * audio-only escape hatch rather than silently degrading.
 */
export function LowBandwidthNotice({
  onAudioOnly,
  className,
}: {
  onAudioOnly?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 rounded-[14px] border border-beam/25 bg-beam/[0.06] p-[14px]", className)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#40ACFF" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
        <path d="M5 20.5v-4M12 20.5v-9M19 20.5V4.5" opacity="0.4" />
        <path d="M5 20.5v-4M12 20.5v-9" />
      </svg>
      <div className="flex-1 text-[12px] leading-relaxed text-ink-dim">
        Slow connection. Showing lists instead of video previews.
      </div>
      {onAudioOnly && (
        <button
          onClick={onAudioOnly}
          className="inline-flex h-[34px] shrink-0 items-center whitespace-nowrap rounded-full border border-beam/40 px-3 text-[12px] font-semibold text-beam"
        >
          Audio only
        </button>
      )}
    </div>
  );
}
