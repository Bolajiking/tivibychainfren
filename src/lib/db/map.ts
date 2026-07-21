/**
 * DB row (snake_case) ↔ app domain type (camelCase) mappers.
 * One place that knows the column names; the rest of the app stays clean.
 */
import type {
  Creator, Stream, Video, Product, FeaturedProduct, ChatMessage,
  CreatorNotification, Order, ViewMode, ProductType, ProductStatus,
  OrderStatus, ChatKind, NotificationType, VodComment,
} from "@/lib/types";
import { isThemeVariant } from "@/lib/creator-theme";

type DbNumber = number | string | null | undefined;
type DbText = string | null | undefined;

interface CreatorRow {
  creator_id: string;
  username: string;
  display_name: string;
  bio?: DbText;
  avatar_color?: DbText;
  avatar_url?: DbText;
  header_url?: DbText;
  accent_color?: DbText;
  theme_variant?: DbText;
  subscriber_count?: DbNumber;
  social_links?: Creator["socialLinks"] | null;
  category?: DbText;
}

export interface StreamRow {
  playback_id: string;
  creator_id: string;
  title: string;
  description?: DbText;
  view_mode: ViewMode;
  amount?: DbNumber;
  is_active?: boolean | null;
  viewer_count?: DbNumber;
  thumb_color?: DbText;
  started_at?: DbText;
  paid_users?: string[] | null;
  donation_presets?: DbNumber[] | null;
  record?: boolean | null;
  livepeer_id?: DbText;
  livepeer_playback_id?: DbText;
}

interface VideoRow {
  playback_id: string;
  creator_id: string;
  asset_name?: DbText;
  title: string;
  view_mode: ViewMode;
  amount?: DbNumber;
  views?: DbNumber;
  duration_sec?: DbNumber;
  published_at: string;
  thumb_color?: DbText;
  thumbnail_url?: DbText;
  paid_users?: string[] | null;
  disabled?: boolean | null;
  status: Video["status"];
  livepeer_id?: DbText;
  livepeer_playback_id?: DbText;
}

export interface ProductRow {
  id: string;
  playback_id: string;
  creator_id: string;
  name: string;
  description?: DbText;
  price?: DbNumber;
  image_color?: DbText;
  image_url?: DbText;
  product_type: ProductType;
  inventory?: DbNumber;
  subs_only?: boolean | null;
  status: ProductStatus;
}

export interface FeaturedProductRow {
  playback_id: string;
  product_id: string;
  creator_id: string;
  sort_order?: DbNumber;
  is_highlighted?: boolean | null;
}

export interface ChatRow {
  id: string;
  stream_id: string;
  sender: string;
  wallet_address: string;
  message: string;
  kind: ChatKind;
  amount?: DbNumber;
  role?: ChatMessage["role"] | null;
  name_color?: DbText;
  created_at: string;
}

export interface VodCommentRow {
  id: string;
  playback_id: string;
  wallet_address: string;
  sender: string;
  message: string;
  created_at: string;
}

interface NotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  wallet_address?: DbText;
  tx_hash?: DbText;
  amount?: DbNumber;
  created_at: string;
  read?: boolean | null;
}

