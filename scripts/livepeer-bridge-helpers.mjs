const BRIDGE_PATH = /^[A-Za-z0-9_-]{1,64}$/;
const LIVEPEER_STREAM_KEY = /^[A-Za-z0-9_-]{8,128}$/;
const BRIDGE_HOST = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const BRIDGE_CREDENTIAL = /^[A-Za-z0-9_-]{8,128}$/;

export function localBridgeWhipUrl(path, origin = "http://127.0.0.1:8889") {
  if (!BRIDGE_PATH.test(path)) throw new Error("Invalid bridge path");
  return `${origin.replace(/\/$/, "")}/${path}/whip`;
}

export function livepeerBridgeRtmpUrl(streamKey) {
  const key = String(streamKey ?? "").trim();
  if (!LIVEPEER_STREAM_KEY.test(key)) throw new Error("Invalid Livepeer stream key");
  return `rtmp://rtmp.livepeer.com/live/${key}`;
}

export function redactBridgeSecrets(value, streamKey) {
  const secret = String(streamKey ?? "");
  if (!secret) return value;
  if (typeof value === "string") return value.split(secret).join("<redacted-stream-key>");
  if (Array.isArray(value)) return value.map((item) => redactBridgeSecrets(item, secret));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactBridgeSecrets(item, secret)]),
    );
  }
  return value;
}

export function bridgeActivationConfirmed(value) {
  return value?.isActive === true && Number(value.sessions) > 0;
}

export function preferH264Codecs(codecs) {
  const values = Array.isArray(codecs) ? [...codecs] : [];
  return [
    ...values.filter((codec) => String(codec?.mimeType).toLowerCase() === "video/h264"),
    ...values.filter((codec) => String(codec?.mimeType).toLowerCase() !== "video/h264"),
  ];
}

