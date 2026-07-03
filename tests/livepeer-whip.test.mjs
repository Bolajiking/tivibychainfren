import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const whip = await loadTsModule(new URL("../src/lib/livepeer/whip.ts", import.meta.url));

test("chooseWhipPostUrl prefers the resolved Livepeer catalyst URL", () => {
  assert.equal(
    whip.chooseWhipPostUrl(
      "https://playback.livepeer.studio/webrtc/abc123",
      "https://fra-prod-catalyst-0.lp-playback.studio:443/webrtc/video+abc123",
    ),
    "https://fra-prod-catalyst-0.lp-playback.studio/webrtc/video+abc123",
  );
});

test("chooseWhipPostUrl accepts catalyst redirects without the video prefix", () => {
  assert.equal(
    whip.chooseWhipPostUrl(
      "https://playback.livepeer.studio/webrtc/abc123",
      "https://fra-prod-catalyst-0.lp-playback.studio/webrtc/abc123",
    ),
    "https://fra-prod-catalyst-0.lp-playback.studio/webrtc/abc123",
  );
});

test("chooseWhipPostUrl keeps video ingest prefix when prefixed input redirects without it", () => {
  assert.equal(
    whip.chooseWhipPostUrl(
      "https://playback.livepeer.studio/webrtc/video+abc123",
      "https://fra-prod-catalyst-0.lp-playback.studio/webrtc/abc123",
    ),
    "https://fra-prod-catalyst-0.lp-playback.studio/webrtc/video+abc123",
  );
});

test("chooseWhipPostUrl rejects redirects for a different stream key", () => {
  assert.equal(
    whip.chooseWhipPostUrl(
      "https://playback.livepeer.studio/webrtc/abc123",
      "https://fra-prod-catalyst-0.lp-playback.studio/webrtc/other-key",
    ),
    "https://playback.livepeer.studio/webrtc/abc123",
  );
});

test("normalizeLivepeerWhipUrlForBroadcast prefixes browser ingest stream keys", () => {
  assert.equal(
    whip.normalizeLivepeerWhipUrlForBroadcast("https://playback.livepeer.studio/webrtc/abc123"),
    "https://playback.livepeer.studio/webrtc/video+abc123",
  );
  assert.equal(
    whip.normalizeLivepeerWhipUrlForBroadcast("https://fra-prod-catalyst-0.lp-playback.studio/webrtc/video+abc123"),
    "https://fra-prod-catalyst-0.lp-playback.studio/webrtc/video+abc123",
  );
});

test("resolveLivepeerWhipBrowserRouting keeps POST on CORS-safe canonical ingest", () => {
  assert.deepEqual(
    whip.resolveLivepeerWhipBrowserRouting(
      "https://playback.livepeer.studio/webrtc/video+abc123",
      "https://fra-prod-catalyst-0.lp-playback.studio/webrtc/video+abc123",
    ),
    {
      postUrl: "https://playback.livepeer.studio/webrtc/video+abc123",
      iceUrl: "https://fra-prod-catalyst-0.lp-playback.studio/webrtc/video+abc123",
    },
  );
});

test("rewriteLivepeerWhipPostUrlForCors rewrites matching catalyst POSTs to canonical ingest", () => {
  assert.equal(
    whip.rewriteLivepeerWhipPostUrlForCors(
      "https://fra-prod-catalyst-0.lp-playback.studio/webrtc/video+abc123",
      "https://playback.livepeer.studio/webrtc/abc123",
    ),
    "https://playback.livepeer.studio/webrtc/abc123",
  );
  assert.equal(
    whip.rewriteLivepeerWhipPostUrlForCors(
      "https://fra-prod-catalyst-0.lp-playback.studio/webrtc/abc123",
      "https://playback.livepeer.studio/webrtc/video+abc123",
    ),
    "https://playback.livepeer.studio/webrtc/video+abc123",
  );
});

