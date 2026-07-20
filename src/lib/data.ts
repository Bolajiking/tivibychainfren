/**
 * Single data-access surface for the whole app.
 * When Supabase env is set it reads real tables; otherwise it falls back to the
 * in-memory seed (mock mode). Call sites never change — the seam lives here.
 */
import * as seed from "@/lib/mock/seed";
import { getSupabase } from "@/lib/db/client";
import {
  rowToCreator, rowToStream, rowToVideo, rowToProduct, rowToFeatured,
  rowToChat, rowToVodComment,
  type FeaturedProductRow,
  type ProductRow,
} from "@/lib/db/map";
import { selectActiveStreamRow, selectCanonicalStreamRow } from "@/lib/stream-selection";
import type {
  Creator, Stream, Video, Product, FeaturedProductWithProduct, ChatMessage,
  VodComment,
} from "@/lib/types";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
type FeaturedProductJoinRow = FeaturedProductRow & { product?: ProductRow | null };

/**
 * Short-TTL memo + in-flight dedupe for hot list reads (landing, explore).
 * These surfaces tolerate seconds of staleness — live status is re-checked
 * client-side — while each saved round-trip is a full Supabase RTT.
 */
const HOT_TTL_MS = 10_000;
const hotCache = new Map<string, { at: number; value: Promise<unknown> }>();
function memoHot<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = hotCache.get(key);
  if (hit && Date.now() - hit.at < HOT_TTL_MS) return hit.value as Promise<T>;
  const value = fetcher().catch((error) => {
    hotCache.delete(key); // never cache a failure
    throw error;
  });
  hotCache.set(key, { at: Date.now(), value });
  return value;
}

// ── Creators ───────────────────────────────────────────────────────
export async function getCreatorByUsername(username: string): Promise<Creator | null> {
  const db = getSupabase();
  if (db) {
    const { data } = await db.from("creators").select("*").eq("username", username.toLowerCase()).maybeSingle();
    return data ? rowToCreator(data) : null;
  }
  return clone(seed.creators.find((c) => c.username === username.toLowerCase()) ?? null);
}
export async function getCreatorById(creatorId: string): Promise<Creator | null> {
  const db = getSupabase();
  if (db) {
    const { data } = await db.from("creators").select("*").eq("creator_id", creatorId.toLowerCase()).maybeSingle();
    return data ? rowToCreator(data) : null;
  }
  return clone(seed.creators.find((c) => c.creatorId === creatorId.toLowerCase()) ?? null);
}
export async function listCreators(): Promise<Creator[]> {
  const db = getSupabase();
  if (db) {
    return memoHot("creators:list", async () => {
      const { data } = await db.from("creators").select("*").order("subscriber_count", { ascending: false });
      return (data ?? []).map(rowToCreator);
    });
  }
  return clone(seed.creators);
}

// ── Streams ────────────────────────────────────────────────────────
export async function getLiveStreams(): Promise<Stream[]> {
  const db = getSupabase();
  if (db) {
    return memoHot("streams:live", async () => {
      const { data } = await db.from("streams").select("*").eq("is_active", true).order("viewer_count", { ascending: false });
      return (data ?? []).map(rowToStream);
    });
  }
  return clone(seed.streams.filter((s) => s.isActive));
}
export async function getCreatorLiveStream(creatorId: string): Promise<Stream | null> {
  const db = getSupabase();
  if (db) {
    const { data } = await db.from("streams").select("*")
      .eq("creator_id", creatorId.toLowerCase()).eq("is_active", true);
    const active = selectActiveStreamRow(data ?? []);
    return active ? rowToStream(active) : null;
  }
  return clone(selectActiveStreamRow(seed.streams.filter((s) => s.creatorId === creatorId)) ?? null);
}
export async function getCreatorStream(creatorId: string): Promise<Stream | null> {
  const db = getSupabase();
  if (db) {
    const { data } = await db.from("streams").select("*")
      .eq("creator_id", creatorId.toLowerCase());
    const stream = selectCanonicalStreamRow(data ?? []);
    return stream ? rowToStream(stream) : null;
  }
  return clone(selectCanonicalStreamRow(seed.streams.filter((s) => s.creatorId === creatorId)) ?? null);
}

