"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePrivy, useLoginWithEmail, useLoginWithOAuth } from "@privy-io/react-auth";
import { Mail, Apple, Chrome, ArrowLeft, Loader2 } from "lucide-react";
import { AuthCard } from "@/app/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { authRoleFromSearch, safeNextPath } from "@/lib/auth/redirect";

type View = "methods" | "email" | "code";

const FIELD =
  "h-[50px] rounded-[14px] border border-white/12 bg-white/[0.05] px-4 text-[14px] text-white placeholder:text-faint focus:border-blue/60 focus:outline-none";

/**
 * Real auth, our UI. Privy stays the backend but we drive it headlessly so the
 * entire sign-in / sign-up flow lives inside the branded AuthCard — no Privy
 * modal ever opens:
 *   - email → Privy `sendCode` → branded OTP step → `loginWithCode`
 *   - Apple / Google → Privy `initOAuth` (full-page redirect, no modal)
 * On success Privy authenticates and the `authenticated` effect forwards to `next`.
 */
export function PrivyAuth() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, authenticated } = usePrivy();
  const role = authRoleFromSearch(searchParams.get("role"));
  const next = safeNextPath(searchParams.get("next"), "/explore");

  const [view, setView] = useState<View>("methods");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { sendCode, loginWithCode } = useLoginWithEmail({
    onComplete: () => router.replace(next),
    onError: () => {
      setError("Something went wrong signing you in. Please try again.");
      setBusy(false);
    },
  });
  const { initOAuth } = useLoginWithOAuth({
    onError: () => {
      setError("Couldn't continue with that provider. Please try again.");
      setBusy(false);
    },
  });

  // Returning visitor / already-authenticated → skip the wall.
  useEffect(() => {
    if (ready && authenticated) router.replace(next);
  }, [ready, authenticated, next, router]);

  async function onSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sendCode({ email: email.trim() });
      setCode("");
      setView("code");
    } catch {
      setError("We couldn't send a code to that email. Check it and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < 6) return;
    setBusy(true);
    setError(null);
    try {
      await loginWithCode({ code });
      // onComplete handles the redirect.
    } catch {
      setError("That code didn't match. Check it and try again.");
      setBusy(false);
    }
  }

  async function onOAuth(provider: "google" | "apple") {
    setBusy(true);
    setError(null);
    try {
      await initOAuth({ provider }); // full-page redirect — no Privy modal
    } catch {
      setError("Couldn't start that sign-in. Please try again.");
      setBusy(false);
    }
  }

  return (
    <AuthCard role={role} busy={!ready} error={error}>
      {view === "methods" && (
        <>
          <Button size="lg" className="w-full" onClick={() => { setError(null); setView("email"); }} disabled={!ready || busy}>
            <Mail className="size-[18px]" /> Continue with email
          </Button>
          <Button size="lg" variant="ghost" className="w-full" onClick={() => onOAuth("apple")} disabled={!ready || busy}>
            <Apple className="size-[18px]" /> Continue with Apple
          </Button>
          <Button size="lg" variant="ghost" className="w-full" onClick={() => onOAuth("google")} disabled={!ready || busy}>
            <Chrome className="size-[18px]" /> Continue with Google
          </Button>
        </>
      )}

      {view === "email" && (
        <form onSubmit={onSendCode} className="flex flex-col gap-2.5">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className={FIELD}
          />
          <Button size="lg" className="w-full" type="submit" disabled={busy || !email.trim()}>
            {busy ? <Loader2 className="size-[18px] animate-spin" /> : "Send code"}
          </Button>
          <BackLink label="Back to all options" onClick={() => { setView("methods"); setError(null); }} />
        </form>
      )}

      {view === "code" && (
        <form onSubmit={onVerify} className="flex flex-col gap-2.5">
          <p className="text-[12.5px] leading-relaxed text-muted">
            Enter the 6-digit code we sent to <span className="font-medium text-white">{email}</span>.
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
            className={`${FIELD} text-center text-[18px] font-semibold tracking-[0.4em] placeholder:tracking-[0.2em]`}
          />
          <Button size="lg" className="w-full" type="submit" disabled={busy || code.length < 6}>
            {busy ? <Loader2 className="size-[18px] animate-spin" /> : "Verify & continue"}
          </Button>
          <BackLink label="Use a different email" onClick={() => { setView("email"); setCode(""); setError(null); }} />
        </form>
      )}
    </AuthCard>
  );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 inline-flex items-center justify-center gap-1.5 text-[12px] font-medium text-muted transition-colors hover:text-white"
    >
      <ArrowLeft className="size-3.5" /> {label}
    </button>
  );
}