test("rewriteLivepeerWhipPostUrlForCors leaves unrelated or mismatched POSTs alone", () => {
  assert.equal(
    whip.rewriteLivepeerWhipPostUrlForCors(
      "https://fra-prod-catalyst-0.lp-playback.studio/webrtc/video+wrong",
      "https://playback.livepeer.studio/webrtc/abc123",
    ),
    "https://fra-prod-catalyst-0.lp-playback.studio/webrtc/video+wrong",
  );
  assert.equal(
    whip.rewriteLivepeerWhipPostUrlForCors(
      "https://example.com/webrtc/video+abc123",
      "https://playback.livepeer.studio/webrtc/abc123",
    ),
    "https://example.com/webrtc/video+abc123",
  );
});

test("livepeerIceServersFromWhipUrl derives STUN and TURN servers from the catalyst host", () => {
  assert.deepEqual(
    whip.livepeerIceServersFromWhipUrl("https://fra-prod-catalyst-0.lp-playback.studio:443/webrtc/video+abc123"),
    [
      { urls: "stun:fra-prod-catalyst-0.lp-playback.studio" },
      { urls: "turn:fra-prod-catalyst-0.lp-playback.studio", username: "livepeer", credential: "livepeer" },
    ],
  );
});

test("summarizeWhipOfferSdp reports sendable audio and video tracks", () => {
  const summary = whip.summarizeWhipOfferSdp(
    [
      "v=0",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "a=mid:0",
      "a=sendrecv",
      "m=video 9 UDP/TLS/RTP/SAVPF 96",
      "a=mid:1",
      "a=sendonly",
    ].join("\r\n"),
  );

  assert.deepEqual(summary, {
    audioMLineCount: 1,
    videoMLineCount: 1,
    hasAudioSend: true,
    hasVideoSend: true,
    audioSendonlyCount: 0,
    videoSendonlyCount: 1,
  });
});

test("summarizeWhipOfferSdp rejects recvonly media sections", () => {
  assert.deepEqual(whip.summarizeWhipOfferSdp("m=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=recvonly"), {
    audioMLineCount: 1,
    videoMLineCount: 0,
    hasAudioSend: false,
    hasVideoSend: false,
    audioSendonlyCount: 0,
    videoSendonlyCount: 0,
  });
});

test("summarizeWhipOfferSdp distinguishes sendonly from sendrecv offers", () => {
  assert.deepEqual(whip.summarizeWhipOfferSdp("m=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendrecv"), {
    audioMLineCount: 0,
    videoMLineCount: 1,
    hasAudioSend: false,
    hasVideoSend: true,
    audioSendonlyCount: 0,
    videoSendonlyCount: 0,
  });
  assert.deepEqual(whip.summarizeWhipOfferSdp("m=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly"), {
    audioMLineCount: 0,
    videoMLineCount: 1,
    hasAudioSend: false,
    hasVideoSend: true,
    audioSendonlyCount: 0,
    videoSendonlyCount: 1,
  });
});

test("needsRelaxedMediaConstraints catches browser constraint failures", () => {
  assert.equal(whip.needsRelaxedMediaConstraints({ name: "OverconstrainedError" }), true);
  assert.equal(whip.needsRelaxedMediaConstraints({ name: "NotFoundError" }), true);
  assert.equal(whip.needsRelaxedMediaConstraints({ name: "NotAllowedError" }), false);
});

test("broadcastPublishErrorMessage maps stalled WHIP starts to a clear recovery path", () => {
  assert.match(whip.broadcastPublishErrorMessage({ name: "TimeoutError" }), /could not connect/i);
  assert.match(whip.broadcastPublishErrorMessage({ name: "AbortError" }), /could not connect/i);
  assert.match(whip.broadcastPublishErrorMessage(new Error("Failed to connect to peer.")), /could not connect/i);
  assert.match(whip.broadcastPublishErrorMessage({ message: "Failed to connect to peer." }), /could not connect/i);
  assert.match(whip.broadcastPublishErrorMessage(new Error("failed to gather ICE candidates for offer")), /could not connect/i);
});

test("broadcastPublishErrorMessage maps empty media offers to camera or mic guidance", () => {
  assert.match(whip.broadcastPublishErrorMessage(new Error("whip_offer_missing_sendable_media")), /camera or mic/i);
});

test("buildBroadcastDiagnosticText returns early pending diagnostics", () => {
  assert.equal(
    whip.buildBroadcastDiagnosticText({
      mediaReady: false,
      whip: {},
      offer: {
        audioMLineCount: 0,
        videoMLineCount: 0,
        hasAudioSend: false,
        hasVideoSend: false,
        audioSendonlyCount: 0,
        videoSendonlyCount: 0,
      },
      outboundPacketsSent: 0,
      sessionConfirmed: false,
    }),
    "Camera pending · Ingest pending · Session pending",
  );
});

