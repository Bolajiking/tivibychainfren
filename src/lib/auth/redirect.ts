export type AuthRole = "viewer" | "creator";

const defaultNext = "/explore";

export function authRoleFromSearch(value: string | null | undefined): AuthRole {
  return value === "creator" ? "creator" : "viewer";
}

export function safeNextPath(value: string | null | undefined, fallback = defaultNext): string {
  const safeFallback = isSafeInternalPath(fallback) ? fallback : defaultNext;
  if (!value || !isSafeInternalPath(value)) return safeFallback;
  return value;
}

/**
 * A short key for *why* the auth wall appeared, so the card can speak to the
 * exact action the fan just tried (follow, tip, buy…) instead of a generic
 * welcome. `subject` carries the creator's name where it sharpens the copy.
 */
export type AuthReason =
  | "follow"
  | "tip"
  | "buy"
  | "unlock"
  | "comment"
  | "save"
  | "wallet"
  | "golive"
  | "claim";

export function buildAuthHref({
  role = "viewer",
  next,
  reason,
  subject,
}: {
  role?: AuthRole;
  next?: string | null;
  reason?: AuthReason | null;
  subject?: string | null;
} = {}): string {
  const params = new URLSearchParams({
    role,
    next: safeNextPath(next, defaultNext),
  });
  if (reason) params.set("reason", reason);
  // Bound the subject so a crafted name can't bloat the URL.
  if (subject) params.set("subject", subject.slice(0, 48));
  return `/auth?${params.toString()}`;
}

export function authReasonFromSearch(value: string | null | undefined): AuthReason | null {
  const reasons: AuthReason[] = ["follow", "tip", "buy", "unlock", "comment", "save", "wallet", "golive", "claim"];
  return reasons.includes(value as AuthReason) ? (value as AuthReason) : null;
}

function isSafeInternalPath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//")) return false;

  try {
    const parsed = new URL(value, "https://tvin.bio");
    return parsed.origin === "https://tvin.bio" && parsed.pathname.startsWith("/");
  } catch {
    return false;
  }
}
