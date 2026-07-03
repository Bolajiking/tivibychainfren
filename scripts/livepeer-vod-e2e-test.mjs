#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { firstHlsVariantUri } from "./livepeer-rtmp-e2e-helpers.mjs";
import { vodE2ePassed } from "./livepeer-vod-e2e-helpers.mjs";

const LIVEPEER_API = "https://livepeer.studio/api";
const READY_TIMEOUT_MS = 120_000;

loadEnv();
if (!process.env.LIVEPEER_API_KEY) throw new Error("LIVEPEER_API_KEY missing");

const filePath = process.argv[2];
if (!filePath) throw new Error("Provide a small MP4 file path");

const headers = { authorization: `Bearer ${process.env.LIVEPEER_API_KEY}` };
let assetId = "";
let evidence = emptyEvidence();
let failure = null;

try {
  const uploadRequest = await livepeer("/asset/request-upload", {
    method: "POST",
    body: JSON.stringify({ name: `tvinbio-vod-repeat-${Date.now()}` }),
  });
  assetId = uploadRequest.data?.asset?.id ?? "";
  const uploadUrl = uploadRequest.data?.url;
  if (!uploadRequest.ok || !assetId || !uploadUrl) {
    throw new Error(`Livepeer upload request failed (${uploadRequest.status})`);
  }

  const upload = await fetch(uploadUrl, {
    method: "PUT",
    body: readFileSync(filePath),
    headers: { "content-type": "video/mp4" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!upload.ok) throw new Error(`Livepeer asset upload failed (${upload.status})`);

  evidence = await waitForPlayableAsset(assetId);
  if (evidence.phase !== "ready") throw new Error(`Livepeer asset ended in phase ${evidence.phase}`);
  if (!evidence.manifestOk || evidence.segments < 1) {
    throw new Error("Livepeer asset became ready without playable HLS segments");
  }
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  evidence.assetDeleted = assetId ? await deleteAsset(assetId) : false;
}

const report = {
  mode: "livepeer-vod-e2e",
  ...evidence,
  passed: failure === null && vodE2ePassed(evidence),
  error: failure,
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 2;

async function waitForPlayableAsset(id) {
  const startedAt = Date.now();
  const deadline = startedAt + READY_TIMEOUT_MS;
  let current = emptyEvidence();

  while (Date.now() < deadline) {
    const response = await livepeer(`/asset/${encodeURIComponent(id)}`);
    const phase = response.data?.status?.phase ?? response.data?.phase ?? "unknown";
    const playbackId = response.data?.playbackId ?? current.playbackId;
    current = { ...current, phase, playbackId };
    if (phase === "failed") return current;

    if (phase === "ready" && playbackId) {
      current.readyMs ??= Date.now() - startedAt;
      const playback = await readPlaybackEvidence(playbackId);
      current = { ...current, ...playback };
      if (current.manifestOk && current.segments > 0) {
        current.playbackMs = Date.now() - startedAt;
        return current;
      }
    }
    await delay(2_000);
  }

  return current;
}

async function readPlaybackEvidence(playbackId) {
  const response = await livepeer(`/playback/${encodeURIComponent(playbackId)}`);
  const sources = Array.isArray(response.data?.meta?.source) ? response.data.meta.source : [];
  const hls = sources.find((source) => /m3u8|application\/vnd\.apple/i.test(`${source?.url} ${source?.type}`));
  if (!hls?.url) return { playbackSources: sources.length, manifestOk: false, segments: 0 };

  const top = await fetchText(hls.url);
  if (!top.ok || !top.text.includes("#EXTM3U")) {
    return { playbackSources: sources.length, manifestOk: false, segments: 0 };
  }
  const variant = firstHlsVariantUri(top.text);
  const media = variant ? await fetchText(new URL(variant, hls.url).href) : top;
  return {
    playbackSources: sources.length,
    manifestOk: media.ok && media.text.includes("#EXTM3U"),
    segments: (media.text.match(/#EXTINF:/g) ?? []).length,
  };
}

async function deleteAsset(id) {
  try {
    const response = await livepeer(`/asset/${encodeURIComponent(id)}`, { method: "DELETE" });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

async function livepeer(path, init = {}) {
  const response = await fetch(`${LIVEPEER_API}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(8_000),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  return { ok: response.ok, status: response.status, data };
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  return { ok: response.ok, text: await response.text() };
}

function emptyEvidence() {
  return {
    phase: "waiting",
    playbackId: "",
    playbackSources: 0,
    manifestOk: false,
    segments: 0,
    readyMs: null,
    playbackMs: null,
    assetDeleted: false,
  };
}

function loadEnv() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
