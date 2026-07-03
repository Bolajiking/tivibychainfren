"use client";

import { useEffect, useRef } from "react";
import { usePrivy, useWallets, useCreateWallet } from "@privy-io/react-auth";
import type { LinkedAccountWithMetadata } from "@privy-io/react-auth";
import { useSession } from "@/lib/store/session";
import { getUsdcBalance } from "@/lib/payments/balance";
import { normalizeAddress } from "@/lib/access";

/**
 * Syncs the Privy session into our zustand store, so the rest of the app keeps
 * reading `useSession()` and never imports Privy directly.
 *
 * Identity = the linked-wallet set (lowercased). The primary wallet is the
 * embedded Privy wallet. Right after an email/social sign-in the embedded wallet
 * may not be in `useWallets()` yet, so we also read it off the user object
 * (`user.wallet`), and if the account has no embedded wallet at all we provision
 * one. Without this the store never gets a `user` and the app looks logged-out
 * even though Privy is authenticated. Balance is the real on-chain USDC balance.
 * Renders nothing.
 */
export function SessionBridge() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const setUser = useSession((s) => s.setUser);
  const setBalance = useSession((s) => s.setBalance);
  const logout = useSession((s) => s.logout);
  const provisioning = useRef(false);

  useEffect(() => {
    if (!ready) return;

    if (!authenticated || !user) {
      provisioning.current = false;
      logout();
      return;
    }

    // Collect every linked wallet address (access checks test the full set).
    const linked = (user.linkedAccounts ?? [])
      .filter(isWalletAccount)
      .map((a) => normalizeAddress(a.address));
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    // `useWallets()` can lag right after sign-in; the embedded wallet is also on
    // the user object the moment it exists.
    const fromUser = typeof user.wallet?.address === "string" ? user.wallet.address : undefined;
    const primary = normalizeAddress(embedded?.address ?? fromUser ?? linked[0] ?? "");

    if (!primary) {
      // Authenticated but no embedded wallet yet — provision one (once). When it
      // lands, Privy updates `user`/`wallets` and this effect re-runs and syncs.
      if (!provisioning.current) {
        provisioning.current = true;
        createWallet().catch(() => {
          provisioning.current = false;
        });
      }
      return;
    }
    provisioning.current = false;

    const all = [...new Set([primary, ...linked].filter(Boolean))];
    const displayName =
      (user.email?.address as string | undefined) ??
      (user.google?.email as string | undefined) ??
      `${primary.slice(0, 6)}…${primary.slice(-4)}`;

    setUser({ walletAddress: primary, walletAddresses: all, displayName, balanceUsd: 0 });

    let alive = true;
    getUsdcBalance(primary).then((b) => { if (alive) setBalance(b); });
    return () => { alive = false; };
  }, [ready, authenticated, user, wallets, setUser, setBalance, logout, createWallet]);

  return null;
}

function isWalletAccount(account: LinkedAccountWithMetadata): account is LinkedAccountWithMetadata & { type: "wallet"; address: string } {
  return account.type === "wallet" && typeof account.address === "string" && account.address.length > 0;
}
