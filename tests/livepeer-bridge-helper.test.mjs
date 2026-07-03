import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

let bridge = {};
try {
  bridge = await import("../scripts/livepeer-bridge-helpers.mjs");
} catch {}

test("bridge helper builds local WHIP and private RTMP destinations", () => {
  assert.equal(typeof bridge.localBridgeWhipUrl, "function");
  assert.equal(typeof bridge.livepeerBridgeRtmpUrl, "function");
  assert.equal(bridge.localBridgeWhipUrl("creator-live"), "http://127.0.0.1:8889/creator-live/whip");
  assert.equal(
    bridge.livepeerBridgeRtmpUrl("stream-key-123"),
    "rtmp://rtmp.livepeer.com/live/stream-key-123",
  );
  assert.throws(() => bridge.localBridgeWhipUrl("../escape"), /Invalid bridge path/);
  assert.throws(() => bridge.livepeerBridgeRtmpUrl(" "), /Invalid Livepeer stream key/);
});

test("bridge helper redacts the Livepeer key from nested diagnostics", () => {
  assert.equal(typeof bridge.redactBridgeSecrets, "function");
  assert.deepEqual(
    bridge.redactBridgeSecrets(
      {
        destination: "rtmp://rtmp.livepeer.com/live/stream-key-123",
        command: ["ffmpeg", "stream-key-123"],
      },
      "stream-key-123",
    ),
    {
      destination: "rtmp://rtmp.livepeer.com/live/<redacted-stream-key>",
      command: ["ffmpeg", "<redacted-stream-key>"],
    },
  );
});

test("bridge helper accepts only a healthy active Livepeer confirmation", () => {
  assert.equal(typeof bridge.bridgeActivationConfirmed, "function");
  assert.equal(bridge.bridgeActivationConfirmed({ isActive: true, sessions: 1 }), true);
  assert.equal(bridge.bridgeActivationConfirmed({ isActive: true, sessions: 0 }), false);
  assert.equal(bridge.bridgeActivationConfirmed({ isActive: false, sessions: 1 }), false);
});

test("bridge helper prioritizes H264 without dropping browser codec fallbacks", () => {
  assert.equal(typeof bridge.preferH264Codecs, "function");
  const codecs = [
    { mimeType: "video/VP8" },
    { mimeType: "video/rtx" },
    { mimeType: "video/H264", sdpFmtpLine: "profile-level-id=42e01f" },
    { mimeType: "video/AV1" },
  ];
  const preferred = bridge.preferH264Codecs(codecs);
  assert.equal(preferred[0].mimeType, "video/H264");
  assert.deepEqual(new Set(preferred), new Set(codecs));
  assert.notEqual(preferred, codecs);
});

test("bridge helper builds optional Basic auth without accepting partial credentials", () => {
  assert.equal(typeof bridge.optionalBasicAuthorization, "function");
  assert.equal(bridge.optionalBasicAuthorization(undefined, undefined), null);
  assert.equal(bridge.optionalBasicAuthorization("publisher", "secret-123"), "Basic cHVibGlzaGVyOnNlY3JldC0xMjM=");
  assert.throws(() => bridge.optionalBasicAuthorization("publisher", ""), /both be set/);
});

test("bridge helper renders a restricted ICE-TCP remote validation config", () => {
  assert.equal(typeof bridge.remoteBridgeValidationConfig, "function");
  const config = bridge.remoteBridgeValidationConfig({
    publicHost: "203.0.113.10",
    publishUser: "validation-publisher",
    publishPass: "validation-secret-123",
  });
  assert.match(config, /webrtcLocalUDPAddress: ""/);
  assert.match(config, /webrtcLocalTCPAddress: ":443"/);
  assert.match(config, /webrtcAddress: ":8443"/);
  assert.match(config, /webrtcEncryption: true/);
  assert.match(config, /webrtcServerKey: "\/etc\/tvinbio\/bridge\/tls\.key"/);
  assert.match(config, /webrtcServerCert: "\/etc\/tvinbio\/bridge\/tls\.crt"/);
  assert.match(config, /webrtcAdditionalHosts: \["203\.0\.113\.10"\]/);
  assert.match(config, /user: "validation-publisher"/);
  assert.match(config, /pass: "validation-secret-123"/);
  assert.match(config, /\$TVINBIO_RTMP_DESTINATION/);
  assert.doesNotMatch(config, /rtmp:\/\/rtmp\.livepeer\.com\/live\/[A-Za-z0-9_-]+/);
  assert.throws(
    () => bridge.remoteBridgeValidationConfig({ publicHost: "bad host", publishUser: "valid-user", publishPass: "valid-secret-123" }),
    /Invalid public bridge host/,
  );
});

test("bridge helper parses a public raw-TCP tunnel endpoint without accepting HTTP output", () => {
  assert.equal(typeof bridge.parsePublicTcpTunnelEndpoint, "function");
  assert.deepEqual(
    bridge.parsePublicTcpTunnelEndpoint(
      "Allocated remote forward\nhttps://dashboard.example.test\ntcp://bridge-123.example.test:37677\n",
    ),
    {
      host: "bridge-123.example.test",
      port: 37677,
      url: "tcp://bridge-123.example.test:37677",
    },
  );
  assert.equal(bridge.parsePublicTcpTunnelEndpoint("https://bridge.example.test:37677"), null);
  assert.equal(bridge.parsePublicTcpTunnelEndpoint("tcp://127.0.0.1:37677"), null);
  assert.equal(bridge.parsePublicTcpTunnelEndpoint("tcp://bridge.example.test:70000"), null);
});

