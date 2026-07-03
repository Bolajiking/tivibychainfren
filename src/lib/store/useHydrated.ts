"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/store/session";

/**
 * True once the persisted session store has rehydrated from localStorage.
 *
 * Auth-dependent UI should wait on this before showing a signed-out state —
 * otherwise a returning signed-in user briefly flashes as a fresh/anonymous
 * visitor on first paint, then snaps to the correct state once persist applies.
 * Synchronous localStorage means this resolves almost immediately; the timeout
 * is a belt-and-suspenders release in case the finish signal is ever missed.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const p = useSession.persist;
    if (!p || p.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = p.onFinishHydration(() => setHydrated(true));
    const t = setTimeout(() => setHydrated(true), 80);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, []);
  return hydrated;
}