test("buildBroadcastDiagnosticText treats POST without HEAD as cached ingest routing", () => {
  assert.equal(
    whip.buildBroadcastDiagnosticText({
      mediaReady: true,
      whip: {
        postStartedAt: 30,
        postCompletedAt: 40,
        lastStatus: 201,
      },
      outboundPacketsSent: 0,
      sessionConfirmed: false,
    }),
    "Camera ready · Ingest cached · WHIP POST 201 · Session pending",
  );
});

test("buildBroadcastDiagnosticText includes WHIP, offer, media, and session details", () => {
  assert.equal(
    whip.buildBroadcastDiagnosticText({
      mediaReady: true,
      whip: {
        headStartedAt: 10,
        headCompletedAt: 20,
        postStartedAt: 30,
        postCompletedAt: 40,
        lastStatus: 201,
        lastHost: "fra-prod-catalyst-0.lp-playback.studio",
      },
      peerConnectionState: "connecting",
      iceConnectionState: "connected",
      offer: {
        audioMLineCount: 1,
        videoMLineCount: 1,
        hasAudioSend: true,
        hasVideoSend: true,
        audioSendonlyCount: 1,
        videoSendonlyCount: 1,
      },
      outboundPacketsSent: 22,
      sessionConfirmed: true,
    }),
    "Camera ready · Ingest HEAD 201 · WHIP POST 201 · Connection connecting · ICE connected · Offer audio/video sendonly · Media 22 · Session found",
  );
});

test("parseLivepeerIceHost extracts host from stun/turn urls", () => {
  assert.equal(whip.parseLivepeerIceHost("stun:nyc-prod-catalyst-0.lp-playback.studio"), "nyc-prod-catalyst-0.lp-playback.studio");
  assert.equal(whip.parseLivepeerIceHost("turn:host.example:3478?transport=udp"), "host.example");
  assert.equal(whip.parseLivepeerIceHost(["turns:relay.example:443?transport=tcp"]), "relay.example");
  assert.equal(whip.parseLivepeerIceHost(undefined), null);
});

test("augmentLivepeerIceServersForTcp adds TCP + TLS relays derived from the SDK's UDP servers", () => {
  const sdkServers = [
    { urls: "stun:nyc-prod-catalyst-0.lp-playback.studio" },
    { urls: "turn:nyc-prod-catalyst-0.lp-playback.studio", username: "livepeer", credential: "livepeer" },
  ];
  const out = whip.augmentLivepeerIceServersForTcp(sdkServers);
  const urls = out.map((s) => s.urls);
  assert.ok(urls.includes("turn:nyc-prod-catalyst-0.lp-playback.studio:3478?transport=tcp"), "has TCP turn");
  assert.ok(urls.includes("turns:nyc-prod-catalyst-0.lp-playback.studio:5349?transport=tcp"), "has TLS turn");
  // UDP servers stay first so good networks are unaffected.
  assert.equal(out[0].urls, "stun:nyc-prod-catalyst-0.lp-playback.studio");
  assert.equal(out[1].urls, "turn:nyc-prod-catalyst-0.lp-playback.studio");
  // TCP relays carry the static Livepeer TURN credentials.
  const tcp = out.find((s) => s.urls === "turn:nyc-prod-catalyst-0.lp-playback.studio:3478?transport=tcp");
  assert.equal(tcp.username, "livepeer");
  assert.equal(tcp.credential, "livepeer");
});

test("augmentLivepeerIceServersForTcp is idempotent and safe on empty input", () => {
  assert.deepEqual(whip.augmentLivepeerIceServersForTcp(undefined), []);
  assert.deepEqual(whip.augmentLivepeerIceServersForTcp([]), []);
  const once = whip.augmentLivepeerIceServersForTcp([
    { urls: "turn:h.example", username: "livepeer", credential: "livepeer" },
  ]);
  const twice = whip.augmentLivepeerIceServersForTcp(once);
  assert.deepEqual(twice, once);
});
