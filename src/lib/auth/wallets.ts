import { normalizeEvmAddress } from "@/lib/input-normalizers";

export function extractEvmWalletAddressesFromUnknown(value: unknown): string[] {
  const found = new Set<string>();
  walk(value, found);
  return [...found];
}

function walk(value: unknown, found: Set<string>) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, found);
    return;
  }

  const record = value as Record<string, unknown>;
  const address = normalizeEvmAddress(record.address);
  if (address) found.add(address);

  for (const child of Object.values(record)) {
    if (child && typeof child === "object") walk(child, found);
  }
}
