// Faithful headless WHIP publish test. Runs the same negotiation the app's
// BrowserBroadcaster does (catalyst-host ICE servers + the TCP/TLS TURN
// augmentation fix + sendonly transceivers + HEAD redirect + offer/answer),
// driven by a real Chromium with a fake camera/mic. This machine blocks UDP
// egress, so reaching "connected" here can only happen via the TCP/TLS TURN
// relay — i.e. it proves the fix.
//
// Usage: node scripts/whip-browser-test.mjs <whipUrl> [streamId]
//
// EXPERIMENT (opt-in, default behaviour unchanged when env is unset):
//   Inject a third-party TURN relay on a firewall-friendly port (443/TLS) to
//   bypass UDP-restricted carriers (e.g. MTN/Nigeria) where Livepeer's own
//   catalyst TCP-TURN relay is regionally flaky. The decisive test is whether a
//   relayed candidate pair gets nominated AND Livepeer flips isActive with
//   bytesSent > 0.
//
//   Cloudflare Realtime TURN (recommended — anycast, TURN-over-TLS on 443):
//     CF_TURN_KEY_ID=...  CF_TURN_API_TOKEN=...   (creds minted via CF API)
//   Any other provider (Twilio / coturn / Metered / Xirsys) — raw RTCIceServer[]:
//     EXTRA_ICE_JSON='[{"urls":["turns:host:443?transport=tcp"],"username":"u","credential":"c"}]'
//   Force ALL media through a relay (honest proof — no UDP/host shortcut):
//     WHIP_FORCE_RELAY=1
//
// Examples:
//   CF_TURN_KEY_ID=xxx CF_TURN_API_TOKEN=yyy WHIP_FORCE_RELAY=1 \
//     node scripts/whip-browser-test.mjs <whipUrl> <streamId>

import http from "node:http";
import { chromium } from "playwright";
import { optionalBasicAuthorization } from "./livepeer-bridge-helpers.mjs";

const whipUrl = process.argv[2];
if (!whipUrl) { console.error("need whipUrl"); process.exit(1); }

const FORCE_RELAY = process.env.WHIP_FORCE_RELAY === "1";
const PREFER_H264 = process.env.WHIP_PREFER_H264 === "1";
const AUTHORIZATION = optionalBasicAuthorization(
  process.env.WHIP_AUTH_USERNAME,
  process.env.WHIP_AUTH_PASSWORD,
);

