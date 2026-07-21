"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { config } from "@/lib/config";
import { useSession } from "@/lib/store/session";
import { buildAuthHref, type AuthReason, type AuthRole } from "@/lib/auth/redirect";

export function useAuthIntent(defaultRole: AuthRole = "viewer") {
  const router = useRouter();
  const pathname = usePathname();
  const user = useSession((s) => s.user);
  const login = useSession((s) => s.login);

  // `reason` + `subject` let the auth wall speak to the exact action that
  // triggered it ("To follow Ada, set up an account"), surfaced by AuthCard.
  const requireAuth = useCallback(
    (options: { role?: AuthRole; next?: string; reason?: AuthReason; subject?: string } = {}) => {
      if (useSession.getState().user ?? user) return true;

      const role = options.role ?? defaultRole;
      const next = options.next ?? currentPath(pathname);
      if (config.privy.enabled) {
        router.push(buildAuthHref({ role, next, reason: options.reason, subject: options.subject }));
        return false;
      }

      login("You");
      return true;
    },
    [defaultRole, login, pathname, router, user],
  );

  const getAuthedUser = useCallback(() => {
    return useSession.getState().user ?? user;
  }, [user]);

  return { user, requireAuth, getAuthedUser };
}

function currentPath(pathname: string) {
  if (typeof window === "undefined") return pathname;
  return `${window.location.pathname}${window.location.search}`;
}
