"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/store/session";
import { AuthCard } from "@/app/auth/AuthCard";
import { authRoleFromSearch, safeNextPath } from "@/lib/auth/redirect";

export function MockAuth() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useSession((s) => s.login);
  const role = authRoleFromSearch(searchParams.get("role"));
  const next = safeNextPath(searchParams.get("next"), "/explore");

  function signIn() {
    login();
    router.push(next);
  }

  return <AuthCard role={role} onSignIn={signIn} demoNote />;
}
