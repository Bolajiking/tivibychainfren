"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { useSession } from "@/lib/store/session";
import { useHydrated } from "@/lib/store/useHydrated";
import { buildAuthHref } from "@/lib/auth/redirect";

/**
 * Deep-link target for "open my wallet". Waits for the persisted session to
 * hydrate before deciding, so a signed-in user landing here directly is never
 * bounced through auth on a hydration race. Opens the wallet sheet and lands on
 * explore; signed-out users go through auth and come back.
 */
export default function WalletPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const openWallet = useSession((s) => s.openWallet);
  const done = useRef(false);

  useEffect(() => {
    if (!hydrated || done.current) return;
    done.current = true;
    if (!useSession.getState().user) {
      router.replace(buildAuthHref({ role: "viewer", next: "/wallet", reason: "wallet" }));
      return;
    }
    openWallet();
    router.replace("/explore");
  }, [hydrated, openWallet, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 text-center">
      <div>
        <Logo size={42} href="" />
        <div className="mt-4 text-[12px] text-muted">Opening your balance…</div>
      </div>
    </main>
  );
}
