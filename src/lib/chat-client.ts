import { getAccessToken } from "@/lib/auth/privy-bridge";

/**
 * Creator-side chat moderation. Deletes go through the owner-scoped server route
 * (the `chats` RLS is permissive for v1), and the realtime DELETE event clears
 * the message from every connected viewer.
 */
export async function moderateDeleteMessage(id: string, walletAddress?: string): Promise<void> {
  const token = await getAccessToken();
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (walletAddress) headers.set("x-tvinbio-wallet", walletAddress.toLowerCase());

  const res = await fetch(`/api/chats/${encodeURIComponent(id)}`, { method: "DELETE", headers });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error ?? "moderate_failed");
  }
}
