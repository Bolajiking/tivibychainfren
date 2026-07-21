"use client";

import { useEffect } from "react";

/**
 * App-shell service worker lifecycle.
 *
 * PRODUCTION: register `/sw.js` once after load. Next's static chunks are
 * content-hashed there, so the SW's cache-first strategy always serves
 * immutable files.
 *
 * DEVELOPMENT: do the opposite — unregister any SW and wipe its caches. Dev
 * chunks reuse the same `/_next/static/...` paths across rebuilds, so a
 * cache-first SW serves stale JS and breaks module resolution
 * (`Cannot read properties of undefined (reading 'call')`). A developer who
 * registered the SW in a prior session is cleaned up on their next visit.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((reg) => reg.unregister()))
        .catch(() => {});
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration is best-effort; the app works fully without it.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
