"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * An in-app back affordance for arrival surfaces (the creator page) that have
 * no natural "up" — a fan lands here from a bio tap OR from Explore, and only
 * the second case has somewhere to go back to.
 *
 * It renders nothing on a cold arrival (history has a single entry — a shared
 * link opened fresh), so a bio-tap page stays clean and the platform webview's
 * own back chrome isn't duplicated. When the page was reached by navigating
 * within the app, it appears and pops the stack. Mount-gated to avoid a
 * hydration mismatch, since `window.history` is client-only.
 */
export function BackButton({ fallback = "/explore", className }: { fallback?: string; className?: string }) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, []);

  if (!canGoBack) return null;

  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => {
        // Prefer the real stack; fall back to a safe hub if it's somehow empty.
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className={cn(
        "grid size-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition-transform active:scale-[0.92]",
        className,
      )}
    >
      <ChevronLeft className="size-[22px]" />
    </button>
  );
}
