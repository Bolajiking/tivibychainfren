"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/PrivyProvider";
import { CreatorHydrator } from "@/lib/auth/CreatorHydrator";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";

// The wallet pulls in viem — load it lazily so it never weighs down first
// paint of any page. It renders nothing until the user opens the wallet.
const WalletSheet = dynamic(
  () => import("@/components/wallet/WalletSheet").then((m) => m.WalletSheet),
  { ssr: false },
);

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <CreatorHydrator />
        <ServiceWorkerRegistrar />
        {children}
        <WalletSheet />
      </AuthProvider>
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: "#0c0c0f",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#fff",
            borderRadius: "14px",
          },
        }}
      />
    </QueryClientProvider>
  );
}
