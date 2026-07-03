"use client";

import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Radio, ShieldCheck, VideoOff } from "lucide-react";
import { BrowserBroadcaster } from "@/components/dashboard/BrowserBroadcaster";
import { Button } from "@/components/ui/Button";
import {
  createLiveFieldSessionLoader,
  describeLiveFieldBrowser,
  describeLiveFieldMedia,
  reportLiveFieldEvidence,
} from "@/lib/livepeer/field-client";
import type { LiveFieldEvidence, LiveFieldPublicConfig } from "@/lib/livepeer/field";

type BroadcastEvidence = {
  status: string;
  peer: string;
  enabled: boolean;
};

const EMPTY_EVIDENCE: BroadcastEvidence = { status: "idle", peer: "none", enabled: false };

export function LiveFieldBroadcaster({ config }: { config: LiveFieldPublicConfig }) {
  const [evidence, setEvidence] = useState<BroadcastEvidence>(EMPTY_EVIDENCE);
  const [publicLive, setPublicLive] = useState(false);
  const [showObs, setShowObs] = useState(false);
  const [copied, setCopied] = useState(false);
  const lastEvidenceRef = useRef<string>("");
  const lastMediaEvidenceRef = useRef<string>("");
  const lastNetworkEvidenceRef = useRef<string>("");
  const sessionLoader = useMemo(() => createLiveFieldSessionLoader(config.token), [config.token]);

  const reportEvidence = useCallback((evidence: LiveFieldEvidence) => {
    void reportLiveFieldEvidence(config.token, config.streamId, evidence).catch(() => undefined);
  }, [config.streamId, config.token]);

  useEffect(() => {
    const update = () => {
      const surface = document.querySelector<HTMLElement>("[data-tvinbio-broadcast-status]");
      if (!surface) return;
      setEvidence({
        status: surface.dataset.tvinbioBroadcastStatus ?? "idle",
        peer: surface.dataset.tvinbioBroadcastPeer ?? "none",
        enabled: surface.dataset.tvinbioBroadcastEnabled === "true",
      });
      const preview = surface.querySelector<HTMLVideoElement>("video");
      const stream = preview?.srcObject instanceof MediaStream ? preview.srcObject : null;
      const media = describeLiveFieldMedia(stream?.getTracks() ?? []);
      const mediaEvidence: LiveFieldEvidence = {
        event: "media_state",
        ...media,
        mediaReady: surface.dataset.tvinbioBroadcastMediaReady === "true",
        videoCodec: surface.dataset.tvinbioBroadcastVideoCodec ?? "none",
        audioCodec: surface.dataset.tvinbioBroadcastAudioCodec ?? "none",
        error: surface.dataset.tvinbioBroadcastError ?? "none",
        occurredAt: Date.now(),
      };
      const signature = JSON.stringify({ ...mediaEvidence, occurredAt: 0 });
      if (signature !== lastMediaEvidenceRef.current) {
        lastMediaEvidenceRef.current = signature;
        reportEvidence(mediaEvidence);
      }
    };
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [reportEvidence]);

  useEffect(() => {
    const preview = document.querySelector<HTMLVideoElement>("[data-tvinbio-broadcast-status] video");
    reportEvidence({
      event: "page_ready",
      ...describeLiveFieldBrowser(navigator.userAgent),
      secureContext: window.isSecureContext,
      mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
      playsInline: Boolean(preview?.playsInline),
      muted: Boolean(preview?.muted),
      autoPlay: Boolean(preview?.autoplay),
      occurredAt: Date.now(),
    });
  }, [reportEvidence]);

  useEffect(() => {
    const connection = (navigator as Navigator & {
      connection?: { effectiveType?: string; addEventListener?: (type: string, listener: () => void) => void; removeEventListener?: (type: string, listener: () => void) => void };
    }).connection;
    const reportNetwork = () => {
      const networkEvidence: LiveFieldEvidence = {
        event: "network_state",
        online: navigator.onLine,
        effectiveType: connection?.effectiveType ?? "unavailable",
        occurredAt: Date.now(),
      };
      const signature = JSON.stringify({ ...networkEvidence, occurredAt: 0 });
      if (signature === lastNetworkEvidenceRef.current) return;
      lastNetworkEvidenceRef.current = signature;
      reportEvidence(networkEvidence);
    };
    reportNetwork();
    window.addEventListener("online", reportNetwork);
    window.addEventListener("offline", reportNetwork);
    connection?.addEventListener?.("change", reportNetwork);
    return () => {
      window.removeEventListener("online", reportNetwork);
      window.removeEventListener("offline", reportNetwork);
      connection?.removeEventListener?.("change", reportNetwork);
    };
  }, [reportEvidence]);

  useEffect(() => {
    const signature = `${evidence.status}:${evidence.peer}:${evidence.enabled}`;
    if (signature === lastEvidenceRef.current) return;
    lastEvidenceRef.current = signature;
    reportEvidence({ event: "broadcast_status", ...evidence, occurredAt: Date.now() });
  }, [evidence, reportEvidence]);

  const handleLiveChange = useCallback((active: boolean) => {
    setPublicLive(active);
  }, []);

  const interruptCamera = useCallback(() => {
    const preview = document.querySelector<HTMLVideoElement>("[data-tvinbio-broadcast-status] video");
    const stream = preview?.srcObject instanceof MediaStream ? preview.srcObject : null;
    stream?.getVideoTracks()[0]?.stop();
    reportEvidence({ event: "camera_interrupted", ...evidence, occurredAt: Date.now() });
  }, [evidence, reportEvidence]);

  const handleObsFallback = useCallback(() => {
    setShowObs(true);
    reportEvidence({ event: "obs_fallback", ...evidence, occurredAt: Date.now() });
  }, [evidence, reportEvidence]);

  const handleFieldClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target instanceof Element ? event.target.closest("[data-tvinbio-go-live='true']") : null;
    if (!target) return;
    reportEvidence({
      event: "go_live_gesture",
      userActivated: navigator.userActivation?.isActive ?? true,
      occurredAt: Date.now(),
    });
  }, [reportEvidence]);

  const copyStreamKey = useCallback(async () => {
    await navigator.clipboard.writeText(config.streamKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }, [config.streamKey]);

  return (
    <main className="min-h-dvh bg-[#070708] text-white" onClickCapture={handleFieldClick}>
      <header className="border-b border-white/[0.08] bg-[#09090a]/95 px-4 py-3 backdrop-blur md:px-7">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-300/[0.08] shadow-[0_0_24px_rgba(34,211,238,.08)]">
              <Radio className="size-4 text-cyan-200" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold">Browser live field check</div>
              <div className="truncate text-[10px] text-white/45">Temporary Livepeer stream</div>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2.5 py-1 text-[10px] font-semibold text-emerald-100">
            <ShieldCheck className="size-3.5" /> Private run
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] gap-4 p-3 md:p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="flex min-h-[560px] overflow-hidden rounded-lg border border-white/[0.08] bg-black lg:min-h-[calc(100dvh-108px)]">
          <BrowserBroadcaster
            ingestUrl={config.whipUrl}
            livepeerId={config.streamId}
            title="Mobile browser reliability check"
            username="field-check"
            activeProduct={null}
            hasProducts={false}
            onLiveChange={handleLiveChange}
            onOpenShopping={() => undefined}
            onObsFallback={handleObsFallback}
            sessionLoader={sessionLoader}
          />
        </section>

        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <section className="border-y border-white/[0.08] py-4 md:border md:p-4">
            <div className="mb-3 text-[10px] font-semibold uppercase text-white/40">Live evidence</div>
            <EvidenceRow label="Publisher" value={evidence.status} active={evidence.status === "live"} />
            <EvidenceRow label="Peer" value={evidence.peer} active={evidence.peer === "connected"} />
            <EvidenceRow label="Session" value={publicLive ? "confirmed" : evidence.enabled ? "pending" : "idle"} active={publicLive} />
          </section>

          <Button
            type="button"
            variant="secondary"
            className="w-full justify-center gap-2"
            title="Stop the current camera track to verify recovery"
            disabled={!evidence.enabled}
            onClick={interruptCamera}
          >
            <VideoOff className="size-4" /> Interrupt camera
          </Button>

          {showObs && (
            <section className="border border-white/[0.1] bg-white/[0.03] p-4">
              <div className="text-[10px] font-semibold uppercase text-white/40">OBS fallback</div>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate text-[11px] text-white/70">{config.streamKey}</code>
                <button
                  type="button"
                  onClick={copyStreamKey}
                  className="grid size-9 shrink-0 place-items-center border border-white/10 bg-white/[0.04] text-white/65 transition-colors hover:text-white"
                  title="Copy stream key"
                >
                  {copied ? <Check className="size-4 text-emerald-300" /> : <Copy className="size-4" />}
                </button>
              </div>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}

function EvidenceRow({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between border-t border-white/[0.06] py-2.5 first:border-t-0">
      <span className="text-[12px] text-white/50">{label}</span>
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/80">
        <span className={`size-1.5 rounded-full ${active ? "bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.65)]" : "bg-white/25"}`} />
        {value}
      </span>
    </div>
  );
}
