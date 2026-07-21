"use client";

import { InstallButton } from "@/components/pwa/InstallButton";
import { useInstallPrompt } from "@/lib/pwa";
import { cn } from "@/lib/cn";

/**
 * The fan-side "save this channel to your phone" affordance.
 *
 * `InstallButton` already renders nothing when install is impossible (already
 * standalone, no `beforeinstallprompt`, an in-app webview) — but a row whose
 * only content is that button would then collapse to an empty pill. So the row
 * reads the same hook and removes itself, never leaving a hollow shell behind.
 *
 * The channel `layout.tsx` serves a per-creator manifest, so installing from
 * any channel surface saves *that channel*, not the TVinBio app.
 */
export function SaveChannelRow({
  creatorName,
  className,
}: {
  creatorName: string;
  className?: string;
}) {
  const { available } = useInstallPrompt();
  if (!available) return null;

  const first = creatorName.split(" ")[0];

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-full border border-white/[0.08] bg-surface-2 py-1.5 pl-4 pr-1.5",
        className,
      )}
    >
      <span className="min-w-0 truncate text-[12px] text-faint">Keep {first} one tap away</span>
      <InstallButton subject="channel" name={creatorName} size="sm" variant="ghost" />
    </div>
  );
}