export function optionalBasicAuthorization(username, password) {
  const user = String(username ?? "");
  const pass = String(password ?? "");
  if (!user && !pass) return null;
  if (!user || !pass) throw new Error("WHIP auth username and password must both be set");
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

export function parsePublicTcpTunnelEndpoint(output) {
  const matches = String(output ?? "").match(/tcp:\/\/[A-Za-z0-9.-]+:\d{1,5}\b/g) ?? [];
  for (const value of matches) {
    let url;
    try {
      url = new URL(value);
    } catch {
      continue;
    }
    const port = Number(url.port);
    const host = url.hostname.toLowerCase();
    if (!BRIDGE_HOST.test(host) || !validPort(port) || host === "localhost" || host.startsWith("127.")) {
      continue;
    }
    return { host, port, url: `tcp://${host}:${port}` };
  }
  return null;
}

export function tunneledBridgeValidationConfig({
  publicIceHost,
  publicIcePort,
  publishUser,
  publishPass,
  allowedOrigin = "http://127.0.0.1:7788",
}) {
  const host = String(publicIceHost ?? "").trim();
  const externalPort = Number(publicIcePort);
  const user = String(publishUser ?? "").trim();
  const pass = String(publishPass ?? "").trim();
  if (!BRIDGE_HOST.test(host)) throw new Error("Invalid public ICE host");
  if (!validPort(externalPort)) throw new Error("Invalid public ICE port");
  if (!BRIDGE_CREDENTIAL.test(user) || !BRIDGE_CREDENTIAL.test(pass)) {
    throw new Error("Invalid bridge publish credentials");
  }
  return renderBridgeValidationConfig({
    signalingAddress: "127.0.0.1:8889",
    encrypted: false,
    allowedOrigin: normalizedOrigin(allowedOrigin),
    localTcpAddress: `127.0.0.1:${externalPort}`,
    additionalHost: host,
    publishUser: user,
    publishPass: pass,
  });
}

export function bridgeVerifierOverrides(env) {
  const configPath = String(env?.TVINBIO_BRIDGE_CONFIG_PATH ?? "").trim();
  const whipUrl = String(env?.TVINBIO_BRIDGE_WHIP_URL ?? "").trim();
  if (!configPath && !whipUrl) {
    return { configPath: null, whipUrl: null, mode: "local-whip-rtmp-bridge" };
  }
  if (configPath && !configPath.startsWith("/")) throw new Error("Bridge config path must be absolute");
  let url;
  if (whipUrl) {
    try {
      url = new URL(whipUrl);
    } catch {
      throw new Error("Bridge WHIP URL must be valid HTTPS");
    }
    if (url.protocol !== "https:") throw new Error("Bridge WHIP URL must use HTTPS");
  }
  if (!configPath || !url) throw new Error("Bridge config path and HTTPS WHIP URL must both be set");
  return {
    configPath,
    whipUrl: url.toString(),
    mode: "public-tunnel-whip-rtmp-bridge",
  };
}

export function remoteBridgeValidationConfig({
  publicHost,
  publishUser,
  publishPass,
  allowedOrigin = "http://127.0.0.1:7788",
  tlsKeyPath = "/etc/tvinbio/bridge/tls.key",
  tlsCertPath = "/etc/tvinbio/bridge/tls.crt",
}) {
  const host = String(publicHost ?? "").trim();
  const user = String(publishUser ?? "").trim();
  const pass = String(publishPass ?? "").trim();
  if (!BRIDGE_HOST.test(host)) throw new Error("Invalid public bridge host");
  if (!BRIDGE_CREDENTIAL.test(user) || !BRIDGE_CREDENTIAL.test(pass)) {
    throw new Error("Invalid bridge publish credentials");
  }
  const origin = normalizedOrigin(allowedOrigin);
  const keyPath = absoluteConfigPath(tlsKeyPath, "TLS key");
  const certPath = absoluteConfigPath(tlsCertPath, "TLS certificate");
  return renderBridgeValidationConfig({
    signalingAddress: ":8443",
    encrypted: true,
    keyPath,
    certPath,
    allowedOrigin: origin,
    localTcpAddress: ":443",
    additionalHost: host,
    publishUser: user,
    publishPass: pass,
  });
}

function renderBridgeValidationConfig({
  signalingAddress,
  encrypted,
  keyPath,
  certPath,
  allowedOrigin,
  localTcpAddress,
  additionalHost,
  publishUser,
  publishPass,
}) {
  const tls = encrypted
    ? `webrtcServerKey: ${JSON.stringify(keyPath)}\nwebrtcServerCert: ${JSON.stringify(certPath)}\n`
    : "";
  return `logLevel: info
logDestinations: [stdout]

authMethod: internal
authInternalUsers:
  - user: ${JSON.stringify(publishUser)}
    pass: ${JSON.stringify(publishPass)}
    ips: []
    permissions:
      - action: publish
        path: bridge
  - user: any
    ips: ["127.0.0.1", "::1"]
    permissions:
      - action: read
        path: bridge
      - action: api

rtspAddress: "127.0.0.1:8554"
rtspTransports: [tcp]
rtmp: false
hls: false
srt: false
moq: false

api: true
apiAddress: "127.0.0.1:9997"
metrics: false
pprof: false
playback: false

webrtc: true
webrtcAddress: ${JSON.stringify(signalingAddress)}
webrtcEncryption: ${encrypted}
${tls}webrtcAllowOrigins: [${JSON.stringify(allowedOrigin)}]
webrtcLocalUDPAddress: ""
webrtcLocalTCPAddress: ${JSON.stringify(localTcpAddress)}
webrtcIPsFromInterfaces: false
webrtcAdditionalHosts: [${JSON.stringify(additionalHost)}]

pathDefaults:
  source: publisher

paths:
  bridge:
    runOnReady: >-
      ffmpeg -nostdin -loglevel warning -rtsp_transport tcp
      -i rtsp://127.0.0.1:$RTSP_PORT/$MTX_PATH
      -c:v copy -c:a aac -b:a 128k -ar 48000
      -f flv "$TVINBIO_RTMP_DESTINATION"
    runOnReadyRestart: true
`;
}

export function remoteBridgeConfigInputs(env) {
  const publicHost = String(env?.TVINBIO_BRIDGE_PUBLIC_HOST ?? "").trim();
  const publishUser = String(env?.WHIP_AUTH_USERNAME ?? "").trim();
  const publishPass = String(env?.WHIP_AUTH_PASSWORD ?? "").trim();
  const allowedOrigin = String(env?.TVINBIO_BRIDGE_ALLOWED_ORIGIN ?? "http://127.0.0.1:7788").trim();
  const tlsKeyPath = String(env?.TVINBIO_BRIDGE_TLS_KEY ?? "/etc/tvinbio/bridge/tls.key").trim();
  const tlsCertPath = String(env?.TVINBIO_BRIDGE_TLS_CERT ?? "/etc/tvinbio/bridge/tls.crt").trim();
  if (!publicHost) throw new Error("TVINBIO_BRIDGE_PUBLIC_HOST is required");
  if (!publishUser) throw new Error("WHIP_AUTH_USERNAME is required");
  if (!publishPass) throw new Error("WHIP_AUTH_PASSWORD is required");
  return { publicHost, publishUser, publishPass, allowedOrigin, tlsKeyPath, tlsCertPath };
}

function normalizedOrigin(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error("Invalid bridge allowed origin");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Invalid bridge allowed origin");
  }
  return url.origin;
}

function absoluteConfigPath(value, label) {
  const path = String(value ?? "").trim();
  if (!path.startsWith("/") || path.includes("\n") || path.includes("\r")) {
    throw new Error(`Invalid bridge ${label} path`);
  }
  return path;
}

function validPort(value) {
  return Number.isInteger(value) && value >= 1 && value <= 65_535;
}
