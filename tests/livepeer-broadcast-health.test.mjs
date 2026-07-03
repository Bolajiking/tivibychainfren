import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const health = await loadTsModule(new URL("../src/lib/livepeer/broadcast-health.ts", import.meta.url));

test("outbound broadcast stats retain the negotiated audio and video codecs", () => {
  assert.equal(typeof health.summarizeBroadcastOutboundStats, "function");
  assert.deepEqual(
    health.summarizeBroadcastOutboundStats([
      { id: "video-out", type: "outbound-rtp", kind: "video", codecId: "video-codec", bytesSent: 4096, packetsSent: 12 },
      { id: "audio-codec", type: "codec", mimeType: "audio/opus" },
      { id: "video-codec", type: "codec", mimeType: "video/H264" },
      { id: "audio-out", type: "outbound-rtp", mediaType: "audio", codecId: "audio-codec", bytesSent: 1024, packetsSent: 8 },
      { id: "remote", type: "outbound-rtp", kind: "video", isRemote: true, bytesSent: 9999, packetsSent: 99 },
    ]),
    {
      bytesSent: 5120,
      packetsSent: 20,
      audioCodec: "audio/opus",
      videoCodec: "video/H264",
    },
  );
});

test("required broadcast media rejects a mobile stream after its enabled camera track ends", () => {
  assert.equal(typeof health.hasRequiredBroadcastMedia, "function");
  assert.equal(
    health.hasRequiredBroadcastMedia(
      [
        { kind: "audio", readyState: "live" },
        { kind: "video", readyState: "ended" },
      ],
      { audioEnabled: true, videoEnabled: true },
    ),
    false,
  );
  assert.equal(
    health.hasRequiredBroadcastMedia(
      [{ kind: "video", readyState: "live" }],
      { audioEnabled: false, videoEnabled: true },
    ),
    true,
  );
});

test("an ended required media track enters the bounded live recovery path", () => {
  assert.equal(typeof health.shouldRecoverBroadcastMedia, "function");
  assert.equal(
    health.shouldRecoverBroadcastMedia({
      enabled: true,
      status: "live",
      mediaReady: false,
      recoveryCount: 0,
      maxRecoveries: 3,
    }),
    true,
  );
  assert.equal(
    health.shouldRecoverBroadcastMedia({
      enabled: true,
      status: "live",
      mediaReady: false,
      recoveryCount: 3,
      maxRecoveries: 3,
    }),
    false,
  );
});

test("broadcastStartPhase explains the browser WHIP start phases", () => {
  assert.equal(health.broadcastStartPhase({ enabled: false, status: "idle", mediaReady: true, elapsedMs: 0, retryCount: 0 }), null);
  assert.equal(health.broadcastStartPhase({ enabled: true, status: "idle", mediaReady: false, elapsedMs: 0, retryCount: 0 }), "Preparing camera");
  assert.equal(health.broadcastStartPhase({ enabled: true, status: "pending", mediaReady: true, elapsedMs: 100, retryCount: 0, whip: {} }), "Contacting live ingest");
  assert.equal(
    health.broadcastStartPhase({
      enabled: true,
      status: "pending",
      mediaReady: true,
      elapsedMs: 100,
      retryCount: 0,
      whip: { postStartedAt: 10 },
    }),
    "Confirming broadcast",
  );
  assert.equal(
    health.broadcastStartPhase({
      enabled: true,
      status: "pending",
      mediaReady: true,
      elapsedMs: 100,
      retryCount: 0,
      whip: { postStartedAt: 10, postCompletedAt: 30, lastStatus: 201 },
    }),
    "Waiting for Livepeer session",
  );
  assert.equal(
    health.broadcastStartPhase({
      enabled: true,
      status: "pending",
      mediaReady: true,
      elapsedMs: 100,
      retryCount: 0,
      whip: { postStartedAt: 10, postCompletedAt: 30, lastStatus: 201 },
      sessionConfirmed: false,
      peerConnectionState: "connecting",
      iceConnectionState: "connected",
    }),
    "Waiting for Livepeer session",
  );
  assert.equal(
    health.broadcastStartPhase({
      enabled: true,
      status: "pending",
      mediaReady: true,
      elapsedMs: 100,
      retryCount: 0,
      whip: { postStartedAt: 10, postCompletedAt: 30, lastStatus: 201 },
      sessionConfirmed: true,
      peerConnectionState: "connecting",
      iceConnectionState: "connected",
    }),
    "Confirming live media",
  );
});