// Mint Cloudflare Realtime TURN credentials (short-lived). Returns RTCIceServer[]
// normalised to the array shape Chromium expects, plus an explicit 443/TLS entry
// (the most firewall-traversable port) reusing the returned credentials.
async function loadCloudflareTurn() {
  const id = process.env.CF_TURN_KEY_ID;
  const token = process.env.CF_TURN_API_TOKEN;
  if (!id || !token) return [];
  const endpoint = `https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`;
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ ttl: 3600 }),
  });
  if (!r.ok) {
    console.error(`  [cf-turn] credential mint failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return [];
  }
  const data = await r.json();
  const raw = data.iceServers;
  const servers = Array.isArray(raw) ? raw : raw ? [raw] : [];
  // Pull a username/credential to synthesize an explicit 443/TLS relay entry.
  const withCreds = servers.find((s) => s.username && s.credential);
  if (withCreds) {
    const have = new Set(servers.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls])));
    const tls443 = "turns:turn.cloudflare.com:443?transport=tcp";
    if (!have.has(tls443)) {
      servers.push({ urls: [tls443], username: withCreds.username, credential: withCreds.credential });
    }
  }
  return servers;
}

function loadExtraIceFromEnv() {
  if (!process.env.EXTRA_ICE_JSON) return [];
  try {
    const parsed = JSON.parse(process.env.EXTRA_ICE_JSON);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    console.error("  [extra-ice] EXTRA_ICE_JSON parse error: " + e);
    return [];
  }
}

const EXTRA_ICE = [...(await loadCloudflareTurn()), ...loadExtraIceFromEnv()];
if (EXTRA_ICE.length) {
  console.log("  [experiment] extra ICE relays injected:\n" +
    EXTRA_ICE.map((s) => "    " + (Array.isArray(s.urls) ? s.urls.join(", ") : s.urls)).join("\n"));
}
if (FORCE_RELAY) console.log("  [experiment] iceTransportPolicy=relay (all media forced through a relay)");

const PAGE = (ingest, extraIce, forceRelay, preferH264, authorization) => `<!doctype html><meta charset=utf8><body><script>
const INGEST = ${JSON.stringify(ingest)};
const EXTRA_ICE = ${JSON.stringify(extraIce || [])};
const FORCE_RELAY = ${forceRelay ? "true" : "false"};
const PREFER_H264 = ${preferH264 ? "true" : "false"};
const AUTHORIZATION = ${JSON.stringify(authorization)};
const log = (m) => { (window.__log ||= []).push(m); };

function parseHost(url){const f=Array.isArray(url)?url[0]:url;const m=typeof f==="string"&&f.match(/^(?:stun|stuns|turn|turns):([^:?/]+)/i);return m?m[1]:null;}
function augment(existing){const s=Array.isArray(existing)?[...existing]:[];const host=s.map(x=>parseHost(x.urls)).find(Boolean);if(!host)return s;const have=new Set();for(const e of s)for(const u of(Array.isArray(e.urls)?e.urls:[e.urls]))have.add(u);for(const r of [{urls:\`turn:\${host}:3478?transport=tcp\`,username:"livepeer",credential:"livepeer"},{urls:\`turns:\${host}:5349?transport=tcp\`,username:"livepeer",credential:"livepeer"}])if(!have.has(r.urls))s.push(r);return s;}

async function waitGather(pc){return new Promise(res=>{const t=setTimeout(()=>res(pc.localDescription),5000);pc.onicegatheringstatechange=()=>{if(pc.iceGatheringState==="complete"){clearTimeout(t);res(pc.localDescription);}};});}

async function run(){
  const stream = await navigator.mediaDevices.getUserMedia({audio:true,video:{width:1280,height:720}});
  log("got media tracks "+stream.getTracks().map(t=>t.kind).join(","));
  // HEAD redirect -> catalyst host (same as SDK getRedirectUrl)
  let host = new URL(INGEST).host;
  const authHeaders = AUTHORIZATION ? {authorization: AUTHORIZATION} : {};
  try { const h = await fetch(INGEST,{method:"HEAD",headers:authHeaders}); host = new URL(h.url).host; log("redirect host "+host); } catch(e){ log("HEAD err "+e); }
  const hostNoPort = host.split(":")[0];
  const baseIce = [{urls:\`stun:\${hostNoPort}\`},{urls:\`turn:\${hostNoPort}\`,username:"livepeer",credential:"livepeer"}];
  const iceServers = augment(baseIce);
  for(const s of EXTRA_ICE) iceServers.push(s);
  log("iceServers "+JSON.stringify(iceServers.map(s=>s.urls)));
  const config = {iceServers};
  if(FORCE_RELAY) config.iceTransportPolicy = "relay";
  log("config policy "+(config.iceTransportPolicy||"all"));
  const pc = new RTCPeerConnection(config);
  window.__pc = pc;
  pc.addEventListener("connectionstatechange",()=>log("conn "+pc.connectionState));
  pc.addEventListener("iceconnectionstatechange",()=>log("ice "+pc.iceConnectionState));
  pc.addEventListener("icecandidate",(e)=>{ if(e.candidate&&e.candidate.candidate) log("cand "+(e.candidate.url?("["+e.candidate.url+"] "):"")+e.candidate.candidate); });
  pc.addEventListener("icecandidateerror",(e)=>{ log("CANDERR url="+e.url+" code="+e.errorCode+" text="+e.errorText); });
  for(const track of stream.getVideoTracks()) {
    const transceiver = pc.addTransceiver(track,{direction:"sendonly"});
    if(PREFER_H264 && typeof transceiver.setCodecPreferences === "function") {
      const codecs = RTCRtpSender.getCapabilities("video")?.codecs || [];
      const preferred = [
        ...codecs.filter(codec => codec.mimeType.toLowerCase() === "video/h264"),
        ...codecs.filter(codec => codec.mimeType.toLowerCase() !== "video/h264"),
      ];
      transceiver.setCodecPreferences(preferred);
      log("preferred H264 codecs "+preferred.map(codec=>codec.mimeType).join(","));
    }
  }
  for(const track of stream.getAudioTracks()) pc.addTransceiver(track,{direction:"sendonly"});
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitGather(pc);
  const postUrl = new URL(INGEST); // POST to original ingest endpoint
  const resp = await fetch(postUrl.toString(),{method:"POST",mode:"cors",headers:{...authHeaders,"content-type":"application/sdp"},body:pc.localDescription.sdp});
  log("POST "+resp.status);
  if(resp.ok){ const ans=await resp.text(); window.__answer=ans; await pc.setRemoteDescription({type:"answer",sdp:ans}); log("set answer"); }
  else { log("POST body "+(await resp.text()).slice(0,200)); }
}
run().then(()=>{window.__started=true;}).catch(e=>{window.__err=String(e);log("ERR "+e);});
</script></body>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(PAGE(whipUrl, EXTRA_ICE, FORCE_RELAY, PREFER_H264, AUTHORIZATION));
});
await new Promise((r) => server.listen(7788, "127.0.0.1", r));

const browser = await chromium.launch({
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage();
page.on("console", (m) => process.stdout.write("  [console] " + m.text() + "\n"));
await page.goto("http://127.0.0.1:7788/");

// Wait for connected (or timeout). UDP is blocked on this host, so success == TCP TURN relay worked.
let connected = false, selected = null;
for (let i = 0; i < 30; i++) {
  const state = await page.evaluate(() => ({
    conn: window.__pc?.connectionState ?? null,
    ice: window.__pc?.iceConnectionState ?? null,
    err: window.__err ?? null,
    log: window.__log ?? [],
  }));
  // Probe the live transport even while still "connecting" — this is where a
  // DTLS stall hides (iceConnectionState=connected but connectionState=connecting).
  const probe = await page.evaluate(async () => {
    const pc = window.__pc; if (!pc) return null;
    const stats = await pc.getStats();
    let pair = null, transport = null;
    stats.forEach((s) => {
      if (s.type === "candidate-pair" && (s.nominated || s.state === "succeeded" || s.state === "in-progress")) {
        if (!pair || s.nominated) pair = s;
      }
      if (s.type === "transport") transport = s;
    });
    let local = null, remote = null;
    if (pair) stats.forEach((s) => {
      if (s.id === pair.localCandidateId) local = s;
      if (s.id === pair.remoteCandidateId) remote = s;
    });
    return {
      dtls: transport?.dtlsState ?? null,
      ice: transport?.iceState ?? null,
      pairState: pair?.state ?? null,
      nominated: pair?.nominated ?? null,
      reqSent: pair?.requestsSent ?? null,
      respRecv: pair?.responsesReceived ?? null,
      bytesSent: transport?.bytesSent ?? pair?.bytesSent ?? null,
      bytesRecv: transport?.bytesReceived ?? pair?.bytesReceived ?? null,
      localUrl: local?.url ?? null,
      localType: local?.candidateType ?? null,
      remoteType: remote?.candidateType ?? null,
      remoteAddr: remote ? `${remote.address}:${remote.port}` : null,
    };
  });
  if (i === 0 || state.conn) process.stdout.write(`  [${i}] conn=${state.conn} ice=${state.ice} dtls=${probe?.dtls} pair=${probe?.pairState}/${probe?.nominated} req/resp=${probe?.reqSent}/${probe?.respRecv} bytes=${probe?.bytesSent}/${probe?.bytesRecv} via=${probe?.localUrl} ->${probe?.remoteType}@${probe?.remoteAddr}\n`);
  if (state.conn === "connected") {
    connected = true;
    selected = await page.evaluate(async () => {
      const stats = await window.__pc.getStats();
      let pair = null, local = null, remote = null;
      stats.forEach((s) => { if (s.type === "candidate-pair" && (s.state === "succeeded" || s.nominated)) pair = s; });
      if (pair) stats.forEach((s) => {
        if (s.id === pair.localCandidateId) local = s;
        if (s.id === pair.remoteCandidateId) remote = s;
      });
      return local ? {
        nominated: pair?.nominated ?? null,
        pairState: pair?.state ?? null,
        local: { type: local.candidateType, protocol: local.protocol, relayProtocol: local.relayProtocol, url: local.url ?? null, address: local.address ?? null },
        remote: remote ? { type: remote.candidateType, protocol: remote.protocol, address: remote.address ?? null, port: remote.port ?? null } : null,
      } : null;
    });
    break;
  }
  if (state.conn === "failed") { process.stdout.write("  connection failed\n"); break; }
  await new Promise((r) => setTimeout(r, 2000));
}

const finalLog = await page.evaluate(() => window.__log ?? []);
console.log("\n--- page log ---\n" + finalLog.filter((l) => /relay|CANDERR|redirect|POST|conn |ice /.test(l)).join("\n"));

// Dump the catalyst answer SDP (ice-lite? setup role? remote candidates?).
const answer = await page.evaluate(() => window.__answer ?? null);
if (answer) {
  const lines = answer.split(/\r?\n/).filter((l) => /^a=(ice-lite|setup|candidate|fingerprint|ice-ufrag|rtcp-mux)|^m=/.test(l));
  console.log("\n--- catalyst answer SDP (key lines) ---\n" + lines.join("\n"));
}
console.log("\n--- transport ---");
console.log(JSON.stringify({ connected, selected }, null, 2));

// Hold the connection open and poll Livepeer for an ACTIVE session.
let sessionActive = false;
const streamId = process.argv[3];
if (connected && streamId) {
  const fs = await import("node:fs");
  const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const KEY = (env.match(/^LIVEPEER_API_KEY=(.*)$/m) || [])[1];
  console.log("\n--- polling Livepeer for active session ---");
  for (let i = 0; i < 15; i++) {
    const r = await fetch(`https://livepeer.studio/api/stream/${streamId}`, { headers: { authorization: `Bearer ${KEY}` } });
    const j = await r.json();
    const ob = await page.evaluate(async () => {
      const pc = window.__pc; if (!pc) return null;
      let b = 0, p = 0, frames = 0;
      (await pc.getStats()).forEach((s) => { if (s.type === "outbound-rtp" && !s.isRemote) { b += s.bytesSent || 0; p += s.packetsSent || 0; frames += s.framesEncoded || 0; } });
      return { bytesSent: b, packetsSent: p, framesEncoded: frames };
    });
    process.stdout.write(`  [${i}] isActive=${j.isActive} sourceSegments=${j.sourceSegments ?? "-"} | outbound bytes=${ob?.bytesSent} pkts=${ob?.packetsSent} frames=${ob?.framesEncoded}\n`);
    if (j.isActive) { sessionActive = true; break; }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

console.log("\n--- RESULT ---");
console.log(JSON.stringify({
  connected,
  forceRelay: FORCE_RELAY,
  preferH264: PREFER_H264,
  authenticated: Boolean(AUTHORIZATION),
  extraRelays: EXTRA_ICE.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls])),
  nominatedPair: selected ? { state: selected.pairState, nominated: selected.nominated } : null,
  localCandidate: selected?.local ?? null,
  remoteCandidate: selected?.remote ?? null,
  relayProtocol: selected?.local?.relayProtocol ?? null,
  turnServerUsed: selected?.local?.url ?? null,
  sessionActive,
}, null, 2));

// Long-running publish for propagation harnesses: keep media flowing until the
// timer elapses or the parent sends SIGINT.
const STAY_ALIVE_MS = Number(process.env.WHIP_STAY_ALIVE_MS ?? 0);
if (connected && STAY_ALIVE_MS > 0) {
  console.log(`\n--- staying alive for ${STAY_ALIVE_MS}ms (WHIP_STAY_ALIVE_MS) ---`);
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, STAY_ALIVE_MS);
    process.once("SIGINT", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

await browser.close();
server.close();
process.exit(connected && (!streamId || sessionActive) ? 0 : 2);
