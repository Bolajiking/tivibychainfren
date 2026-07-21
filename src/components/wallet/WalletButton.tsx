"use client";

import { useRouter } from "next/navigation";
import { User, Wallet } from "lucide-react";
import { useSession } from "@/lib/store/session";
import { useHydrated } from "@/lib/store/useHydrated";
import { buildAuthHref } from "@/lib/auth/redirect";

/**
 * Dedicated wallet entry for the nav. Signed-out users route to sign in.
 *  - `rail`: compact icon (84px icon rail)
 *  - `row` : full-width row showing the live balance (wide sidebar)
 *  - `pill`: blue-tinted balance pill (mobile top bar)
 */
export function WalletButton({ variant }: { variant: "rail" | "row" | "pill" }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const user = useSession((s) => s.user);
  const openWallet = useSession((s) => s.openWallet);

  function onClick() {
    // Read fresh state so a click right after hydration never mis-routes.
    if (!useSession.getState().user) {
      router.push(buildAuthHref({ role: "viewer", next: "/wallet" }));
      return;
    }
    openWallet();
  }

  if (variant === "rail") {
    return (
      <button onClick={onClick} aria-label="Wallet" className="flex size-10 items-center justify-center rounded-full border-[1.5px] border-white/20 text-muted hover:text-white">
        <Wallet className="size-[17px]" />
      </button>
    );
  }

  if (variant === "pill") {
    return (
      <button onClick={onClick} aria-label="Wallet" className="flex items-center gap-2 rounded-full border border-beam/30 bg-beam/[0.12] py-1 pl-1 pr-3">
        <span className="flex size-[26px] items-center justify-center rounded-full bg-beam/25 text-beam-soft"><Wallet className="size-[14px]" /></span>
        <span className={`text-[12.5px] font-semibold text-white ${hydrated && user ? "receipt" : ""}`}>{hydrated && user ? `$${user.balanceUsd.toFixed(2)}` : "Wallet"}</span>
      </button>
    );
  }

  // row — don't flash "Sign in" for a returning user before hydration settles.
  return (
    <button onClick={onClick} className="flex h-10 items-center justify-between gap-3 rounded-[11px] bg-white/[0.06] px-[11px] text-[12px] font-semibold text-ink-dim transition hover:bg-white/[0.09] hover:text-white">
      {!hydrated ? (
        <span className="flex items-center gap-2.5"><Wallet className="size-[17px]" /> Wallet</span>
      ) : user ? (
        <>
          <span className="flex items-center gap-2.5"><Wallet className="size-[17px]" /> Wallet</span>
          <span className="text-white">${user.balanceUsd.toFixed(2)}</span>
        </>
      ) : (
        <span className="flex items-center gap-2.5"><User className="size-[17px]" /> Sign in</span>
      )}
    </button>
  );
}
