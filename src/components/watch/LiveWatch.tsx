"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LiveFavicon } from "@/components/brand/LiveFavicon";
import { toast } from "sonner";
import { ChevronLeft, Play, Heart, ShoppingBag } from "lucide-react";
import { LivePill, ViewerPill } from "@/components/ui/Badges";
import { TipComposer } from "@/components/money/TipComposer";
import { DonationAlert } from "@/components/money/DonationAlert";
import { UnlockGate } from "@/components/money/UnlockGate";
import { FundSheet } from "@/components/money/FundSheet";
import { PurchaseSheet } from "@/components/money/PurchaseSheet";
import { Player } from "@/components/watch/Player";
import { Tile, Avatar } from "@/components/ui/Media";
import { useSession } from "@/lib/store/session";
import { hasAccess } from "@/lib/access";
import { MOCK_MODE } from "@/lib/config";
import { cn } from "@/lib/cn";
import { canFeatureProduct } from "@/lib/product-availability";
import { shouldMountLivePlayback } from "@/lib/livepeer/playback-gating";
import { sendChatMessage, subscribeToChatMessages, subscribeToFeaturedProducts, subscribeToStreamStatus } from "@/lib/realtime";
import { useStreamPresence } from "@/lib/live-hooks";
import {
  createLocalChatMessage,
  mergeChatMessage,
  removeChatMessage,
  removeFeaturedProduct,
  selectFeaturedProduct,
  upsertFeaturedProduct,
} from "@/lib/realtime-state";
import type { Creator, Stream, ChatMessage, FeaturedProductWithProduct, Product } from "@/lib/types";

const AMBIENT = ["this set is unreal", "where's the hoodie from", "🔥🔥", "first time here, love it", "go best!", "linking it now!"];
const NAMES = ["tobi", "zee", "kemi", "dami", "lola", "seyi"];
const COLORS = ["#5acdff", "#c8eb6d", "#8daaff", "#9fd3ff"];

