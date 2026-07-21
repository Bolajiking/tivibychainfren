"use client";

import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mic, MicOff, MonitorUp, Radio, RotateCcw, ShoppingBag, Video, VideoOff, X } from "lucide-react";
import { attachMediaStreamToPeerConnection, createNewWHIP } from "@livepeer/core-web/webrtc";
import { Button } from "@/components/ui/Button";
import { Tile } from "@/components/ui/Media";
import { cn } from "@/lib/cn";
import {
  BROADCAST_MAX_AUTO_RETRIES,
  BROADCAST_MAX_LIVE_RECOVERIES,
  BROADCAST_LIVE_DISCONNECT_RECOVERY_MS,
  BROADCAST_LIVE_RECOVERY_FALLBACK_MS,
  BROADCAST_OBS_FALLBACK_MS,
  BROADCAST_START_STALL_MS,
  broadcastStartPhase,
  findConfirmedLivepeerSession,
  hasRequiredBroadcastMedia,
  isSustainedLiveDisconnect,
  shouldAutoRetryBroadcastStart,
  shouldFailBroadcastStart,
  shouldRecoverBroadcastMedia,
  shouldRecoverLiveDrop,
  shouldRefreshBroadcastMediaForRetry,
  stalledBroadcastMessage,
  summarizeBroadcastOutboundStats,
  type LivepeerBroadcastStatus,
  type WhipHandshakeSnapshot,
} from "@/lib/livepeer/broadcast-health";
import {
  getBroadcastSessionStatus,
  getLivepeerStreamActive,
  getLivepeerStreamSessions,
  type BroadcastTransportPlanPayload,
  type LivepeerSessionLoader,
  type LivepeerStreamSession,
} from "@/lib/livepeer-client";
import { getAccessToken } from "@/lib/auth/privy-bridge";
import {
  evaluateBridgeCodecGate,
  evaluateNegotiatedBridgeVideoCodec,
  orderBridgeVideoCodecPreferences,
} from "@/lib/livepeer/h264-contract";
import { evaluateLiveAuthority, type LiveAuthorityProbe } from "@/lib/livepeer/live-authority";
import {
  createBroadcastTransportController,
  type BroadcastTransportController,
} from "@/lib/livepeer/transport-controller";
import type { BroadcastTransportTarget } from "@/lib/livepeer/transport-policy";
import {
  augmentLivepeerIceServersForTcp,
  buildBroadcastDiagnosticText,
  broadcastPublishErrorMessage,
  needsRelaxedMediaConstraints,
  rewriteLivepeerWhipPostUrlForCors,
  summarizeWhipOfferSdp,
  type WhipOfferSummary,
} from "@/lib/livepeer/whip";
import { browserPublisherFailureAction } from "@/lib/livepeer/obs-fallback";
import type { Product } from "@/lib/types";

const CAMERA_AUDIO: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const CAMERA_VIDEO: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
};

const EMPTY_OUTBOUND_STATS: OutboundMediaStats = {
  bytesSent: 0,
  packetsSent: 0,
  audioCodec: null,
  videoCodec: null,
};
const EMPTY_OFFER_SUMMARY: WhipOfferSummary = {
  audioMLineCount: 0,
  videoMLineCount: 0,
  hasAudioSend: false,
  hasVideoSend: false,
  audioSendonlyCount: 0,
  videoSendonlyCount: 0,
};

type PeerState = {
  connectionState: RTCPeerConnectionState | null;
  iceConnectionState: RTCIceConnectionState | null;
};

type OutboundMediaStats = {
  bytesSent: number;
  packetsSent: number;
  audioCodec: string | null;
  videoCodec: string | null;
};

