"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { LayoutGrid, ShoppingBag } from "lucide-react";
import { Stage } from "./Stage";
import { Triad, type Room } from "@/components/nav/Triad";
import { OwnerToggle } from "@/components/nav/OwnerToggle";
import { VideoCard, ProductCard } from "@/components/cards/Cards";
import { UnlockGate } from "@/components/money/UnlockGate";
import { TipSheet } from "@/components/money/TipSheet";
import { PurchaseSheet } from "@/components/money/PurchaseSheet";
import { DonationAlert } from "@/components/money/DonationAlert";
import { Button } from "@/components/ui/Button";
import { SectionLabel } from "@/components/ui/Badges";
import { useSession } from "@/lib/store/session";
import { useAuthIntent } from "@/lib/auth/useAuthIntent";
import { hasAccess, matchesAny } from "@/lib/access";
import { canFeatureProduct } from "@/lib/product-availability";
import { subscribeToCreatorStreams, subscribeToFeaturedProducts } from "@/lib/realtime";
import { useStreamPresence } from "@/lib/live-hooks";
import { uploadChannelArt } from "@/lib/profile-client";
import { removeFeaturedProduct, selectFeaturedProduct, upsertFeaturedProduct } from "@/lib/realtime-state";
import { applyCreatorStreamChange, mergePolledCreatorStream } from "@/lib/channel-stream-state";
import { channelLiveStatusPollMs, createSingleFlightChannelRefresh } from "@/lib/channel-live-polling";
import { useHydrated } from "@/lib/store/useHydrated";
import type { Creator, Stream, Video, Product, FeaturedProductWithProduct } from "@/lib/types";

