"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Loader2, Play, Share2 } from "lucide-react";
import { CreatorTheme } from "./CreatorTheme";
import { CaptureModule } from "./CaptureModule";
import { BackButton } from "@/components/nav/BackButton";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionLabel, ReplayPill, UpcomingPill, PricePill, LivePill, ViewerPill } from "@/components/ui/Badges";
import { PlatformStamp } from "@/components/brand/Logo";
import { StoreGlyph, ReplayGlyph, TipGlyph, StageGlyph, WalletGlyph } from "@/components/brand/Glyphs";
import { TipSheet } from "@/components/money/TipSheet";
import { PurchaseSheet } from "@/components/money/PurchaseSheet";
import { UnlockGate } from "@/components/money/UnlockGate";
import { DonationAlert } from "@/components/money/DonationAlert";
import { InstallButton } from "@/components/pwa/InstallButton";
import { useSession } from "@/lib/store/session";
import { useAuthIntent } from "@/lib/auth/useAuthIntent";
import { useHydrated } from "@/lib/store/useHydrated";
import { matchesAny } from "@/lib/access";
import { uploadChannelArt } from "@/lib/profile-client";
import { shareLink } from "@/lib/share";
import { cn, formatCount } from "@/lib/cn";
import { variantSurfaces } from "@/lib/creator-theme";
import { useChannelLiveStream } from "@/lib/useChannelLiveStream";
import type { Creator, Stream, Video, Product } from "@/lib/types";

/**
 * F1, idle arrival — the bento landing.
 *
 * Reads in the fan's existing mental model first (avatar, name, one-line bio,
 * action row — the social-profile shape they arrived from), then diverges into
 * the three-tier conversion architecture one scroll later:
 *   discovery (who/what) → engagement (follow/capture) → conversion (buy/tip).
 *
 * Tier 1 leads: the creator's accent owns the page and their name is the
 * largest text on it. Tier 2 is a single idle mark in the footer — that is the
 * entire platform presence a fan sees.
 */
