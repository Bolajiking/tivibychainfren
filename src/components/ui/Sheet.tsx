"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { cn } from "@/lib/cn";

/**
 * Bottom sheet on mobile, centered card on desktop. The home for every
 * money surface (gate, fund, tip, purchase) — calm, legible, dismissible.
 */
export function Sheet({
  open,
  onOpenChange,
  children,
  title,
  variant = "bottom",
  className,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
  title: string;
  variant?: "bottom" | "center";
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-[tvFadeIn_.22s_ease] data-[state=closed]:animate-[tvFadeOut_.2s_ease]" />
        <Dialog.Content
          className={cn(
            "fixed z-50 border border-white/12 bg-elevated text-white shadow-[0_24px_60px_rgba(0,0,0,.6)] focus:outline-none",
            // Bottom sheet (mobile): full slide up from below the viewport, slide back down on close.
            variant === "bottom"
              ? "inset-x-0 bottom-0 rounded-t-[24px] p-4 pb-[max(20px,env(safe-area-inset-bottom))] will-change-transform data-[state=open]:animate-[tvSheet_.34s_cubic-bezier(.22,1,.36,1)] data-[state=closed]:animate-[tvSheetOut_.24s_cubic-bezier(.4,0,1,1)]"
              : "left-1/2 top-1/2 w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-[22px] p-6 will-change-transform data-[state=open]:animate-[tvCenterIn_.3s_cubic-bezier(.22,1,.36,1)] data-[state=closed]:animate-[tvCenterOut_.18s_ease-in]",
            className,
          )}
        >
          <Dialog.Title asChild>
            <VisuallyHidden>{title}</VisuallyHidden>
          </Dialog.Title>
          {variant === "bottom" && (
            <div className="mx-auto mb-3.5 h-1 w-9 rounded-full bg-white/25" />
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
