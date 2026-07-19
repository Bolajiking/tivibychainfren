"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Copy, Eye, KeyRound, Loader2, MessageSquare, PackageCheck, Radio, RotateCcw, SlidersHorizontal, ShoppingBag, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Tile } from "@/components/ui/Media";
import { useIsDesktop } from "@/lib/use-media-query";
import { useSession } from "@/lib/store/session";
import { getMyCreatorProfile } from "@/lib/profile-client";
import { featureCreatorProduct, updateCreatorStream } from "@/lib/creator-client";
import {
  createBroadcastSession,
  heartbeatBroadcastSession,
  provisionLiveIngest,
  regenerateLiveIngest,
  revealLiveIngest,
  revokeBroadcastSession,
  type BroadcastTransportPlanPayload,
  type LiveIngest,
} from "@/lib/livepeer-client";
import { BroadcastChat } from "@/components/dashboard/BroadcastChat";
import { BrowserBroadcaster } from "@/components/dashboard/BrowserBroadcaster";
import { GoLiveMoment } from "@/components/dashboard/GoLiveMoment";
import { LiveFavicon } from "@/components/brand/LiveFavicon";
import { Mark } from "@/components/brand/Logo";
import { useStreamPresence } from "@/lib/live-hooks";
import { subscribeToStreamStatus } from "@/lib/realtime";
import { useStoreHydrated } from "@/components/dashboard/DashboardScaffold";
import { MOCK_MODE } from "@/lib/config";
import { canFeatureProduct, liveProductUnavailableReason } from "@/lib/product-availability";
import { selectFeaturedProduct } from "@/lib/realtime-state";
import { browserObsFallbackHandoff } from "@/lib/livepeer/obs-fallback";
import type { Creator, CreatorProfilePayload, Product, Stream, ViewMode } from "@/lib/types";

