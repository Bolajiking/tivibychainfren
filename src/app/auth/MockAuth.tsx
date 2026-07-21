"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/store/session";
import { AuthCard } from "@/app/auth/AuthCard";
import { authReasonFromSearch, authRoleFromSearch, safeNextPath } from "@/lib/auth/redirect";

export function MockAuth() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useSession((s) => s.login);
  const role = authRoleFromSearch(searchParams.get("role"));
  const next = safeNextPath(searchParams.get("next"), "/explore");
  const reason = authReasonFromSearch(searchParams.get("reason"));
  const subject = searchParams.get("subject");

  function signIn() {
    login();
    router.push(next);
  }

  return <AuthCard role={role} reason={reason} subject={subject} onSignIn={signIn} demoNote />;
}
