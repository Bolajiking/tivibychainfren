import type { ChatMessage, FeaturedProductWithProduct } from "@/lib/types";

const MAX_CHAT_MESSAGES = 200;
const MAX_CHAT_TEXT_LENGTH = 280;

export function mergeChatMessage(
  current: ChatMessage[],
  incoming: ChatMessage,
  limit = MAX_CHAT_MESSAGES,
): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of current) byId.set(message.id, message);
  byId.set(incoming.id, incoming);

  return [...byId.values()]
    .sort((a, b) => timestampMs(a.timestamp) - timestampMs(b.timestamp))
    .slice(-Math.max(1, limit));
}

export function removeChatMessage(current: ChatMessage[], id: string): ChatMessage[] {
  return current.filter((message) => message.id !== id);
}

export function normalizeChatText(value: string, maxLength = MAX_CHAT_TEXT_LENGTH): string | null {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return null;
  return text.slice(0, Math.max(1, maxLength));
}

export function createLocalChatMessage({
  id,
  streamId,
  sender,
  walletAddress,
  message,
  timestamp,
}: {
  id?: string;
  streamId: string;
  sender: string;
  walletAddress: string;
  message: string;
  timestamp?: string;
}): ChatMessage | null {
  const text = normalizeChatText(message);
  if (!text) return null;

  return {
    id: id ?? `local-${Date.now()}`,
    streamId,
    sender,
    walletAddress,
    message: text,
    kind: "message",
    role: "viewer",
    nameColor: "#9fd3ff",
    timestamp: timestamp ?? new Date().toISOString(),
  };
}

export function upsertFeaturedProduct(
  current: FeaturedProductWithProduct[],
  incoming: FeaturedProductWithProduct,
): FeaturedProductWithProduct[] {
  const byProductId = new Map<string, FeaturedProductWithProduct>();
  for (const item of current) byProductId.set(item.productId, item);
  byProductId.set(incoming.productId, incoming);
  return sortFeatured([...byProductId.values()]);
}

export function removeFeaturedProduct(
  current: FeaturedProductWithProduct[],
  productId: string,
): FeaturedProductWithProduct[] {
  return sortFeatured(current.filter((item) => item.productId !== productId));
}

export function selectFeaturedProduct(items: FeaturedProductWithProduct[]): FeaturedProductWithProduct | null {
  return items.find((item) => item.isHighlighted) ?? items[0] ?? null;
}

function sortFeatured(items: FeaturedProductWithProduct[]): FeaturedProductWithProduct[] {
  return [...items].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.product.name.localeCompare(b.product.name);
  });
}

function timestampMs(value: string): number {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}