export function BrowserBroadcaster({
  ingestUrl,
  livepeerId,
  walletAddress,
  title,
  username,
  activeProduct,
  hasProducts,
  onLiveChange,
  onOpenShopping,
  onObsFallback,
  transportPlan = null,
  onPlanConsumed,
  sessionLoader = getLivepeerStreamSessions,
}: {
  ingestUrl: string;
  livepeerId: string;
  walletAddress?: string;
  title: string;
  username: string;
  activeProduct: Product | null;
  hasProducts: boolean;
  onLiveChange: (active: boolean, activationSource?: "livepeer_status") => void;
  onOpenShopping: () => void;
  onObsFallback: () => void;
  /** Ordered transport plan (spec §6). Absent → proven single-target direct path. */
  transportPlan?: BroadcastTransportPlanPayload | null;
  /** The attempt reached a terminal outcome; the page should mint a fresh plan. */
  onPlanConsumed?: () => void;
  sessionLoader?: LivepeerSessionLoader;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const whipDestroyRef = useRef<(() => void) | null>(null);
  const fetchProbeRestoreRef = useRef<(() => void) | null>(null);
  const publishGenerationRef = useRef(0);
  const publicLiveRef = useRef(false);
  const terminalHandledRef = useRef(false);
  const retryingRef = useRef(false);
  const refreshMediaOnNextManualRetryRef = useRef(false);
  const liveRecoveryCountRef = useRef(0);
  const recoveringLiveRef = useRef(false);
  const liveDisconnectedAtRef = useRef<number | null>(null);
  const statusRef = useRef<LivepeerBroadcastStatus>("idle");
  const firstStartStartedAtRef = useRef<number | null>(null);
  const mediaTrackCleanupRef = useRef<(() => void) | null>(null);
  const handledMediaInterruptionRef = useRef(0);
  const audioEnabledRef = useRef(true);
  const videoEnabledRef = useRef(true);
  // Transport-plan mode (spec §6/§8): the controller owns targets, deadlines,
  // and generations; the legacy single-target effects are gated off while it runs.
  const controllerRef = useRef<BroadcastTransportController | null>(null);
  const planActiveRef = useRef(false);
  const currentTargetRef = useRef<{ target: BroadcastTransportTarget; generation: number; startedAtMs: number } | null>(null);
  const authorityProbesRef = useRef<LiveAuthorityProbe[]>([]);
  const sessionSnapshotsRef = useRef<LivepeerStreamSession[]>([]);
  const upstreamActiveRef = useRef(false);
  const bridgePublishingRef = useRef(false);
  const bridgeAuthRestoreRef = useRef<(() => void) | null>(null);

  const [publishError, setPublishError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<LivepeerBroadcastStatus>("idle");
  const [enabled, setEnabled] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [peerState, setPeerState] = useState<PeerState>({ connectionState: null, iceConnectionState: null });
  const [outboundStats, setOutboundStats] = useState<OutboundMediaStats>(EMPTY_OUTBOUND_STATS);
  const [confirmedSession, setConfirmedSession] = useState<LivepeerStreamSession | null>(null);
  const [sessionProbeError, setSessionProbeError] = useState<string | null>(null);
  const [liveRecoveryPending, setLiveRecoveryPending] = useState(false);
  const [startStartedAt, setStartStartedAt] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [heartbeat, setHeartbeat] = useState(0);
  const [whipProbe, setWhipProbe] = useState<WhipHandshakeSnapshot>({});
  const [offerSummary, setOfferSummary] = useState<WhipOfferSummary>(EMPTY_OFFER_SUMMARY);
  const [lastDiagnosticText, setLastDiagnosticText] = useState<string | null>(null);
  const [mediaInterruptionEpoch, setMediaInterruptionEpoch] = useState(0);
  const [planPhase, setPlanPhase] = useState<string | null>(null);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
    videoEnabledRef.current = videoEnabled;
  }, [videoEnabled]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const detachMediaTrackListeners = useCallback(() => {
    mediaTrackCleanupRef.current?.();
    mediaTrackCleanupRef.current = null;
  }, []);

  const observeMediaStream = useCallback((stream: MediaStream) => {
    detachMediaTrackListeners();
    const removers: Array<() => void> = [];
    let interruptionReported = false;
    for (const track of stream.getTracks()) {
      const onEnded = () => {
        if (mediaStreamRef.current !== stream || screenTrackRef.current === track) return;
        const ready = hasRequiredBroadcastMedia(stream.getTracks(), {
          audioEnabled: audioEnabledRef.current,
          videoEnabled: videoEnabledRef.current,
        });
        setMediaReady(ready);
        if (!ready && !interruptionReported) {
          interruptionReported = true;
          setMediaInterruptionEpoch((current) => current + 1);
        }
      };
      track.addEventListener("ended", onEnded);
      removers.push(() => track.removeEventListener("ended", onEnded));
    }
    mediaTrackCleanupRef.current = () => removers.forEach((remove) => remove());
  }, [detachMediaTrackListeners]);

  const disposeTransport = useCallback((opts: { stopTracks?: boolean } = {}) => {
    abortRef.current?.abort();
    abortRef.current = null;
    fetchProbeRestoreRef.current?.();
    fetchProbeRestoreRef.current = null;
    whipDestroyRef.current?.();
    whipDestroyRef.current = null;

    const peerConnection = peerConnectionRef.current;
    peerConnectionRef.current = null;
    if (peerConnection && peerConnection.signalingState !== "closed") {
      peerConnection.close();
    }

    if (opts.stopTracks !== false) {
      detachMediaTrackListeners();
      stopMediaStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
      screenTrackRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }

    setPeerState({ connectionState: null, iceConnectionState: null });
    setOutboundStats(EMPTY_OUTBOUND_STATS);
    setScreenSharing(false);
  }, [detachMediaTrackListeners]);

  const resetBroadcastState = useCallback(
    (opts: { keepError?: boolean; notifyOffline?: boolean } = {}) => {
      publishGenerationRef.current += 1;
      terminalHandledRef.current = false;
      retryingRef.current = false;
      liveDisconnectedAtRef.current = null;
      firstStartStartedAtRef.current = null;
      disposeTransport();
      setEnabled(false);
      setStatus("idle");
      statusRef.current = "idle";
      setMediaReady(false);
      setRecoveryNotice(null);
      setStartStartedAt(null);
      setRetryCount(0);
      setWhipProbe({});
      setOfferSummary(EMPTY_OFFER_SUMMARY);
      setConfirmedSession(null);
      setSessionProbeError(null);
      setLiveRecoveryPending(false);
      if (!opts.keepError) {
        setPublishError(null);
        setLastDiagnosticText(null);
      }
      if (opts.notifyOffline && publicLiveRef.current) {
        publicLiveRef.current = false;
        onLiveChange(false, "livepeer_status");
      }
    },
    [disposeTransport, onLiveChange],
  );

  const primeCameraPreview = useCallback(async () => {
    if (publishError) return;
    const existingStream = mediaStreamRef.current;
    const existingReady = Boolean(existingStream) && hasRequiredBroadcastMedia(existingStream?.getTracks() ?? [], {
      audioEnabled,
      videoEnabled,
    });
    if (enabled || existingReady) {
      if (existingStream) attachPreview(videoRef.current, existingStream);
      setMediaReady(existingReady);
      return;
    }
    try {
      if (existingStream) {
        detachMediaTrackListeners();
        stopMediaStream(existingStream);
        mediaStreamRef.current = null;
      }
      const stream = await acquireCameraStream(true, true);
      mediaStreamRef.current = stream;
      observeMediaStream(stream);
      setMediaReady(hasRequiredBroadcastMedia(stream.getTracks(), { audioEnabled: true, videoEnabled: true }));
      setAudioEnabled(stream.getAudioTracks().some((track) => track.enabled && track.readyState === "live"));
      setVideoEnabled(stream.getVideoTracks().some((track) => track.enabled && track.readyState === "live"));
      attachPreview(videoRef.current, stream);
      setPublishError(null);
    } catch (error) {
      setMediaReady(false);
      setPublishError(broadcastPublishErrorMessage(error));
    }
  }, [audioEnabled, detachMediaTrackListeners, enabled, observeMediaStream, publishError, videoEnabled]);

  const runPublishAttempt = useCallback(
    async (
      attempt: number,
      opts: {
        refreshMedia?: boolean;
        liveRecovery?: boolean;
        ingestUrlOverride?: string;
        targetKind?: BroadcastTransportTarget["kind"];
        planGeneration?: number;
      } = {},
    ) => {
      const generation = publishGenerationRef.current + 1;
      publishGenerationRef.current = generation;
      disposeTransport({ stopTracks: false });
      const controller = new AbortController();
      abortRef.current = controller;
      const targetIngestUrl = opts.ingestUrlOverride ?? ingestUrl;
      const isBridgeTarget = opts.targetKind === "tvinbio-bridge";
      const isCurrentAttempt = () => publishGenerationRef.current === generation && !controller.signal.aborted;
      const handlePublisherError = (error: unknown) => {
        // Plan mode: the transport controller owns failure routing (switch,
        // recovery budget, terminal). Report and let it decide.
        if (planActiveRef.current && opts.planGeneration !== undefined) {
          if (isAbortLike(error) || !isCurrentAttempt()) return;
          controllerRef.current?.reportFailure(opts.planGeneration, isBridgeTarget ? "bridge_transport_failed" : "whip_failed");
          return;
        }
        const action = browserPublisherFailureAction({
          currentAttempt: isCurrentAttempt(),
          aborted: isAbortLike(error),
          live: statusRef.current === "live" || publicLiveRef.current,
        });
        if (action === "ignore") return;
        if (action === "recover") {
          setRecoveryNotice("Live connection dropped - reconnecting...");
          return;
        }
        onObsFallback();
        terminalHandledRef.current = true;
        setPublishError(broadcastPublishErrorMessage(error));
        setRecoveryNotice(null);
        setEnabled(false);
        setStatus("idle");
        statusRef.current = "idle";
        setStartStartedAt(null);
        disposeTransport();
      };

      try {
        const element = videoRef.current;
        if (!element) throw new Error("broadcast_preview_unavailable");
        let existingStream = mediaStreamRef.current;
        const existingReady = Boolean(existingStream) && hasRequiredBroadcastMedia(existingStream?.getTracks() ?? [], {
          audioEnabled,
          videoEnabled,
        });
        if ((opts.refreshMedia || !existingReady) && existingStream) {
          detachMediaTrackListeners();
          stopMediaStream(existingStream);
          mediaStreamRef.current = null;
          existingStream = null;
          setMediaReady(false);
          if (videoRef.current) videoRef.current.srcObject = null;
        }
        const stream: MediaStream =
          existingStream && existingReady ? existingStream : await acquireCameraStream(audioEnabled, videoEnabled);
        if (!isCurrentAttempt()) {
          if (stream !== existingStream) stopMediaStream(stream);
          return;
        }
        mediaStreamRef.current = stream;
        observeMediaStream(stream);
        setMediaReady(hasRequiredBroadcastMedia(stream.getTracks(), { audioEnabled, videoEnabled }));
        setAudioEnabled(stream.getAudioTracks().some((track) => track.enabled && track.readyState === "live"));
        setVideoEnabled(stream.getVideoTracks().some((track) => track.enabled && track.readyState === "live"));
        attachPreview(videoRef.current, stream);

        if (!isBridgeTarget) {
          fetchProbeRestoreRef.current = installWhipFetchProbe(setWhipProbe, targetIngestUrl);
        }
        setStatus("pending");
        if (!planActiveRef.current) {
          setRecoveryNotice(attempt > 0 ? "Rebuilt the Livepeer publisher. Waiting for session..." : "Contacting Livepeer ingest...");
        }
        const cleanupWhip = await startLivepeerWhipPublisher({
          ingestUrl: isBridgeTarget ? new URL(targetIngestUrl, window.location.origin).toString() : targetIngestUrl,
          element,
          stream,
          signal: controller.signal,
          onPeerConnection: (peerConnection) => {
            if (!isCurrentAttempt()) return;
            peerConnectionRef.current = peerConnection;
            if (isBridgeTarget) {
              // Spec §6.3 step 2: H.264 first at negotiation. Applied on
              // negotiationneeded so the preference lands before the offer SDP
              // is finalized; step 3 (outbound-stats verification) backstops it.
              const applyH264Preference = () => {
                try {
                  const capabilities = RTCRtpSender.getCapabilities?.("video");
                  if (!capabilities) return;
                  for (const transceiver of peerConnection.getTransceivers()) {
                    const kind = transceiver.sender?.track?.kind ?? transceiver.receiver?.track?.kind;
                    if (kind === "video") {
                      transceiver.setCodecPreferences?.(orderBridgeVideoCodecPreferences(capabilities.codecs));
                    }
                  }
                } catch {
                  // Preference is best-effort; the codec verdict aborts mismatches.
                }
              };
              peerConnection.addEventListener("negotiationneeded", applyH264Preference);
              applyH264Preference();
            }
            const updatePeerState = () => {
              if (!isCurrentAttempt()) return;
              setPeerState({
                connectionState: peerConnection.connectionState,
                iceConnectionState: peerConnection.iceConnectionState,
              });
            };
            const updateOfferSummary = () => {
              if (!isCurrentAttempt()) return;
              const sdp = peerConnection.localDescription?.sdp;
              if (sdp) setOfferSummary(summarizeWhipOfferSdp(sdp));
            };
            updatePeerState();
            peerConnection.addEventListener("connectionstatechange", updatePeerState);
            peerConnection.addEventListener("iceconnectionstatechange", updatePeerState);
            peerConnection.addEventListener("signalingstatechange", updateOfferSummary);
            peerConnection.addEventListener("icegatheringstatechange", updateOfferSummary);
            window.setTimeout(updateOfferSummary, 5_500);
          },
          onConnected: () => {
            if (!isCurrentAttempt()) return;
            setStatus("pending");
            setRecoveryNotice("Livepeer transport connected. Confirming session...");
            setPublishError(null);
          },
          onError: (error) => {
            handlePublisherError(error);
          },
        });
        whipDestroyRef.current = cleanupWhip;
        if (!isCurrentAttempt()) {
          cleanupWhip();
          return;
        }
      } catch (error) {
        handlePublisherError(error);
      }
    },
    [audioEnabled, detachMediaTrackListeners, disposeTransport, ingestUrl, observeMediaStream, onObsFallback, videoEnabled],
  );

  useEffect(() => {
    void primeCameraPreview();
  }, [primeCameraPreview]);

  const beginBroadcast = useCallback(
    (attempt: number, notice: string | null = null, opts: { refreshMedia?: boolean; liveRecovery?: boolean } = {}) => {
      terminalHandledRef.current = false;
      refreshMediaOnNextManualRetryRef.current = false;
      setPublishError(null);
      setLastDiagnosticText(null);
      setRecoveryNotice(notice);
      setEnabled(true);
      setStatus("pending");
      statusRef.current = "pending";
      setMediaReady(false);
      setConfirmedSession(null);
      setSessionProbeError(null);
      setLiveRecoveryPending(Boolean(opts.liveRecovery));
      setOutboundStats(EMPTY_OUTBOUND_STATS);
      setOfferSummary(EMPTY_OFFER_SUMMARY);
      setWhipProbe({});
      setStartStartedAt(Date.now());
      if (opts.liveRecovery) firstStartStartedAtRef.current = null;
      firstStartStartedAtRef.current ??= Date.now();
      void runPublishAttempt(attempt, opts);
    },
    [runPublishAttempt],
  );

  const stopPlanBroadcast = useCallback(() => {
    controllerRef.current?.dispose();
    controllerRef.current = null;
    planActiveRef.current = false;
    currentTargetRef.current = null;
    bridgeAuthRestoreRef.current?.();
    bridgeAuthRestoreRef.current = null;
    setPlanPhase(null);
  }, []);

  const startPlanBroadcast = useCallback(() => {
    const plan = transportPlan;
    if (!plan) return;
    stopPlanBroadcast();
    terminalHandledRef.current = false;
    authorityProbesRef.current = [];
    sessionSnapshotsRef.current = [];
    upstreamActiveRef.current = false;
    bridgePublishingRef.current = false;
    setPublishError(null);
    setLastDiagnosticText(null);
    setRecoveryNotice(null);
    setEnabled(true);
    setStatus("pending");
    statusRef.current = "pending";
    setConfirmedSession(null);
    setSessionProbeError(null);
    setOutboundStats(EMPTY_OUTBOUND_STATS);
    setOfferSummary(EMPTY_OFFER_SUMMARY);
    setWhipProbe({});
    setStartStartedAt(Date.now());
    firstStartStartedAtRef.current = Date.now();
    setPlanPhase("Preparing live");
    planActiveRef.current = true;
    bridgeAuthRestoreRef.current = installBridgeAuthFetch(walletAddress);

    const controller = createBroadcastTransportController({
      plan,
      callbacks: {
        activate: (target, generation) => {
          currentTargetRef.current = { target, generation, startedAtMs: Date.now() };
          authorityProbesRef.current = [];
          setPlanPhase(target.kind === "tvinbio-bridge" ? "Securing connection" : "Preparing live");
          if (target.kind === "tvinbio-bridge") {
            // Spec §6.3 step 1: capability gate before any signaling.
            const gate = evaluateBridgeCodecGate(
              typeof RTCRtpSender !== "undefined" && RTCRtpSender.getCapabilities
                ? RTCRtpSender.getCapabilities("video")
                : null,
            );
            if (!gate.ok) {
              window.setTimeout(() => controllerRef.current?.reportFailure(generation, gate.reasonCode), 0);
              return;
            }
          }
          void runPublishAttempt(0, {
            ingestUrlOverride: target.ingestUrl,
            targetKind: target.kind,
            planGeneration: generation,
          });
        },
        abort: () => {
          // Peer close + WHIP DELETE; camera/microphone tracks stay alive
          // across target switches (spec goal 5).
          disposeTransport({ stopTracks: false });
        },
        live: () => {
          setStatus("live");
          statusRef.current = "live";
          setRecoveryNotice(null);
          setPublishError(null);
          setStartStartedAt(null);
          setLiveRecoveryPending(false);
          setPlanPhase(null);
          firstStartStartedAtRef.current = null;
        },
        terminal: (outcome, reasonCode) => {
          const wasLive = publicLiveRef.current;
          stopPlanBroadcast();
          onPlanConsumed?.();
          if (outcome === "ended") {
            resetBroadcastState({ notifyOffline: true });
            return;
          }
          onObsFallback();
          setPublishError(planTerminalMessage(outcome, reasonCode));
          resetBroadcastState({ keepError: true, notifyOffline: wasLive });
        },
      },
    });
    controllerRef.current = controller;
    controller.start();
  }, [disposeTransport, onObsFallback, onPlanConsumed, resetBroadcastState, runPublishAttempt, stopPlanBroadcast, transportPlan, walletAddress]);

  const startBroadcast = useCallback(() => {
    setRetryCount(0);
    liveRecoveryCountRef.current = 0;
    if (transportPlan) {
      startPlanBroadcast();
      return;
    }
    beginBroadcast(0);
  }, [beginBroadcast, startPlanBroadcast, transportPlan]);

  const retryBrowserBroadcast = useCallback(() => {
    setRetryCount(0);
    if (transportPlan) {
      startPlanBroadcast();
      return;
    }
    beginBroadcast(
      0,
      refreshMediaOnNextManualRetryRef.current ? "Refreshing camera media and retrying browser live..." : "Retrying browser live...",
      { refreshMedia: refreshMediaOnNextManualRetryRef.current },
    );
  }, [beginBroadcast, startPlanBroadcast, transportPlan]);

  const endBroadcast = useCallback(() => {
    if (planActiveRef.current && controllerRef.current) {
      // Controller terminal("ended") performs the single cleanup pass.
      controllerRef.current.end();
      return;
    }
    resetBroadcastState({ notifyOffline: true });
  }, [resetBroadcastState]);

  const toggleAudio = useCallback(() => {
    const tracks = mediaStreamRef.current?.getAudioTracks() ?? [];
    setAudioEnabled((current) => {
      const next = !current;
      tracks.forEach((track) => {
        track.enabled = next;
      });
      return next;
    });
  }, []);

  const toggleVideo = useCallback(() => {
    const tracks = mediaStreamRef.current?.getVideoTracks() ?? [];
    setVideoEnabled((current) => {
      const next = !current;
      tracks.forEach((track) => {
        track.enabled = next;
      });
      return next;
    });
  }, []);

  const replaceOutgoingVideoTrack = useCallback(async (track: MediaStreamTrack, stopExisting: boolean) => {
    const stream = mediaStreamRef.current;
    const sender = peerConnectionRef.current?.getSenders().find((candidate) => candidate.track?.kind === "video");
    if (sender) await sender.replaceTrack(track);
    if (!stream) return;
    detachMediaTrackListeners();
    for (const existing of stream.getVideoTracks()) {
      stream.removeTrack(existing);
      if (stopExisting && existing !== track && existing.readyState === "live") existing.stop();
    }
    stream.addTrack(track);
    observeMediaStream(stream);
    attachPreview(videoRef.current, stream);
    setVideoEnabled(track.enabled && track.readyState === "live");
    setMediaReady(hasRequiredBroadcastMedia(stream.getTracks(), {
      audioEnabled: audioEnabledRef.current,
      videoEnabled: track.enabled && track.readyState === "live",
    }));
  }, [detachMediaTrackListeners, observeMediaStream]);

  const restoreCameraTrack = useCallback(async () => {
    const screenTrack = screenTrackRef.current;
    screenTrackRef.current = null;
    if (screenTrack && screenTrack.readyState === "live") screenTrack.stop();
    const cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: CAMERA_VIDEO });
    const cameraTrack = cameraStream.getVideoTracks()[0];
    if (!cameraTrack) {
      stopMediaStream(cameraStream);
      throw new Error("no_sendable_media_tracks");
    }
    await replaceOutgoingVideoTrack(cameraTrack, true);
    stopMediaStream(new MediaStream(cameraStream.getTracks().filter((track) => track !== cameraTrack)));
    setScreenSharing(false);
  }, [replaceOutgoingVideoTrack]);

  const toggleScreenshare = useCallback(async () => {
    if (screenSharing) {
      try {
        await restoreCameraTrack();
      } catch (error) {
        setPublishError(broadcastPublishErrorMessage(error));
      }
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setPublishError("Screen sharing is not available in this browser.");
      return;
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) {
        stopMediaStream(displayStream);
        throw new Error("no_sendable_media_tracks");
      }
      screenTrackRef.current = screenTrack;
      await replaceOutgoingVideoTrack(screenTrack, true);
      setScreenSharing(true);
      screenTrack.addEventListener(
        "ended",
        () => {
          void restoreCameraTrack().catch((error) => setPublishError(broadcastPublishErrorMessage(error)));
        },
        { once: true },
      );
    } catch (error) {
      setScreenSharing(false);
      setPublishError(broadcastPublishErrorMessage(error));
    }
  }, [replaceOutgoingVideoTrack, restoreCameraTrack, screenSharing]);

  const attemptId = transportPlan?.attemptId ?? null;
  const handleSessionSnapshots = useCallback(
    (sessions: LivepeerStreamSession[]) => {
      if (!planActiveRef.current) return;
      sessionSnapshotsRef.current = sessions;
      const current = currentTargetRef.current;
      if (!current) return;
      const freshest = sessions
        .filter((session) => !session.parentId || session.parentId === livepeerId)
        .sort((a, b) => (b.lastSeen ?? b.createdAt ?? 0) - (a.lastSeen ?? a.createdAt ?? 0))[0];
      if (freshest) {
        authorityProbesRef.current = [
          ...authorityProbesRef.current.slice(-19),
          {
            atMs: Date.now(),
            generation: current.generation,
            sourceBytes: freshest.sourceBytes ?? null,
            sourceSegments: freshest.sourceSegments ?? null,
            ingestRate: freshest.ingestRate ?? null,
          },
        ];
      }
      // Spec §9.1 item 2 + §6.4 bridge publishing: polled alongside sessions.
      void getLivepeerStreamActive(livepeerId, walletAddress).then((active) => {
        if (planActiveRef.current) upstreamActiveRef.current = active;
      });
      if (current.target.kind === "tvinbio-bridge" && attemptId) {
        void getBroadcastSessionStatus(attemptId, walletAddress).then((status) => {
          if (planActiveRef.current) bridgePublishingRef.current = status?.publishing === true;
        });
      }
    },
    [attemptId, livepeerId, walletAddress],
  );

  useLivepeerSessionProbe({
    enabled,
    livepeerId,
    walletAddress,
    startedAtMs: startStartedAt,
    loadSessions: sessionLoader,
    onConfirmedSession: setConfirmedSession,
    onError: setSessionProbeError,
    onSessions: handleSessionSnapshots,
  });

  // Plan-mode confirmation: spec §9.1 — matching current session, explicit
  // upstream ACTIVE, same-generation media progression, and (bridge) a
  // publishing lease. The §6.3 codec verdict aborts a VP8 negotiation first.
  useEffect(() => {
    if (!planActiveRef.current || !enabled || status === "live") return;
    const current = currentTargetRef.current;
    if (!current) return;

    if (current.target.kind === "tvinbio-bridge") {
      const codecVerdict = evaluateNegotiatedBridgeVideoCodec(outboundStats.videoCodec);
      if (!codecVerdict.ok && codecVerdict.reasonCode === "bridge_codec_mismatch") {
        controllerRef.current?.reportFailure(current.generation, codecVerdict.reasonCode);
        return;
      }
    }

    if (confirmedSession && planPhase !== "Confirming broadcast") setPlanPhase("Confirming broadcast");

    const verdict = evaluateLiveAuthority({
      livepeerId,
      generation: current.generation,
      generationStartedAtMs: current.startedAtMs,
      sessions: sessionSnapshotsRef.current,
      upstreamActive: upstreamActiveRef.current,
      probes: authorityProbesRef.current,
      targetKind: current.target.kind,
      bridgePublishing: bridgePublishingRef.current,
    });
    if (verdict.confirmed) controllerRef.current?.reportConfirmed(current.generation);
  }, [confirmedSession, enabled, heartbeat, livepeerId, outboundStats.videoCodec, planPhase, status]);

  useEffect(() => {
    if (!enabled || status === "live") return;
    const timer = window.setInterval(() => setHeartbeat((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [enabled, status]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(async () => {
      const peerConnection = peerConnectionRef.current;
      if (!peerConnection) return;
      try {
        setOutboundStats(summarizeOutboundStats(await peerConnection.getStats()));
      } catch {
        // Stats only drive diagnostics; the Livepeer session probe remains authoritative.
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  const elapsedMs = enabled && startStartedAt ? Date.now() - startStartedAt : 0;
  const totalElapsedMs = enabled && firstStartStartedAtRef.current ? Date.now() - firstStartStartedAtRef.current : elapsedMs;
  const obsFallbackMs = liveRecoveryPending ? BROADCAST_LIVE_RECOVERY_FALLBACK_MS : BROADCAST_OBS_FALLBACK_MS;
  const sessionConfirmed = Boolean(confirmedSession);
  const startSnapshot = useMemo(
    () => ({
      enabled,
      status,
      mediaReady,
      elapsedMs,
      totalElapsedMs,
      retryCount,
      maxRetries: BROADCAST_MAX_AUTO_RETRIES,
      whip: whipProbe,
      peerConnectionState: peerState.connectionState,
      iceConnectionState: peerState.iceConnectionState,
      outboundBytesSent: outboundStats.bytesSent,
      outboundPacketsSent: outboundStats.packetsSent,
      sessionConfirmed,
      obsFallbackMs,
    }),
    // heartbeat intentionally forces elapsedMs to refresh while a start is pending.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, status, mediaReady, elapsedMs, totalElapsedMs, retryCount, whipProbe, peerState, outboundStats, sessionConfirmed, obsFallbackMs, heartbeat],
  );
  const phase = planPhase ?? broadcastStartPhase(startSnapshot);
  const shouldRetry = shouldAutoRetryBroadcastStart(startSnapshot);
  const shouldFail = shouldFailBroadcastStart(startSnapshot);

  useEffect(() => {
    if (planActiveRef.current) return;
    if (!shouldRetry || retryingRef.current) return;
    retryingRef.current = true;
    const nextRetryCount = retryCount + 1;
    const refreshMedia = shouldRefreshBroadcastMediaForRetry(startSnapshot);
    setRetryCount(nextRetryCount);
    beginBroadcast(
      nextRetryCount,
      refreshMedia
        ? "Refreshing camera media and rebuilding the Livepeer session..."
        : nextRetryCount === 1
          ? "Still connecting. Rebuilding the Livepeer session..."
          : "Rechecking the Livepeer session...",
      { refreshMedia },
    );
    window.setTimeout(() => {
      retryingRef.current = false;
    }, 0);
  }, [beginBroadcast, retryCount, shouldRetry, startSnapshot]);

  useEffect(() => {
    if (planActiveRef.current) return;
    if (!shouldFail || terminalHandledRef.current) return;
    terminalHandledRef.current = true;
    refreshMediaOnNextManualRetryRef.current = shouldRefreshBroadcastMediaForRetry(startSnapshot);
    setLastDiagnosticText(
      buildBroadcastDiagnosticText({
        mediaReady: startSnapshot.mediaReady,
        whip: startSnapshot.whip,
        peerConnectionState: startSnapshot.peerConnectionState,
        iceConnectionState: startSnapshot.iceConnectionState,
        offer: offerSummary,
        outboundPacketsSent: startSnapshot.outboundPacketsSent,
        sessionConfirmed: Boolean(confirmedSession),
      }),
    );
    onObsFallback();
    setPublishError(stalledBroadcastMessage(startSnapshot));
    resetBroadcastState({ keepError: true });
  }, [confirmedSession, offerSummary, onObsFallback, resetBroadcastState, shouldFail, startSnapshot]);

  useEffect(() => {
    if (mediaInterruptionEpoch <= handledMediaInterruptionRef.current) return;
    handledMediaInterruptionRef.current = mediaInterruptionEpoch;
    if (!enabled) return;

    if (status === "live") {
      if (
        shouldRecoverBroadcastMedia({
          enabled,
          status,
          mediaReady: false,
          recoveryCount: liveRecoveryCountRef.current,
        })
      ) {
        recoveringLiveRef.current = true;
        liveRecoveryCountRef.current += 1;
        setRetryCount(0);
        beginBroadcast(0, "Camera or microphone was interrupted - reconnecting...", {
          refreshMedia: true,
          liveRecovery: true,
        });
        window.setTimeout(() => {
          recoveringLiveRef.current = false;
        }, 0);
      } else {
        onObsFallback();
        setPublishError("Camera or microphone access ended. Restart browser live, or switch to OBS with the stream key below.");
        resetBroadcastState({ keepError: true, notifyOffline: true });
      }
      return;
    }

    if (retryingRef.current) return;
    retryingRef.current = true;
    const nextRetryCount = Math.min(retryCount + 1, BROADCAST_MAX_AUTO_RETRIES);
    setRetryCount(nextRetryCount);
    beginBroadcast(nextRetryCount, "Camera or microphone was interrupted - reconnecting...", {
      refreshMedia: true,
      liveRecovery: liveRecoveryPending,
    });
    window.setTimeout(() => {
      retryingRef.current = false;
    }, 0);
  }, [beginBroadcast, enabled, liveRecoveryPending, mediaInterruptionEpoch, onObsFallback, resetBroadcastState, retryCount, status]);

  useEffect(() => {
    if (planActiveRef.current) return;
    if (!enabled || status === "live" || !confirmedSession) return;
    const transportReady =
      peerState.connectionState === "connected" ||
      peerState.iceConnectionState === "connected" ||
      peerState.iceConnectionState === "completed" ||
      outboundStats.bytesSent > 0 ||
      outboundStats.packetsSent > 0 ||
      sessionHasMedia(confirmedSession);
    if (!transportReady) return;
    setStatus("live");
    statusRef.current = "live";
    setRecoveryNotice(null);
    setPublishError(null);
    setStartStartedAt(null);
    setLiveRecoveryPending(false);
    firstStartStartedAtRef.current = null;
  }, [confirmedSession, enabled, outboundStats.bytesSent, outboundStats.packetsSent, peerState, status]);

  useEffect(() => {
    const nextPublicLive = status === "live" && Boolean(confirmedSession);
    if (publicLiveRef.current === nextPublicLive) return;
    publicLiveRef.current = nextPublicLive;
    onLiveChange(nextPublicLive, "livepeer_status");
  }, [confirmedSession, onLiveChange, status]);

  useEffect(() => {
    if (!enabled || status !== "live" || peerState.connectionState !== "disconnected") {
      liveDisconnectedAtRef.current = null;
      return;
    }
    liveDisconnectedAtRef.current ??= Date.now();
    const timer = window.setTimeout(() => setHeartbeat((value) => value + 1), BROADCAST_LIVE_DISCONNECT_RECOVERY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, heartbeat, peerState.connectionState, status]);

  // Auto-reconnect a dropped LIVE transport instead of silently going dark.
  // Bounded per go-live (BROADCAST_MAX_LIVE_RECOVERIES); once exhausted, end
  // cleanly and surface the OBS fallback.
  // Plan mode: report drops to the controller; it owns the shared 15 s budget.
  useEffect(() => {
    if (!planActiveRef.current || !enabled || status !== "live") return;
    const generation = currentTargetRef.current?.generation;
    if (generation === undefined) return;
    if (peerState.connectionState === "failed") {
      controllerRef.current?.reportLiveDrop(generation, "failed");
      return;
    }
    const disconnectedForMs =
      peerState.connectionState === "disconnected" && liveDisconnectedAtRef.current
        ? Date.now() - liveDisconnectedAtRef.current
        : 0;
    if (isSustainedLiveDisconnect({ peerConnectionState: peerState.connectionState, disconnectedForMs })) {
      controllerRef.current?.reportLiveDrop(generation, "disconnected");
    }
  }, [enabled, heartbeat, peerState.connectionState, status]);

  useEffect(() => {
    if (planActiveRef.current) return;
    if (!enabled || status !== "live" || recoveringLiveRef.current) return;
    const disconnectedForMs =
      peerState.connectionState === "disconnected" && liveDisconnectedAtRef.current
        ? Date.now() - liveDisconnectedAtRef.current
        : 0;
    const droppedState =
      peerState.connectionState === "failed" ||
      isSustainedLiveDisconnect({
        peerConnectionState: peerState.connectionState,
        disconnectedForMs,
      })
        ? peerState.connectionState
        : null;
    if (!droppedState) return;
    if (
      shouldRecoverLiveDrop({
        enabled,
        status,
        peerConnectionState: droppedState,
        recoveryCount: liveRecoveryCountRef.current,
      })
    ) {
      recoveringLiveRef.current = true;
      liveDisconnectedAtRef.current = null;
      liveRecoveryCountRef.current += 1;
      setRetryCount(0);
      beginBroadcast(0, "Live connection dropped - reconnecting...", { liveRecovery: true });
      window.setTimeout(() => {
        recoveringLiveRef.current = false;
      }, 0);
    } else {
      onObsFallback();
      setPublishError("The live connection kept dropping. Restart browser live, or switch to OBS with the stream key below.");
      resetBroadcastState({ keepError: true, notifyOffline: true });
    }
  }, [beginBroadcast, enabled, onObsFallback, peerState.connectionState, resetBroadcastState, status]);

  useEffect(() => {
    return () => {
      publishGenerationRef.current += 1;
      controllerRef.current?.dispose();
      controllerRef.current = null;
      planActiveRef.current = false;
      bridgeAuthRestoreRef.current?.();
      bridgeAuthRestoreRef.current = null;
      disposeTransport();
      if (publicLiveRef.current) onLiveChange(false, "livepeer_status");
    };
  }, [disposeTransport, onLiveChange]);

  return (
    <BroadcastSurface
      videoRef={videoRef}
      title={title}
      username={username}
      activeProduct={activeProduct}
      hasProducts={hasProducts}
      publishError={publishError}
      lastDiagnosticText={lastDiagnosticText}
      recoveryNotice={recoveryNotice}
      phase={phase}
      retryCount={retryCount}
      status={status}
      enabled={enabled}
      audioEnabled={audioEnabled}
      videoEnabled={videoEnabled}
      screenSharing={screenSharing}
      mediaReady={mediaReady}
      peerState={peerState}
      outboundStats={outboundStats}
      confirmedSession={confirmedSession}
      sessionProbeError={sessionProbeError}
      offerSummary={offerSummary}
      whipProbe={whipProbe}
      obsFallbackSecondsRemaining={Math.max(0, Math.ceil((obsFallbackMs - totalElapsedMs) / 1000))}
      onToggleAudio={toggleAudio}
      onToggleVideo={toggleVideo}
      onToggleScreenshare={toggleScreenshare}
      onStart={startBroadcast}
      onEnd={endBroadcast}
      onRetry={retryBrowserBroadcast}
      onOpenShopping={onOpenShopping}
    />
  );
}

function BroadcastSurface({
  videoRef,
  title,
  username,
  activeProduct,
  hasProducts,
  publishError,
  lastDiagnosticText,
  recoveryNotice,
  phase,
  retryCount,
  status,
  enabled,
  audioEnabled,
  videoEnabled,
  screenSharing,
  mediaReady,
  peerState,
  outboundStats,
  confirmedSession,
  sessionProbeError,
  offerSummary,
  whipProbe,
  obsFallbackSecondsRemaining,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenshare,
  onStart,
  onEnd,
  onRetry,
  onOpenShopping,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  title: string;
  username: string;
  activeProduct: Product | null;
  hasProducts: boolean;
  publishError: string | null;
  lastDiagnosticText: string | null;
  recoveryNotice: string | null;
  phase: string | null;
  retryCount: number;
  status: LivepeerBroadcastStatus;
  enabled: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  mediaReady: boolean;
  peerState: PeerState;
  outboundStats: OutboundMediaStats;
  confirmedSession: LivepeerStreamSession | null;
  sessionProbeError: string | null;
  offerSummary: WhipOfferSummary;
  whipProbe: WhipHandshakeSnapshot;
  obsFallbackSecondsRemaining: number;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenshare: () => void;
  onStart: () => void;
  onEnd: () => void;
  onRetry: () => void;
  onOpenShopping: () => void;
}) {
  const live = status === "live" && Boolean(confirmedSession);
  const pending = enabled && !live;
  const diagnosticText = pending
    ? buildBroadcastDiagnosticText({
        mediaReady,
        whip: whipProbe,
        peerConnectionState: peerState.connectionState,
        iceConnectionState: peerState.iceConnectionState,
        offer: offerSummary,
        outboundPacketsSent: outboundStats.packetsSent,
        sessionConfirmed: Boolean(confirmedSession),
      })
    : null;
  const visibleDiagnosticText = diagnosticText ?? (publishError ? lastDiagnosticText : null);

  return (
    <div
      className="relative flex-1 overflow-hidden rounded-2xl border border-white/[0.08]"
      data-tvinbio-broadcast-status={status}
      data-tvinbio-broadcast-enabled={enabled}
      data-tvinbio-broadcast-peer={peerState.connectionState ?? "none"}
      data-tvinbio-broadcast-media-ready={mediaReady}
      data-tvinbio-broadcast-audio-codec={outboundStats.audioCodec ?? "none"}
      data-tvinbio-broadcast-video-codec={outboundStats.videoCodec ?? "none"}
      data-tvinbio-broadcast-error={publishError ? "present" : "none"}
      style={{ background: "linear-gradient(150deg,#1d1f24,#0a0a0c 78%)", minHeight: 320 }}
    >
      <video ref={videoRef} title={title} muted playsInline autoPlay className="absolute inset-0 size-full object-cover" />

      <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
        <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[11px] font-semibold text-ink-dim backdrop-blur">@{username}</span>
        {live && (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-500/20 px-2.5 py-1 text-[9px] font-bold text-red-50 backdrop-blur">
            <span className="size-[5px] rounded-full bg-live" /> LIVE
          </span>
        )}
        {pending && (
          <span className="inline-flex items-center gap-1 rounded-full border border-beam/35 bg-beam/15 px-2.5 py-1 text-[9px] font-bold text-beam-soft backdrop-blur">
            <Loader2 className="size-3 animate-spin" /> STARTING
          </span>
        )}
        {!audioEnabled && <span className="rounded-full border border-red-400/30 bg-red-500/15 px-2.5 py-1.5 text-[10px] font-bold text-red-100 backdrop-blur">MUTED</span>}
      </div>

      {!mediaReady && !publishError && (
        <div className="absolute inset-0 grid place-items-center bg-black/40">
          <div className="flex flex-col items-center gap-2 text-[12px] text-muted">
            <Loader2 className="size-7 animate-spin text-white/80" />
            Preparing camera
          </div>
        </div>
      )}

      <div className="absolute bottom-[78px] left-3.5 right-3.5 z-10 flex flex-col gap-2 md:right-auto md:w-[320px]">
        <div className="rounded-xl border border-white/10 bg-[#08080a]/80 p-3 backdrop-blur">
          <div className="text-[9px] font-bold tracking-[0.08em] text-beam-soft">{live ? "LIVE PROGRAM" : "READY ROOM"}</div>
          <div className="mt-1 truncate text-[14px] font-semibold">{title}</div>
        </div>
        {activeProduct && (
          <div className="flex items-center gap-2.5 rounded-xl border border-beam/40 bg-[#08080a]/85 p-2 backdrop-blur">
            <Tile seed={activeProduct.imageColor} src={activeProduct.imageUrl} size={34} radius={10} />
            <div className="min-w-0">
              <div className="text-[8px] font-bold tracking-[0.08em] text-beam-soft">PINNED</div>
              <div className="truncate text-[11px] font-semibold">
                {activeProduct.name} · ${activeProduct.price}
              </div>
            </div>
          </div>
        )}
      </div>

      {(pending || publishError) && (
        <div
          className="absolute inset-x-3.5 top-16 z-20 rounded-xl border border-white/10 bg-[#08080a]/90 px-3 py-2.5 text-[11.5px] text-ink-dim backdrop-blur md:left-auto md:w-[330px]"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-2.5">
            {publishError ? <X className="mt-0.5 size-3.5 shrink-0 text-red-200" /> : <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-beam-soft" />}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-white">
                {publishError ? "Browser live needs attention" : recoveryNotice ?? phase ?? "Starting live session"}
              </div>
              <div className="mt-1 leading-relaxed">
                {publishError ? publishError : "Keep this tab open while TVinBio confirms a real Livepeer session."}
              </div>
              {!publishError && retryCount > 0 && (
                <div className="mt-1 text-[10.5px] text-beam-soft">Retry {retryCount}/{BROADCAST_MAX_AUTO_RETRIES}</div>
              )}
              {!publishError && pending && (
                <div className="mt-1 text-[10.5px] text-faint">
                  OBS fallback in {obsFallbackSecondsRemaining}s
                </div>
              )}
              {visibleDiagnosticText && (
                <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 font-mono text-[10.5px] leading-relaxed text-beam-soft">
                  {visibleDiagnosticText}
                </div>
              )}
              {pending && sessionProbeError && <div className="mt-1 text-[10.5px] text-red-100/80">Livepeer session check is retrying</div>}
              {publishError && !enabled && (
                <Button size="sm" variant="secondary" className="mt-2.5 h-8 px-3 text-[12px]" onClick={onRetry}>
                  <RotateCcw className="size-3.5" />
                  Retry browser live
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-3.5 z-20 flex items-center justify-center gap-2.5">
        <button type="button" onClick={onToggleAudio} aria-label="Toggle mic" className={ctrlClass(audioEnabled)}>
          {audioEnabled ? <Mic className="size-[18px]" /> : <MicOff className="size-[18px]" />}
        </button>
        <button type="button" onClick={onToggleVideo} aria-label="Toggle camera" className={ctrlClass(videoEnabled)}>
          {videoEnabled ? <Video className="size-[18px]" /> : <VideoOff className="size-[18px]" />}
        </button>
        <button type="button" onClick={onToggleScreenshare} aria-label={screenSharing ? "Stop sharing screen" : "Share screen"} className={ctrlClass(screenSharing)}>
          <MonitorUp className="size-[18px]" />
        </button>
        <button
          type="button"
          onClick={() => onOpenShopping()}
          aria-label="Live shopping"
          className={cn(
            "flex size-[46px] items-center justify-center rounded-full border",
            activeProduct ? "border-beam/40 bg-beam/15 text-beam-soft" : "border-white/12 bg-white/[0.06] text-ink-dim hover:text-white",
            hasProducts ? "" : "opacity-60",
          )}
        >
          <ShoppingBag className="size-[18px]" />
        </button>
        <Button
          type="button"
          variant={enabled ? "live" : "golive"}
          size="pill"
          data-tvinbio-go-live={enabled ? undefined : "true"}
          onClick={enabled ? onEnd : onStart}
        >
          {enabled ? <X className="size-4" /> : <Radio className="size-4" />}
          {enabled ? (live ? "End stream" : "Cancel") : "Go live"}
        </Button>
      </div>
    </div>
  );
}

function ctrlClass(active: boolean) {
  return cn(
    "flex size-[46px] items-center justify-center rounded-full border transition-colors",
    active ? "border-beam/40 bg-beam/15 text-beam-soft" : "border-white/12 bg-white/[0.06] text-ink-dim hover:text-white",
  );
}

function useLivepeerSessionProbe({
  enabled,
  livepeerId,
  walletAddress,
  startedAtMs,
  loadSessions,
  onConfirmedSession,
  onError,
  onSessions,
}: {
  enabled: boolean;
  livepeerId: string;
  walletAddress?: string;
  startedAtMs: number | null;
  loadSessions: LivepeerSessionLoader;
  onConfirmedSession: Dispatch<SetStateAction<LivepeerStreamSession | null>>;
  onError: Dispatch<SetStateAction<string | null>>;
  onSessions?: (sessions: LivepeerStreamSession[]) => void;
}) {
  useEffect(() => {
    if (!enabled || !livepeerId || !startedAtMs) return;
    let active = true;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const sessions = await loadSessions(livepeerId, walletAddress);
        if (!active) return;
        onSessions?.(sessions);
        const confirmed = findConfirmedLivepeerSession(sessions, { livepeerId, startedAtMs });
        if (confirmed) onConfirmedSession(toLivepeerStreamSession(confirmed));
        onError(null);
      } catch (error) {
        if (active) onError(error instanceof Error ? error.message : "session_probe_failed");
      } finally {
        if (active) timer = window.setTimeout(poll, 2_000);
      }
    };

    void poll();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, livepeerId, loadSessions, onConfirmedSession, onError, onSessions, startedAtMs, walletAddress]);
}

function toLivepeerStreamSession(session: ReturnType<typeof findConfirmedLivepeerSession>): LivepeerStreamSession | null {
  if (!session) return null;
  return {
    id: session.id ?? undefined,
    parentId: session.parentId ?? undefined,
    createdAt: session.createdAt ?? undefined,
    lastSeen: session.lastSeen ?? undefined,
    sourceBytes: session.sourceBytes ?? undefined,
    sourceSegments: session.sourceSegments ?? undefined,
    ingestRate: session.ingestRate ?? undefined,
    isHealthy: session.isHealthy ?? undefined,
    issues: session.issues ?? undefined,
  };
}

async function startLivepeerWhipPublisher({
  ingestUrl,
  element,
  stream,
  signal,
  onPeerConnection,
  onConnected,
  onError,
}: {
  ingestUrl: string;
  element: HTMLVideoElement;
  stream: MediaStream;
  signal: AbortSignal;
  onPeerConnection: (peerConnection: RTCPeerConnection) => void;
  onConnected: () => void;
  onError: (error: unknown) => void;
}): Promise<() => void> {
  throwIfAborted(signal);
  let active = true;
  let peerConnection: RTCPeerConnection | null = null;

  const cleanup = () => {
    if (!active) return;
    active = false;
    if (peerConnection) peerConnection.removeEventListener("connectionstatechange", handleConnectionState);
    destroy();
  };

  function handleConnectionState() {
    if (!active || !peerConnection) return;
    if (peerConnection.connectionState === "connected") onConnected();
    if (peerConnection.connectionState === "failed") onError(new Error("Failed to connect to peer."));
  }

  const { destroy } = createNewWHIP({
    ingestUrl,
    element,
    sdpTimeout: null,
    callbacks: {
      onRTCPeerConnection: (nextPeerConnection) => {
        if (!active || signal.aborted) {
          if (nextPeerConnection.signalingState !== "closed") nextPeerConnection.close();
          return;
        }
        peerConnection = nextPeerConnection;
        peerConnection.addEventListener("connectionstatechange", handleConnectionState);
        // The SDK only configures UDP ICE servers. Add the catalyst's TCP/TLS
        // TURN relays before media attach (which triggers negotiationneeded →
        // ICE gathering) so the browser can still publish on UDP-blocked
        // networks. Done here so the augmented servers are in effect for the
        // first and only gathering pass.
        try {
          const current = peerConnection.getConfiguration();
          const iceServers = augmentLivepeerIceServersForTcp(current.iceServers);
          if (iceServers.length > (current.iceServers?.length ?? 0)) {
            peerConnection.setConfiguration({ ...current, iceServers });
          }
        } catch {
          // setConfiguration is best-effort; UDP path still works where allowed.
        }
        onPeerConnection(peerConnection);
        void attachMediaStreamToPeerConnection({ mediaStream: stream, peerConnection }).catch((error) => {
          if (active && !isAbortLike(error)) onError(error);
        });
      },
      onConnected,
      onError: (error) => {
        if (active && !isAbortLike(error)) onError(error);
      },
    },
  });

  const abort = () => cleanup();
  signal.addEventListener("abort", abort, { once: true });
  return () => {
    signal.removeEventListener("abort", abort);
    cleanup();
  };
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Broadcast start was aborted.", "AbortError");
}

async function acquireCameraStream(audioEnabled: boolean, videoEnabled: boolean): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("media_devices_unavailable");
  }
  const wantsAudio = audioEnabled;
  const wantsVideo = videoEnabled || !wantsAudio;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: wantsAudio ? CAMERA_AUDIO : false,
      video: wantsVideo ? CAMERA_VIDEO : false,
    });
    assertSendableMedia(stream, wantsAudio, wantsVideo);
    return stream;
  } catch (error) {
    if (!needsRelaxedMediaConstraints(error)) throw error;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: wantsAudio,
      video: wantsVideo,
    });
    assertSendableMedia(stream, wantsAudio, wantsVideo);
    return stream;
  }
}

function assertSendableMedia(stream: MediaStream, audioEnabled: boolean, videoEnabled: boolean) {
  if (!hasRequiredBroadcastMedia(stream.getTracks(), { audioEnabled, videoEnabled })) {
    stopMediaStream(stream);
    throw new Error("no_sendable_media_tracks");
  }
}

function attachPreview(video: HTMLVideoElement | null, stream: MediaStream) {
  if (!video) return;
  video.srcObject = stream;
  void video.play().catch(() => undefined);
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    if (track.readyState === "live") track.stop();
  });
}

function summarizeOutboundStats(report: RTCStatsReport): OutboundMediaStats {
  const stats: RTCStats[] = [];
  report.forEach((stat) => {
    stats.push(stat);
  });
  return summarizeBroadcastOutboundStats(stats);
}

function sessionHasMedia(session: LivepeerStreamSession): boolean {
  return positiveNumber(session.sourceBytes) > 0 || positiveNumber(session.sourceSegments) > 0 || positiveNumber(session.ingestRate) > 0;
}

function positiveNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function installWhipFetchProbe(onSnapshot: Dispatch<SetStateAction<WhipHandshakeSnapshot>>, canonicalWhipPostUrl: string): () => void {
  let active = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = describeWhipFetch(input, init);
    if (request?.method === "HEAD") {
      onSnapshot((current) => ({
        ...current,
        headStartedAt: Date.now(),
        lastHost: request.host,
        lastError: null,
      }));
    }
    if (request?.method === "POST") {
      onSnapshot((current) => ({
        ...current,
        postStartedAt: Date.now(),
        lastHost: request.host,
        lastError: null,
      }));
    }

    try {
      const fetchInput =
        request?.method === "POST"
          ? rewriteFetchInputForWhipCors(input, rewriteLivepeerWhipPostUrlForCors(request.href, canonicalWhipPostUrl))
          : input;
      const response = await originalFetch(fetchInput, init);
      if (active && request) {
        onSnapshot((current) => ({
          ...current,
          ...(request.method === "HEAD" ? { headCompletedAt: Date.now() } : {}),
          ...(request.method === "POST" ? { postCompletedAt: Date.now() } : {}),
          lastStatus: response.status,
          lastHost: safeHost(response.url) ?? request.host,
          lastError: null,
        }));
      }
      return response;
    } catch (error) {
      if (active && request) {
        onSnapshot((current) => ({
          ...current,
          lastHost: request.host,
          lastError: error instanceof Error ? error.message : String(error),
        }));
      }
      throw error;
    }
  }) as typeof window.fetch;

  return () => {
    active = false;
    window.fetch = originalFetch;
  };
}