export default function Broadcast() {
  const { user, creator: sessionCreator, setCreator } = useSession();
  const hydrated = useStoreHydrated();
  const [payload, setPayload] = useState<CreatorProfilePayload | null>(null);
  const [stream, setStream] = useState<Stream | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStream, setSavingStream] = useState(false);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("free");
  const [amount, setAmount] = useState("0");
  const [record, setRecord] = useState(true);
  const [pinnedProductId, setPinnedProductId] = useState<string | null>(null);
  const [ingest, setIngest] = useState<LiveIngest | null>(null);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [transportPlan, setTransportPlan] = useState<BroadcastTransportPlanPayload | null>(null);
  const [planEpoch, setPlanEpoch] = useState(0);
  const [keyShown, setKeyShown] = useState(false);
  const [setupError, setSetupError] = useState(false);
  const liveRef = useRef(false);
  const livePersistRetryRef = useRef<number | null>(null);
  const shopPanelRef = useRef<HTMLDivElement>(null);
  const obsPanelRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const [railTab, setRailTab] = useState<"chat" | "setup" | "shop">("chat");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<"live" | "setup">("live");

  useEffect(() => {
    // Wait for the persisted session before deciding (avoids a hard-refresh hang).
    if (!hydrated) return;
    let alive = true;
    async function load() {
      if (!user) {
        setPayload(null);
        setStream(null);
        setLoading(false);
        return;
      }

      if (MOCK_MODE) {
        // No backend in mock mode — never hit the real API (it can't resolve).
        setPayload(
          sessionCreator
            ? { creator: sessionCreator, stream: fallbackStream(sessionCreator), videos: [], products: [], featuredProducts: [], notifications: [], orders: [] }
            : null,
        );
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const next = await getMyCreatorProfile(user.walletAddress);
        if (!alive) return;
        setPayload(next);
        if (next?.creator) setCreator(next.creator);
      } catch (error) {
        if (!alive) return;
        setPayload(null);
        toast.error(error instanceof Error && error.message === "profile_not_found" ? "Create your channel profile first" : "Could not load broadcast desk");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
    // Stable ids only — setCreator writes a new object each fetch (see DashboardHome).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user?.walletAddress, sessionCreator?.creatorId]);

  const creator = payload?.creator ?? sessionCreator;
  const products = useMemo(() => (payload?.products ?? []).filter((product) => product.status !== "archived"), [payload?.products]);
  const pinnableProducts = useMemo(() => products.filter(canFeatureProduct), [products]);
  const activeProduct = products.find((product) => product.id === pinnedProductId && canFeatureProduct(product)) ?? null;

  useEffect(() => {
    const nextStream = payload?.stream ?? fallbackStream(creator);
    setStream(nextStream);
    liveRef.current = Boolean(nextStream?.isActive);
    if (!nextStream) return;
    setTitle(nextStream.title);
    setDescription(nextStream.description ?? "");
    setViewMode(nextStream.viewMode);
    setAmount(String(nextStream.amount));
    setRecord(nextStream.record);
    setIngest(null);
    setKeyShown(false);
  }, [creator, payload?.stream]);

  useEffect(() => {
    return () => {
      if (livePersistRetryRef.current) window.clearTimeout(livePersistRetryRef.current);
    };
  }, []);

  useEffect(() => {
    setPinnedProductId(selectFeaturedProduct((payload?.featuredProducts ?? []).filter((item) => canFeatureProduct(item.product)))?.productId ?? null);
  }, [payload?.featuredProducts]);

  useEffect(() => {
    if (!stream?.isActive) {
      setSecs(0);
      return;
    }
    const started = stream.startedAt ? new Date(stream.startedAt).getTime() : Date.now();
    const tick = () => setSecs(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [stream?.isActive, stream?.startedAt]);

  const live = Boolean(stream?.isActive);
  const clock = `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}`;

  // Real concurrent-viewer count via presence (read-only — host doesn't inflate).
  const presence = useStreamPresence(stream?.playbackId, { enabled: live, track: false });
  const liveViewers = presence ?? stream?.viewerCount ?? 0;
  const ingestStream = MOCK_MODE ? stream : payload?.stream ?? null;

  // Provision (or reveal) Livepeer ingest so the browser broadcaster can publish.
  // The streams row already exists, so we just attach the Livepeer ids to it.
  useEffect(() => {
    if (MOCK_MODE || !user || !ingestStream || ingest) {
      return;
    }
    let alive = true;
    setSetupError(false);
    setIngestBusy(true);
    (async () => {
      try {
        const detail = ingestStream.livepeerId
          ? await revealLiveIngest(ingestStream.livepeerId, user.walletAddress)
          : await provisionLiveIngest(ingestStream.playbackId, ingestStream.title, ingestStream.record, user.walletAddress);
        if (!alive) return;
        setIngest(detail);
        if (!ingestStream.livepeerId) setStream((s) => (s ? { ...s, livepeerId: detail.id, livepeerPlaybackId: detail.playbackId } : s));
      } catch {
        if (alive) setSetupError(true);
      } finally {
        if (alive) setIngestBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingestStream?.playbackId, ingestStream?.livepeerId, user?.walletAddress, ingest]);

  // Broadcast attempt + transport plan (spec §6). A fresh attempt is minted per
  // planEpoch bump (initial ingest, and after each terminal outcome). The
  // attempt is revoked on navigation/unmount; a 10 s heartbeat keeps the
  // pre-publish bridge lease alive.
  useEffect(() => {
    if (MOCK_MODE || !user || !ingest?.id) return;
    let alive = true;
    let attemptId: string | null = null;
    let heartbeatTimer: number | undefined;

    (async () => {
      try {
        const plan = await createBroadcastSession(ingest.id, user.walletAddress);
        if (!alive) {
          void revokeBroadcastSession(plan.attemptId, user.walletAddress);
          return;
        }
        attemptId = plan.attemptId;
        setTransportPlan(plan);
        heartbeatTimer = window.setInterval(() => {
          if (attemptId) void heartbeatBroadcastSession(attemptId, user.walletAddress);
        }, 10_000);
      } catch {
        // No plan → the broadcaster keeps the proven direct-only path.
        if (alive) setTransportPlan(null);
      }
    })();

    return () => {
      alive = false;
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      if (attemptId) void revokeBroadcastSession(attemptId, user.walletAddress);
      setTransportPlan(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingest?.id, user?.walletAddress, planEpoch]);

  useEffect(() => {
    if (MOCK_MODE || !stream?.playbackId) return;
    return subscribeToStreamStatus(stream.playbackId, (next) => {
      setStream(next);
      liveRef.current = next.isActive;
    });
  }, [stream?.playbackId]);

  // The broadcaster's confirmed video status drives our viewer-facing live flag.
  function handleLiveChange(active: boolean, activationSource?: "livepeer_status") {
    void persistLiveState(active, { activationSource });
  }

  async function persistLiveState(
    active: boolean,
    opts?: { activationSource?: "livepeer_status" },
    attempt = 0,
  ) {
    if (livePersistRetryRef.current) {
      window.clearTimeout(livePersistRetryRef.current);
      livePersistRetryRef.current = null;
    }
    if (liveRef.current === active && stream?.isActive === active) return;
    liveRef.current = active;
    const ok = await saveStream(active, { ...opts, quiet: attempt > 0 });
    if (ok) return;
    liveRef.current = Boolean(stream?.isActive);
    if (attempt >= 3) return;
    livePersistRetryRef.current = window.setTimeout(() => {
      livePersistRetryRef.current = null;
      void persistLiveState(active, opts, attempt + 1);
    }, 1_200 * 2 ** attempt);
  }

  async function saveStream(nextActive = live, opts?: { activationSource?: "livepeer_status"; quiet?: boolean }): Promise<boolean> {
    if (!user || !creator || !stream) return false;
    // Guard: only confirmed ingest may make a stream publicly live.
    if (nextActive && !MOCK_MODE && opts?.activationSource !== "livepeer_status") {
      toast.error("Start the broadcast from the Go live control so we can confirm video first");
      return false;
    }
    if (nextActive && !MOCK_MODE && !stream.livepeerId && opts?.activationSource !== "livepeer_status") {
      toast.error("Setting up your stream — try again in a moment");
      return false;
    }
    const statusChanged = stream.isActive !== nextActive;
    setSavingStream(true);
    try {
      const updated = await updateCreatorStream(
        {
          playbackId: stream.playbackId,
          title,
          description,
          viewMode,
          amount: viewMode === "free" ? 0 : amount,
          isActive: nextActive,
          activationSource: opts?.activationSource,
          donationPresets: stream.donationPresets,
          record,
          currentStream: stream,
        },
        user.walletAddress,
      );
      setStream(updated);
      setTitle(updated.title);
      setDescription(updated.description ?? "");
      setViewMode(updated.viewMode);
      setAmount(String(updated.amount));
      setRecord(updated.record);
      if (!opts?.quiet) toast.success(statusChanged ? (nextActive ? "Stream is live" : "Stream ended") : "Setup saved");
      return true;
    } catch (error) {
      if (!opts?.quiet) toast.error(broadcastError(error));
      return false;
    } finally {
      setSavingStream(false);
    }
  }

  async function pinProduct(product: Product | null) {
    if (!user || !stream) return;
    if (product && !canFeatureProduct(product)) {
      toast.error("Only available products can be featured live");
      return;
    }
    setPinningId(product?.id ?? "none");
    try {
      const featured = await featureCreatorProduct({ playbackId: stream.playbackId, productId: product?.id ?? null }, user.walletAddress);
      setPinnedProductId(product?.id ?? null);
      setPayload((current) => current ? { ...current, featuredProducts: featured ? [featured] : [] } : current);
      toast.success(product ? `${product.name} pinned live` : "Featured product cleared");
    } catch (error) {
      toast.error(broadcastError(error));
    } finally {
      setPinningId(null);
    }
  }

  function openLiveShoppingPanel() {
    if (!products.length) {
      toast("Add products in your store first");
      return;
    }
    if (!pinnableProducts.length) {
      toast("Add inventory before featuring products live");
      return;
    }
    // Surface the shopping controls where they live for this viewport.
    if (isDesktop) {
      setRailTab("shop");
    } else {
      setSheetTab("live");
      setSheetOpen(true);
    }
    window.requestAnimationFrame(() => shopPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function handleBrowserObsFallback() {
    const handoff = browserObsFallbackHandoff({ hasIngest: Boolean(ingest), keyShown });
    if (handoff.revealKey) setKeyShown(true);
    if (handoff.focusObsPanel) {
      if (isDesktop) setRailTab("setup");
      else {
        setSheetTab("setup");
        setSheetOpen(true);
      }
      window.requestAnimationFrame(() => {
        obsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
    if (handoff.focusObsPanel) {
      toast.message("Browser live switched to OBS fallback", {
        description: "Use the server and stream key in the OBS panel to keep going live on this network.",
      });
    }
  }

  async function connectEncoder() {
    if (!user || !stream) return;
    setIngestBusy(true);
    try {
      // Reuse this channel's existing stream key when one exists — a new broadcast
      // is a new session under the same stream, never a new Livepeer stream.
      const next = stream.livepeerId
        ? await revealLiveIngest(stream.livepeerId, user.walletAddress)
        : await provisionLiveIngest(stream.playbackId, title || stream.title, record, user.walletAddress);
      setIngest(next);
      setKeyShown(true);
      // Reflect the mapping locally so the viewer player resolves real video.
      setStream((s) => (s ? { ...s, livepeerId: next.id, livepeerPlaybackId: next.playbackId } : s));
      toast.success("Encoder connected — copy your stream key");
    } catch (error) {
      toast.error(ingestError(error));
    } finally {
      setIngestBusy(false);
    }
  }

  async function revealIngest() {
    if (!user || !stream?.livepeerId) return;
    setIngestBusy(true);
    try {
      const next = await revealLiveIngest(stream.livepeerId, user.walletAddress);
      setIngest(next);
      setKeyShown(true);
    } catch (error) {
      toast.error(ingestError(error));
    } finally {
      setIngestBusy(false);
    }
  }

  async function regenerateIngest() {
    if (!user || !stream) return;
    setIngestBusy(true);
    setSetupError(false);
    try {
      const next = await regenerateLiveIngest(stream.playbackId, title || stream.title, record, user.walletAddress);
      setIngest(next);
      setKeyShown(true);
      liveRef.current = false;
      setStream((s) => (s ? { ...s, livepeerId: next.id, livepeerPlaybackId: next.playbackId, isActive: false } : s));
      toast.success("Fresh Livepeer ingest generated");
    } catch (error) {
      toast.error(ingestError(error));
    } finally {
      setIngestBusy(false);
    }
  }

  if (loading) {
    return (
      <BroadcastShell live={false} clock="0:00">
        <div className="flex flex-1 animate-pulse p-4">
          <div className="flex-1 rounded-2xl bg-white/[0.06]" />
          <div className="ml-4 hidden w-[320px] rounded-2xl bg-white/[0.06] lg:block" />
        </div>
      </BroadcastShell>
    );
  }

  if (!user || !creator || !stream) {
    return (
      <BroadcastShell live={false} clock="0:00">
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div className="max-w-[390px]">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-blue-light">
              <Radio className="size-5" />
            </div>
            <h1 className="mt-4 font-display text-[24px] font-semibold tracking-[-0.02em]">Create your channel profile</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">Broadcast tools unlock after your TVinBio channel profile is ready.</p>
            <Button asChild size="lg" className="mt-5"><Link href="/onboarding">Set up profile</Link></Button>
          </div>
        </div>
      </BroadcastShell>
    );
  }

  const setupPanel = (
    <div ref={shopPanelRef} className="p-4">
      <div className="mb-3 text-xs font-semibold tracking-[0.04em] text-ink-dim">STREAM SETUP</div>
      <div className="flex flex-col gap-2.5">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Stream title" className="h-11 rounded-[12px] border border-white/12 bg-white/[0.06] px-3 text-sm text-white placeholder:text-faint focus:border-blue focus:outline-none" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="min-h-20 resize-none rounded-[12px] border border-white/12 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-faint focus:border-blue focus:outline-none" />
        <div className="grid grid-cols-2 gap-2">
          <select value={viewMode} onChange={(e) => setViewMode(e.target.value as ViewMode)} className="h-11 rounded-[12px] border border-white/12 bg-[#151518] px-3 text-sm text-white focus:border-blue focus:outline-none">
            <option value="free">Free</option>
            <option value="one-time">One-time</option>
            <option value="monthly">Monthly</option>
          </select>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} disabled={viewMode === "free"} placeholder="Price" inputMode="decimal" className="h-11 rounded-[12px] border border-white/12 bg-white/[0.06] px-3 text-sm text-white placeholder:text-faint focus:border-blue focus:outline-none disabled:opacity-45" />
        </div>
        <label className="flex h-10 items-center gap-2.5 rounded-[12px] border border-white/10 bg-white/[0.035] px-3 text-[12px] text-ink-dim">
          <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} className="size-4 accent-[#40acff]" />
          Record replay
        </label>
        <Button size="lg" onClick={() => saveStream(live)} disabled={savingStream}>
          {savingStream ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
          Save setup
        </Button>
      </div>
    </div>
  );

  const obsPanel = !MOCK_MODE ? (
    <div ref={obsPanelRef} className="border-t border-white/[0.06] p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-[0.04em] text-ink-dim">STREAM WITH OBS · ALTERNATIVE TO BROWSER</span>
        {stream.livepeerId && <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-blue-soft"><span className="size-[6px] rounded-full bg-blue-light" /> Connected</span>}
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-faint">Go live straight from the browser above, or use these credentials in OBS / any encoder — handy if browser live won&apos;t connect on your network.</p>

      {stream.livepeerId || ingest ? (
        <div className="flex flex-col gap-2.5">
          <CopyRow label="OBS server" value={ingest?.rtmpIngestUrl ?? "rtmp://rtmp.livepeer.com/live"} />
          {ingest && keyShown ? (
            <CopyRow label="Stream key" value={ingest.streamKey} secret />
          ) : (
            <Button size="lg" variant="secondary" onClick={revealIngest} disabled={ingestBusy}>
              {ingestBusy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              Reveal stream key
            </Button>
          )}
          <p className="text-[11px] leading-relaxed text-faint">In OBS, set Server to this URL and Stream Key to the key below. Keep the key private — anyone with it can stream to your channel.</p>
          <Button size="lg" variant="secondary" onClick={regenerateIngest} disabled={ingestBusy || live}>
            {ingestBusy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            Regenerate ingest
          </Button>
          <p className="text-[11px] leading-relaxed text-faint">Use this if Livepeer stays idle or OBS cannot connect. TVinBio will create a fresh Livepeer stream and update this channel.</p>
          {setupError && <p className="text-[11px] leading-relaxed text-red-200">Could not reveal the browser ingest details. Retry the key reveal or refresh the studio.</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className="text-[11.5px] leading-relaxed text-muted">Generate ingest credentials to broadcast from OBS, a hardware encoder, or a mobile app.</p>
          <Button size="lg" onClick={connectEncoder} disabled={ingestBusy}>
            {ingestBusy ? <Loader2 className="size-4 animate-spin" /> : <Radio className="size-4" />}
            {ingestBusy ? "Setting up ingest" : "Generate ingest"}
          </Button>
          {setupError && <p className="text-[11px] leading-relaxed text-red-200">Stream setup did not finish. Retry here or refresh the studio.</p>}
        </div>
      )}
    </div>
  ) : null;

  const shoppingPanel = (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-[0.04em] text-ink-dim">LIVE SHOPPING</span>
        <Link href="/dashboard/store" className="text-[11px] font-semibold text-blue">Store</Link>
      </div>
      {products.length ? (
        <div className="flex flex-col gap-2">
          <ProductPinRow product={null} active={!pinnedProductId} busy={pinningId === "none"} onClick={() => pinProduct(null)} />
          {products.map((product) => (
            <ProductPinRow
              key={product.id}
              product={product}
              active={pinnedProductId === product.id}
              busy={pinningId === product.id}
              disabled={!canFeatureProduct(product)}
              onClick={() => pinProduct(product)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-[11.5px] text-faint">Add products before pinning a live offer.</div>
      )}
    </div>
  );

  const chatHeader = (
    <div className="flex h-[50px] shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
      <span className="text-xs font-semibold tracking-[0.04em] text-ink-dim">LIVE CHAT · MOD</span>
      <span className="inline-flex items-center gap-1.5 text-[11px] text-faint"><Eye className="size-[13px]" /> <span className="receipt">{live ? liveViewers.toLocaleString() : "0"}</span></span>
    </div>
  );

  const broadcaster =
    !MOCK_MODE && ingest?.whipUrl ? (
      <BrowserBroadcaster
        ingestUrl={ingest.whipUrl}
        livepeerId={ingest.id}
        walletAddress={user.walletAddress}
        title={stream.title}
        username={creator.username}
        activeProduct={activeProduct}
        hasProducts={pinnableProducts.length > 0}
        onLiveChange={handleLiveChange}
        onOpenShopping={openLiveShoppingPanel}
        onObsFallback={handleBrowserObsFallback}
        transportPlan={transportPlan}
        onPlanConsumed={() => setPlanEpoch((epoch) => epoch + 1)}
      />
    ) : (
      <ReadyRoomFallback creator={creator} title={stream.title} setupError={setupError} mock={MOCK_MODE} />
    );

  return (
    <BroadcastShell live={live} clock={clock} viewerCount={liveViewers}>
      <LiveFavicon live={live} />
      <GoLiveMoment live={live} name={creator.displayName} handle={creator.username} />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Camera stage — dominant, contained, centered; fills the viewport on mobile. */}
        <div className="relative flex min-h-0 flex-1 flex-col p-0 lg:p-4">
          <div className="relative flex min-h-0 flex-1 overflow-hidden lg:mx-auto lg:w-full lg:max-w-[min(100%,calc((100vh-84px)*16/9))]">
            {broadcaster}
          </div>

          {/* Mobile: right-edge action rail to reach chat / shopping / setup. */}
          {!isDesktop && (
            <div className="pointer-events-none absolute inset-y-0 right-3 z-30 flex flex-col items-center justify-end gap-2.5 pb-28">
              <StageAction label="Chat" onClick={() => { setSheetTab("live"); setSheetOpen(true); }}>
                <MessageSquare className="size-5" />
              </StageAction>
              {pinnableProducts.length > 0 && (
                <StageAction label="Shopping" active={Boolean(activeProduct)} onClick={openLiveShoppingPanel}>
                  <ShoppingBag className="size-5" />
                </StageAction>
              )}
              <StageAction label="Stream setup" onClick={() => { setSheetTab("setup"); setSheetOpen(true); }}>
                <SlidersHorizontal className="size-5" />
              </StageAction>
            </div>
          )}
        </div>

        {/* Desktop: tabbed side rail keeps chat primary, setup + shop one tap away. */}
        {isDesktop && (
          <aside className="flex w-[360px] shrink-0 flex-col border-l border-white/[0.06] bg-[#0a0a0c]">
            <div className="flex shrink-0 gap-1 border-b border-white/[0.06] p-1.5">
              <RailTabButton active={railTab === "chat"} onClick={() => setRailTab("chat")} icon={<MessageSquare className="size-4" />} label="Chat" />
              <RailTabButton active={railTab === "setup"} onClick={() => setRailTab("setup")} icon={<SlidersHorizontal className="size-4" />} label="Setup" />
              <RailTabButton active={railTab === "shop"} onClick={() => setRailTab("shop")} icon={<ShoppingBag className="size-4" />} label="Shop" badge={activeProduct ? 1 : 0} />
            </div>

            {railTab === "chat" && (
              <div className="flex min-h-0 flex-1 flex-col">
                {chatHeader}
                <BroadcastChat streamId={stream.playbackId} hostName={creator.displayName} live={live} />
              </div>
            )}
            {railTab === "setup" && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                {setupPanel}
                {obsPanel}
              </div>
            )}
            {railTab === "shop" && <div className="min-h-0 flex-1 overflow-y-auto">{shoppingPanel}</div>}
          </aside>
        )}
      </div>

      {/* Mobile: bottom-up sheet — Live (chat + shop) on one side, Stream setup on the other. */}
      {!isDesktop && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="Broadcast controls" className="flex h-[82vh] flex-col p-0 pb-0">
          <div className="flex shrink-0 gap-1 px-3 pb-2 pt-1">
            <SheetTabButton active={sheetTab === "live"} onClick={() => setSheetTab("live")} icon={<MessageSquare className="size-4" />} label="Chat & shop" />
            <SheetTabButton active={sheetTab === "setup"} onClick={() => setSheetTab("setup")} icon={<SlidersHorizontal className="size-4" />} label="Stream setup" />
          </div>
          {sheetTab === "live" ? (
            <div className="flex min-h-0 flex-1 flex-col border-t border-white/[0.06]">
              {pinnableProducts.length > 0 && <div className="shrink-0 border-b border-white/[0.06]">{shoppingPanel}</div>}
              <div className="flex min-h-0 flex-1 flex-col">
                {chatHeader}
                <BroadcastChat streamId={stream.playbackId} hostName={creator.displayName} live={live} />
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/[0.06] pb-[env(safe-area-inset-bottom)]">
              {setupPanel}
              {obsPanel}
            </div>
          )}
        </Sheet>
      )}
    </BroadcastShell>
  );
}

function RailTabButton({ active, onClick, icon, label, badge = 0 }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-[12px] font-semibold transition-colors ${active ? "bg-white/[0.08] text-white" : "text-ghost hover:text-white"}`}
    >
      {icon}
      {label}
      {badge > 0 && <span className="absolute right-1.5 top-1.5 size-[6px] rounded-full bg-blue-light" />}
    </button>
  );
}

function SheetTabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-[12px] text-[13px] font-semibold transition-colors ${active ? "bg-white/[0.08] text-white" : "text-ghost hover:text-white"}`}
    >
      {icon}
      {label}
    </button>
  );
}

function StageAction({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`pointer-events-auto flex size-11 items-center justify-center rounded-full border backdrop-blur transition-colors ${active ? "border-blue/40 bg-blue/20 text-blue-light" : "border-white/12 bg-black/45 text-white hover:bg-black/60"}`}
    >
      {children}
    </button>
  );
}

function BroadcastShell({ live, clock, viewerCount, children }: { live: boolean; clock: string; viewerCount?: number; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <div
        className="flex h-[50px] shrink-0 items-center justify-between border-b px-5"
        style={{
          background: live ? "linear-gradient(90deg,rgba(239,68,68,.18),transparent)" : "transparent",
          borderColor: live ? "rgba(239,68,68,.35)" : "rgba(255,255,255,.06)",
        }}
      >
        <div className="flex items-center gap-2.5">
          {live ? (
            <>
              <span className="text-ink-soft"><Mark size={20} live /></span>
              <span className="text-[12px] font-semibold tracking-[0.14em] text-live">ON AIR</span>
              <span className="receipt text-xs text-muted">· {clock}</span>
            </>
          ) : (
            <span className="inline-flex items-center gap-2 text-muted">
              <Mark size={20} />
              <span className="font-display text-[14px] font-semibold">Broadcast desk</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3.5 text-[11.5px]">
          {live && <span className="inline-flex items-center gap-1.5 text-ink-dim"><Eye className="size-[13px]" /> <span className="receipt">{(viewerCount ?? 0).toLocaleString()}</span></span>}
          <Link href="/dashboard" className="font-semibold text-muted hover:text-white">Dashboard</Link>
        </div>
      </div>
      {children}
    </div>
  );
}

function ReadyRoomFallback({ creator, title, setupError, mock }: { creator: Creator; title: string; setupError: boolean; mock: boolean }) {
  return (
    <div className="relative flex-1 overflow-hidden rounded-2xl border border-white/[0.08]" style={{ background: "linear-gradient(150deg,#1d1f24,#0a0a0c 78%)", minHeight: 320 }}>
      <div className="absolute inset-0" style={{ background: `radial-gradient(55% 65% at 50% 40%,${creator.avatarColor ?? "#0091ff"}33,transparent 72%)` }} />
      <div className="absolute left-4 top-4 z-10 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[11px] font-semibold text-ink-dim backdrop-blur">@{creator.username}</div>
      <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
        {mock ? (
          <div className="text-[12px] text-muted">Live video runs once a backend is configured. Your channel, setup and chat all work here.</div>
        ) : setupError ? (
          <div className="max-w-[260px] text-[12px] text-muted">Couldn't set up live video — refresh, or use an RTMP encoder via the ingest panel.</div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted"><Loader2 className="size-6 animate-spin" /><span className="text-[12px]">Preparing your studio…</span></div>
        )}
      </div>
      <div className="absolute bottom-3.5 left-3.5 right-3.5 rounded-xl border border-white/10 bg-[#08080a]/80 p-3 backdrop-blur md:w-[320px]">
        <div className="text-[9px] font-bold tracking-[0.08em] text-blue-soft">READY ROOM</div>
        <div className="mt-1 truncate text-[14px] font-semibold">{title}</div>
      </div>
    </div>
  );
}

function ProductPinRow({
  product,
  active,
  busy,
  disabled,
  onClick,
}: {
  product: Product | null;
  active: boolean;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const unavailable = product ? liveProductUnavailableReason(product) : null;
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${active ? "border-blue/45 bg-blue/[0.13]" : "border-white/[0.06] bg-white/[0.035] hover:bg-white/[0.06]"}`}
    >
      {product ? <Tile seed={product.imageColor} src={product.imageUrl} size={34} radius={10} /> : <span className="flex size-[34px] items-center justify-center rounded-[10px] border border-white/10 text-faint"><X className="size-4" /></span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold text-white">{product?.name ?? "No featured product"}</span>
        <span className="mt-0.5 block text-[10.5px] text-faint">{product ? (unavailable ?? `$${product.price} · ${product.inventory} left`) : "Clear the live shopping card"}</span>
      </span>
      {busy && <Loader2 className="size-3.5 animate-spin text-blue-light" />}
    </button>
  );
}

function fallbackStream(creator?: Creator | null): Stream | null {
  if (!creator) return null;
  return {
    playbackId: `live-${creator.username}`,
    creatorId: creator.creatorId,
    title: `${creator.displayName} live`,
    description: "A new TVinBio channel.",
    viewMode: "free",
    amount: 0,
    isActive: false,
    viewerCount: 0,
    thumbColor: creator.avatarColor ?? "#2a2a2a",
    paidUsers: [],
    donationPresets: [3, 5, 10, 25],
    record: true,
  };
}

function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("Couldn't copy");
    }
  }
  return (
    <div className="rounded-[12px] border border-white/10 bg-white/[0.04] p-2.5">
      <div className="mb-1 text-[9.5px] font-bold tracking-[0.08em] text-faint">{label.toUpperCase()}</div>
      <div className="flex items-center gap-2">
        <code className={`min-w-0 flex-1 truncate text-[12px] ${secret ? "tracking-wider text-blue-soft" : "text-ink-dim"}`}>{value}</code>
        <button onClick={copy} aria-label={`Copy ${label}`} className="shrink-0 text-ghost hover:text-white">
          {copied ? <Check className="size-4 text-blue-light" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function ingestError(error: unknown) {
  if (!(error instanceof Error)) return "Couldn't set up live ingest";
  if (error.message === "livepeer_unconfigured") return "Live video isn't configured yet";
  if (error.message === "not_resource_owner") return "This stream belongs to another channel";
  if (error.message === "missing_token" || error.message === "invalid_token" || error.message === "unauthorized") return "Sign in again to set up ingest";
  if (error.message === "stream_not_found" || error.message === "server_unconfigured") return "Create your channel stream first";
  if (error.message === "livepeer_response_invalid" || error.message === "livepeer_ingest_unavailable") return "The video service did not return usable ingest details";
  return "Couldn't set up live ingest";
}

function broadcastError(error: unknown) {
  if (!(error instanceof Error)) return "Broadcast update failed";
  if (error.message === "bad_stream_amount") return "Add a valid paid amount";
  if (error.message === "missing_stream_title") return "Add a stream title";
  if (error.message === "stream_not_found") return "Create your channel stream first";
  if (error.message === "stream_activation_requires_ingest") return "Start the broadcast from the Go live control so video can be confirmed first";
  if (error.message === "product_not_found") return "That product is no longer available";
  if (error.message === "product_unavailable") return "Only available products can be featured live";
  if (error.message === "missing_token" || error.message === "invalid_token") return "Sign in again to manage your stream";
  return "Broadcast update failed";
}
