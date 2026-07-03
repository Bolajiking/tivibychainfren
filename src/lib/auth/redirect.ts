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

export function buildAuthHref({
  role = "viewer",
  next,
}: {
  role?: AuthRole;
  next?: string | null;
} = {}): string {
  const params = new URLSearchParams({
    role,
    next: safeNextPath(next, defaultNext),
  });
  return `/auth?${params.toString()}`;
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
