// Real-key Livepeer e2e. Replicates the app's exact request shapes
// (src/lib/livepeer/policy.ts + proxy route + livepeer-client.ts) but talks
// to Livepeer directly with LIVEPEER_API_KEY, since the app proxy's owner
// routes require a real Privy bearer we can't mint in automation.
//
// Steps: create stream -> (caller publishes RTMP) -> confirm active session
// via GET /session (the section-37 route) and GET /stream/:id -> resolve HLS
// playback -> confirm live segments. VOD handled by a second invocation.

import { readFileSync } from "node:fs";
import { extractSessionRows, selectParentSession, sessionConfirmPath } from "./livepeer-e2e-helpers.mjs";

const API = "https://livepeer.studio/api";

function loadEnv() {
  const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const KEY = process.env.LIVEPEER_API_KEY;
if (!KEY) throw new Error("LIVEPEER_API_KEY missing");

const auth = { authorization: `Bearer ${KEY}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const firstHlsVariantUri = (manifest) => manifest
  .split("\n")
  .map((line) => line.trim())
  .find((line) => line.length > 0 && !line.startsWith("#") && /\.m3u8(?:$|[?#])/i.test(line)) || null;

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...auth, ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers || {}) },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, ok: res.ok, json, text };
}

async function textFetch(url) {
  try {
    const res = await fetch(url);
    return { ok: res.ok, status: res.status, text: await res.text(), error: null };
  } catch (error) {
    return { ok: false, status: 0, text: "", error: error instanceof Error ? error.message : String(error) };
  }
}

const cmd = process.argv[2] || "live";

if (cmd === "create") {
  // Mirrors proxy POST /stream forward body { name, record }.
  const r = await api("/stream", {
    method: "POST",
    body: JSON.stringify({ name: `tvinbio-e2e-${Date.now()}`, record: true }),
  });
  if (!r.ok) { console.error("CREATE FAIL", r.status, r.text); process.exit(1); }
  const { id, playbackId, streamKey } = r.json;
  console.log(JSON.stringify({ id, playbackId, streamKey }));
  process.exit(0);
}

if (cmd === "confirm") {
  const id = process.argv[3];
  const playbackId = process.argv[4];
  // 1) Active session route (section 37): GET /session?parentId=<stream id>
  // 2) Stream object isActive
  let activeSession = null, isActive = false;
  for (let i = 0; i < 40; i++) {
    const s = await api(`/stream/${id}`);
    isActive = Boolean(s.json?.isActive);
    const sess = await api(sessionConfirmPath(id));
    const rows = extractSessionRows(sess.json);
    activeSession = selectParentSession(sess.json, id);
    process.stdout.write(`  [${i}] isActive=${isActive} sessions=${rows.length} lastSeen=${activeSession?.lastSeen ?? "-"}\n`);
    if (isActive) break;
    await sleep(3000);
  }
  // 3) Resolve HLS playback (viewer path): GET /playback/:playbackId
  const pb = await api(`/playback/${playbackId}`);
  const sources = pb.json?.meta?.source || [];
  const hls = sources.find((s) => /m3u8|application\/vnd.apple/.test(`${s.type} ${s.hrn} ${s.url}`)) || sources[0];
  let segs = 0, manifestOk = false, playbackError = null;
  if (hls?.url) {
    const top = await textFetch(hls.url);
    playbackError = top.error;
    const topText = top.text;
    manifestOk = top.ok && topText.includes("#EXTM3U");
    // follow first variant if master
    const variant = firstHlsVariantUri(topText);
    if (variant) {
      const base = hls.url.replace(/[^/]*$/, "");
      const v = await textFetch(variant.startsWith("http") ? variant : base + variant);
      playbackError = v.error ?? playbackError;
      const vText = v.text;
      segs = (vText.match(/\.ts|#EXTINF/g) || []).length;
    } else {
      segs = (topText.match(/#EXTINF/g) || []).length;
    }
  }
  console.log(JSON.stringify({ isActive, sessions: Boolean(activeSession), playbackSources: sources.length, hlsUrl: hls?.url || null, manifestOk, segments: segs, playbackError }, null, 2));
  process.exit(isActive ? 0 : 2);
}

if (cmd === "delete-stream") {
  const id = process.argv[3];
  const r = await api(`/stream/${id}`, { method: "DELETE" });
  console.log("delete-stream", r.status);
  process.exit(0);
}

if (cmd === "vod") {
  // Mirrors proxy POST /asset/request-upload { name }.
  const name = `tvinbio-vod-e2e-${Date.now()}`;
  const req = await api("/asset/request-upload", { method: "POST", body: JSON.stringify({ name }) });
  if (!req.ok) { console.error("REQUEST-UPLOAD FAIL", req.status, req.text); process.exit(1); }
  const { url, asset, tusEndpoint } = req.json;
  const assetId = asset?.id;
  console.log("  request-upload ok asset=", assetId, "tus=", Boolean(tusEndpoint));
  // Direct PUT upload (simpler than tus; same endpoint accepts it).
  const file = readFileSync(process.argv[3]);
  const put = await fetch(url, { method: "PUT", body: file, headers: { "content-type": "video/mp4" } });
  console.log("  upload PUT", put.status);
  if (!put.ok) { console.error("UPLOAD FAIL", put.status, await put.text()); process.exit(1); }
  // Poll asset until ready.
  let phase = "", playbackId = null;
  for (let i = 0; i < 60; i++) {
    const a = await api(`/asset/${assetId}`);
    phase = a.json?.status?.phase || a.json?.phase || "?";
    playbackId = a.json?.playbackId || playbackId;
    process.stdout.write(`  [${i}] phase=${phase} playbackId=${playbackId ?? "-"}\n`);
    if (phase === "ready") break;
    if (phase === "failed") { console.error("ASSET FAILED", JSON.stringify(a.json?.status)); process.exit(1); }
    await sleep(4000);
  }
  // Confirm playback resolves.
  let segs = 0, playbackError = null;
  if (playbackId) {
    const pb = await api(`/playback/${playbackId}`);
    const src = (pb.json?.meta?.source || []).find((s) => /m3u8/.test(`${s.url}`)) || pb.json?.meta?.source?.[0];
    if (src?.url) {
      const m = await textFetch(src.url); const t = m.text; playbackError = m.error;
      const variant = firstHlsVariantUri(t);
      if (variant) { const base = src.url.replace(/[^/]*$/, ""); const response = await textFetch(variant.startsWith("http") ? variant : base + variant); playbackError = response.error ?? playbackError; segs = (response.text.match(/#EXTINF/g) || []).length; }
      else segs = (t.match(/#EXTINF/g) || []).length;
    }
  }
  console.log(JSON.stringify({ assetId, phase, playbackId, segments: segs, playbackError }, null, 2));
  // cleanup
  await api(`/asset/${assetId}`, { method: "DELETE" });
  process.exit(phase === "ready" ? 0 : 2);
}

console.error("unknown cmd", cmd);
process.exit(1);