export function ChannelExperience({
  creator,
  stream,
  videos,
  products,
  featured,
}: {
  creator: Creator;
  stream: Stream | null;
  videos: Video[];
  products: Product[];
  featured: FeaturedProductWithProduct[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // "?install=1" (from a Save-channel link) auto-opens the install flow on arrival.
  const autoInstall = searchParams.get("install") === "1";
  const { user, requireAuth } = useAuthIntent("viewer");
  const { isSubscribed, subscribe, isUnlocked } = useSession();
  const hydrated = useHydrated();
  const [ownerMode, setOwnerMode] = useState<"public" | "manage">("public");
  const [room, setRoom] = useState<Room>("watch");
  const [gateOpen, setGateOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [buy, setBuy] = useState<Product | null>(null);
  const [alert, setAlert] = useState<{ amount: number; message: string } | null>(null);
  const [currentStream, setCurrentStream] = useState<Stream | null>(stream);
  const [featuredItems, setFeaturedItems] = useState<FeaturedProductWithProduct[]>(featured);
  const [headerUrl, setHeaderUrl] = useState<string | null>(creator.headerUrl ?? null);
  const [headerUploading, setHeaderUploading] = useState(false);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const pollAbortRef = useRef<AbortController | null>(null);

  const wallets = hydrated ? user?.walletAddresses ?? [] : [];
  // Only the wallet that owns this channel may enter manage view. Everyone else
  // is locked to the public surface regardless of local toggle state.
  const canManage = matchesAny(wallets, creator.creatorId);
  const isOwner = canManage && ownerMode === "manage";
  const subscribed = hydrated && isSubscribed(creator.creatorId);

  // On the creator's own channel, default to the owner/manage view (once the
  // owning wallet resolves). They can still flip to "View as public"; we only
  // auto-set the default once so the toggle stays in their control.
  const defaultedOwnerView = useRef(false);
  useEffect(() => {
    if (canManage && !defaultedOwnerView.current) {
      defaultedOwnerView.current = true;
      setOwnerMode("manage");
    }
  }, [canManage]);

  const streamKey = currentStream ? `stream_access_${currentStream.playbackId}` : "";
  const creatorKey = `creator_access_${creator.creatorId}`;
  const unlockedLocally = hydrated && ((streamKey && isUnlocked(streamKey)) || isUnlocked(creatorKey));

  const gated = !!currentStream && currentStream.viewMode !== "free";
  const accessGranted =
    !gated ||
    subscribed ||
    unlockedLocally ||
    (currentStream ? hasAccess({ resource: currentStream, wallets }) : true);
  const locked = !isOwner && gated && !accessGranted;

  const oneTimeAmount = currentStream?.viewMode === "one-time" ? currentStream.amount : 3;
  const monthlyAmount = currentStream?.viewMode === "monthly" ? currentStream.amount : 9;
  const presets = currentStream?.donationPresets ?? [1, 5, 10, 20];
  const featuredProduct = selectFeaturedProduct(featuredItems.filter((item) => canFeatureProduct(item.product)));

  // Real "X watching" via presence (read-only — browsing the channel doesn't count).
  const presence = useStreamPresence(currentStream?.playbackId, { enabled: !!currentStream?.isActive, track: false });
  const stageStream = currentStream ? { ...currentStream, viewerCount: presence ?? currentStream.viewerCount } : null;

  useEffect(() => setCurrentStream(stream), [stream]);
  useEffect(() => {
    setFeaturedItems(currentStream?.playbackId === stream?.playbackId ? featured : []);
  }, [currentStream?.playbackId, featured, stream?.playbackId]);

  useEffect(() => {
    return subscribeToCreatorStreams(creator.creatorId, (event) => {
      setCurrentStream((current) => applyCreatorStreamChange(current, event));
    });
  }, [creator.creatorId]);

  const performStreamStatusRefresh = useCallback(async () => {
    const controller = new AbortController();
    pollAbortRef.current = controller;
    try {
      const res = await fetch(`/api/channels/${encodeURIComponent(creator.username)}/stream`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const next = data && typeof data === "object" && "stream" in data ? (data.stream as Stream | null) : null;
      if (!controller.signal.aborted) {
        setCurrentStream((current) => mergePolledCreatorStream(current, next));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    } finally {
      if (pollAbortRef.current === controller) pollAbortRef.current = null;
    }
  }, [creator.username]);

  const refreshStreamStatus = useMemo(
    () => createSingleFlightChannelRefresh(performStreamStatusRefresh),
    [performStreamStatusRefresh],
  );

  useEffect(() => {
    const intervalMs = channelLiveStatusPollMs(Boolean(currentStream?.isActive));
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshStreamStatus();
    }, intervalMs);
    void refreshStreamStatus();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshStreamStatus();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      pollAbortRef.current?.abort();
    };
  }, [currentStream?.isActive, refreshStreamStatus]);

  useEffect(() => {
    if (!currentStream) return;
    return subscribeToFeaturedProducts(currentStream.playbackId, (event) => {
      setFeaturedItems((current) =>
        event.type === "delete"
          ? removeFeaturedProduct(current, event.productId)
          : upsertFeaturedProduct(current, event.item),
      );
    });
  }, [currentStream?.playbackId]);

  function onPlay() {
    if (locked) return setGateOpen(true);
    if (currentStream?.isActive) router.push(`/${creator.username}/live`);
    else toast("Starting playback…");
  }

  const channelSummary = {
    creatorId: creator.creatorId,
    username: creator.username,
    displayName: creator.displayName,
    avatarColor: creator.avatarColor,
    avatarUrl: creator.avatarUrl,
  };

  function onSubscribe() {
    if (!requireAuth({ role: "viewer" })) return;
    if (subscribed) return;
    if (gated) return setGateOpen(true); // paid sub goes through the gate
    subscribe(creator.creatorId, channelSummary);
    toast.success(`Subscribed to ${creator.displayName}`);
  }

  function onTip() {
    if (!requireAuth({ role: "viewer" })) return;
    setTipOpen(true);
  }

  // Owner uploads the channel header (the offline stage poster).
  async function onHeaderFile(file: File | null) {
    if (!file || !user) return;
    setHeaderUrl(URL.createObjectURL(file)); // instant preview
    setHeaderUploading(true);
    try {
      const url = await uploadChannelArt(file, user.walletAddress, "header");
      if (url) {
        setHeaderUrl(url);
        const cur = useSession.getState().creator;
        if (cur && matchesAny([cur.creatorId], creator.creatorId)) useSession.getState().setCreator({ ...cur, headerUrl: url });
      }
      toast.success("Channel header updated");
    } catch {
      toast.error("Couldn't upload header");
      setHeaderUrl(creator.headerUrl ?? null);
    } finally {
      setHeaderUploading(false);
    }
  }

  function onGoLive() {
    if (requireAuth({ role: "creator", next: "/dashboard/broadcast" })) {
      router.push("/dashboard/broadcast");
    }
  }

  function onUpload() {
    // Upload = VOD (Livepeer asset upload), not the live broadcast desk.
    if (requireAuth({ role: "creator", next: "/dashboard/videos?compose=1" })) {
      router.push("/dashboard/videos?compose=1");
    }
  }

  function onUnlocked(door: "one-time" | "monthly") {
    if (door === "monthly") subscribe(creator.creatorId, channelSummary);
    toast.success(door === "monthly" ? "Subscribed — welcome in" : "Unlocked");
  }

  function onTipSent(amount: number, message: string) {
    setAlert({ amount, message });
  }

  return (
    <div className="relative mx-auto w-full max-w-[1180px] px-4 pb-24 pt-4 md:px-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
          <span className={`size-[7px] rounded-full ${isOwner ? "bg-online" : "bg-blue"}`} />
          {isOwner ? "Owner view · manage" : currentStream?.isActive ? "Live now" : "Channel"}
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {isOwner && (
              <Button asChild size="pill" variant="secondary">
                <Link href="/dashboard"><LayoutGrid className="size-[15px]" /> Dashboard</Link>
              </Button>
            )}
            <OwnerToggle mode={ownerMode} onChange={setOwnerMode} />
          </div>
        )}
      </div>

      <div className="relative">
        <Stage
          creator={creator}
          stream={stageStream}
          isOwner={isOwner}
          locked={locked}
          height={460}
          statusLine={currentStream?.description}
          subscribed={subscribed}
          onPlay={onPlay}
          onSubscribe={onSubscribe}
          onTip={onTip}
          onGoLive={onGoLive}
          onUpload={onUpload}
          onEditHeader={canManage ? () => headerInputRef.current?.click() : undefined}
          headerUrl={headerUrl}
          headerUploading={headerUploading}
          autoInstall={autoInstall}
        >
          {room === "watch" && currentStream?.isActive && featuredProduct && !locked && (
            <div className="absolute inset-x-4 top-[34%] z-20 animate-[tvDrop_.5s_cubic-bezier(.22,1,.36,1)] rounded-2xl border-[1.5px] border-blue bg-[#08080a]/90 p-3.5 backdrop-blur-md shadow-[0_16px_50px_rgba(0,145,255,.32)] md:left-auto md:right-4 md:w-[280px]">
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
                  <div className="mt-1 font-display text-[19px] font-bold">${featuredProduct.product.price}</div>
                </div>
              </div>
              <Button className="mt-3 w-full" onClick={() => setBuy(featuredProduct.product)}>Buy now</Button>
            </div>
          )}
        </Stage>

        {alert && (
          <DonationAlert
            amount={alert.amount}
            message={alert.message}
            creatorName={creator.displayName}
            onDone={() => setAlert(null)}
          />
        )}

        <input
          ref={headerInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => onHeaderFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="mt-5">
        <Triad active={room} onChange={setRoom} />
      </div>

      {room === "watch" ? (
        <div className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>{isOwner ? "Your videos" : "Recent"}</SectionLabel>
            <span className="text-[11px] font-semibold text-faint">{videos.length} {videos.length === 1 ? "video" : "videos"}</span>
          </div>
          {videos.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {videos.map((v) => (
                <VideoCard key={v.playbackId} video={v} href={`/${creator.username}/video/${v.playbackId}`} />
              ))}
            </div>
          ) : (
            <Empty label="No videos yet" hint={isOwner ? "Upload your first replay" : "Subscribe to get notified"} />
          )}
        </div>
      ) : room === "shop" ? (
        <div className="mt-5">
          <SectionLabel className="mb-3">Shop</SectionLabel>
          {products.length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} onClick={() => setBuy(p)} />
              ))}
            </div>
          ) : (
            <Empty label="Store is empty" hint={isOwner ? "Add your first product" : "Check back soon"} icon />
          )}
        </div>
      ) : null}

      <UnlockGate
        open={gateOpen}
        onOpenChange={setGateOpen}
        creatorName={creator.displayName}
        recipient={creator.creatorId}
        contextLabel={currentStream?.title ? `${creator.displayName} · ${currentStream.title}` : creator.displayName}
        oneTimeAmount={oneTimeAmount}
        monthlyAmount={monthlyAmount}
        unlockKeys={{ "one-time": streamKey ? [streamKey] : [], monthly: [creatorKey] }}
        resource={currentStream ? { kind: "stream", playbackId: currentStream.playbackId } : undefined}
        onUnlocked={onUnlocked}
      />
      <TipSheet
        open={tipOpen}
        onOpenChange={setTipOpen}
        creatorName={creator.displayName}
        recipient={creator.creatorId}
        presets={presets}
        avatarSeed={creator.avatarColor}
        resource={currentStream ? { kind: "stream", playbackId: currentStream.playbackId } : undefined}
        onSent={onTipSent}
      />
      <PurchaseSheet product={buy} open={!!buy} onOpenChange={(v) => !v && setBuy(null)} />
    </div>
  );
}

function Empty({ label, hint, icon }: { label: string; hint: string; icon?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 py-14 text-center">
      {icon && <ShoppingBag className="size-7 text-ghost" />}
      <div className="text-sm font-semibold text-ink-dim">{label}</div>
      <div className="text-[11.5px] text-faint">{hint}</div>
    </div>
  );
}