test("pending starts retry only after media is ready and the start window stalls", () => {
  assert.equal(
    health.shouldAutoRetryBroadcastStart({
      enabled: true,
      status: "pending",
      mediaReady: true,
      elapsedMs: health.BROADCAST_START_STALL_MS - 1,
      retryCount: 0,
    }),
    false,
  );
  assert.equal(
    health.shouldAutoRetryBroadcastStart({
      enabled: true,
      status: "pending",
      mediaReady: true,
      elapsedMs: health.BROADCAST_START_STALL_MS,
      retryCount: 0,
    }),
    true,
  );
  assert.equal(
    health.shouldAutoRetryBroadcastStart({
      enabled: true,
      status: "pending",
      mediaReady: false,
      elapsedMs: health.BROADCAST_START_STALL_MS,
      retryCount: 0,
    }),
    false,
  );
  assert.equal(
    health.shouldAutoRetryBroadcastStart({
      enabled: true,
      status: "pending",
      mediaReady: true,
      elapsedMs: health.BROADCAST_START_STALL_MS,
      retryCount: health.BROADCAST_MAX_AUTO_RETRIES,
    }),
    false,
  );
});

test("stalledBroadcastMessage returns specific recovery paths", () => {
  assert.match(
    health.stalledBroadcastMessage({ enabled: true, status: "pending", mediaReady: false, elapsedMs: 30_000, retryCount: 0 }),
    /camera preview/i,
  );
  assert.match(
    health.stalledBroadcastMessage({
      enabled: true,
      status: "pending",
      mediaReady: true,
      elapsedMs: 30_000,
      retryCount: 2,
      whip: { lastStatus: 403 },
    }),
    /rejected the stream key/i,
  );
  assert.match(
    health.stalledBroadcastMessage({
      enabled: true,
      status: "pending",
      mediaReady: true,
      elapsedMs: 30_000,
      retryCount: 2,
      whip: { postStartedAt: 10, postCompletedAt: 20, lastStatus: 201 },
      iceConnectionState: "connected",
    }),
    /outbound media was not confirmed/i,
  );
  assert.match(
    health.stalledBroadcastMessage({
      enabled: true,
      status: "pending",
      mediaReady: true,
      elapsedMs: 30_000,
      retryCount: 2,
      whip: { postStartedAt: 10, postCompletedAt: 20, lastStatus: 201 },
    }),
    /did not confirm/i,
  );
});

test("shouldConfirmBroadcastLive covers Livepeer pending with connected ICE and outbound RTP", () => {
  const base = {
    enabled: true,
    status: "pending",
    mediaReady: true,
    elapsedMs: 5_000,
    retryCount: 0,
    whip: { postStartedAt: 10, postCompletedAt: 20, lastStatus: 201 },
    peerConnectionState: "connecting",
    iceConnectionState: "connected",
    sessionConfirmed: true,
  };
  assert.equal(health.shouldConfirmBroadcastLive(base), false);
  assert.equal(health.shouldConfirmBroadcastLive({ ...base, outboundPacketsSent: 1 }), true);
  assert.equal(health.shouldConfirmBroadcastLive({ ...base, outboundBytesSent: 2048 }), true);
  assert.equal(health.shouldConfirmBroadcastLive({ ...base, sessionConfirmed: false, outboundPacketsSent: 1 }), false);
  assert.equal(health.shouldConfirmBroadcastLive({ ...base, status: "live", outboundPacketsSent: 1 }), false);
  assert.equal(health.shouldConfirmBroadcastLive({ ...base, iceConnectionState: "checking", outboundPacketsSent: 1 }), false);
  assert.equal(
    health.shouldConfirmBroadcastLive({
      ...base,
      whip: { postStartedAt: 10, postCompletedAt: 20, lastStatus: 403 },
      outboundPacketsSent: 1,
    }),
    false,
  );
});

test("shouldRefreshBroadcastMediaForRetry targets accepted starts with no outbound RTP", () => {
  const base = {
    enabled: true,
    status: "pending",
    mediaReady: true,
    elapsedMs: 24_000,
    retryCount: 1,
    whip: { postStartedAt: 10, postCompletedAt: 20, lastStatus: 201 },
    peerConnectionState: "connecting",
    iceConnectionState: "connected",
    sessionConfirmed: false,
  };

  assert.equal(health.shouldRefreshBroadcastMediaForRetry(base), true);
  assert.equal(health.shouldRefreshBroadcastMediaForRetry({ ...base, outboundPacketsSent: 1 }), false);
  assert.equal(health.shouldRefreshBroadcastMediaForRetry({ ...base, outboundBytesSent: 2048 }), false);
  assert.equal(health.shouldRefreshBroadcastMediaForRetry({ ...base, whip: { ...base.whip, lastStatus: 403 } }), false);
  assert.equal(health.shouldRefreshBroadcastMediaForRetry({ ...base, iceConnectionState: "checking" }), false);
});

