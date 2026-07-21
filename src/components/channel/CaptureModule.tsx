"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * F3 — the ownership loop. One module, three moments:
 *
 *   "page"    on the creator page, below the fold, dismissible
 *   "post-pay"  after a tip/purchase, one tap (already authed)
 *   "confirmed" states the ownership plainly — the thesis as microcopy
 *
 * Rules it enforces: never a modal ambush, never gates content, only asks at
 * moments of demonstrated intent. Dismissal is respected by the caller.
 */
export function CaptureModule({
  creatorName,
  firstName,
  subscribed,
  moment = "page",
  onFollow,
  onDismiss,
  className,
}: {
  creatorName: string;
  /** Used in the headline — "Never miss Ada live" reads better than the full name. */
  firstName?: string;
  subscribed?: boolean;
  moment?: "page" | "post-pay";
  onFollow: (email?: string) => void | Promise<void>;
  onDismiss?: () => void;
  className?: string;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const name = firstName ?? creatorName.split(" ")[0];

  async function submit(withEmail?: string) {
    setBusy(true);
    try {
      await onFollow(withEmail);
    } finally {
      setBusy(false);
    }
  }

  if (subscribed) {
    return (
      <div className={cn("rounded-[18px] border border-white/[0.08] bg-surface-2 p-4", className)}>
        <div className="flex items-center gap-2.5">
          <span className="grid size-6 place-items-center rounded-full border border-earn/40 bg-earn/[0.15]">
            <Check className="size-3 text-earn" />
          </span>
          <span className="text-sm font-semibold text-ink-soft">You follow {name}</span>
        </div>
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">
          {name} now owns this relationship — it travels with {name === creatorName ? "them" : "them"}, off-platform.
          You&apos;ll hear about lives by email.
        </p>
      </div>
    );
  }

  // Post-pay: they've already proven intent and they're authed. One tap.
  if (moment === "post-pay") {
    return (
      <div className={cn("flex items-center gap-3 rounded-[18px] border border-white/[0.08] bg-surface-2 p-4", className)}>
        <div className="min-w-0 flex-1 text-[13px] text-ink-dim">Never miss {name} live</div>
        <Button size="sm" onClick={() => submit()} disabled={busy}>
          {busy ? "…" : "Follow"}
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("rounded-[18px] border border-white/[0.08] bg-creator-card p-4", className)}>
      <div className="font-display text-[17px] font-semibold tracking-[-0.01em] text-ink-soft">
        Never miss {name} live
      </div>
      <form
        className="mt-2.5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(email.trim() || undefined);
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email address"
          aria-label="Email address"
          className="h-11 min-w-0 flex-1 rounded-full border border-white/[0.12] bg-canvas px-4 text-[13px] text-white placeholder:text-faint focus:border-white/25 focus:outline-none"
        />
        <Button type="submit" size="sm" className="h-11 shrink-0" disabled={busy}>
          {busy ? "…" : "Notify me"}
        </Button>
      </form>
      <div className="mt-2.5 flex items-center gap-3">
        <span className="text-[12px] text-faint">One field or one tap.</span>
        {onDismiss && (
          <button onClick={onDismiss} className="ml-auto text-[12px] text-faint transition-colors hover:text-muted">
            Not now
          </button>
        )}
      </div>
    </div>
  );
}
