"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/store/session";
import { getMyCreatorProfile } from "@/lib/profile-client";
import { MOCK_MODE } from "@/lib/config";

/**
 * Hydrates the signed-in user's own creator profile into the session, so the
 * whole app knows whether they are a creator (drives the persona switch, the
 * owned-channel rail, and channel management gating). No-op in mock mode (the
 * onboarding flow sets `creator` locally there) and once a profile is loaded.
 */
export function CreatorHydrator() {
  const user = useSession((s) => s.user);
  const creator = useSession((s) => s.creator);
  const setCreator = useSession((s) => s.setCreator);

  useEffect(() => {
    if (MOCK_MODE || !user || creator) return;
    let alive = true;
    getMyCreatorProfile(user.walletAddress)
      .then((payload) => {
        if (alive && payload?.creator) setCreator(payload.creator);
      })
      .catch(() => {
        /* not a creator yet — stays a fan */
      });
    return () => {
      alive = false;
    };
  }, [user, creator, setCreator]);

  return null;
}