interface OrderRow {
  id: string;
  product_id: string;
  buyer_address: string;
  seller_address: string;
  amount?: DbNumber;
  tx_hash?: DbText;
  status: OrderStatus;
  product_snapshot?: Order["productSnapshot"] | null;
  created_at: string;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export function rowToCreator(r: CreatorRow): Creator {
  return {
    creatorId: r.creator_id,
    username: r.username,
    displayName: r.display_name,
    bio: r.bio ?? undefined,
    avatarColor: r.avatar_color ?? undefined,
    avatarUrl: r.avatar_url ?? undefined,
    headerUrl: r.header_url ?? undefined,
    accentColor: r.accent_color ?? undefined,
    themeVariant: isThemeVariant(r.theme_variant) ? r.theme_variant : undefined,
    subscriberCount: num(r.subscriber_count),
    socialLinks: Array.isArray(r.social_links) ? r.social_links : [],
    category: r.category ?? undefined,
  };
}

export function rowToStream(r: StreamRow): Stream {
  return {
    playbackId: r.playback_id,
    creatorId: r.creator_id,
    title: r.title,
    description: r.description ?? undefined,
    viewMode: r.view_mode as ViewMode,
    amount: num(r.amount),
    isActive: !!r.is_active,
    viewerCount: num(r.viewer_count),
    thumbColor: r.thumb_color ?? "#1c2230",
    startedAt: r.started_at ?? undefined,
    paidUsers: r.paid_users ?? [],
    donationPresets: (r.donation_presets ?? []).map(num),
    record: !!r.record,
    livepeerId: r.livepeer_id ?? undefined,
    livepeerPlaybackId: r.livepeer_playback_id ?? undefined,
  };
}

export function rowToVideo(r: VideoRow): Video {
  return {
    playbackId: r.playback_id,
    creatorId: r.creator_id,
    assetName: r.asset_name ?? "",
    title: r.title,
    viewMode: r.view_mode as ViewMode,
    amount: num(r.amount),
    views: num(r.views),
    durationSec: num(r.duration_sec),
    publishedAt: r.published_at,
    thumbColor: r.thumb_color ?? "#1c2230",
    thumbnailUrl: r.thumbnail_url ?? undefined,
    paidUsers: r.paid_users ?? [],
    disabled: r.disabled ?? false,
    status: r.status as Video["status"],
    livepeerId: r.livepeer_id ?? undefined,
    livepeerPlaybackId: r.livepeer_playback_id ?? undefined,
  };
}

export function rowToVodComment(r: VodCommentRow): VodComment {
  return {
    id: String(r.id),
    playbackId: r.playback_id,
    walletAddress: r.wallet_address,
    sender: r.sender,
    message: r.message,
    timestamp: r.created_at,
  };
}

export function rowToProduct(r: ProductRow): Product {
  return {
    id: r.id,
    playbackId: r.playback_id,
    creatorId: r.creator_id,
    name: r.name,
    description: r.description ?? undefined,
    price: num(r.price),
    currency: "USDC",
    imageColor: r.image_color ?? "#2b2b2b",
    imageUrl: r.image_url ?? undefined,
    productType: r.product_type as ProductType,
    inventory: num(r.inventory),
    subsOnly: r.subs_only ?? undefined,
    status: r.status as ProductStatus,
  };
}

export function rowToFeatured(r: FeaturedProductRow): FeaturedProduct {
  return {
    playbackId: r.playback_id,
    productId: r.product_id,
    creatorId: r.creator_id,
    sortOrder: num(r.sort_order),
    isHighlighted: !!r.is_highlighted,
  };
}

export function rowToChat(r: ChatRow): ChatMessage {
  return {
    id: String(r.id),
    streamId: r.stream_id,
    sender: r.sender,
    walletAddress: r.wallet_address,
    message: r.message,
    kind: r.kind as ChatKind,
    amount: r.amount != null ? num(r.amount) : undefined,
    role: r.role ?? undefined,
    nameColor: r.name_color ?? undefined,
    timestamp: r.created_at,
  };
}

export function rowToNotification(r: NotificationRow): CreatorNotification {
  return {
    id: String(r.id),
    type: r.type as NotificationType,
    title: r.title,
    message: r.message,
    walletAddress: r.wallet_address ?? "",
    txHash: r.tx_hash ?? undefined,
    amount: r.amount != null ? num(r.amount) : undefined,
    createdAt: r.created_at,
    read: r.read ?? false,
  };
}

export function rowToOrder(r: OrderRow): Order {
  return {
    id: String(r.id),
    productId: r.product_id,
    buyerAddress: r.buyer_address,
    sellerAddress: r.seller_address,
    amount: num(r.amount),
    txHash: r.tx_hash ?? "",
    status: r.status as OrderStatus,
    productSnapshot: r.product_snapshot ?? { name: "", price: 0, imageColor: "#2b2b2b" },
    createdAt: r.created_at,
  };
}
