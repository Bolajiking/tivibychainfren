import { getSupabase } from "@/lib/db/client";
import {
  rowToChat,
  rowToFeatured,
  rowToProduct,
  rowToStream,
  type ChatRow,
  type FeaturedProductRow,
  type ProductRow,
  type StreamRow,
} from "@/lib/db/map";
import { normalizeChatText } from "@/lib/realtime-state";
import type { RealtimePostgresChangesPayload } from "@supabase/realtime-js";
import type { ChatMessage, FeaturedProductWithProduct, Stream } from "@/lib/types";

type Cleanup = () => void;
type RealtimeRow<T> = T & { [key: string]: unknown };
type DbChangePayload<T> = RealtimePostgresChangesPayload<RealtimeRow<T>>;

type ChatRealtimeEvent =
  | { type: "upsert"; message: ChatMessage }
  | { type: "delete"; id: string };

type FeaturedRealtimeEvent =
  | { type: "upsert"; item: FeaturedProductWithProduct }
  | { type: "delete"; productId: string };

type StreamRealtimeEvent =
  | { type: "upsert"; stream: Stream }
  | { type: "delete"; playbackId: string };

export function subscribeToChatMessages(
  streamId: string,
  onEvent: (event: ChatRealtimeEvent) => void,
): Cleanup {
  const db = getSupabase();
  if (!db || !streamId) return noop;

  const channel = db
    .channel(`tvinbio:chat:${streamId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "chats", filter: `stream_id=eq.${streamId}` },
      (payload: DbChangePayload<ChatRow>) => {
        if (payload.eventType === "DELETE") {
          onEvent({ type: "delete", id: String(payload.old?.id ?? "") });
          return;
        }
        if (payload.new) onEvent({ type: "upsert", message: rowToChat(payload.new) });
      },
    )
    .subscribe();

  return () => {
    void channel.unsubscribe();
  };
}

export async function sendChatMessage({
  streamId,
  sender,
  walletAddress,
  message,
  role = "viewer",
}: {
  streamId: string;
  sender: string;
  walletAddress: string;
  message: string;
  role?: "viewer" | "host" | "mod";
}): Promise<ChatMessage | null> {
  const db = getSupabase();
  const text = normalizeChatText(message);
  if (!db || !streamId || !text) return null;

  const { data, error } = await db
    .from("chats")
    .insert({
      stream_id: streamId,
      sender,
      wallet_address: walletAddress,
      message: text,
      kind: "message",
      role,
      name_color: role === "host" ? "#40acff" : "#9fd3ff",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data ? rowToChat(data) : null;
}

/** Load the most recent chat messages for a stream (creator moderation view). */
export async function fetchRecentChat(streamId: string, limit = 60): Promise<ChatMessage[]> {
  const db = getSupabase();
  if (!db || !streamId) return [];
  const { data, error } = await db
    .from("chats")
    .select("*")
    .eq("stream_id", streamId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(rowToChat).reverse();
}

export function subscribeToFeaturedProducts(
  playbackId: string,
  onEvent: (event: FeaturedRealtimeEvent) => void,
): Cleanup {
  const db = getSupabase();
  if (!db || !playbackId) return noop;

  const channel = db
    .channel(`tvinbio:featured:${playbackId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "featured_products", filter: `playback_id=eq.${playbackId}` },
      (payload: DbChangePayload<FeaturedProductRow>) => {
        void handleFeaturedPayload(payload, onEvent);
      },
    )
    .subscribe();

  return () => {
    void channel.unsubscribe();
  };
}

export function subscribeToStreamStatus(
  playbackId: string,
  onStatus: (stream: Stream) => void,
): Cleanup {
  const db = getSupabase();
  if (!db || !playbackId) return noop;

  const channel = db
    .channel(`tvinbio:stream:${playbackId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "streams", filter: `playback_id=eq.${playbackId}` },
      (payload: DbChangePayload<StreamRow>) => {
        const next = payload.new as Partial<StreamRow>;
        if (next.playback_id && next.creator_id && next.title) onStatus(rowToStream(next as StreamRow));
      },
    )
    .subscribe();

  return () => {
    void channel.unsubscribe();
  };
}

export function subscribeToCreatorStreams(
  creatorId: string,
  onEvent: (event: StreamRealtimeEvent) => void,
): Cleanup {
  const db = getSupabase();
  const id = creatorId.toLowerCase();
  if (!db || !id) return noop;

  const channel = db
    .channel(`tvinbio:creator-streams:${id}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "streams", filter: `creator_id=eq.${id}` },
      (payload: DbChangePayload<StreamRow>) => {
        if (payload.eventType === "DELETE") {
          onEvent({ type: "delete", playbackId: String(payload.old?.playback_id ?? "") });
          return;
        }
        if (payload.new) onEvent({ type: "upsert", stream: rowToStream(payload.new as StreamRow) });
      },
    )
    .subscribe();

  return () => {
    void channel.unsubscribe();
  };
}

async function handleFeaturedPayload(
  payload: DbChangePayload<FeaturedProductRow>,
  onEvent: (event: FeaturedRealtimeEvent) => void,
) {
  if (payload.eventType === "DELETE") {
    onEvent({ type: "delete", productId: String(payload.old?.product_id ?? "") });
    return;
  }
  if (!payload.new) return;

  const db = getSupabase();
  if (!db) return;

  const featured = rowToFeatured(payload.new);
  const { data } = await db.from("products").select("*").eq("id", featured.productId).maybeSingle();
  if (!data) return;

  onEvent({ type: "upsert", item: { ...featured, product: rowToProduct(data as ProductRow) } });
}

/**
 * Live viewer presence for a stream. Watchers `track` themselves; the broadcast
 * desk and channel page subscribe read-only (`track:false`) to show the count
 * without inflating it. The count is the number of currently-tracked watchers —
 * real concurrent viewers, not a static DB number.
 */
export function watchStreamPresence(
  streamId: string,
  onCount: (count: number) => void,
  opts: { track?: boolean } = {},
): Cleanup {
  const db = getSupabase();
  if (!db || !streamId) return noop;

  const key = `u-${Math.random().toString(36).slice(2)}`;
  const channel = db.channel(`tvinbio:presence:${streamId}`, { config: { presence: { key } } });

  channel
    .on("presence", { event: "sync" }, () => {
      onCount(Object.keys(channel.presenceState()).length);
    })
    .subscribe(async (status: string) => {
      if (status === "SUBSCRIBED" && opts.track) {
        await channel.track({ at: Date.now() });
      }
    });

  return () => {
    void channel.unsubscribe();
  };
}

function noop() {}
