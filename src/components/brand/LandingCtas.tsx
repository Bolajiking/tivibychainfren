"use client";

import Link from "next/link";
import { ArrowRight, Tv } from "lucide-react";
import { useSession } from "@/lib/store/session";
import { useHydrated } from "@/lib/store/useHydrated";
import { Button } from "@/components/ui/Button";
import { ClaimCta } from "@/components/brand/ClaimCta";
import { InstallButton } from "@/components/pwa/InstallButton";
import { Avatar } from "@/components/ui/Media";
import { buildAuthHref } from "@/lib/auth/redirect";
import type { Creator } from "@/lib/types";

/** Where a signed-in user's "home" is: creators → their channel page, fans → resolver. */
function homeHref(creator?: Creator | null) {
  return creator ? `/${creator.username}` : "/start";
}

/**
 * Header nav for the marketing landing page. Auth-aware on the client: signed-in
 * visitors never see "Sign in" — they get a direct link to their own space. The
 * auth slot is held blank until the store hydrates so a returning user doesn't
 * flash the signed-out buttons first.
 */
export function LandingNav() {
  const hydrated = useHydrated();
  const user = useSession((s) => s.user);
  const creator = useSession((s) => s.creator);

  return (
    <nav className="flex items-center gap-3">
      <Link href="/explore" className="hidden text-sm font-medium text-muted hover:text-white sm:block">Explore</Link>
      {/* TVinBio app install lives only on the homepage — channels install their own PWA. */}
      <InstallButton subject="app" size="sm" variant="ghost" label="Install app" className="hidden sm:inline-flex" />

      {!hydrated ? (
        // Reserve space, render nothing decisive until we know the auth state.
        <div className="h-9 w-[150px]" aria-hidden />
      ) : user ? (
        <>
          <Button asChild size="sm">
            <Link href={homeHref(creator)}>
              {creator ? <><Tv className="size-4" /> Your channel</> : "Open TVinBio"}
            </Link>
          </Button>
          <Link href={homeHref(creator)} aria-label="Your account" className="shrink-0">
            <Avatar seed={creator?.avatarColor ?? "#2a2a2a"} src={creator?.avatarUrl} size={34} />
          </Link>
        </>
      ) : (
        <>
          <Button asChild size="sm" variant="ghost"><Link href={buildAuthHref({ role: "viewer", next: "/start" })}>Sign in</Link></Button>
          <ClaimCta size="sm" />
        </>
      )}
    </nav>
  );
}

/**
 * Hero call-to-action. Signed-in creators get a direct route to their dashboard
 * instead of being asked to claim a channel they already own; everyone else gets
 * the claim CTA. Hydration-gated to avoid a flash.
 */
export function LandingHeroCta() {
  const hydrated = useHydrated();
  const user = useSession((s) => s.user);
  const creator = useSession((s) => s.creator);

  return (
    <div className="mt-8 flex items-center justify-center gap-3">
      {hydrated && user && creator ? (
        <Button asChild size="lg">
          <Link href={`/${creator.username}`}><Tv className="size-[18px] mr-0.5" /> Go to channel <ArrowRight className="size-[18px]" /></Link>
        </Button>
      ) : hydrated && user ? (
        <Button asChild size="lg">
          <Link href="/start">Open TVinBio <ArrowRight className="size-[18px]" /></Link>
        </Button>
      ) : (
        <ClaimCta size="lg" arrow />
      )}
      <Button asChild size="lg" variant="ghost"><Link href="/explore">Explore creators</Link></Button>
    </div>
  );
}
