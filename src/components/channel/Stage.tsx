"use client";

import { Lock, Loader2, Maximize2, HandCoins, ImagePlus, Upload, Radio, Play } from "lucide-react";
import { Tile } from "@/components/ui/Media";
import { Button } from "@/components/ui/Button";
import { LivePill, ViewerPill } from "@/components/ui/Badges";
import { Player } from "@/components/watch/Player";
import { InstallButton } from "@/components/pwa/InstallButton";
import { cn, formatCount } from "@/lib/cn";
import type { Creator, Stream } from "@/lib/types";

export function Stage({
  creator,
  stream,
  isOwner,
  locked,
  height = 476,
  statusLine,
  onPlay,
  onSubscribe,
  onTip,
  onGoLive,
  onUpload,
  onEditHeader,
  headerUrl,
  headerUploading,
  subscribed,
  autoInstall = false,
  children,
}: {
  creator: Creator;
  stream: Stream | null;
  isOwner: boolean;
  locked: boolean;
  height?: number;
  statusLine?: string;
  onPlay?: () => void;
  onSubscribe?: () => void;
  onTip?: () => void;
  onGoLive?: () => void;
  onUpload?: () => void;
  onEditHeader?: () => void;
  headerUrl?: string | null;
  headerUploading?: boolean;
  subscribed?: boolean;
  /** Arrived from a "Save channel" link → auto-open the install flow. */
  autoInstall?: boolean;
  children?: React.ReactNode;
}) {
  const isLive = !!stream?.isActive;
  const showPlayer = isLive && !locked;
  const livePlaybackId = stream ? stream.livepeerPlaybackId ?? stream.playbackId : "";
  const glow = isOwner && !isLive ? "rgba(34,197,94,.12)" : "rgba(64,172,255,.14)";
  const profileStatus = isLive ? `Live now · ${stream?.title ?? creator.displayName}` : statusLine;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[22px] border transition-[border-color,box-shadow] duration-500 ease-[cubic-bezier(.22,1,.36,1)]",
        isLive ? "border-live/35" : "border-white/[0.08]",
      )}
      style={{
        height,
        background: "#0a0a0c",
        boxShadow: isLive
          ? "0 0 0 1px rgba(239,68,68,.28), 0 24px 70px rgba(0,0,0,.62), 0 0 60px rgba(239,68,68,.13)"
          : `0 0 0 1px ${isOwner && !isLive ? "rgba(34,197,94,.14)" : "rgba(64,172,255,.14)"},0 24px 60px rgba(0,0,0,.55)`,
      }}
    >
      {isLive && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] animate-[tvGlow_4.8s_ease-in-out_infinite]" style={{ background: "radial-gradient(58% 56% at 50% 34%,rgba(239,68,68,.18),transparent 72%)" }} />
          <div aria-hidden className="pointer-events-none absolute inset-0 z-[2] rounded-[22px] border border-live/25 shadow-[inset_0_0_42px_rgba(239,68,68,.12)]" />
        </>
      )}
      {showPlayer ? (
        <Player playbackId={livePlaybackId} mode="live" autoPlay className="absolute inset-0 z-0 size-full">
          <div className="absolute inset-0" style={{ background: "linear-gradient(150deg,#1d1f24,#0a0a0c 75%)" }} />
        </Player>
      ) : headerUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={headerUrl} alt="" className="absolute inset-0 z-0 size-full object-cover" />
          <div className="absolute inset-0 z-0" style={{ background: "linear-gradient(150deg,rgba(8,8,11,.28),rgba(8,8,11,.5) 75%)" }} />
        </>
      ) : (
        <>
          <div className="absolute inset-0 z-0" style={{ background: "linear-gradient(150deg,#1d1f24,#0a0a0c 75%)" }} />
          <div className="absolute inset-0 z-0" style={{ background: `radial-gradient(60% 80% at 50% 38%, ${glow}, transparent 70%)` }} />
        </>
      )}
      {locked && isLive && <div className="absolute inset-0 z-[1] backdrop-blur-[3px]" style={{ background: "rgba(4,4,6,.5)" }} />}

      <div className="absolute left-[18px] top-[18px] z-10 flex items-center gap-2.5">
        {isLive ? (
          <>
            <LivePill />
            <ViewerPill count={stream!.viewerCount} />
          </>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-[10px] font-bold tracking-[0.06em] text-ink-dim backdrop-blur">
            <span className="size-[6px] rounded-full bg-muted" /> OFFLINE
          </span>
        )}
      </div>

      {showPlayer ? (
        <button
          type="button"
          onClick={onPlay}
          aria-label="Open full player"
          className="absolute right-[18px] top-[18px] z-10 flex size-9 items-center justify-center rounded-[10px] bg-black/40 text-ink-dim backdrop-blur transition hover:text-white"
        >
          <Maximize2 className="size-4" />
        </button>
      ) : isOwner && onEditHeader ? (
        <button
          type="button"
          onClick={onEditHeader}
          disabled={headerUploading}
          className="absolute right-[18px] top-[18px] z-10 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-[11px] font-semibold text-ink-dim backdrop-blur transition hover:text-white disabled:opacity-60"
        >
          {headerUploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
          {headerUrl ? "Change header" : "Add header"}
        </button>
      ) : null}

      {isLive && locked && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
          <span className="flex size-[58px] items-center justify-center rounded-[18px] border border-white/[0.14] bg-white/[0.06] text-ink-dim">
            <Lock className="size-7" />
          </span>
          <span className="text-xs font-semibold text-ink-dim">Subscribe to watch live</span>
        </div>
      )}

      {children}

      <div
        className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-end gap-x-4 gap-y-3 px-5 pb-5 pt-[60px] md:flex-nowrap md:px-6 md:pb-[22px]"
        style={{ background: "linear-gradient(0deg,rgba(6,6,8,.94),rgba(6,6,8,.55) 55%,transparent)" }}
      >
        <div className="relative shrink-0">
          {isLive && (
            <>
              <span aria-hidden className="absolute -inset-2 rounded-[24px] border border-live/35 animate-[tvLive_1.8s_infinite]" />
              <span aria-hidden className="absolute -inset-1 rounded-[22px] bg-live/20 blur-md" />
            </>
          )}
          <Tile seed={creator.avatarColor} src={creator.avatarUrl} size={64} radius={18} />
          {isLive && <span aria-hidden className="absolute -right-1 -top-1 size-4 rounded-full border-2 border-black bg-live shadow-[0_0_14px_rgba(239,68,68,.9)]" />}
        </div>
        <div className="min-w-0 flex-1">
          {profileStatus && (
            <div className={cn("mb-1.5 flex items-center gap-1.5 text-[11px] text-ink-dim md:text-xs", isLive && "font-semibold text-white")}>
              <span className={cn("size-[5px] shrink-0 rounded-full", isLive ? "bg-live shadow-[0_0_12px_rgba(239,68,68,.9)] animate-[tvLive_1.4s_infinite]" : "bg-online")} />
              <span className="truncate">{profileStatus}</span>
            </div>
          )}
          <h1 className="truncate font-display text-[26px] font-semibold leading-[0.98] tracking-[-0.02em] md:text-[38px]">{creator.displayName}</h1>
          <div className="mt-1.5 flex items-center gap-2.5 text-[12px] text-muted md:mt-2 md:text-[13px]">
            <span className="receipt shrink-0 text-ink-dim">tvin.bio/{creator.username}</span>
            <Dot /> <span className="receipt truncate">{formatCount(creator.subscriberCount)} subscribers</span>
          </div>
        </div>
        {/* Actions wrap to a full-width row below on mobile, inline on desktop. */}
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2.5 md:w-auto md:flex-nowrap">
          {isOwner ? (
            <>
              <Button variant="golive" size="pill" onClick={onGoLive} className="flex-1 md:flex-none"><Radio className="size-4" /> Go live</Button>
              <Button variant="secondary" size="pill" onClick={onUpload} className="flex-1 md:flex-none"><Upload className="size-4" /> Upload</Button>
              <InstallButton subject="channel" name={creator.displayName} autoPrompt={autoInstall} size="pill" variant="secondary" className="flex-1 md:flex-none" />
            </>
          ) : (
            <>
              {isLive && (
                <Button size="pill" onClick={onPlay} variant="live" className="min-w-[132px] flex-1 md:flex-none">
                  <Play className="size-4 fill-current" /> {locked ? "Unlock live" : "Watch live"}
                </Button>
              )}
              <Button size="pill" onClick={onSubscribe} variant={subscribed ? "secondary" : "primary"} className="min-w-[118px] flex-1 md:flex-none">
                {subscribed ? "Subscribed" : "Subscribe"}
              </Button>
              <Button variant="secondary" size="pill" onClick={onTip} className="min-w-[96px] flex-1 md:flex-none"><HandCoins className="size-4" /> Tip</Button>
              <InstallButton subject="channel" name={creator.displayName} autoPrompt={autoInstall} size="pill" variant="secondary" className="flex-1 md:flex-none" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Dot() {
  return <span className="size-[3px] rounded-full bg-ghost" />;
}
