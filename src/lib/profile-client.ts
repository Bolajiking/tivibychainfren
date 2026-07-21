import { getAccessToken } from "@/lib/auth/privy-bridge";
import { getSupabase } from "@/lib/db/client";
import type { CreatorProfilePayload } from "@/lib/types";

export async function getMyCreatorProfile(walletAddress?: string): Promise<CreatorProfilePayload | null> {
  const response = await profileRequest("GET", undefined, walletAddress);
  if (response.status === 404) return null;
  return readProfileResponse(response);
}

export async function provisionCreatorProfile(
  input: {
    displayName: string;
    username: string;
    bio?: string;
    category?: string;
    avatarColor?: string;
    avatarUrl?: string | null;
    /** Tier-1 brand accent picked during onboarding (framework §8). */
    accentColor?: string;
    themeVariant?: "midnight" | "dim" | "voltage";
    socialLinks?: { kind: string; url: string }[];
  },
  walletAddress?: string,
): Promise<CreatorProfilePayload> {
  return readProfileResponse(await profileRequest("POST", input, walletAddress));
}

/**
 * Upload channel art (avatar or stage header) for the signed-in creator; returns
 * the stored public URL. `field` defaults to the avatar.
 */
export async function uploadChannelArt(
  file: File,
  walletAddress?: string,
  field: "avatar" | "header" = "avatar",
): Promise<string | null> {
  const token = await getAccessToken();
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (walletAddress) headers.set("x-tvinbio-wallet", walletAddress.toLowerCase());

  const form = new FormData();
  form.append("file", file);
  form.append("field", field);

  const res = await fetch("/api/creator/avatar", { method: "POST", headers, body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error ?? "image_upload_failed");
  }
  return (data?.url as string | null) ?? (data?.avatarUrl as string | null) ?? null;
}

/**
 * Persist a free follow to the database and return the creator's updated
 * follower count. Best-effort: the caller keeps its optimistic local state and
 * ignores a null (network hiccup, mock mode) — the count reconciles on reload.
 */
export async function followCreator(username: string, walletAddress?: string): Promise<number | null> {
  const token = await getAccessToken();
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (walletAddress) headers.set("x-tvinbio-wallet", walletAddress.toLowerCase());

  try {
    const res = await fetch(`/api/channels/${encodeURIComponent(username)}/follow`, {
      method: "POST",
      headers,
      body: JSON.stringify({ walletAddress }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.ok === false) return null;
    return typeof data?.subscriberCount === "number" ? data.subscriberCount : null;
  } catch {
    return null;
  }
}

/** Read-only check: has this wallet already redeemed an invite (creator access)? */
export async function checkCreatorAccess(walletAddress: string): Promise<boolean> {
  const db = getSupabase();
  if (!db) return false;
  const { data, error } = await db.rpc("has_creator_access", { p_creator_id: walletAddress.toLowerCase() });
  return !error && data === true;
}

/** Redeem a creator invite code for the signed-in wallet (invite-only gate). */
export async function redeemInvite(code: string, walletAddress?: string): Promise<void> {
  const token = await getAccessToken();
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (walletAddress) headers.set("x-tvinbio-wallet", walletAddress.toLowerCase());

  const res = await fetch("/api/creator/redeem-invite", {
    method: "POST",
    headers,
    body: JSON.stringify({ code, walletAddress }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error ?? "redeem_failed");
  }
}

async function profileRequest(method: "GET" | "POST", body?: unknown, walletAddress?: string) {
  const token = await getAccessToken();
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (walletAddress) headers.set("x-tvinbio-wallet", walletAddress.toLowerCase());

  return fetch("/api/profile", {
    method,
    headers,
    body: method === "POST" ? JSON.stringify({ ...(body && typeof body === "object" ? body : {}), walletAddress }) : undefined,
  });
}

async function readProfileResponse(response: Response): Promise<CreatorProfilePayload> {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error ?? "profile_request_failed");
  }
  return data as CreatorProfilePayload;
}
