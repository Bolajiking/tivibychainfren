"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Download, Share, Plus, SmartphoneNfc } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { useInstallPrompt } from "@/lib/pwa";

/**
 * Contextual "Add to device" affordance. Renders nothing once the surface is
 * already installed / running standalone. On Chromium it fires the native
 * prompt (which uses *this page's* manifest — so a channel page installs the
 * channel, the homepage installs the TVinBio app); on iOS it opens a short
 * Share → Add to Home Screen guide. `subject` tailors the generic copy and
 * `name` injects the specific channel/profile name.
 */
export function InstallButton({
  subject = "app",
  name,
  label,
  size = "md",
  variant = "secondary",
  className,
  iconOnly = false,
  autoPrompt = false,
}: {
  subject?: "app" | "channel" | "profile";
  /** The specific thing being saved, e.g. the channel's display name. */
  name?: string;
  label?: string;
  size?: "sm" | "md" | "lg" | "pill";
  variant?: "primary" | "secondary" | "ghost" | "white";
  className?: string;
  iconOnly?: boolean;
  /** Fire the install flow automatically once available (e.g. arriving from a "Save channel" link). */
  autoPrompt?: boolean;
}) {
  const { available, canPrompt, needsManualInstall, promptInstall } = useInstallPrompt();
  const [iosOpen, setIosOpen] = useState(false);
  const autoFired = useRef(false);

  const noun = subject === "channel" ? "channel" : subject === "profile" ? "profile" : "TVinBio";
  // The specific target for copy: the channel/profile name when we have it.
  const target = name ?? noun;
  const text = label ?? (subject === "channel" ? "Save channel" : subject === "profile" ? "Save profile" : "Install app");

  async function runInstall() {
    if (needsManualInstall) {
      setIosOpen(true);
      return;
    }
    const outcome = await promptInstall();
    if (outcome === "accepted") toast.success(`Added ${target} to your device`);
    else if (outcome === "unavailable") setIosOpen(true);
  }

  // Auto-fire once when a "save" link routed here specifically to install.
  useEffect(() => {
    if (!autoPrompt || autoFired.current || !available) return;
    autoFired.current = true;
    void runInstall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrompt, available, needsManualInstall]);

  if (!available) return null;

  async function onClick() {
    await runInstall();
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={onClick}
        className={className}
        aria-label={text}
      >
        <Download className="size-4" />
        {!iconOnly && text}
      </Button>

      <Sheet open={iosOpen} onOpenChange={setIosOpen} title={`Add ${target} to your device`}>
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-blue-light">
            <SmartphoneNfc className="size-5" />
          </span>
          <div>
            <div className="text-[15px] font-semibold text-white">Add {target} to your Home Screen</div>
            <div className="text-[12px] text-muted">One tap to reopen — no App Store needed.</div>
          </div>
        </div>
        <ol className="mt-4 flex flex-col gap-2.5">
          <IosStep n={1} icon={<Share className="size-4 text-blue-light" />}>
            Tap the <span className="font-semibold text-white">Share</span> icon in Safari&apos;s toolbar.
          </IosStep>
          <IosStep n={2} icon={<Plus className="size-4 text-blue-light" />}>
            Choose <span className="font-semibold text-white">Add to Home Screen</span>.
          </IosStep>
          <IosStep n={3} icon={<Check className="size-4 text-blue-light" />}>
            Tap <span className="font-semibold text-white">Add</span> — the {target} icon lands on your Home Screen.
          </IosStep>
        </ol>
        <Button variant="primary" size="lg" className="mt-5 w-full" onClick={() => setIosOpen(false)}>
          Got it
        </Button>
      </Sheet>
    </>
  );
}

function IosStep({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-center gap-3 rounded-[14px] border border-white/[0.07] bg-white/[0.035] p-3")}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[12px] font-bold text-white">{n}</span>
      <span className="flex-1 text-[12.5px] leading-relaxed text-ink-dim">{children}</span>
      {icon}
    </li>
  );
}
