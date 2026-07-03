"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useSession } from "@/lib/store/session";
import { getMyCreatorProfile } from "@/lib/profile-client";
import { buildAuthHref } from "@/lib/auth/redirect";
import { MOCK_MODE } from "@/lib/config";

/**
 * Post-login home resolver. The single destination every generic sign-in routes
 * to — it reads who just signed in and forwards them to the right home:
 *   - not signed in → the auth wall (returns here)
 *   - creator       → their channel in owner view (`/<username>`), persona = owner
 *   - fan           → explore
 * Switching fan→creator later opens the dashboard (PersonaSwitch); the channel
 * owner view links across to it. This keeps "where do I land" in one place.
 */
export default function Start() {
  const router = useRouter();
  // Wait for the persisted session to rehydrate before deciding, so a returning
  // signed-in user is never briefly seen as signed-out and bounced to auth.
  // All persist access is client-only (it's undefined during SSR/prerender).
  const [hydrated, setHydrated] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    const p = useSession.persist;
    if (!p || p.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return p.onFinishHydration(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated || done.current) return;
    done.current = true;

    const { user, creator, setCreator, setPersona } = useSession.getState();

    if (!user) {
      router.replace(buildAuthHref({ role: "viewer", next: "/start" }));
      return;
    }

    const toOwnerHome = (username: string) => {
      setPersona("owner");
      router.replace(`/${username}`);
    };

    // Already know they're a creator (persisted) → straight to their channel.
    if (creator) return toOwnerHome(creator.username);

    // Mock mode never has a server profile to fetch; non-onboarded = fan.
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

  return (
    <div className="grid min-h-screen place-items-center bg-canvas">
      <Loader2 className="size-6 animate-spin text-muted" />
    </div>
  );
}
