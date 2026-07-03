"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe media query hook. Returns `false` on the server and first client
 * render (matching the mobile-first default), then updates after mount so the
 * desktop rail vs. mobile sheet never both mount and double-subscribe.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** True at Tailwind's `lg` breakpoint and up (≥1024px). */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