export function LiveWatch({
  creator,
  stream,
  initialChat,
  featured,
}: {
  creator: Creator;
  stream: Stream;
  initialChat: ChatMessage[];
  featured: FeaturedProductWithProduct[];
}) {
  const { user, isSubscribed, isUnlocked, subscribe } = useSession();
  const [liveStream, setLiveStream] = useState<Stream>(stream);
  const [messages, setMessages] = useState<ChatMessage[]>(initialChat);
  const [featuredItems, setFeaturedItems] = useState<FeaturedProductWithProduct[]>(featured);
  const [alert, setAlert] = useState<{ amount: number; message: string } | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);
  const [fundNeed, setFundNeed] = useState<number | undefined>();
  const [buy, setBuy] = useState<Product | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const wallets = user?.walletAddresses ?? [];
  const subscribed = isSubscribed(creator.creatorId);
  const unlocked = isUnlocked(`stream_access_${liveStream.playbackId}`) || isUnlocked(`creator_access_${creator.creatorId}`);
  const gated = liveStream.viewMode !== "free";
  const locked = gated && !subscribed && !unlocked && !hasAccess({ resource: liveStream, wallets });
  const availableFeaturedItems = featuredItems.filter((item) => canFeatureProduct(item.product));
  const featuredProduct = selectFeaturedProduct(availableFeaturedItems);
  const liveShopProducts = Array.from(
    new Map(availableFeaturedItems.map((item) => [item.product.id, item.product])).values(),
  );
  const mobileShopVisible = liveShopProducts.length > 0 && !locked;
  const livePlaybackId = liveStream.livepeerPlaybackId ?? liveStream.playbackId;
  const showLivePlayer = shouldMountLivePlayback({
    isActive: liveStream.isActive,
    locked,
    playbackId: livePlaybackId,
  });

  // Real concurrent viewers via presence (this viewer is tracked while not gated out).
  const presence = useStreamPresence(liveStream.playbackId, { enabled: liveStream.isActive && !locked, track: true });
  const viewers = presence ?? liveStream.viewerCount;

  useEffect(() => setLiveStream(stream), [stream]);
  useEffect(() => setFeaturedItems(featured), [featured]);

  useEffect(() => {
    return subscribeToChatMessages(stream.playbackId, (event) => {
      setMessages((current) =>
        event.type === "delete"
          ? removeChatMessage(current, event.id)
          : mergeChatMessage(current, event.message),
      );
    });
  }, [stream.playbackId]);

  useEffect(() => {
    return subscribeToFeaturedProducts(stream.playbackId, (event) => {
      setFeaturedItems((current) =>
        event.type === "delete"
          ? removeFeaturedProduct(current, event.productId)
          : upsertFeaturedProduct(current, event.item),
      );
    });
  }, [stream.playbackId]);

  useEffect(() => subscribeToStreamStatus(stream.playbackId, setLiveStream), [stream.playbackId]);

  // Mock mode appends local ambient chat instead of writing fake messages to Supabase.
  useEffect(() => {
    if (locked || !MOCK_MODE) return;
    const t = setInterval(() => {
      const i = Math.floor(Math.random() * NAMES.length);
      setMessages((m) => [
        ...m.slice(-60),
        {
          id: `amb-${Date.now()}`,
          streamId: liveStream.playbackId,
          sender: NAMES[i],
          walletAddress: `0x${i}`,
          message: AMBIENT[Math.floor(Math.random() * AMBIENT.length)],
          kind: "message",
          role: "viewer",
          nameColor: COLORS[i % COLORS.length],
          timestamp: new Date().toISOString(),
        },
      ]);
    }, 4500);
    return () => clearInterval(t);
  }, [locked, liveStream.playbackId]);

  // Auto-scroll to newest, but only when the viewer is already near the bottom —
  // never yank them down while they're scrolled up reading history.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Open the gate automatically when a locked viewer lands.
  useEffect(() => {
    if (locked) setGateOpen(true);
  }, [locked]);

  function onTipSent(amount: number, message: string) {
    const activeUser = useSession.getState().user ?? user;
    setAlert({ amount, message });
    if (MOCK_MODE) {
      setMessages((m) => [
        ...m,
        {
          id: `tip-${Date.now()}`,
          streamId: liveStream.playbackId,
          sender: activeUser?.displayName?.toLowerCase() ?? "you",
          walletAddress: activeUser?.walletAddress ?? "0x",
          message,
          kind: "donation",
          amount,
          nameColor: "#9fd3ff",
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }

  async function onChatSent(message: string): Promise<boolean> {
    const activeUser = useSession.getState().user ?? user;
    if (!activeUser) return false;

    const localMessage = createLocalChatMessage({
      streamId: liveStream.playbackId,
      sender: activeUser.displayName,
      walletAddress: activeUser.walletAddress,
      message,
    });
    if (!localMessage) return false;

    if (MOCK_MODE) {
      setMessages((current) => mergeChatMessage(current, localMessage));
      return true;
    }

    try {
      const inserted = await sendChatMessage({
        streamId: liveStream.playbackId,
        sender: activeUser.displayName,
        walletAddress: activeUser.walletAddress,
        message,
      });
      setMessages((current) => mergeChatMessage(current, inserted ?? localMessage));
      return true;
    } catch {
      toast.error("Message failed to send");
      return false;
    }
  }

  function openTipFunding(amount: number) {
    setFundNeed(amount);
    setFundOpen(true);
  }

  function onFundOpenChange(open: boolean) {
    setFundOpen(open);
    if (!open) setFundNeed(undefined);
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas md:flex-row">
      <LiveFavicon live={liveStream.isActive} />
      <div className="relative flex-1 overflow-hidden" style={{ background: "linear-gradient(150deg,#1d1f24,#0a0a0c 78%)" }}>
        <div className="absolute inset-0" style={{ background: "radial-gradient(55% 45% at 50% 36%,rgba(64,172,255,.14),transparent 70%)" }} />

        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 bg-gradient-to-b from-black/55 to-transparent p-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link href={`/${creator.username}`} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur">
              <ChevronLeft className="size-[18px]" />
            </Link>
            <Link href={`/${creator.username}`} className="flex min-w-0 items-center gap-2 rounded-full bg-black/35 py-1 pl-1 pr-3 backdrop-blur">
              <Avatar seed={creator.avatarColor} src={creator.avatarUrl} size={30} />
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold leading-tight text-white">{creator.displayName}</span>
                <span className="block truncate text-[10.5px] leading-tight text-white/60">@{creator.username}</span>
              </span>
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {liveStream.isActive ? (
              <LivePill small />
            ) : (
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[9.5px] font-bold tracking-[0.08em] text-ink-dim">
                OFFLINE
              </span>
            )}
            <ViewerPill count={viewers} small />
          </div>
        </div>

        {showLivePlayer ? (
          <Player playbackId={livePlaybackId} mode="live" autoPlay className="absolute inset-0 z-0 size-full">
            <div className="absolute left-1/2 top-[38%] z-10 -translate-x-1/2">
              <span className="flex size-16 items-center justify-center rounded-full border border-white/25 bg-white/[0.14] backdrop-blur">
                <Play className="ml-1 size-6 fill-white text-white" />
              </span>
            </div>
          </Player>
        ) : !locked ? (
          <div className="absolute left-1/2 top-[38%] z-10 -translate-x-1/2">
            <span className="flex size-16 items-center justify-center rounded-full border border-white/25 bg-white/[0.14] backdrop-blur">
              <Play className="ml-1 size-6 fill-white text-white" />
            </span>
          </div>
        ) : null}

        {alert && <DonationAlert amount={alert.amount} message={alert.message} creatorName={creator.displayName} onDone={() => setAlert(null)} />}

        {featuredProduct && !locked && (
          <div className="absolute inset-x-4 top-[26%] z-20 animate-[tvDrop_.5s_cubic-bezier(.22,1,.36,1)] rounded-2xl border-[1.5px] border-blue bg-[#08080a]/90 p-3.5 backdrop-blur-md  md:left-auto md:right-4 md:w-[280px]">
            <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-blue/[0.18] px-2.5 py-1">
              <span className="size-[5px] rounded-full bg-blue-light" />
              <span className="text-[8.5px] font-bold tracking-[0.08em] text-blue-soft">FEATURED NOW</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative size-[60px] shrink-0 overflow-hidden rounded-[13px]" style={{ background: `linear-gradient(140deg,${featuredProduct.product.imageColor},#101010)` }}>
                {featuredProduct.product.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={featuredProduct.product.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{featuredProduct.product.name}</div>
                <div className="receipt mt-1 text-[18px] text-ink-soft">${featuredProduct.product.price}</div>
              </div>
            </div>
            <button onClick={() => setBuy(featuredProduct.product)} className="mt-3 h-[46px] w-full rounded-[13px] bg-blue text-[13.5px] font-bold text-white">
              Buy now
            </button>
          </div>
        )}

        <div className="md:hidden">
          {mobileShopVisible && (
            <div className="absolute inset-x-3 bottom-[84px] z-20 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {liveShopProducts.slice(0, 4).map((product) => (
                <button
                  key={product.id}
                  onClick={() => setBuy(product)}
                  className="flex min-w-[168px] items-center gap-2 rounded-[14px] border border-blue/35 bg-[#08080a]/82 p-2 text-left  backdrop-blur-md"
                >
                  <Tile seed={product.imageColor} src={product.imageUrl} size={38} radius={10} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-semibold text-white">{product.name}</span>
                    <span className="mt-0.5 block receipt text-[13px] text-beam-soft">${product.price}</span>
                  </span>
                  <span className="rounded-full bg-blue px-2 py-1 text-[9px] font-bold text-white">Buy</span>
                </button>
              ))}
            </div>
          )}
          <div className={cn("absolute inset-x-0 z-10 flex flex-col justify-end gap-2.5 overflow-hidden px-4", mobileShopVisible ? "bottom-[154px] max-h-[30%]" : "bottom-[78px] max-h-[40%]")}>
            {messages.slice(-5).map((m) => <ChatRow key={m.id} m={m} overlay />)}
          </div>
          <div className="absolute inset-x-0 bottom-0 z-20 p-3.5">
            <TipComposer creatorName={creator.displayName} recipient={creator.creatorId} presets={liveStream.donationPresets} resource={{ kind: "stream", playbackId: liveStream.playbackId }} onSent={onTipSent} onMessage={onChatSent} onNeedFunds={openTipFunding} />
          </div>
        </div>
      </div>

      <aside className="hidden w-[360px] shrink-0 flex-col border-l border-white/[0.06] bg-surface md:flex">
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
          <span className="text-xs font-semibold tracking-[0.04em] text-ink-dim">LIVE CHAT</span>
          <span className="text-[11px] text-faint">{viewers.toLocaleString()}</span>
        </div>
        {liveShopProducts.length > 0 && !locked && (
          <div className="shrink-0 border-b border-white/[0.06] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ghost">
                <ShoppingBag className="size-3.5 text-blue-light" /> Shop live
              </span>
              <span className="text-[10.5px] text-faint">{liveShopProducts.length} {liveShopProducts.length === 1 ? "item" : "items"}</span>
            </div>
            <div className="flex flex-col gap-2">
              {liveShopProducts.slice(0, 3).map((product) => (
                <button
                  key={product.id}
                  onClick={() => setBuy(product)}
                  className="group flex items-center gap-2.5 rounded-[14px] border border-white/[0.07] bg-white/[0.035] p-2 text-left transition-colors hover:border-blue/45 hover:bg-blue/[0.07]"
                >
                  <Tile seed={product.imageColor} src={product.imageUrl} size={42} radius={10} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-ink-soft">{product.name}</span>
                    <span className="mt-0.5 block receipt text-[13px] text-beam-soft">${product.price}</span>
                  </span>
                  <span className="rounded-full bg-blue px-2.5 py-1 text-[10px] font-bold text-white transition-colors group-hover:bg-blue-light">
                    {product.status === "active" ? "Buy" : "Sold"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          {messages.map((m) => <ChatRow key={m.id} m={m} />)}
        </div>
        <div className="shrink-0 border-t border-white/[0.06] p-3">
          <TipComposer creatorName={creator.displayName} recipient={creator.creatorId} presets={liveStream.donationPresets} resource={{ kind: "stream", playbackId: liveStream.playbackId }} onSent={onTipSent} onMessage={onChatSent} onNeedFunds={openTipFunding} />
        </div>
      </aside>

      <UnlockGate
        open={gateOpen}
        onOpenChange={setGateOpen}
        creatorName={creator.displayName}
        recipient={creator.creatorId}
        contextLabel={`${creator.displayName} · ${stream.title}`}
        oneTimeAmount={liveStream.viewMode === "one-time" ? liveStream.amount : 3}
        monthlyAmount={liveStream.viewMode === "monthly" ? liveStream.amount : 9}
        unlockKeys={{
          "one-time": [`stream_access_${liveStream.playbackId}`],
          monthly: [`creator_access_${creator.creatorId}`],
        }}
        resource={{ kind: "stream", playbackId: liveStream.playbackId }}
        onUnlocked={(door) => {
          if (door === "monthly") {
            subscribe(creator.creatorId, {
              creatorId: creator.creatorId,
              username: creator.username,
              displayName: creator.displayName,
              avatarColor: creator.avatarColor,
              avatarUrl: creator.avatarUrl,
            });
          }
        }}
      />
      <FundSheet open={fundOpen} onOpenChange={onFundOpenChange} needFor={fundNeed} actionLabel="send" />
      <PurchaseSheet product={buy} open={!!buy} onOpenChange={(v) => !v && setBuy(null)} />
    </div>
  );
}

function ChatRow({ m, overlay }: { m: ChatMessage; overlay?: boolean }) {
  if (m.kind === "donation") {
    return (
      <div className="flex items-center gap-2 self-start rounded-xl border border-blue-light/40 bg-beam/[0.12] px-2.5 py-2 animate-[tvPop_.4s_ease_both]">
        <Heart className="size-[14px] text-blue-light" />
        <span className="text-[11.5px] font-bold text-blue-soft">{m.sender} tipped ${m.amount}</span>
        {m.message && <span className="text-[11.5px] text-ink-dim">{m.message}</span>}
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="shrink-0 text-[11.5px] font-semibold" style={{ color: m.nameColor }}>{m.sender}</span>
      {m.role === "host" && <Badge color="#40acff">HOST</Badge>}
      {m.role === "mod" && <Badge color="#c8eb6d">MOD</Badge>}
      <span className={cn("text-[12px]", overlay ? "text-[#e2e2e6] [text-shadow:0_1px_3px_rgba(0,0,0,.6)]" : "text-[#d6d6db]")}>{m.message}</span>
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return <span className="rounded px-1.5 py-px text-[8px] font-bold text-canvas" style={{ background: color }}>{children}</span>;
}
