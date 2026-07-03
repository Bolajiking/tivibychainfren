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
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-white/85 shadow-[0_18px_60px_rgba(0,0,0,.45)]">
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

function LiveControls() {
  return (
    <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-full border border-white/12 bg-black/45 px-2.5 py-2 text-white shadow-[0_18px_50px_rgba(0,0,0,.45)] backdrop-blur-md">
      <span className="hidden items-center gap-1.5 rounded-full bg-red-500/20 px-2.5 py-1 text-[9px] font-bold tracking-[0.08em] text-red-50 sm:inline-flex">
        <span className="size-[5px] rounded-full bg-live animate-[tvLive_1.4s_infinite]" />
        LIVE
      </span>
      <LP.PlayPauseTrigger className="flex size-8 items-center justify-center rounded-full text-white/90 hover:bg-white/10 hover:text-white" title="Play or pause live video">
        <LP.PlayingIndicator asChild matcher={false}><Play className="ml-0.5 size-[17px] fill-current" /></LP.PlayingIndicator>
        <LP.PlayingIndicator asChild matcher={true}><Pause className="size-[17px] fill-current" /></LP.PlayingIndicator>
      </LP.PlayPauseTrigger>
      <LP.MuteTrigger className="flex size-8 items-center justify-center rounded-full text-white/90 hover:bg-white/10 hover:text-white" title="Mute or unmute">
        <LP.VolumeIndicator asChild matcher={false}><VolumeX className="size-[17px]" /></LP.VolumeIndicator>
        <LP.VolumeIndicator asChild matcher={(volume) => volume > 0}><Volume2 className="size-[17px]" /></LP.VolumeIndicator>
      </LP.MuteTrigger>
      <LP.FullscreenTrigger className="flex size-8 items-center justify-center rounded-full text-white/90 hover:bg-white/10 hover:text-white" title="Fullscreen">
        <Maximize className="size-[16px]" />
      </LP.FullscreenTrigger>
    </div>
  );
}

/** Minimal dark VOD control bar built from Player primitives (design-matched). */
function VodControls() {
  return (
    <LP.Controls className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-10">
      <LP.Seek className="relative flex h-4 items-center">
        <LP.Track className="relative h-[3px] grow rounded-full bg-white/25">
          <LP.SeekBuffer className="absolute h-full rounded-full bg-white/30" />
          <LP.Range className="absolute h-full rounded-full bg-blue" />
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
