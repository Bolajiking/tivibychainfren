"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Radio, VideoOff } from "lucide-react";
import type { PlaybackInfo, PlaybackSrc } from "@/lib/livepeer/playback";

// The heavy @livepeer/react render is loaded only when there's a source to play,
// so OFFLINE channels / unresolved VODs never carry the player kit (~300 kB).
const LivepeerVideo = dynamic(() => import("@/components/watch/LivepeerVideo"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-black/40">
      <Loader2 className="size-6 animate-spin text-white/80" />
    </div>
  ),
});

type Status = "idle" | "ready" | "starting" | "processing" | "not_found" | "mock";

/**
 * Viewer player wearing our stage UI. Resolves a health-checked source then
 * lazy-mounts `@livepeer/react`'s Player (WebRTC low-latency for live, HLS
 * fallback) — no default Livepeer chrome on live (our overlays own it); a
 * minimal dark control bar on VOD.
 *
 * The src is resolved against our health-checked playback seam:
 * - **Live**: poll every 2s so the stream appears the instant the encoder
 *   starts; keep the prior src through transient blips (3-miss clear).
 * - **VOD**: exponential backoff (2→4→8…cap 15s) to ride out asset processing.
 * Mock mode renders the designed placeholder (`children`).
 */
export function Player({
  playbackId,
  mode,
  className,
  poster,
  autoPlay,
  children,
}: {
  playbackId: string;
  mode: "live" | "vod";
  className?: string;
  poster?: string;
  autoPlay?: boolean;
  children: React.ReactNode;
}) {
  const [src, setSrc] = useState<PlaybackSrc | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const sigRef = useRef("");
  const offlineRef = useRef(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    setSrc(null);
    setStatus("idle");
    sigRef.current = "";
    offlineRef.current = 0;

    const apply = (next: PlaybackSrc) => {
      const sig = signature(next);
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        setSrc(next);
      }
    };

    const tick = async () => {
      let info: PlaybackInfo;
      try {
        info = await fetch(`/api/livepeer/playback/${encodeURIComponent(playbackId)}?mode=${mode}`, { cache: "no-store" }).then((r) => r.json());
      } catch {
        info = { state: "processing" };
      }
      if (!alive) return;

      if (info.state === "mock") return setStatus("mock");
      if (info.state === "ready") {
        offlineRef.current = 0;
        apply(info.sources);
        setStatus("ready");
        if (mode === "vod") return; // settled
      } else if (info.state === "not_found" && mode === "vod") {
        return setStatus("not_found");
      } else {
        offlineRef.current += 1;
        if (mode === "live") {
          if (offlineRef.current >= 3) {
            sigRef.current = "";
            setSrc(null);
            setStatus(info.state === "starting" ? "starting" : "processing");
          }
        } else {
          setStatus(info.state === "starting" ? "starting" : "processing");
        }
      }

      if (mode === "live") {
        timer = setTimeout(tick, 2000);
      } else if (info.state !== "ready") {
        attempt += 1;
        if (attempt > 18) return;
        timer = setTimeout(tick, Math.min(15000, 2000 * 2 ** Math.min(attempt - 1, 3)));
      }
    };

    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [playbackId, mode]);

  if (status === "mock" || (status === "idle" && !src)) return <>{children}</>;

  if (src) {
    return <LivepeerVideo src={src} mode={mode} className={className} autoPlay={autoPlay} />;
  }

  return <PlaybackStatus className={className} status={status} mode={mode} />;
}

function PlaybackStatus({ className, status, mode }: { className?: string; status: Status; mode: "live" | "vod" }) {
  const gone = status === "not_found";
  const label = gone ? "This video isn't available" : mode === "live" ? "Waiting for the encoder" : "Preparing the replay";
  const sub =
    gone
      ? "The creator may have removed it, or it's still being processed."
      : mode === "live"
        ? "We will switch on the picture as soon as the live feed arrives."
        : "Processing can take a minute. Keep this tab open and we will refresh it.";
  return (
    <div className={className} style={{ display: "grid", placeItems: "center", height: "100%", background: "radial-gradient(80% 80% at 50% 35%,rgba(64,172,255,.12),#0a0a0c 72%)" }}>
      <div className="mx-5 flex max-w-[320px] flex-col items-center text-center">
        <div className="relative flex size-16 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.06] text-white shadow-[0_20px_60px_rgba(0,0,0,.35)]">
          {!gone && <span className="absolute inset-[-7px] rounded-[24px] border border-blue/20 animate-pulse" />}
          {gone ? <VideoOff className="size-7 text-ink-dim" /> : mode === "live" ? <Radio className="size-7 text-blue-light" /> : <Loader2 className="size-7 animate-spin text-blue-light" />}
        </div>
        <div className="mt-4 font-display text-[18px] font-semibold tracking-[-0.01em] text-white">{label}</div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{sub}</p>
        {!gone && (
          <div className="mt-4 flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[10px] font-bold tracking-[0.08em] text-blue-soft">
            <span className="size-[5px] rounded-full bg-blue-light animate-[tvLive_1.4s_infinite]" />
            {mode === "live" ? "AUTO CONNECTING" : "CHECKING PLAYBACK"}
          </div>
        )}
      </div>
    </div>
  );
}

function signature(src: PlaybackSrc): string {
  return src.map((s) => `${s.type}:${String(s.src).split("?")[0]}`).join("|");
}
