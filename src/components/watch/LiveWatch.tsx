"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LiveFavicon } from "@/components/brand/LiveFavicon";
import { toast } from "sonner";
import { ChevronLeft, Play } from "lucide-react";
import { LivePill, ViewerPill } from "@/components/ui/Badges";
import { Button } from "@/components/ui/Button";
import { CreatorTheme } from "@/components/channel/CreatorTheme";
import { StoreGlyph, TipGlyph, StageGlyph } from "@/components/brand/Glyphs";
import { TipComposer } from "@/components/money/TipComposer";
import { TipSheet } from "@/components/money/TipSheet";
import { DonationAlert } from "@/components/money/DonationAlert";
import { UnlockGate } from "@/components/money/UnlockGate";
import { PurchaseSheet } from "@/components/money/PurchaseSheet";
import { Player } from "@/components/watch/Player";
import { Tile, Avatar } from "@/components/ui/Media";
import { useSession } from "@/lib/store/session";
import { useAuthIntent } from "@/lib/auth/useAuthIntent";
import { followCreator } from "@/lib/profile-client";
import { hasAccess, matchesAny } from "@/lib/access";
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
  const router = useRouter();
  const { requireAuth } = useAuthIntent();
  const { user, isSubscribed, isUnlocked, subscribe } = useSession();
  const [liveStream, setLiveStream] = useState<Stream>(stream);
  const [messages, setMessages] = useState<ChatMessage[]>(initialChat);
  const [featuredItems, setFeaturedItems] = useState<FeaturedProductWithProduct[]>(featured);
  const [alert, setAlert] = useState<{ amount: number; message: string } | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [buy, setBuy] = useState<Product | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const wallets = user?.walletAddresses ?? [];
  const isOwner = matchesAny(wallets, creator.creatorId);
  const subscribed = isSubscribed(creator.creatorId);
  const unlocked = isUnlocked(`stream_access_${liveStream.playbackId}`) || isUnlocked(`creator_access_${creator.creatorId}`);
  const gated = liveStream.viewMode !== "free";
  // The owner is never gated out of their own stream.
  const locked = !isOwner && gated && !subscribed && !unlocked && !hasAccess({ resource: liveStream, wallets });
  // Ended while watching (started active, now idle) — a calm close for the fan.
  const ended = !liveStream.isActive && !isOwner;
  const availableFeaturedItems = featuredItems.filter((item) => canFeatureProduct(item.product));
  const featuredProduct = selectFeaturedProduct(availableFeaturedItems);
  const liveShopProducts = Array.from(
    new Map(availableFeaturedItems.map((item) => [item.product.id, item.product])).values(),
  );
  const mobileShopVisible = liveShopProducts.length > 0 && !locked && !ended;
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

  // When it ends, drift back to the channel — the live surface never lingers.
  useEffect(() => {
    if (!ended) return;
    const t = window.setTimeout(() => router.replace(`/${creator.username}`), 6000);
    return () => window.clearTimeout(t);
  }, [ended, creator.username, router]);

  /** F3 — post-tip capture. The creator, not the platform, owns the fan. */
  function onFollow() {
    subscribe(creator.creatorId, {
      creatorId: creator.creatorId,
      username: creator.username,
      displayName: creator.displayName,
      avatarColor: creator.avatarColor,
      avatarUrl: creator.avatarUrl,
    });
    toast.success(`You follow ${creator.displayName}`);
    void followCreator(creator.username, useSession.getState().user?.walletAddress);
  }

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
    // Posting requires sign-in (D4): send the fan to the auth wall, worded for chat.
    if (!activeUser) {
      requireAuth({ reason: "comment", subject: creator.displayName });
      return false;
    }

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

  return (
    <CreatorTheme
      accent={creator.accentColor}
      variant={creator.themeVariant}
      className="flex min-h-[100dvh] flex-col md:flex-row"
    >
      <LiveFavicon live={liveStream.isActive} />
      <div className="relative flex-1 overflow-hidden bg-black">
        {/* Ambient creator light behind the frame — the accent as stage wash. */}
        <div className="accent-ambient absolute inset-0 opacity-70" />

        {/* Top scrim: the 5-second read — who, live, how many. */}
        <div className="scrim-top pointer-events-none absolute inset-x-0 top-0 z-20 h-[110px]" />
        <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2.5 p-4">
          <Link
            href={`/${creator.username}`}
            aria-label={`${creator.displayName}'s channel`}
            className="tap grid size-11 shrink-0 place-items-center rounded-full text-white"
          >
            <ChevronLeft className="size-[20px]" />
          </Link>
          {liveStream.isActive ? (
            <LivePill small />
          ) : (
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[9.5px] font-bold tracking-[0.08em] text-ink-dim">
              OFFLINE
            </span>
          )}
          <ViewerPill count={viewers} small bare />
          {/* Owner watching their own stream gets a direct route to the desk;
              a viewer sees the address. Neither ever sees the other's action. */}
          {isOwner ? (
            <Button asChild size="sm" variant="secondary" className="ml-auto bg-black/40">
              <Link href="/dashboard/broadcast"><StageGlyph size={15} /> Desk</Link>
            </Button>
          ) : (
            <span className="receipt ml-auto hidden text-[12px] text-ink-dim [text-shadow:0_1px_6px_rgba(0,0,0,.6)] sm:block">
              tvin.bio/{creator.username}
            </span>
          )}
        </div>

        {showLivePlayer ? (
          <Player playbackId={livePlaybackId} mode="live" autoPlay className="absolute inset-0 z-0 size-full">
            <div className="absolute inset-0 grid place-items-center">
              <span className="grid size-16 place-items-center rounded-full border border-white/25 bg-white/[0.14]">
                <Play className="ml-1 size-6 fill-white text-white" />
              </span>
            </div>
          </Player>
        ) : ended ? (
          /* The stream ended while watching — a calm close, not a dead frame.
             We return to the channel on our own after a beat. */
          <div className="absolute inset-0 z-10 grid place-items-center px-6">
            <div className="flex max-w-[300px] flex-col items-center text-center">
              <Avatar seed={creator.avatarColor} src={creator.avatarUrl} size={64} ring="var(--creator-accent)" />
              <div className="font-display mt-4 text-[20px] font-semibold tracking-[-0.01em] text-ink-soft">
                {creator.displayName.split(" ")[0]}&apos;s stream ended
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                Thanks for watching. The replay will be on the channel shortly.
              </p>
              <Button asChild size="pill" variant="accent" className="mt-5">
                <Link href={`/${creator.username}`}>Back to channel</Link>
              </Button>
            </div>
          </div>
        ) : !locked ? (
          <div className="absolute inset-0 grid place-items-center">
            <span className="grid size-16 place-items-center rounded-full border border-white/25 bg-white/[0.14]">
              <Play className="ml-1 size-6 fill-white text-white" />
            </span>
          </div>
        ) : null}

        {alert && <DonationAlert amount={alert.amount} message={alert.message} creatorName={creator.displayName} onDone={() => setAlert(null)} />}

        {/* Live shopping: the product the stream is demoing, on a scrim card. */}
        {featuredProduct && !locked && (
          <div className="absolute inset-x-4 top-[22%] z-20 animate-[tvDrop_.5s_cubic-bezier(.22,1,.36,1)] rounded-[18px] border border-accent-line bg-black/75 p-3.5 md:left-auto md:right-4 md:w-[280px]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-line px-2.5 py-1 text-[9px] font-semibold tracking-[0.12em] text-accent">
              FEATURED NOW
            </span>
            <div className="mt-2.5 flex items-center gap-3">
              <div
                className="relative size-[60px] shrink-0 overflow-hidden rounded-[13px]"
                style={{ background: `linear-gradient(140deg,${featuredProduct.product.imageColor},#101010)` }}
              >
                {featuredProduct.product.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={featuredProduct.product.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium text-ink-soft">{featuredProduct.product.name}</div>
                <div className="receipt mt-1 text-[18px] text-ink-soft">${featuredProduct.product.price.toFixed(2)}</div>
              </div>
            </div>
            <Button variant="accent" size="pill" className="mt-3 w-full" onClick={() => setBuy(featuredProduct.product)}>
              Buy now
            </Button>
          </div>
        )}

        {/* Mobile: chat overlays the frame, identity and actions sit on the
            bottom scrim. Tip and store stay reachable without leaving the
            stream — the funnel ladder is watch → capture → pay. */}
        <div className="md:hidden">
          {mobileShopVisible && (
            <div className="absolute inset-x-3 bottom-[142px] z-20 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {liveShopProducts.slice(0, 4).map((product) => (
                <button
                  key={product.id}
                  onClick={() => setBuy(product)}
                  className="tap flex min-w-[168px] items-center gap-2 rounded-[14px] border border-accent-line bg-black/75 p-2 text-left"
                >
                  <Tile seed={product.imageColor} src={product.imageUrl} size={38} radius={10} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-medium text-white">{product.name}</span>
                    <span className="receipt mt-0.5 block text-[13px] text-accent">${product.price.toFixed(2)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div
            className={cn(
              "absolute inset-x-0 z-10 flex flex-col justify-end gap-1.5 overflow-hidden px-4",
              mobileShopVisible ? "bottom-[196px] max-h-[26%]" : "bottom-[124px] max-h-[36%]",
            )}
          >
            {messages.slice(-4).map((m) => (
              <ChatRow key={m.id} m={m} overlay />
            ))}
          </div>

          <div className="scrim-bottom pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[190px]" />

          {/* Identity + composer are for a running stream — the ended card
              takes over when it's over (and we head back shortly). */}
          {!ended && (
            <>
              {/* Identity row — the creator's name is the largest thing on the frame. */}
              <div className="absolute inset-x-4 bottom-[74px] z-20 flex items-center gap-2.5">
                <Avatar seed={creator.avatarColor} src={creator.avatarUrl} size={36} ring="var(--creator-accent)" />
                <Link href={`/${creator.username}`} className="min-w-0 flex-1">
                  <span className="font-display block truncate text-[17px] font-semibold leading-tight tracking-[-0.01em] text-white [text-shadow:0_1px_6px_rgba(0,0,0,.7)]">
                    {creator.displayName}
                  </span>
                  <span className="block truncate text-[12px] text-ink-dim">{liveStream.title}</span>
                </Link>
                {liveShopProducts.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0 bg-black/40"
                    onClick={() => setBuy(liveShopProducts[0])}
                  >
                    <StoreGlyph size={15} /> Store
                  </Button>
                )}
              </div>

              <div className="absolute inset-x-0 bottom-0 z-20 px-3.5 pt-3.5 pb-[max(14px,env(safe-area-inset-bottom))]">
                <TipComposer creatorName={creator.displayName} onMessage={onChatSent} onTip={() => setTipOpen(true)} showTip={!isOwner} />
              </div>
            </>
          )}
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
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint">
                <StoreGlyph size={14} className="text-accent" /> Shop live
              </span>
              <span className="text-[10.5px] text-faint">{liveShopProducts.length} {liveShopProducts.length === 1 ? "item" : "items"}</span>
            </div>
            <div className="flex flex-col gap-2">
              {liveShopProducts.slice(0, 3).map((product) => (
                <button
                  key={product.id}
                  onClick={() => setBuy(product)}
                  className="group flex items-center gap-2.5 rounded-[14px] border border-white/[0.07] bg-white/[0.035] p-2 text-left transition-colors hover:border-accent-line"
                >
                  <Tile seed={product.imageColor} src={product.imageUrl} size={42} radius={10} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-ink-soft">{product.name}</span>
                    <span className="receipt mt-0.5 block text-[13px] text-accent">${product.price.toFixed(2)}</span>
                  </span>
                  <span className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold text-on-accent">
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
          <TipComposer creatorName={creator.displayName} onMessage={onChatSent} onTip={() => setTipOpen(true)} showTip={!isOwner} />
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
      {/* Funding is owned by whichever money surface needs it — the tip sheet,
          the purchase sheet, the gate. One top-up path per intent, never two. */}
      <PurchaseSheet
        product={buy}
        open={!!buy}
        onOpenChange={(v) => !v && setBuy(null)}
        creatorName={creator.displayName}
        onFollow={subscribed ? undefined : onFollow}
      />
      {/* The one money surface — system tokens, outside the creator theme. */}
      <TipSheet
        open={tipOpen}
        onOpenChange={setTipOpen}
        creatorName={creator.displayName}
        recipient={creator.creatorId}
        presets={liveStream.donationPresets}
        resource={{ kind: "stream", playbackId: liveStream.playbackId }}
        onSent={onTipSent}
        onFollow={subscribed ? undefined : onFollow}
      />
    </CreatorTheme>
  );
}

function ChatRow({ m, overlay }: { m: ChatMessage; overlay?: boolean }) {
  // Money received is the one place earn-green appears — on the amount alone.
  if (m.kind === "donation") {
    return (
      <div className="flex items-center gap-2 self-start rounded-[10px] border border-earn/25 bg-earn/[0.08] px-2.5 py-2 animate-[tvPop_.4s_ease_both]">
        <TipGlyph size={14} className="text-earn" />
        <span className="text-[12px] text-ink-soft">
          <span className="font-semibold">{m.sender}</span> tipped{" "}
          <span className="receipt text-earn">${m.amount?.toFixed(2)}</span>
        </span>
        {m.message && <span className="text-[11.5px] text-ink-dim">{m.message}</span>}
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-1.5">
      {/* Chat pastels are chat identity only — never a UI state. */}
      <span className="shrink-0 text-[12px] font-semibold" style={{ color: m.nameColor }}>{m.sender}</span>
      {m.role === "host" && <Badge color="#40acff">HOST</Badge>}
      {m.role === "mod" && <Badge color="#c8eb6d">MOD</Badge>}
      <span className={cn("text-[13px]", overlay ? "text-[#e6e6ea] [text-shadow:0_1px_4px_rgba(0,0,0,.7)]" : "text-ink-dim")}>{m.message}</span>
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return <span className="rounded px-1.5 py-px text-[8px] font-bold text-canvas" style={{ background: color }}>{children}</span>;
}
