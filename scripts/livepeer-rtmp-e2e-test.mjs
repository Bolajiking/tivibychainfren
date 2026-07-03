#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import {
  buildRtmpEncoderArgs,
  firstHlsVariantUri,
  redactRtmpSecret,
  rtmpE2ePassed,
} from "./livepeer-rtmp-e2e-helpers.mjs";

const LIVEPEER_API = "https://livepeer.studio/api";
const ACTIVATION_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 1_000;

loadEnv();
if (!process.env.LIVEPEER_API_KEY) throw new Error("LIVEPEER_API_KEY missing");

const headers = { authorization: `Bearer ${process.env.LIVEPEER_API_KEY}` };
const encoderLogs = [];
let stream = null;
let encoder = null;
let evidence = emptyEvidence();
let failure = null;
const cleanup = { encoderStopped: false, streamDeleted: false };

try {
  stream = await createTemporaryStream();
  encoder = spawn("ffmpeg", buildRtmpEncoderArgs(stream.streamKey), {
    stdio: ["pipe", "ignore", "pipe"],
  });
  capture(encoder.stderr, encoderLogs, stream.streamKey);
  evidence = await waitForEvidence(stream);
  if (!rtmpE2ePassed(evidence)) {
    throw new Error("Livepeer RTMP run did not produce complete active-session and HLS evidence");
  }
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  cleanup.encoderStopped = await stopEncoder(encoder);
  if (stream?.id) cleanup.streamDeleted = await deleteTemporaryStream(stream.id);
}

const report = {
  mode: "livepeer-rtmp-e2e",
  ...evidence,
  encoderErrors: encoderLogs.slice(-20),
  cleanup,
  passed: failure === null && rtmpE2ePassed(evidence) && cleanup.encoderStopped && cleanup.streamDeleted,
  error: failure,
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 2;

async function createTemporaryStream() {
  const response = await livepeer("/stream", {
    method: "POST",
    body: JSON.stringify({ name: `tvinbio-rtmp-repeat-${Date.now()}`, record: false }),
  });
  if (!response.ok) throw new Error(`Livepeer stream creation failed (${response.status})`);
  if (!response.data?.id || !response.data?.playbackId || !response.data?.streamKey) {
    throw new Error("Livepeer stream creation returned incomplete ingest data");
  }
  return response.data;
}

async function waitForEvidence(target) {
  const startedAt = Date.now();
  const deadline = startedAt + ACTIVATION_TIMEOUT_MS;
  let current = emptyEvidence();

  while (Date.now() < deadline) {
    if (encoder && encoder.exitCode !== null) {
      throw new Error(`ffmpeg exited before Livepeer confirmation (${encoder.exitCode})`);
    }

    try {
      const [streamResponse, sessionResponse] = await Promise.all([
        livepeer(`/stream/${encodeURIComponent(target.id)}`),
        livepeer(`/session?parentId=${encodeURIComponent(target.id)}`),
      ]);
      const sessions = rows(sessionResponse.data).filter((row) => row?.parentId === target.id);
      current.isActive = streamResponse.data?.isActive === true;
      current.matchingSessions = sessions.length;
      if (current.isActive && current.activeMs === null) current.activeMs = Date.now() - startedAt;
      if (sessions.length > 0 && current.sessionMs === null) current.sessionMs = Date.now() - startedAt;

      if (current.isActive && sessions.length > 0) {
        const playback = await readPlaybackEvidence(target.playbackId);
        current = { ...current, ...playback };
        if (rtmpE2ePassed(current)) {
          current.playbackMs = Date.now() - startedAt;
          return current;
        }
      }
    } catch (error) {
      current.lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(POLL_INTERVAL_MS);
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

async function stopEncoder(child) {
  if (!child) return true;
  if (child.exitCode !== null || child.signalCode) return true;
  child.stdin?.write("q\n");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(5_000).then(() => child.kill("SIGTERM")),
  ]);
  return child.exitCode !== null || child.signalCode !== null;
}

async function deleteTemporaryStream(streamId) {
  try {
    const response = await livepeer(`/stream/${encodeURIComponent(streamId)}`, { method: "DELETE" });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

function rows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function emptyEvidence() {
  return {
    isActive: false,
    matchingSessions: 0,
    playbackSources: 0,
    manifestOk: false,
    segments: 0,
    activeMs: null,
    sessionMs: null,
    playbackMs: null,
    lastError: null,
  };
}

function capture(readable, target, streamKey) {
  let pending = "";
  readable?.setEncoding("utf8");
  readable?.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    target.push(...lines.filter(Boolean).map((line) => redactRtmpSecret(line, streamKey)));
  });
}

function loadEnv() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
