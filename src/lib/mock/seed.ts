import type {
  Creator,
  Stream,
  Video,
  Product,
  FeaturedProduct,
  ChatMessage,
  VodComment,
  CreatorNotification,
  Order,
} from "@/lib/types";

// Deterministic fake wallet addresses (lowercase, the ownership key).
const w = (n: string) => `0x${n.padEnd(40, n).slice(0, 40)}`;

export const ADDR = {
  ada: w("ada"),
  tunde: w("tunde"),
  studiok: w("studk"),
  kemi: w("kemi"),
  seyi: w("seyi"),
  lola: w("lola"),
  lagospod: w("lagos"),
  fitada: w("fitada"),
  // a demo fan
  tobi: w("tobi"),
};

export const creators: Creator[] = [
  {
    creatorId: ADDR.ada, username: "adaplays", displayName: "Ada Plays",
    bio: "Late night just chatting — ask me anything.", avatarColor: "#2b2b2b",
    subscriberCount: 12400, category: "Gaming",
    socialLinks: [{ kind: "twitter", url: "https://x.com/adaplays" }],
  },
  {
    creatorId: ADDR.tunde, username: "tundefm", displayName: "Tunde FM",
    bio: "Friday mix sessions, every week.", avatarColor: "#242424",
    subscriberCount: 8800, category: "Music",
  },
  {
    creatorId: ADDR.studiok, username: "studiok", displayName: "Studio K",
    bio: "Build in public.", avatarColor: "#202020",
    subscriberCount: 4100, category: "Learn",
  },
  {
    creatorId: ADDR.kemi, username: "kemicooks", displayName: "Kemi Cooks",
    bio: "Lagos kitchen, live.", avatarColor: "#211f29",
    subscriberCount: 18200, category: "Learn",
  },
  {
    creatorId: ADDR.seyi, username: "seyitalkstech", displayName: "Seyi Talks Tech",
    bio: "Tech, simply.", avatarColor: "#1d2230",
    subscriberCount: 9400, category: "Learn",
  },
  {
    creatorId: ADDR.lagospod, username: "thelagospod", displayName: "The Lagos Pod",
    bio: "Culture, weekly.", avatarColor: "#262028",
    subscriberCount: 31000, category: "Music",
  },
  {
    creatorId: ADDR.fitada, username: "fitwithada", displayName: "Fit With Ada",
    bio: "Move daily.", avatarColor: "#1f2622",
    subscriberCount: 6100, category: "Learn",
  },
  {
    creatorId: ADDR.lola, username: "lolawrites", displayName: "Lola Writes",
    bio: "Morning pages.", avatarColor: "#262626",
    subscriberCount: 2300, category: "Learn",
  },
];

export const streams: Stream[] = [
  {
    playbackId: "live-ada", creatorId: ADDR.ada, title: "Late night just chatting",
    description: "Late night just chatting — ask me anything", viewMode: "monthly",
    amount: 9, isActive: true, viewerCount: 1240, thumbColor: "#1c2230",
    startedAt: new Date(Date.now() - 1932_000).toISOString(),
    paidUsers: [], donationPresets: [1, 5, 10, 20], record: true,
  },
  {
    playbackId: "live-tunde", creatorId: ADDR.tunde, title: "Friday mix session",
    viewMode: "free", amount: 0, isActive: true, viewerCount: 840, thumbColor: "#26222c",
    paidUsers: [], donationPresets: [2, 5, 10, 25], record: true,
  },
  {
    playbackId: "live-studiok", creatorId: ADDR.studiok, title: "Build in public",
    viewMode: "free", amount: 0, isActive: true, viewerCount: 320, thumbColor: "#22202a",
    paidUsers: [], donationPresets: [1, 5, 10, 20], record: false,
  },
  {
    playbackId: "live-lola", creatorId: ADDR.lola, title: "Morning pages",
    viewMode: "one-time", amount: 3, isActive: true, viewerCount: 95, thumbColor: "#1f242a",
    paidUsers: [], donationPresets: [1, 3, 5, 10], record: true,
  },
];