test("shouldFailBroadcastStart hands off to OBS by the restricted-network fallback deadline", () => {
  assert.equal(
    health.shouldFailBroadcastStart({
      enabled: true,
      status: "pending",
      mediaReady: true,
      elapsedMs: 2_000,
      totalElapsedMs: health.BROADCAST_OBS_FALLBACK_MS,
      retryCount: 1,
      whip: { postStartedAt: 10, postCompletedAt: 20, lastStatus: 201 },
      peerConnectionState: "connecting",
      iceConnectionState: "connected",
      sessionConfirmed: false,
      outboundPacketsSent: 0,
    }),
    true,
  );
  assert.equal(
    health.shouldAutoRetryBroadcastStart({
      enabled: true,
      status: "pending",
      mediaReady: true,
      elapsedMs: health.BROADCAST_START_STALL_MS,
      totalElapsedMs: health.BROADCAST_OBS_FALLBACK_MS,
      retryCount: 0,
    }),
    false,
  );
});

test("live recovery can use a tighter OBS fallback budget than initial start", () => {
  assert.ok(health.BROADCAST_LIVE_RECOVERY_FALLBACK_MS <= 15_000, "live-drop fallback resolves by the recovery target");
  assert.equal(
    health.shouldFailBroadcastStart({
      enabled: true,
      status: "pending",
      mediaReady: true,
      elapsedMs: 2_000,
      totalElapsedMs: 2_000,
      retryCount: 0,
      sessionConfirmed: false,
      obsFallbackMs: health.BROADCAST_LIVE_RECOVERY_FALLBACK_MS,
    }),
    false,
  );
  assert.equal(
    health.shouldFailBroadcastStart({
      enabled: true,
      status: "pending",
      mediaReady: true,
      elapsedMs: health.BROADCAST_LIVE_RECOVERY_FALLBACK_MS,
      totalElapsedMs: health.BROADCAST_LIVE_RECOVERY_FALLBACK_MS,
      retryCount: 0,
      sessionConfirmed: false,
      obsFallbackMs: health.BROADCAST_LIVE_RECOVERY_FALLBACK_MS,
    }),
    true,
  );
});

test("live recovery fallback resolves within the live-drop product target", () => {
  assert.ok(
    health.BROADCAST_LIVE_DISCONNECT_RECOVERY_MS + health.BROADCAST_LIVE_RECOVERY_FALLBACK_MS <= 15_000,
    "sustained disconnect detection plus live recovery fallback must fit the 15s target",
  );
  assert.equal(
    health.shouldFailBroadcastStart({
      enabled: true,
      status: "pending",
      mediaReady: true,
      elapsedMs: health.BROADCAST_LIVE_RECOVERY_FALLBACK_MS - 1,
      totalElapsedMs: health.BROADCAST_LIVE_RECOVERY_FALLBACK_MS - 1,
      obsFallbackMs: health.BROADCAST_LIVE_RECOVERY_FALLBACK_MS,
      retryCount: 0,
      sessionConfirmed: false,
    }),
    false,
  );
  assert.equal(
    health.shouldFailBroadcastStart({
      enabled: true,
      status: "pending",
      mediaReady: true,
      elapsedMs: health.BROADCAST_LIVE_RECOVERY_FALLBACK_MS,
      totalElapsedMs: health.BROADCAST_LIVE_RECOVERY_FALLBACK_MS,
      obsFallbackMs: health.BROADCAST_LIVE_RECOVERY_FALLBACK_MS,
      retryCount: 0,
      sessionConfirmed: false,
    }),
    true,
  );
});

test("findConfirmedLivepeerSession prefers fresh sessions for the stream being started", () => {
  const now = 1_700_000_060_000;
  const started = 1_700_000_000_000;
  const confirmed = health.findConfirmedLivepeerSession(
    [
      { id: "old", parentId: "lp1", createdAt: started - 600_000, lastSeen: started - 300_000, sourceBytes: 10_000 },
      { id: "wrong-stream", parentId: "lp2", createdAt: now, lastSeen: now, sourceBytes: 20_000 },
      { id: "fresh", parentId: "lp1", createdAt: started + 1_000, lastSeen: now, ingestRate: 42 },
    ],
    { livepeerId: "lp1", startedAtMs: started, nowMs: now },
  );
  assert.equal(confirmed.id, "fresh");
});