// ── Videos ─────────────────────────────────────────────────────────
export async function getVideosByCreator(creatorId: string): Promise<Video[]> {
  const db = getSupabase();
  if (db) {
    // Public surface: only fully-uploaded, transcoded videos. Drafts and
    // processing/failed uploads stay in the creator's dashboard until ready.
    const { data } = await db.from("videos").select("*")
      .eq("creator_id", creatorId.toLowerCase()).eq("disabled", false).eq("status", "ready")
      .order("published_at", { ascending: false });
    return (data ?? []).map(rowToVideo);
  }
  return clone(seed.videos.filter((v) => v.creatorId === creatorId && !v.disabled && v.status === "ready"));
}
export async function getVideoByPlaybackId(id: string): Promise<Video | null> {
  const db = getSupabase();
  if (db) {
    const { data } = await db.from("videos").select("*").eq("playback_id", id).maybeSingle();
    return data ? rowToVideo(data) : null;
  }
  return clone(seed.videos.find((v) => v.playbackId === id) ?? null);
}

// ── Products & live shopping ───────────────────────────────────────
export async function getProductsByChannel(playbackId: string): Promise<Product[]> {
  const db = getSupabase();
  if (db) {
    const { data } = await db.from("products").select("*")
      .eq("playback_id", playbackId).neq("status", "archived").order("created_at");
    return (data ?? []).map(rowToProduct);
  }
  return clone(seed.products.filter((p) => p.playbackId === playbackId && p.status !== "archived"));
}
export async function getProductsByCreator(creatorId: string): Promise<Product[]> {
  const db = getSupabase();
  if (db) {
    const { data } = await db.from("products").select("*")
      .eq("creator_id", creatorId.toLowerCase()).neq("status", "archived").order("created_at");
    return (data ?? []).map(rowToProduct);
  }
  return clone(seed.products.filter((p) => p.creatorId === creatorId && p.status !== "archived"));
}
export async function getFeaturedProducts(playbackId: string): Promise<FeaturedProductWithProduct[]> {
  const db = getSupabase();
  if (db) {
    const { data } = await db.from("featured_products")
      .select("*, product:products(*)").eq("playback_id", playbackId).order("sort_order");
    return (data ?? [])
      .filter((r: FeaturedProductJoinRow): r is FeaturedProductJoinRow & { product: ProductRow } => Boolean(r.product))
      .map((r) => ({ ...rowToFeatured(r), product: rowToProduct(r.product) }));
  }
  const rows = seed.featured.filter((f) => f.playbackId === playbackId);
  return clone(
    rows
      .map((f) => {
        const product = seed.products.find((p) => p.id === f.productId);
        return product ? { ...f, product } : null;
      })
      .filter(Boolean) as FeaturedProductWithProduct[],
  );
}

// ── Chat ───────────────────────────────────────────────────────────
export async function getChatMessages(streamId: string): Promise<ChatMessage[]> {
  const db = getSupabase();
  if (db) {
    const { data } = await db.from("chats").select("*")
      .eq("stream_id", streamId).order("created_at").limit(200);
    return (data ?? []).map(rowToChat);
  }
  return clone(seed.chats.filter((c) => c.streamId === streamId));
}

// ── VOD comments ───────────────────────────────────────────────────
export async function getVideoComments(playbackId: string): Promise<VodComment[]> {
  const db = getSupabase();
  if (db) {
    const { data } = await db.from("video_comments").select("*")
      .eq("playback_id", playbackId).order("created_at", { ascending: true }).limit(200);
    return (data ?? []).map(rowToVodComment);
  }
  return clone(seed.videoComments.filter((c) => c.playbackId === playbackId));
}
