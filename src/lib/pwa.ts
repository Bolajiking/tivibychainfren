"use client";

import { useEffect, useState } from "react";

// The `beforeinstallprompt` event isn't in the DOM lib types yet.
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Install affordance state, contextual by platform:
 * - Chromium/Android: captures `beforeinstallprompt`, exposes `promptInstall()`.
 * - iOS Safari: no native prompt exists → `needsManualInstall` so the UI can
 *   show the "Share → Add to Home Screen" hint instead of a dead button.
 * - Already installed (standalone): everything is false → hide the affordance.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
    if (!deferred) return "unavailable";
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferred(null);
    return choice.outcome;
  }

  const ios = isIos();
  const canPrompt = Boolean(deferred);
  const needsManualInstall = ios && !standalone && !installed;
  // Show the affordance whenever we can install (native prompt or iOS manual),
  // and it isn't already installed / running standalone.
  const available = !standalone && !installed && (canPrompt || needsManualInstall);

  return { available, canPrompt, needsManualInstall, standalone, installed, ios, promptInstall };
}
