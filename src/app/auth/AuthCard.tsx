"use client";

import { Mail, Apple, Chrome } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import type { AuthRole } from "@/lib/auth/redirect";

/**
 * Presentational sign-in card — the on-brand shell shared by both auth paths.
 * Mock auth uses the default three buttons (via `onSignIn`); the real Privy path
 * passes its own multi-step action UI through `children`, so the whole sign-in /
 * sign-up flow stays inside our branding (no Privy modal).
 */
export function AuthCard({
  onSignIn,
  role = "viewer",
  busy = false,
  demoNote = false,
  error,
  children,
}: {
  onSignIn?: () => void;
  role?: AuthRole;
  busy?: boolean;
  demoNote?: boolean;
  error?: string | null;
  children?: React.ReactNode;
}) {
  const copy =
    role === "creator"
      ? {
          title: "Claim your TVinBio channel",
          body: "Sign in to set up your channel, stream, store, and share-ready link in one flow.",
        }
      : {
          title: "Welcome to TVinBio",
          body: "Sign in to subscribe, tip, shop, and join the channels you love. It only takes a few seconds.",
        };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px]"
        style={{ background: "radial-gradient(70% 100% at 50% 0%,rgba(0,145,255,.18),transparent 60%)" }} />
      <div className="relative w-full max-w-[360px]">
        <Logo size={44} href="" />
        <h1 className="font-display mt-6 text-[27px] font-semibold leading-[1.05] tracking-[-0.02em]">
          {copy.title}
        </h1>
        <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
          {copy.body}
        </p>

        <div className="mt-7 flex flex-col gap-2.5">
          {children ?? (
            <>
              <Button size="lg" className="w-full" onClick={onSignIn} disabled={busy}>
                <Mail className="size-[18px]" /> Continue with email
              </Button>
              <Button size="lg" variant="ghost" className="w-full" onClick={onSignIn} disabled={busy}>
                <Apple className="size-[18px]" /> Continue with Apple
              </Button>
              <Button size="lg" variant="ghost" className="w-full" onClick={onSignIn} disabled={busy}>
                <Chrome className="size-[18px]" /> Continue with Google
              </Button>
            </>
          )}
        </div>

        {error && (
          <div className="mt-3.5 rounded-[12px] border border-live/30 bg-live/[0.08] px-3.5 py-2.5 text-[12px] font-medium text-live">
            {error}
          </div>
        )}

        <div className="mt-6 text-center text-[11px] text-ghost">
          {demoNote && "Demo mode — sign-in is simulated. "}
          By continuing you agree to the Terms.
        </div>
      </div>
    </div>
  );
}
