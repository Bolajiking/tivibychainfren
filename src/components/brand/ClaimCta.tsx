"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/lib/store/session";
import { slugifyUsername } from "@/lib/profile";
import { cn } from "@/lib/cn";

/**
 * Landing call-to-action. One channel per account: a signed-in creator is sent
 * to their dashboard and never offered "Claim your channel" again; everyone else
 * gets the claim flow.
 */
export function ClaimCta({ size = "lg", arrow, variant }: { size?: "sm" | "lg"; arrow?: boolean; variant?: "ghost" | "secondary" }) {
  const creator = useSession((s) => s.creator);
  const href = creator ? "/dashboard" : "/start";
  const label = creator ? "Your dashboard" : "Claim your channel";
  return (
    <Button asChild size={size} variant={variant} className="whitespace-nowrap">
      <Link href={href}>
        {label}
        {arrow && <ArrowRight className="size-4" />}
      </Link>
    </Button>
  );
}

type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "free" }
  | { state: "taken"; suggestions: string[] }
  | { state: "short" };

/**
 * F4, step one — the URL *is* the hero.
 *
 * The whole promise of the product is compressed into one input: this address
 * is yours. Availability resolves inline (no page reload) because the claim
 * step has a 15-second budget inside the 60-second claim-to-live path, and a
 * taken handle offers three suggestions rather than a dead end.
 */
export function ClaimHandle({ autoFocus = true }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [availability, setAvailability] = useState<Availability>({ state: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const handle = slugifyUsername(raw);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Debounced so a fast typist triggers one request, not one per keystroke.
  useEffect(() => {
    if (!handle) return setAvailability({ state: "idle" });
    if (handle.length < 3) return setAvailability({ state: "short" });

    setAvailability({ state: "checking" });
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/handle?u=${encodeURIComponent(handle)}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (data.available) setAvailability({ state: "free" });
        else setAvailability({ state: "taken", suggestions: data.suggestions ?? [] });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Never block the claim on a flaky check — the server revalidates.
        setAvailability({ state: "free" });
      }
    }, 320);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [handle]);

  function claim() {
    if (availability.state !== "free") return;
    router.push(`/onboarding?handle=${encodeURIComponent(handle)}`);
  }

  return (
    <div className="w-full">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          claim();
        }}
        className={cn(
          "flex h-14 items-center rounded-full border-2 bg-beam/[0.05] pl-[18px] pr-2 transition-colors",
          availability.state === "taken" ? "border-error/60" : "border-beam",
        )}
      >
        <span className="receipt shrink-0 text-[15px] text-faint">tvin.bio/</span>
        <input
          ref={inputRef}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          placeholder="yourname"
          aria-label="Your handle"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="receipt min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-ghost focus:outline-none"
        />
        <Button
          type="submit"
          size="sm"
          className="ml-2 shrink-0"
          disabled={availability.state !== "free"}
        >
          {availability.state === "checking" ? <Loader2 className="size-4 animate-spin" /> : "Claim"}
        </Button>
      </form>

      <div className="mt-2.5 min-h-[20px] text-[12px]">
        {availability.state === "free" && (
          <span className="inline-flex items-center gap-1.5 text-earn">
            <Check className="size-3.5" /> available — claim it before someone else does
          </span>
        )}
        {availability.state === "short" && <span className="text-faint">A few more letters</span>}
        {availability.state === "taken" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">Taken. Try</span>
            {availability.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setRaw(suggestion)}
                className="receipt rounded-full border border-white/[0.14] px-2.5 py-1 text-[11px] text-ink-dim transition-colors hover:border-white/30 hover:text-white"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