test("findConfirmedLivepeerSession rejects stale sessions even if they sent media before", () => {
  assert.equal(
    health.findConfirmedLivepeerSession(
      [{ id: "old", parentId: "lp1", createdAt: 1_000, lastSeen: 2_000, sourceBytes: 100_000 }],
      { livepeerId: "lp1", startedAtMs: 10_000_000, nowMs: 10_060_000 },
    ),
    null,
  );
});

test("findConfirmedLivepeerSession rejects a recently ended session from before this start", () => {
  const startedAtMs = 1_700_000_060_000;
  assert.equal(
    health.findConfirmedLivepeerSession(
      [{
        id: "previous-run",
        parentId: "lp1",
        createdAt: startedAtMs - 120_000,
        lastSeen: startedAtMs - 30_000,
        sourceBytes: 100_000,
        sourceSegments: 50,
      }],
      { livepeerId: "lp1", startedAtMs, nowMs: startedAtMs + 1_000 },
    ),
    null,
  );
});

test("shouldRecoverLiveDrop reconnects a dropped live transport within the recovery budget", () => {
  // Live + peer connection failed + under budget -> recover.
  assert.equal(health.shouldRecoverLiveDrop({ enabled: true, status: "live", peerConnectionState: "failed", recoveryCount: 0 }), true);
  assert.equal(health.shouldRecoverLiveDrop({ enabled: true, status: "live", peerConnectionState: "disconnected", recoveryCount: 1 }), true);
  // Exhausted budget -> give up (caller surfaces OBS fallback).
  assert.equal(health.shouldRecoverLiveDrop({ enabled: true, status: "live", peerConnectionState: "failed", recoveryCount: health.BROADCAST_MAX_LIVE_RECOVERIES }), false);
  // Healthy connection or not-live -> nothing to recover.
  assert.equal(health.shouldRecoverLiveDrop({ enabled: true, status: "live", peerConnectionState: "connected", recoveryCount: 0 }), false);
  assert.equal(health.shouldRecoverLiveDrop({ enabled: true, status: "pending", peerConnectionState: "failed", recoveryCount: 0 }), false);
  assert.equal(health.shouldRecoverLiveDrop({ enabled: false, status: "live", peerConnectionState: "failed", recoveryCount: 0 }), false);
});

test("isSustainedLiveDisconnect waits out transient WebRTC disconnects", () => {
  assert.equal(
    health.isSustainedLiveDisconnect({
      peerConnectionState: "disconnected",
      disconnectedForMs: health.BROADCAST_LIVE_DISCONNECT_RECOVERY_MS - 1,
    }),
    false,
  );
  assert.equal(
    health.isSustainedLiveDisconnect({
      peerConnectionState: "disconnected",
      disconnectedForMs: health.BROADCAST_LIVE_DISCONNECT_RECOVERY_MS,
    }),
    true,
  );
  assert.equal(
    health.isSustainedLiveDisconnect({
      peerConnectionState: "failed",
      disconnectedForMs: health.BROADCAST_LIVE_DISCONNECT_RECOVERY_MS,
    }),
    false,
  );
});

test("broadcast retry budget is tuned for flaky restricted networks", () => {
  assert.ok(health.BROADCAST_MAX_AUTO_RETRIES >= 3, "at least 3 start retries");
  assert.ok(health.BROADCAST_START_STALL_MS <= 20_000, "fails an attempt fast enough to cycle");
  assert.ok(health.BROADCAST_OBS_FALLBACK_MS <= 20_000, "OBS fallback appears by the restricted-network deadline");
  assert.ok(health.BROADCAST_OBS_FALLBACK_MS <= 18_000, "reserves time for the OBS handoff UI to render before 20s");
  assert.ok(
    health.BROADCAST_START_STALL_MS * 2 <= health.BROADCAST_OBS_FALLBACK_MS,
    "preserves a full retry window before the OBS handoff",
  );
  assert.ok(health.BROADCAST_MAX_LIVE_RECOVERIES >= 1, "live drops auto-reconnect");
});

test("shared live-drop budget helpers anchor one 15 s incident deadline (spec §6.5)", () => {
  assert.equal(health.BROADCAST_LIVE_DROP_BUDGET_MS, 15_000);
  const dropAt = 1_000_000;
  assert.equal(health.liveRecoveryDeadlineAtMs(dropAt), dropAt + 15_000);
  assert.equal(health.remainingLiveRecoveryBudgetMs(dropAt, dropAt + 4_000), 11_000);
  assert.equal(health.remainingLiveRecoveryBudgetMs(dropAt, dropAt + 15_000), 0);
  assert.equal(
    health.remainingLiveRecoveryBudgetMs(dropAt, dropAt + 20_000),
    0,
    "the budget never goes negative and never extends",
  );
});
