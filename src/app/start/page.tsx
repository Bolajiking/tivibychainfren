"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Mark } from "@/components/brand/Logo";
import { ClaimHandle } from "@/components/brand/ClaimCta";
import { useSession } from "@/lib/store/session";
import { getMyCreatorProfile } from "@/lib/profile-client";
import { MOCK_MODE } from "@/lib/config";

/**
 * F4, step one — and the post-login home resolver, in one screen.
 *
 * Signed out, this is the claim moment: the address is the hero, one Georgia
 * italic outcome line, availability inline. Signed in, there is nothing to
 * claim, so it resolves to where that person actually lives:
 *   creator → their channel (owner view) · fan → what's on
 *
 * Keeping both behaviours here means "where do I begin" and "where do I land"
 * never drift apart into two answers.
 */
export default function Start() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [resolving, setResolving] = useState(false);
  const done = useRef(false);

  // Wait for the persisted session before deciding, so a returning signed-in
  // user is never briefly treated as a stranger and shown the claim screen.
  useEffect(() => {
    const persist = useSession.persist;
    if (!persist || persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return persist.onFinishHydration(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated || done.current) return;

    const { user, creator, setCreator, setPersona } = useSession.getState();
    if (!user) return; // signed out → the claim screen below

    done.current = true;
    setResolving(true);

    const toOwnerHome = (username: string) => {
      setPersona("owner");
      router.replace(`/${username}?view=channel`);
    };

    if (creator) return toOwnerHome(creator.username);

    if (MOCK_MODE) {
      router.replace("/explore");
      return;
    }

    getMyCreatorProfile(user.walletAddress)
      .then((payload) => {
        if (payload?.creator) {
          setCreator(payload.creator);
          toOwnerHome(payload.creator.username);
        } else {
          router.replace("/explore");
        }
      })
      .catch(() => router.replace("/explore"));
  }, [hydrated, router]);

  if (!hydrated || resolving) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <Loader2 className="size-6 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-canvas">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[380px]"
        style={{ background: "radial-gradient(90% 100% at 30% 0%, rgba(64,172,255,0.14), transparent 62%)" }}
      />
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[460px] flex-col gap-[18px] px-6 py-12">
        <Mark size={30} className="text-ink-soft" />

        <h1 className="font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.02em]">
          Your channel starts with your address
        </h1>
        {/* The one Georgia-italic outcome line on this screen. */}
        <p className="outcome text-[16px] text-muted">a link you own, not one you rent</p>

        <ClaimHandle />

        <div className="receipt mt-auto pt-8 text-[11px] text-ghost">
          100% revenue yours · 0% platform cut · live in under a minute
        </div>
      </div>
    </div>
  );
}
