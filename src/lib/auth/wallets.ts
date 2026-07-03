import { normalizeEvmAddress } from "@/lib/input-normalizers";

/**
 * Every EVM wallet address linked to a Privy user, embedded wallet first.
 *
 * The client (`SessionBridge`) treats the embedded wallet (`walletClientType
 * === "privy"`) as the account's primary identity, falling back to any other
 * linked wallet only when no embedded wallet exists yet. Every owner-scoped
 * DB row (`creators.creator_id`, `products.creator_id`, ...) is keyed by
 * `walletAddresses[0]` from this function (see `requirePrivyUser`), so it
 * must resolve to the SAME address the client considers primary — otherwise
 * a creator who links a second (external) wallet could see their own rows
 * become invisible depending on incidental object-traversal order. A plain
 * recursive walk has no such guarantee; this makes the priority explicit and
 * mirrors the client 1:1.
 */
export function extractEvmWalletAddressesFromUnknown(value: unknown): string[] {
  const found = new Set<string>();
  let embedded: string | null = null;
  walk(value, found, (address, record) => {
    if (embedded === null && isEmbeddedWalletRecord(record)) embedded = address;
  });

  const all = [...found];
  if (embedded !== null && all.includes(embedded)) {
    return [embedded, ...all.filter((address) => address !== embedded)];
  }
  return all;
}

function isEmbeddedWalletRecord(record: Record<string, unknown>): boolean {
  return record.wallet_client_type === "privy" || record.connector_type === "embedded";
}

function walk(
  value: unknown,
  found: Set<string>,
  onAddress: (address: string, record: Record<string, unknown>) => void,
) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, found, onAddress);
    return;
  }

  const record = value as Record<string, unknown>;
  const address = normalizeEvmAddress(record.address);
  if (address) {
    found.add(address);
    onAddress(address, record);
  }

  for (const child of Object.values(record)) {
    if (child && typeof child === "object") walk(child, found, onAddress);
  }
}