export const videos: Video[] = [
  {
    playbackId: "vod-ada-1", creatorId: ADDR.ada, assetName: "clawgame",
    title: "Clawgame stream replay", viewMode: "one-time", amount: 7, views: 312,
    durationSec: 724, publishedAt: "2026-02-24T20:00:00Z", thumbColor: "#1c2230",
    paidUsers: [], status: "ready",
  },
  {
    playbackId: "vod-ada-2", creatorId: ADDR.ada, assetName: "citywalk",
    title: "City walk & chat", viewMode: "free", amount: 0, views: 1100,
    durationSec: 291, publishedAt: "2026-02-16T18:00:00Z", thumbColor: "#24222c",
    paidUsers: [], status: "ready",
  },
];

export const products: Product[] = [
  {
    id: "prod-hoodie", playbackId: "live-ada", creatorId: ADDR.ada, name: "Tour hoodie",
    description: "Heavyweight cotton, screen-printed in Lagos. Ships worldwide. Limited run for the Q1 tour.",
    price: 40, currency: "USDC", imageColor: "#2b2b2b", productType: "merch", inventory: 50, status: "active",
  },
  {
    id: "prod-poster", playbackId: "live-ada", creatorId: ADDR.ada, name: "Signed poster",
    price: 25, currency: "USDC", imageColor: "#26222c", productType: "merch", inventory: 20,
    subsOnly: true, status: "active",
  },
  {
    id: "prod-stickers", playbackId: "live-ada", creatorId: ADDR.ada, name: "Sticker pack",
    price: 12, currency: "USDC", imageColor: "#211f29", productType: "merch", inventory: 200, status: "active",
  },
  {
    id: "prod-cap", playbackId: "live-ada", creatorId: ADDR.ada, name: "Cap",
    price: 30, currency: "USDC", imageColor: "#1d2230", productType: "merch", inventory: 75, status: "active",
  },
];

export const featured: FeaturedProduct[] = [
  { playbackId: "live-ada", productId: "prod-hoodie", creatorId: ADDR.ada, sortOrder: 0, isHighlighted: true },
];

export const chats: ChatMessage[] = [
  { id: "c1", streamId: "live-ada", sender: "kemi", walletAddress: ADDR.kemi, message: "go best, Ada!", kind: "donation", amount: 5, nameColor: "#9fd3ff", timestamp: iso(-220) },
  { id: "c2", streamId: "live-ada", sender: "tobi", walletAddress: ADDR.tobi, message: "this set is unreal", kind: "message", role: "viewer", nameColor: "#5acdff", timestamp: iso(-180) },
  { id: "c3", streamId: "live-ada", sender: "zee", walletAddress: w("zee"), message: "where's the hoodie from", kind: "message", role: "viewer", nameColor: "#c8eb6d", timestamp: iso(-120) },
  { id: "c4", streamId: "live-ada", sender: "ada", walletAddress: ADDR.ada, message: "linking it now!", kind: "message", role: "host", nameColor: "#8daaff", timestamp: iso(-60) },
  { id: "c5", streamId: "live-ada", sender: "dami", walletAddress: w("dami"), message: "keep it kind in here", kind: "message", role: "mod", nameColor: "#c8eb6d", timestamp: iso(-30) },
];

export const videoComments: VodComment[] = [
  { id: "vc1", playbackId: "vod-ada-1", sender: "tobi", walletAddress: ADDR.tobi, message: "The claw machine bit at 08:20 is still wild.", timestamp: iso(-7200) },
  { id: "vc2", playbackId: "vod-ada-1", sender: "kemi", walletAddress: ADDR.kemi, message: "Saved this for later. Premium replay energy.", timestamp: iso(-3600) },
  { id: "vc3", playbackId: "vod-ada-2", sender: "zee", walletAddress: w("zee"), message: "City walk replays hit different.", timestamp: iso(-2600) },
];

export const notifications: CreatorNotification[] = [
  { id: "n1", type: "donation", title: "New tip", message: "kemi tipped $5", walletAddress: ADDR.kemi, amount: 5, createdAt: iso(-300) },
  { id: "n2", type: "subscription", title: "New subscriber", message: "seyi subscribed", walletAddress: ADDR.seyi, createdAt: iso(-600) },
  { id: "n3", type: "order", title: "New order", message: "tobi bought Tour hoodie", walletAddress: ADDR.tobi, amount: 40, createdAt: iso(-900) },
];

export const orders: Order[] = [];

function iso(secAgo: number) { return new Date(Date.now() + secAgo * 1000).toISOString(); }
