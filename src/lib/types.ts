// ── Core domain types (the rebuild contract) ───────────────────────

export type ViewMode = "free" | "one-time" | "monthly";

export type ProductType = "physical" | "digital" | "merch" | "ad";
export type ProductStatus = "active" | "sold_out" | "archived";
export type OrderStatus = "pending" | "completed" | "failed" | "refunded";

export interface Creator {
  /** lowercase EVM wallet address — the canonical ownership key */
  creatorId: string;
  /** human-readable bio-link slug, e.g. "adaplays" → tvin.bio/adaplays */
  username: string;
  displayName: string;
  bio?: string;
  avatarColor?: string; // gradient seed for placeholder art
  avatarUrl?: string;
  headerUrl?: string; // channel stage header (shown when offline)
  /** Tier-1 brand accent (framework §8) — contrast-guarded at render time. */
  accentColor?: string;
  /** Constrained theme variant: midnight (default) · dim · voltage. */
  themeVariant?: "midnight" | "dim" | "voltage";
  subscriberCount: number;
  socialLinks?: { kind: string; url: string }[];
  category?: string;
}

export interface Stream {
  playbackId: string;
  creatorId: string;
  title: string;
  description?: string;
  viewMode: ViewMode;
  amount: number; // USD/USDC when gated
  isActive: boolean; // live now
  viewerCount: number;
  thumbColor: string; // placeholder gradient seed
  startedAt?: string;
  paidUsers: string[]; // wallets that unlocked
  donationPresets: number[];
  record: boolean;
  livepeerId?: string; // Livepeer stream id — owner-scoped mutations
  livepeerPlaybackId?: string; // Livepeer playback id — viewer HLS resolution
}

export interface Video {
  playbackId: string;
  creatorId: string;
  assetName: string;
  title: string;
  viewMode: ViewMode;
  amount: number;
  views: number;
  durationSec: number;
  publishedAt: string;
  thumbColor: string;
  thumbnailUrl?: string;
  paidUsers: string[];
  disabled?: boolean;
  status: "ready" | "processing" | "not_found";
  livepeerId?: string;
  livepeerPlaybackId?: string;
}

export interface Product {
  id: string;
  playbackId: string; // channel
  creatorId: string;
  name: string;
  description?: string;
  price: number;
  currency: "USDC";
  imageColor: string; // placeholder seed
  imageUrl?: string;
  productType: ProductType;
  inventory: number;
  subsOnly?: boolean;
  status: ProductStatus;
}

export interface Order {
  id: string;
  productId: string;
  buyerAddress: string;
  sellerAddress: string;
  amount: number;
  txHash: string;
  status: OrderStatus;
  productSnapshot: Pick<Product, "name" | "price" | "imageColor">;
  createdAt: string;
}

export interface FeaturedProduct {
  playbackId: string;
  productId: string;
  creatorId: string;
  sortOrder: number;
  isHighlighted: boolean;
}

export type FeaturedProductWithProduct = FeaturedProduct & { product: Product };

export type ChatKind = "message" | "donation" | "system";

export interface ChatMessage {
  id: string;
  streamId: string;
  sender: string; // short display handle
  walletAddress: string;
  message: string;
  kind: ChatKind;
  amount?: number; // for donations
  role?: "host" | "mod" | "viewer";
  nameColor?: string;
  timestamp: string;
}

export interface VodComment {
  id: string;
  playbackId: string;
  walletAddress: string;
  sender: string;
  message: string;
  timestamp: string;
}

export type NotificationType = "payment" | "subscription" | "donation" | "order" | "other";

export interface CreatorNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  walletAddress: string;
  txHash?: string;
  amount?: number;
  createdAt: string;
  read?: boolean;
}

export interface CreatorProfilePayload {
  creator: Creator;
  stream: Stream | null;
  videos: Video[];
  products: Product[];
  featuredProducts: FeaturedProductWithProduct[];
  notifications: CreatorNotification[];
  orders: Order[];
}

// ── Money moments ──────────────────────────────────────────────────

export type MoneyMoment = "unlock" | "subscribe" | "tip" | "buy" | "fund";
export type PaymentPhase = "idle" | "preparing" | "confirming" | "success" | "error";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
