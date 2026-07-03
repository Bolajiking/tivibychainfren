import type { Stream, Video } from "@/lib/types";

/** Normalize an EVM address to the canonical lowercase ownership key. */
export const normalizeAddress = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
export const isEvmAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v.trim());
const sameAddress = (a?: string, b?: string) =>
  !!a && !!b && normalizeAddress(a) === normalizeAddress(b);
export const matchesAny = (list: string[], candidate?: string) =>
  !!candidate && list.some((a) => sameAddress(a, candidate));

// ── The access decision ────────────────────────────────────────────
// Access if ANY: is creator ∨ in paidUsers[] ∨ valid subscription.
export function hasAccess(opts: {
  resource: Pick<Stream | Video, "creatorId" | "viewMode" | "paidUsers" | "playbackId">;
  wallets: string[];
}): boolean {
  const { resource, wallets } = opts;
  if (resource.viewMode === "free") return true;
  if (matchesAny([resource.creatorId], wallets[0]) || matchesAny(wallets, resource.creatorId)) return true;
  if (resource.paidUsers.some((p) => matchesAny(wallets, p))) return true;
  return false;
}
