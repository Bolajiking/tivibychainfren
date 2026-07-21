# TVinBio Bridge Host — Deployment

Single-box v1 (plan §7). Browser WHIP over public ICE-TCP → MediaMTX →
path-scoped ffmpeg forwarder (H.264 copy, Opus→AAC) → `rtmp://rtmp.livepeer.com/live`.

## Pinned versions

Record the exact values used at deploy time:

| Component | Version | Checksum / digest |
|---|---|---|
| MediaMTX | **1.19.2** via `Dockerfile.mediamtx` (`bluenviron/mediamtx:1.19.2-ffmpeg` + curl) | record `docker image inspect` digest |
| ffmpeg | 6.x via `Dockerfile.agent` (Alpine) | record `ffmpeg -version` first line |
| Node | 20 LTS (`node:20-alpine`) | record digest |
| Caddy | 2.10 | record digest |

## Host requirements

- Public IPv4; **raw TCP 443 free** (no HTTP terminator on it — it carries ICE).
- TCP 8443 open (HTTPS signaling + control; optionally firewall to app egress IPs).
- Outbound TCP 1935 to `rtmp.livepeer.com`.
- 2 vCPU / 2 GB is ample for copy-mode single-digit concurrent publishers.
- UDP entirely closed. RTSP 8554 / MediaMTX API 9997 / agent 8091 & 9998 are loopback-only.

## DNS / TLS

1. `bridge.<domain>` A record → host IP.
2. Replace `BRIDGE_PUBLIC_HOST` in `../mediamtx.production.yml` (webrtcAdditionalHosts —
   hostname only) and `Caddyfile`.
3. TLS via DNS-01 (Caddyfile shows Cloudflare; any DNS provider plugin works).
   HTTP-01 is impossible: 443 is not HTTP here.

## Secrets

- `TVINBIO_BRIDGE_CONTROL_SECRET` — same value in the app (Vercel/host env) and
  agent env. Never in committed config.
- The agent never holds the Livepeer API key or Supabase keys. Stream keys
  arrive one per lease inside a signed lease-create call and live only in agent
  memory; logs redact them by construction (destinations are never logged).

## Run

```sh
cd bridge/deploy
cat > .env <<'ENV'
TVINBIO_BRIDGE_CONTROL_SECRET=<openssl rand -hex 32>
BRIDGE_PUBLIC_WHIP_BASE=https://bridge.<domain>:8443
CLOUDFLARE_API_TOKEN=<dns-01 token>
ENV
docker compose build          # agent (ffmpeg) and mediamtx (shell + curl)
docker compose up -d
```

**Both images are built, neither is stock, and that is deliberate:**

- `Dockerfile.agent` adds ffmpeg — the forwarder shells out to it, and
  `node:20-alpine` has none.
- `Dockerfile.mediamtx` is based on the `-ffmpeg` tag and adds curl. The stock
  `bluenviron/mediamtx:1.19.2` image is built FROM scratch with no shell, so the
  `runOnReady` / `runOnNotReady` hooks in `mediamtx.production.yml` fail with
  "command not found" — **silently**. MediaMTX still accepts the WebRTC publish,
  the agent never learns the path is ready, ffmpeg never spawns, and the
  broadcast is forwarded nowhere. It looks like it is working.

Verify after `up`, before pointing a browser at it:

```sh
docker compose exec mediamtx curl --version   # must succeed
docker compose exec agent ffmpeg -version     # must succeed
```

## Health / readiness

- Agent: `GET http://127.0.0.1:8091/healthz` (checks the loopback MediaMTX API
  and reports lease stats). The app calls `https://bridge.<domain>:8443/healthz`
  before including a bridge target in any transport plan — an unhealthy agent
  degrades routing to the pre-bridge behavior automatically.
- MediaMTX: `curl -s http://127.0.0.1:9997/v3/paths/list`.

## Shutdown / startup order

- SIGTERM to the agent revokes all leases (kicks publishers, ends forwarders),
  then exits. Stop order: agent → MediaMTX. Start order: agent → MediaMTX
  (compose `depends_on` encodes this).
- Agent restart intentionally clears all leases: the auth hook then denies the
  old opaque paths, MediaMTX drops the publisher, `runOnNotReady` ends ffmpeg,
  and the browser's recovery path creates a fresh lease. Stale credentials are
  never revived.

## Log retention

Agent logs are structured JSON on stdout (attempt/lease ids, reason codes —
no URLs with credentials, no SDP, no stream keys, no raw user agents). Use the
Docker `json-file` driver with rotation, e.g. `max-size: 10m`, `max-file: 5`,
retention ≥ 14 days for incident review.

## Firewall summary

| Port | Proto | Exposure | Purpose |
|---|---|---|---|
| 443 | TCP | public | WebRTC ICE-TCP media |
| 8443 | TCP | public (app-only by design; optionally IP-restricted) | TLS: WHIP signaling proxy + agent control |
| 8554, 9997, 8889, 8091, 9998 | TCP | loopback only | RTSP, MediaMTX API, WHIP internal, agent control, agent hooks |
| any | UDP | closed | — |
