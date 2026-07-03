"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/PrivyProvider";
import { CreatorHydrator } from "@/lib/auth/CreatorHydrator";
import { WalletSheet } from "@/components/wallet/WalletSheet";

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