function describeWhipFetch(input: RequestInfo | URL, init?: RequestInit): { method: string; host: string; href: string } | null {
  const href =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  if (!href.includes("/webrtc/")) return null;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const host = url.host.toLowerCase();
  if (!host.includes("livepeer") && !host.includes("lp-playback")) return null;

  const method = String(init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "HEAD" && method !== "POST") return null;
  return { method, host, href };
}

function safeHost(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

function rewriteFetchInputForWhipCors(input: RequestInfo | URL, nextUrl: string): RequestInfo | URL {
  const currentUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  if (nextUrl === currentUrl) return input;
  if (typeof input === "string") return nextUrl;
  if (input instanceof URL) return new URL(nextUrl);
  return new Request(nextUrl, input);
}

function isAbortLike(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Same-origin bridge signaling requires the owner's auth context, but the WHIP
 * SDK issues its own fetches. Inject the Privy bearer (and the mock-mode wallet
 * header) on /api/bridge/attempts/... requests only.
 */
function installBridgeAuthFetch(walletAddress?: string): () => void {
  let active = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!active || !href.includes("/api/bridge/attempts/")) return originalFetch(input, init);
    const headers = new Headers(init?.headers ?? (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined));
    const token = await getAccessToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (walletAddress) headers.set("x-tvinbio-wallet", walletAddress.toLowerCase());
    return originalFetch(input, { ...init, headers });
  }) as typeof window.fetch;
  return () => {
    active = false;
    window.fetch = originalFetch;
  };
}

function planTerminalMessage(outcome: string, reasonCode: string | null): string {
  if (reasonCode === "bridge_unsupported_codec" || reasonCode === "bridge_codec_mismatch") {
    return "This browser cannot publish the required video format. Continue from a computer, or use OBS with the stream key below.";
  }
  if (reasonCode === "bridge_unavailable" || reasonCode === "lease_rate_limited") {
    return "The live relay is unavailable right now. Retry shortly, or continue from a computer with OBS.";
  }
  if (outcome === "recovery_exhausted") {
    return "The live connection kept dropping. Restart browser live, or switch to OBS with the stream key below.";
  }
  return "Browser live could not confirm a Livepeer session in time. Retry, or switch to OBS with the stream key below.";
}
