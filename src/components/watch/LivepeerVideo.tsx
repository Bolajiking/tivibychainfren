"use client";

import * as LP from "@livepeer/react/player";
import { Loader2, Maximize, Pause, Play, Radio, Volume2, VolumeX } from "lucide-react";
import type { PlaybackSrc } from "@/lib/livepeer/playback";
import { playbackTransportPolicy } from "@/lib/livepeer/playback-gating";

/**
 * The actual `@livepeer/react` Player render. Kept in its own module so it can be
 * lazy-loaded (next/dynamic) only when there's a source to play — an OFFLINE
 * channel never pulls the ~300 kB player kit into its route bundle.
 */
export default function LivepeerVideo({
  src,
  mode,
  className,
  autoPlay,
}: {
  src: PlaybackSrc;
  mode: "live" | "vod";
  className?: string;
  autoPlay?: boolean;
}) {
  const transport = playbackTransportPolicy(mode, Boolean(autoPlay));
  return (
    <LP.Root
      src={src}
      autoPlay={autoPlay}
      volume={transport.volume}
      lowLatency={transport.lowLatency}
      timeout={transport.timeoutMs}
      cacheWebRTCFailureMs={transport.webRtcFailureCacheMs}
      preload={mode === "live" ? "auto" : "metadata"}
    >
      <LP.Container className={className} style={{ width: "100%", height: "100%", background: "#000" }}>
        <LP.Video title="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <LP.LoadingIndicator asChild>
          <div className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[2px]">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-white/85">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-[12px] font-semibold">{mode === "live" ? "Connecting to live video" : "Opening replay"}</span>
            </div>
          </div>
        </LP.LoadingIndicator>
        {mode === "live" ? <LiveControls /> : <VodControls />}
      </LP.Container>
    </LP.Root>
  );
}

/**
 * Stage grammar (Package 3): flat icon chrome on a scrim — no boxes, no
 * shadows, no backdrop panels. The UI may never out-bright the stream.
 * Every target is ≥44px.
 */
function LiveControls() {
  return (
    <>
      {/* Muted autoplay is the platform muscle memory fans arrive with, so the
          unmute affordance is the loudest thing on the frame until it's used. */}
      <LP.VolumeIndicator asChild matcher={false}>
        <LP.MuteTrigger
          className="absolute left-1/2 top-[46%] z-20 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full border border-white/20 bg-black/60 px-[18px] py-[11px] text-[13px] font-semibold text-ink-soft"
          title="Tap for sound"
        >
          <VolumeX className="size-4" />
          Tap for sound
        </LP.MuteTrigger>
      </LP.VolumeIndicator>

      <div className="scrim-bottom pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[34%]" />

      {/* The live edge, in live-red — its one non-chip use. */}
      <div className="absolute inset-x-4 bottom-[52px] z-20 h-[3px] rounded-full bg-white/20">
        <span className="block h-full w-[98.5%] rounded-full bg-live" />
      </div>

      <div className="absolute inset-x-2 bottom-1 z-20 flex items-center gap-1 text-ink-soft">
        <LP.PlayPauseTrigger className="grid size-11 place-items-center rounded-full text-white/90 hover:text-white" title="Play or pause live video">
          <LP.PlayingIndicator asChild matcher={false}><Play className="ml-0.5 size-[22px] fill-current" /></LP.PlayingIndicator>
          <LP.PlayingIndicator asChild matcher={true}><Pause className="size-[22px] fill-current" /></LP.PlayingIndicator>
        </LP.PlayPauseTrigger>
        <LP.MuteTrigger className="grid size-11 place-items-center rounded-full text-white/90 hover:text-white" title="Mute or unmute">
          <LP.VolumeIndicator asChild matcher={false}><VolumeX className="size-[22px]" /></LP.VolumeIndicator>
          <LP.VolumeIndicator asChild matcher={(volume) => volume > 0}><Volume2 className="size-[22px]" /></LP.VolumeIndicator>
        </LP.MuteTrigger>
        <span className="receipt ml-1 text-[11px] text-ink-dim [text-shadow:0_1px_6px_rgba(0,0,0,.6)]">LIVE · −0:00</span>
        <LP.FullscreenTrigger className="ml-auto grid size-11 place-items-center rounded-full text-white/90 hover:text-white" title="Fullscreen">
          <Maximize className="size-[20px]" />
        </LP.FullscreenTrigger>
      </div>
    </>
  );
}

/** Minimal dark VOD control bar built from Player primitives (design-matched). */
function VodControls() {
  return (
    <LP.Controls className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-10">
      <LP.Seek className="relative flex h-4 items-center">
        <LP.Track className="relative h-[3px] grow rounded-full bg-white/25">
          <LP.SeekBuffer className="absolute h-full rounded-full bg-white/30" />
          <LP.Range className="absolute h-full rounded-full bg-beam" />
        </LP.Track>
        <LP.Thumb className="block size-2.5 rounded-full bg-white" />
      </LP.Seek>
      <div className="flex items-center gap-3 text-white">
        <span className="hidden items-center gap-1.5 rounded-full bg-white/10 px-2 py-1 text-[9px] font-bold tracking-[0.08em] text-white/75 sm:inline-flex">
          <Radio className="size-3" />
          REPLAY
        </span>
        <LP.PlayPauseTrigger className="text-white/90 hover:text-white">
          <LP.PlayingIndicator asChild matcher={false}><Play className="size-[18px] fill-current" /></LP.PlayingIndicator>
          <LP.PlayingIndicator asChild matcher={true}><Pause className="size-[18px] fill-current" /></LP.PlayingIndicator>
        </LP.PlayPauseTrigger>
        <LP.MuteTrigger className="text-white/90 hover:text-white">
          <LP.VolumeIndicator asChild matcher={false}><VolumeX className="size-[18px]" /></LP.VolumeIndicator>
          <LP.VolumeIndicator asChild matcher={true}><Volume2 className="size-[18px]" /></LP.VolumeIndicator>
        </LP.MuteTrigger>
        <LP.Time className="text-[11px] tabular-nums text-white/80" />
        <LP.FullscreenTrigger className="ml-auto text-white/90 hover:text-white">
          <Maximize className="size-[17px]" />
        </LP.FullscreenTrigger>
      </div>
    </LP.Controls>
  );
}