export function ChannelLanding({
  creator,
  stream,
  videos,
  products,
}: {
  creator: Creator;
  stream: Stream | null;
  videos: Video[];
  products: Product[];
}) {
  const searchParams = useSearchParams();
  const autoInstall = searchParams.get("install") === "1";
  const { user, requireAuth } = useAuthIntent("viewer");
  const { isSubscribed, subscribe, openWallet } = useSession();
  const hydrated = useHydrated();

  const [tipOpen, setTipOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [buy, setBuy] = useState<Product | null>(null);
  const [alert, setAlert] = useState<{ amount: number; message: string } | null>(null);
  const [captureDismissed, setCaptureDismissed] = useState(false);
  const [headerUrl, setHeaderUrl] = useState<string | null>(creator.headerUrl ?? null);
  const [headerUploading, setHeaderUploading] = useState(false);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const storeRef = useRef<HTMLDivElement>(null);

  // Live status is owned client-side: it flips to LIVE when the creator goes on
  // air and reverts the moment they end — the channel page is never trapped in
  // a stale live state (and polling repairs the DB, which reverts explore too).
  const currentStream = useChannelLiveStream(creator, stream);
  const isLive = !!currentStream?.isActive;

  const wallets = hydrated ? user?.walletAddresses ?? [] : [];
  const isOwner = matchesAny(wallets, creator.creatorId);
  const subscribed = hydrated && isSubscribed(creator.creatorId);
  const gated = !!currentStream && currentStream.viewMode !== "free";
  const surfaces = variantSurfaces(creator.themeVariant);

  const latestVideo = videos[0];
  const restVideos = videos.slice(1);
  const channelSummary = {
    creatorId: creator.creatorId,
    username: creator.username,
    displayName: creator.displayName,
    avatarColor: creator.avatarColor,
    avatarUrl: creator.avatarUrl,
  };

  useEffect(() => setHeaderUrl(creator.headerUrl ?? null), [creator.headerUrl]);

  function onFollow() {
    if (!requireAuth({ role: "viewer", reason: "follow", subject: creator.displayName })) return;
    if (subscribed) return;
    // A paid channel routes follow through the gate; a free one is one tap.
    if (gated) return setGateOpen(true);
    subscribe(creator.creatorId, channelSummary);
    toast.success(`You follow ${creator.displayName}`);
  }

  function onTip() {
    if (!requireAuth({ role: "viewer", reason: "tip", subject: creator.displayName })) return;
    setTipOpen(true);
  }

  // Owner action — hand the address to the share-back kit / native share.
  function shareChannel() {
    void shareLink({
      url: `https://tvin.bio/${creator.username}`,
      text: `${creator.displayName} on TVinBio`,
    });
  }

  async function onHeaderFile(file: File | null) {
    if (!file || !user) return;
    setHeaderUrl(URL.createObjectURL(file));
    setHeaderUploading(true);
    try {
      const url = await uploadChannelArt(file, user.walletAddress, "header");
      if (url) {
        setHeaderUrl(url);
        const current = useSession.getState().creator;
        if (current && matchesAny([current.creatorId], creator.creatorId)) {
          useSession.getState().setCreator({ ...current, headerUrl: url });
        }
      }
      toast.success("Cover updated");
    } catch {
      toast.error("Couldn't upload that cover");
      setHeaderUrl(creator.headerUrl ?? null);
    } finally {
      setHeaderUploading(false);
    }
  }

  return (
    <CreatorTheme accent={creator.accentColor} variant={creator.themeVariant} className="min-h-screen">
      {/* Cover — and, when the creator is on air, the live banner. The fan lands
          on the profile first (never yanked into the stream); the banner offers
          the stream, one tap away. It taller on live so the ON-AIR moment reads
          immediately on mobile. Reverts to a plain cover the instant they end. */}
      <div
        className={cn(
          "relative w-full overflow-hidden transition-[height] duration-500 ease-[cubic-bezier(.22,1,.36,1)]",
          isLive ? "h-[220px] md:h-[300px]" : "h-[132px] md:h-[188px]",
        )}
      >
        {headerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={headerUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className={cn("absolute inset-0", isLive ? "onair-wash" : "accent-ambient")} />
        )}
        <div
          className="absolute inset-x-0 bottom-0 h-1/2"
          style={{ backgroundImage: `linear-gradient(0deg, ${surfaces.canvas}, transparent)` }}
        />

        {/* Back to wherever they came from (Explore, another channel) — hidden
            on a cold bio-tap arrival so the shared page stays a clean front door. */}
        <BackButton className="absolute left-3 top-3 z-20" />

        {/* Top-right chrome cluster — sits above the live banner so it stays
            tappable there. The wallet is the fan's money surface: system tokens,
            never the creator accent, opening the same docked WalletSheet as
            everywhere else (right-dock on desktop, bottom sheet on mobile). */}
        <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
          {hydrated && user && (
            <button
              onClick={openWallet}
              aria-label="Wallet"
              className="tap grid size-9 place-items-center rounded-full border border-white/15 bg-black/45 text-ink-dim backdrop-blur transition-colors hover:text-white"
            >
              <WalletGlyph size={17} />
            </button>
          )}
          {isOwner && !isLive && (
            <button
              onClick={() => headerInputRef.current?.click()}
              disabled={headerUploading}
              className="tap inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-[11px] font-semibold text-ink-dim backdrop-blur transition-colors hover:text-white disabled:opacity-60"
            >
              {headerUploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
              {headerUrl ? "Change cover" : "Add cover"}
            </button>
          )}
        </div>

        {isLive ? (
          /* The whole banner is the tap target → the dedicated stream page. */
          <Link
            href={`/${creator.username}/live`}
            aria-label={`Watch ${creator.displayName} live`}
            className="group absolute inset-0 z-10 block"
          >
            {/* Signal motifs (framework §5): the banner reads as a broadcast
                viewport — ON-AIR wash, faint scanline, corner ticks. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 animate-[tvGlow_4.8s_ease-in-out_infinite]"
              style={{ background: "radial-gradient(60% 70% at 50% 30%, rgba(239,68,68,.22), transparent 70%)" }}
            />
            <span aria-hidden className="scanline pointer-events-none absolute inset-0 opacity-60" />
            <span aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1.5px_rgba(239,68,68,.35),inset_0_0_60px_rgba(239,68,68,.12)]" />
            <span aria-hidden className="corner-ticks pointer-events-none absolute inset-2.5" />
            <span className="absolute left-3 top-3 z-10 flex items-center gap-2">
              <LivePill small />
              <ViewerPill count={currentStream!.viewerCount} small bare />
            </span>
            {/* Thumb-reach CTA, bottom-centered, ≥44px, scales on press. The play
                triangle is nudged right of geometric center to read optical. */}
            <span className="tap absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-live px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_30px_rgba(239,68,68,.45)] transition-transform group-active:scale-[0.97]">
              <Play className="size-4 translate-x-[1px] fill-current" />
              Watch live
            </span>
          </Link>
        ) : null}
      </div>

      {/* Sections cascade in — identity first, then the conversion ladder. */}
      <div className="stagger mx-auto w-full max-w-[680px] px-4 pb-16">
        {/* ── Discovery: who this is ─────────────────────────────── */}
        <div className="-mt-8 flex items-end gap-3.5">
          <Avatar creator={creator} />
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="font-display truncate text-[26px] font-semibold leading-[1] tracking-[-0.02em] md:text-[32px]">
              {creator.displayName}
            </h1>
            {creator.bio && <p className="mt-1.5 line-clamp-2 text-[12.5px] text-muted">{creator.bio}</p>}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2.5 text-[12px] text-muted">
          <span className="receipt text-ink-dim">tvin.bio/{creator.username}</span>
          <span className="size-[3px] rounded-full bg-ghost" />
          <span className="receipt">{formatCount(creator.subscriberCount)} fans</span>
        </div>

        {/* ── Engagement: the action row ─────────────────────────────
            The owner is looking at their own page — following or tipping
            themselves is nonsense, so they get their own actions (this is
            how their page looks to a fan, with the tools to run it). A viewer
            never sees a creator action here, and vice versa. */}
        {isOwner ? (
          <>
            <div className="mt-4 flex gap-2">
              <Button asChild variant="accent" size="pill" className="flex-1">
                <Link href="/dashboard">
                  <StageGlyph size={16} /> Dashboard
                </Link>
              </Button>
              <Button variant="secondary" size="pill" className="flex-1" onClick={shareChannel}>
                <Share2 className="size-[15px]" /> Share
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-full border border-white/[0.08] bg-surface-2 py-1.5 pl-4 pr-1.5">
              <span className="text-[12px] text-faint">This is your public page</span>
              <InstallButton subject="channel" name={creator.displayName} autoPrompt={autoInstall} size="sm" variant="ghost" />
            </div>
          </>
        ) : (
          <div className="mt-4 flex gap-2">
            <Button
              variant={subscribed ? "secondary" : "accent"}
              size="pill"
              className="flex-1"
              onClick={onFollow}
            >
              {subscribed ? "Following" : "Follow"}
            </Button>
            <Button
              variant="secondary"
              size="pill"
              className="flex-1"
              onClick={() => storeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              <StoreGlyph size={16} /> Store
            </Button>
          </div>
        )}

        {/* ── What's next: the one card that says when to come back.
            Live → it becomes the second way into the stream (after the banner)
            and reverts to the schedule/last-live line when the stream ends. */}
        {currentStream && (
          isLive ? (
            <Link
              href={`/${creator.username}/live`}
              className="tap mt-4 flex items-center gap-3 rounded-[18px] border border-live/35 bg-live/[0.06] p-4 transition-colors"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-live text-white">
                <Play className="size-[18px] translate-x-[1px] fill-current" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <LivePill small onSurface />
                </span>
                <span className="mt-1.5 block truncate text-[15px] font-medium text-ink-soft">{currentStream.title}</span>
              </span>
              <ViewerPill count={currentStream.viewerCount} small />
            </Link>
          ) : (
            <div className="mt-4 rounded-[18px] border border-white/[0.08] bg-creator-card p-4">
              <UpcomingPill accent={creator.themeVariant === "voltage"} small />
              <div className="mt-2.5 text-[15px] font-medium text-ink-soft">{currentStream.title}</div>
              <div className="receipt mt-1.5 text-[12px] text-muted">
                {currentStream.startedAt ? `Last live · ${formatDay(currentStream.startedAt)}` : "Follow to get the nudge"}
              </div>
            </div>
          )
        )}

        {/* ── Conversion: the store ──────────────────────────────── */}
        <div ref={storeRef} className="mt-7 scroll-mt-4">
          <SectionLabel className="mb-3">Store</SectionLabel>
          {products.length ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {products.map((product) => (
                <ProductTile key={product.id} product={product} onClick={() => setBuy(product)} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<StoreGlyph size={30} />}
              title={isOwner ? "Your store is empty" : `${firstName(creator.displayName)} hasn't listed anything yet`}
              outcome={isOwner ? "a shelf you own, not a link you rent" : undefined}
              action={
                isOwner ? (
                  <Button asChild size="sm">
                    <Link href="/dashboard/store">Add your first product</Link>
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>

        {/* ── Replays ────────────────────────────────────────────── */}
        <div className="mt-7">
          <SectionLabel className="mb-3">Replays</SectionLabel>
          {latestVideo ? (
            <div className="flex flex-col gap-2.5">
              <ReplayRow video={latestVideo} username={creator.username} />
              {restVideos.map((video) => (
                <ReplayRow key={video.playbackId} video={video} username={creator.username} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ReplayGlyph size={30} />}
              title={isOwner ? "No replays yet" : "Nothing to replay yet"}
              outcome={isOwner ? undefined : "a channel, not a link list"}
              action={
                isOwner ? (
                  <Button asChild size="sm">
                    <Link href="/dashboard/broadcast">Go live</Link>
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>

        {/* ── Capture: the ownership loop, below the fold ─────────── */}
        {!isOwner && !captureDismissed && (
          <CaptureModule
            className="mt-7"
            creatorName={creator.displayName}
            subscribed={subscribed}
            onFollow={onFollow}
            onDismiss={() => setCaptureDismissed(true)}
          />
        )}

        {!isOwner && (
          <div className="mt-7 flex justify-center">
            <Button variant="secondary" size="sm" onClick={onTip}>
              <TipGlyph size={15} /> Tip {firstName(creator.displayName)}
            </Button>
          </div>
        )}

        {/* Tier 2 — the entire platform presence on a creator page. */}
        <div className="mt-10 flex justify-center">
          <PlatformStamp />
        </div>
      </div>

      <input
        ref={headerInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => onHeaderFile(e.target.files?.[0] ?? null)}
      />

      {alert && (
        <DonationAlert
          amount={alert.amount}
          message={alert.message}
          creatorName={creator.displayName}
          onDone={() => setAlert(null)}
        />
      )}

      {/* Money surfaces render in system tokens — trust surfaces don't theme. */}
      <TipSheet
        open={tipOpen}
        onOpenChange={setTipOpen}
        creatorName={creator.displayName}
        recipient={creator.creatorId}
        presets={currentStream?.donationPresets ?? [1, 3, 5, 10]}
        avatarSeed={creator.avatarColor}
        resource={currentStream ? { kind: "stream", playbackId: currentStream.playbackId } : undefined}
        onSent={(amount, message) => setAlert({ amount, message })}
        onFollow={subscribed ? undefined : onFollow}
      />
      <PurchaseSheet
        product={buy}
        open={!!buy}
        onOpenChange={(open) => !open && setBuy(null)}
        creatorName={creator.displayName}
        onFollow={subscribed || isOwner ? undefined : onFollow}
      />
      <UnlockGate
        open={gateOpen}
        onOpenChange={setGateOpen}
        creatorName={creator.displayName}
        recipient={creator.creatorId}
        contextLabel={creator.displayName}
        oneTimeAmount={currentStream?.viewMode === "one-time" ? currentStream.amount : 3}
        monthlyAmount={currentStream?.viewMode === "monthly" ? currentStream.amount : 9}
        unlockKeys={{
          "one-time": currentStream ? [`stream_access_${currentStream.playbackId}`] : [],
          monthly: [`creator_access_${creator.creatorId}`],
        }}
        resource={currentStream ? { kind: "stream", playbackId: currentStream.playbackId } : undefined}
        onUnlocked={(door) => {
          if (door === "monthly") subscribe(creator.creatorId, channelSummary);
          toast.success(door === "monthly" ? "You're in" : "Unlocked");
        }}
      />

      {!isOwner && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
          <div className="pointer-events-auto flex gap-2 rounded-full border border-white/[0.12] bg-raised/95 p-1.5 backdrop-blur">
            <Button variant="accent" size="sm" onClick={onTip}>
              <TipGlyph size={15} /> Tip
            </Button>
            <Button variant="ghost" size="sm" onClick={() => storeRef.current?.scrollIntoView({ behavior: "smooth" })}>
              Store
            </Button>
          </div>
        </div>
      )}
    </CreatorTheme>
  );
}

/** Avatar carries the accent ring — the accent's first appearance on the page. */
function Avatar({ creator }: { creator: Creator }) {
  return (
    <div
      className="relative size-[76px] shrink-0 overflow-hidden rounded-full border-[2.5px] md:size-[92px]"
      style={{
        borderColor: "var(--creator-accent)",
        background: `linear-gradient(135deg, ${creator.avatarColor ?? "#2b2b2b"}, #141414)`,
      }}
    >
      {creator.avatarUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={creator.avatarUrl} alt="" className="absolute inset-0 size-full object-cover" />
      )}
    </div>
  );
}

function ProductTile({ product, onClick }: { product: Product; onClick: () => void }) {
  const soldOut = product.status === "sold_out";
  return (
    <button
      onClick={onClick}
      disabled={soldOut}
      className="group tap overflow-hidden rounded-[14px] border border-white/[0.08] bg-creator-card text-left transition-colors hover:border-white/[0.16] disabled:opacity-85"
    >
      <div
        className="img-outline relative aspect-square"
        style={{ background: `linear-gradient(160deg, ${product.imageColor}, #101010)` }}
      >
        {product.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-2.5">
        <span className="line-clamp-1 text-[12.5px] font-medium text-ink-soft">{product.name}</span>
        <span className="receipt text-[12.5px] text-muted">
          {soldOut ? "Sold out" : `$${product.price.toFixed(2)}`}
        </span>
      </div>
    </button>
  );
}

/** Replay rows, not a grid — the VOD rail reads as a schedule, TV-style. */
function ReplayRow({ video, username }: { video: Video; username: string }) {
  return (
    <Link
      href={`/${username}/video/${video.playbackId}`}
      className="tap flex items-center gap-3 rounded-[14px] border border-white/[0.08] bg-creator-card p-2.5 transition-colors hover:border-white/[0.16]"
    >
      <div
        className="img-outline relative aspect-video w-[96px] shrink-0 overflow-hidden rounded-[8px] md:w-[128px]"
        style={{ background: `linear-gradient(135deg, ${video.thumbColor}, #0d1420)` }}
      >
        {video.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" />
        )}
        <span className="scrim-bottom absolute inset-x-0 bottom-0 h-1/2" />
        <span className="receipt absolute bottom-1 right-1 rounded-[4px] bg-black/65 px-1.5 py-px text-[9px] text-ink-soft">
          {duration(video.durationSec)}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <ReplayPill small />
        <div className="mt-1.5 line-clamp-1 text-[13px] text-ink-soft">{video.title}</div>
      </div>
      {video.viewMode !== "free" && <PricePill small>${video.amount}</PricePill>}
    </Link>
  );
}

function duration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function firstName(displayName: string) {
  return displayName.split(" ")[0];
}