test("bridge helper binds MediaMTX to the externally advertised tunneled ICE port", () => {
  assert.equal(typeof bridge.tunneledBridgeValidationConfig, "function");
  const config = bridge.tunneledBridgeValidationConfig({
    publicIceHost: "bridge-123.example.test",
    publicIcePort: 37677,
    publishUser: "validation-publisher",
    publishPass: "validation-secret-123",
  });
  assert.match(config, /webrtcAddress: "127\.0\.0\.1:8889"/);
  assert.match(config, /webrtcEncryption: false/);
  assert.match(config, /webrtcLocalUDPAddress: ""/);
  assert.match(config, /webrtcLocalTCPAddress: "127\.0\.0\.1:37677"/);
  assert.match(config, /webrtcAdditionalHosts: \["bridge-123\.example\.test"\]/);
  assert.doesNotMatch(config, /bridge-123\.example\.test:37677/);
  assert.match(config, /user: "validation-publisher"/);
  assert.match(config, /pass: "validation-secret-123"/);
  assert.match(config, /\$TVINBIO_RTMP_DESTINATION/);
  assert.throws(
    () => bridge.tunneledBridgeValidationConfig({
      publicIceHost: "bridge.example.test",
      publicIcePort: 0,
      publishUser: "validation-publisher",
      publishPass: "validation-secret-123",
    }),
    /public ICE port/,
  );
});

test("bridge helper validates public-tunnel verifier overrides", () => {
  assert.equal(typeof bridge.bridgeVerifierOverrides, "function");
  assert.deepEqual(bridge.bridgeVerifierOverrides({}), {
    configPath: null,
    whipUrl: null,
    mode: "local-whip-rtmp-bridge",
  });
  assert.deepEqual(
    bridge.bridgeVerifierOverrides({
      TVINBIO_BRIDGE_CONFIG_PATH: "/tmp/private-mediamtx.yml",
      TVINBIO_BRIDGE_WHIP_URL: "https://signal.example.test/bridge/whip",
    }),
    {
      configPath: "/tmp/private-mediamtx.yml",
      whipUrl: "https://signal.example.test/bridge/whip",
      mode: "public-tunnel-whip-rtmp-bridge",
    },
  );
  assert.throws(
    () => bridge.bridgeVerifierOverrides({ TVINBIO_BRIDGE_CONFIG_PATH: "relative.yml" }),
    /absolute/,
  );
  assert.throws(
    () => bridge.bridgeVerifierOverrides({ TVINBIO_BRIDGE_WHIP_URL: "http://signal.example.test/bridge/whip" }),
    /HTTPS/,
  );
});

test("bridge helper reads remote validation inputs without defaulting secrets", () => {
  assert.equal(typeof bridge.remoteBridgeConfigInputs, "function");
  assert.deepEqual(
    bridge.remoteBridgeConfigInputs({
      TVINBIO_BRIDGE_PUBLIC_HOST: "bridge.example.test",
      WHIP_AUTH_USERNAME: "validation-publisher",
      WHIP_AUTH_PASSWORD: "validation-secret-123",
      TVINBIO_BRIDGE_ALLOWED_ORIGIN: "http://127.0.0.1:7788",
    }),
    {
      publicHost: "bridge.example.test",
      publishUser: "validation-publisher",
      publishPass: "validation-secret-123",
      allowedOrigin: "http://127.0.0.1:7788",
      tlsKeyPath: "/etc/tvinbio/bridge/tls.key",
      tlsCertPath: "/etc/tvinbio/bridge/tls.crt",
    },
  );
  assert.throws(() => bridge.remoteBridgeConfigInputs({}), /TVINBIO_BRIDGE_PUBLIC_HOST/);
});

test("remote bridge config CLI writes a private file without printing credentials", () => {
  const directory = mkdtempSync(join(tmpdir(), "tvinbio-bridge-config-"));
  const outputPath = join(directory, "mediamtx.yml");
  const env = {
    ...process.env,
    TVINBIO_BRIDGE_PUBLIC_HOST: "203.0.113.10",
    WHIP_AUTH_USERNAME: "validation-publisher",
    WHIP_AUTH_PASSWORD: "validation-secret-123",
  };
  try {
    const output = execFileSync(process.execPath, ["scripts/livepeer-bridge-remote-config.mjs", outputPath], {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
      env,
    });
    const config = readFileSync(outputPath, "utf8");
    assert.equal(statSync(outputPath).mode & 0o777, 0o600);
    assert.match(config, /validation-secret-123/);
    assert.doesNotMatch(output, /validation-secret-123/);
    assert.throws(
      () => execFileSync(process.execPath, ["scripts/livepeer-bridge-remote-config.mjs", outputPath], {
        cwd: new URL("../", import.meta.url),
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
      /already exists/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
