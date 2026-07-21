"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight, Sparkles, User } from "lucide-react";
import { useSession } from "@/lib/store/session";
import { useHydrated } from "@/lib/store/useHydrated";
import { buildAuthHref } from "@/lib/auth/redirect";
import { config } from "@/lib/config";
import { cn } from "@/lib/cn";

/**
 * - Signed out → sign in.
 * - Fan with no channel → opens the channel claim flow (onboarding), which
 *   provisions a creator profile.
 * - Creator → toggles between managing their channel (owner) and browsing (fan),
 *   routing to the matching surface. Owner persona only holds while a creator
 *   profile exists (enforced in the store).
 */
export function PersonaSwitch({ variant = "full" }: { variant?: "full" | "compact" }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const user = useSession((s) => s.user);
  const creator = useSession((s) => s.creator);
  const persona = useSession((s) => s.persona);
  const setPersona = useSession((s) => s.setPersona);

  const isCreator = !!creator;

  function onClick() {
    if (!user) {
      // Generic sign-in → the home resolver routes creators to their channel
      // owner view and fans to explore.
      router.push(buildAuthHref({ role: "viewer", next: "/start" }));
      return;
    }
    if (!isCreator) {
      // Become a creator → invite-gated claim flow. Real auth preserves intent.
      router.push(config.privy.enabled ? buildAuthHref({ role: "creator", next: "/onboarding" }) : "/onboarding");
      return;
    }
    if (persona === "owner") {
      setPersona("fan");
      toast("Now browsing as a fan");
      router.push("/explore");
    } else {
      setPersona("owner");
      toast("Creator mode — this is your channel");
      router.push("/dashboard");
    }
  }

  // Until the persisted session hydrates, render a neutral placeholder so a
  // returning signed-in user never flashes the "Sign in" label.
  if (!hydrated) {
    return variant === "compact" ? (
      <div className="size-10 rounded-full border-[1.5px] border-white/10" aria-hidden />
    ) : (
      <div className="h-[38px] w-full rounded-[11px] border border-white/10 bg-white/[0.03]" aria-hidden />
    );
  }

  const { label, icon } = labelFor(!!user, isCreator, persona);

  if (variant === "compact") {
    return (
      <button
        onClick={onClick}
        aria-label={label}
        className="flex size-10 items-center justify-center rounded-full border-[1.5px] border-white/20 text-muted hover:text-white"
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[11px] border px-3 py-2.5 text-[11.5px] font-semibold transition",
        isCreator
          ? "border-white/10 text-muted hover:text-white"
          : "border-beam/40 bg-beam/[0.1] text-beam-soft hover:bg-beam/[0.16]",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function labelFor(signedIn: boolean, isCreator: boolean, persona: "fan" | "owner") {
  if (!signedIn) return { label: "Sign in", icon: <User className="size-[15px]" /> };
  if (!isCreator) return { label: "Become a creator", icon: <Sparkles className="size-[15px]" /> };
  return {
    label: persona === "owner" ? "Switch to fan view" : "Switch to creator",
    icon: <ArrowLeftRight className="size-[15px]" />,
  };
}
