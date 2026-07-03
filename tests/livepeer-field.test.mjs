import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

let field = {};
let fieldClient = {};
try {
  field = await loadTsModule(new URL("../src/lib/livepeer/field.ts", import.meta.url));
} catch {}
try {
  fieldClient = await loadTsModule(new URL("../src/lib/livepeer/field-client.ts", import.meta.url));
} catch {}

const completeEnv = {
  LIVEPEER_API_KEY: "api-secret",
  TVINBIO_FIELD_TOKEN: "field-token-with-enough-entropy",
  TVINBIO_FIELD_STREAM_ID: "stream-123",
  TVINBIO_FIELD_STREAM_KEY: "stream-key-secret",
  TVINBIO_FIELD_PLAYBACK_ID: "playback-123",
  TVINBIO_FIELD_WHIP_URL: "https://playback.livepeer.studio/webrtc/stream-key-secret",
};

test("field configuration fails closed unless every ephemeral secret is present", () => {
  assert.equal(typeof field.readLiveFieldConfig, "function");
  assert.equal(field.readLiveFieldConfig(completeEnv)?.streamId, "stream-123");
  assert.equal(field.readLiveFieldConfig({ ...completeEnv, TVINBIO_FIELD_TOKEN: "" }), null);
  assert.equal(field.readLiveFieldConfig({ ...completeEnv, LIVEPEER_API_KEY: "" }), null);
});

test("field authorization requires the configured token and exact stream", () => {
  const config = field.readLiveFieldConfig(completeEnv);
  assert.equal(field.authorizeLiveFieldRequest(config, "field-token-with-enough-entropy", "stream-123"), true);
  assert.equal(field.authorizeLiveFieldRequest(config, "wrong-token", "stream-123"), false);
  assert.equal(field.authorizeLiveFieldRequest(config, "field-token-with-enough-entropy", "other-stream"), false);
  assert.equal(field.authorizeLiveFieldRequest(null, "field-token-with-enough-entropy", "stream-123"), false);
});

test("field browser payload exposes only the temporary publish inputs", () => {
  const config = field.readLiveFieldConfig(completeEnv);
  const payload = field.toLiveFieldPublicConfig(config);

  assert.deepEqual(payload, {
    token: "field-token-with-enough-entropy",
    streamId: "stream-123",
    streamKey: "stream-key-secret",
    playbackId: "playback-123",
    whipUrl: "https://playback.livepeer.studio/webrtc/stream-key-secret",
  });
  assert.equal("apiKey" in payload, false);
});

test("field evidence accepts only scoped, bounded browser state transitions", () => {
  const config = field.readLiveFieldConfig(completeEnv);
  assert.deepEqual(
    field.parseLiveFieldEvidence(config, {
      streamId: "stream-123",
      event: "broadcast_status",
      status: "live",
      peer: "connected",
      enabled: true,
      occurredAt: 1_700_000_000_000,
    }),
    {
      event: "broadcast_status",
      status: "live",
      peer: "connected",
      enabled: true,
      occurredAt: 1_700_000_000_000,
    },
  );
  assert.equal(field.parseLiveFieldEvidence(config, { streamId: "other", event: "broadcast_status" }), null);
  assert.equal(field.parseLiveFieldEvidence(config, { streamId: "stream-123", event: "arbitrary_log" }), null);
});

test("field evidence preserves bounded real-device environment, media, gesture, codec, and network facts", () => {
  const config = field.readLiveFieldConfig(completeEnv);
  assert.deepEqual(
    field.parseLiveFieldEvidence(config, {
      streamId: "stream-123",
      event: "media_state",
      browser: "safari",
      platform: "ios",
      mobile: true,
      secureContext: true,
      mediaDevices: true,
      playsInline: true,
      muted: true,
      autoPlay: true,
      userActivated: true,
      mediaReady: true,
      camera: "live",
      microphone: "live",
      videoCodec: "video/H264",
      audioCodec: "audio/opus",
      error: "none",
      online: true,
      effectiveType: "4g",
      occurredAt: 1_700_000_000_100,
    }),
    {
      event: "media_state",
      browser: "safari",
      platform: "ios",
      mobile: true,
      secureContext: true,
      mediaDevices: true,
      playsInline: true,
      muted: true,
      autoPlay: true,
      userActivated: true,
      mediaReady: true,
      camera: "live",
      microphone: "live",
      videoCodec: "video/H264",
      audioCodec: "audio/opus",
      error: "none",
      online: true,
      effectiveType: "4g",
      occurredAt: 1_700_000_000_100,
    },
  );
});

test("field client classifies iOS browsers without retaining a raw user agent", () => {
  assert.equal(typeof fieldClient.describeLiveFieldBrowser, "function");
  assert.deepEqual(
    fieldClient.describeLiveFieldBrowser(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 Version/17.6 Mobile/15E148 Safari/604.1",
    ),
    { browser: "safari", platform: "ios", mobile: true },
  );
  assert.deepEqual(
    fieldClient.describeLiveFieldBrowser(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 CriOS/126.0 Mobile/15E148 Safari/604.1",
    ),
    { browser: "chrome", platform: "ios", mobile: true },
  );
});

test("field client summarizes required live media tracks for the physical-device log", () => {
  assert.equal(typeof fieldClient.describeLiveFieldMedia, "function");
  assert.deepEqual(
    fieldClient.describeLiveFieldMedia([
      { kind: "audio", readyState: "live", enabled: true },
      { kind: "video", readyState: "live", enabled: true },
    ]),
    { camera: "live", microphone: "live" },
  );
  assert.deepEqual(
    fieldClient.describeLiveFieldMedia([
      { kind: "audio", readyState: "live", enabled: false },
      { kind: "video", readyState: "ended", enabled: true },
    ]),
    { camera: "ended", microphone: "disabled" },
  );
});

test("field session loader scopes browser reads to its ephemeral token and stream", async () => {
  assert.equal(typeof fieldClient.createLiveFieldSessionLoader, "function");
  const requests = [];
  const loader = fieldClient.createLiveFieldSessionLoader("field token", async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({
      data: [{ id: "session-1", parentId: "stream/123", sourceBytes: "2048" }],
    }), { headers: { "content-type": "application/json" } });
  });

  const rows = await loader("stream/123");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "session-1");
  assert.equal(rows[0].parentId, "stream/123");
  assert.equal(rows[0].sourceBytes, 2048);
  assert.deepEqual(requests, [{
    url: "/api/field/livepeer/session?token=field+token&parentId=stream%2F123",
    init: { cache: "no-store" },
  }]);
});

test("field session loader does not hide rejected session reads", async () => {
  const loader = fieldClient.createLiveFieldSessionLoader("field-token", async () => (
    new Response(JSON.stringify({ ok: false, error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    })
  ));

  await assert.rejects(() => loader("stream-123"), /field_session_unavailable/);
});

test("field evidence reporter posts scoped transitions without putting the token in its body", async () => {
  const requests = [];
  await fieldClient.reportLiveFieldEvidence(
    "field token",
    "stream/123",
    { event: "broadcast_status", status: "pending", peer: "connecting", enabled: true, occurredAt: 42 },
    async (url, init) => {
      requests.push({ url, init });
      return new Response(null, { status: 204 });
    },
  );

  assert.equal(requests[0].url, "/api/field/livepeer/evidence?token=field+token");
  assert.equal(requests[0].init.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    streamId: "stream/123",
    event: "broadcast_status",
    status: "pending",
    peer: "connecting",
    enabled: true,
    occurredAt: 42,
  });
  assert.equal(requests[0].init.body.includes("field token"), false);
});
