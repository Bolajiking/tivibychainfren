"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { base } from "viem/chains";
import { config } from "@/lib/config";
import { SessionBridge } from "@/lib/auth/SessionBridge";
import { PrivyBridge } from "@/lib/auth/PrivyBridge";

/**
 * Wraps the app in Privy when configured. Email/social login silently provisions
 * an embedded Ethereum wallet — the user never sees "crypto." Base is the only
 * chain. When Privy isn't configured we render children untouched (mock mode).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!config.privy.enabled) return <>{children}</>;

  return (
    <PrivyProvider
      appId={config.privy.appId}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#40ACFF",
          logo: undefined,
          walletChainType: "ethereum-only",
        },
        loginMethods: ["email", "google", "apple", "wallet"],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          showWalletUIs: false,
        },
        defaultChain: base,
        supportedChains: [base],
      }}
    >
      <SessionBridge />
      <PrivyBridge />
      {children}
    </PrivyProvider>
  );
}
