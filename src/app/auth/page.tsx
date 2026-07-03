"use client";

import { Suspense } from "react";
import { config } from "@/lib/config";
import { AuthCard } from "@/app/auth/AuthCard";
import { MockAuth } from "@/app/auth/MockAuth";
import { PrivyAuth } from "@/app/auth/PrivyAuth";

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthCard onSignIn={() => {}} busy />}>
      <AuthEntry />
    </Suspense>
  );
}

function AuthEntry() {
  // Privy wraps the tree only when configured; pick the matching entry so neither
  // path calls hooks from a provider that isn't mounted.
  return config.privy.enabled ? <PrivyAuth /> : <MockAuth />;
}
