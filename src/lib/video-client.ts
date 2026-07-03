import * as tus from "tus-js-client";
import { getAccessToken } from "@/lib/auth/privy-bridge";
import type { Video, VodComment } from "@/lib/types";

/**
 * VOD upload client. Creates a draft row, asks our key-holder proxy for a
 * Livepeer upload target, then streams the file straight to Livepeer over tus
 * (resumable — survives flaky connections and large files). The LIVEPEER_API_KEY
 * never touches the browser; only the one-time tus endpoint does.
 */
interface VodUploadTarget {
  tusEndpoint: string;
  assetId: string;
  playbackId: string;
}

/** Create the processing `videos` row the upload will fill. */
export async function createVideoDraft(
  meta: { title: string; viewMode: Video["viewMode"]; amount?: string | number; durationSec?: number; thumbnailUrl?: string | null },
  walletAddress?: string,
): Promise<Video> {
  const res = await authed("/api/videos", "POST", meta, walletAddress);
  const data = await readJson(res);
  return data.video as Video;
}

/** Request a Livepeer upload for a draft; the proxy records the asset mapping. */
export async function requestVodUpload(
  tvinbioPlaybackId: string,
  name: string,
  walletAddress?: string,
): Promise<VodUploadTarget> {
  const res = await authed("/api/livepeer/asset/request-upload", "POST", { name, tvinbioPlaybackId }, walletAddress);
  const data = asRecord(await readJson(res));
  const asset = asRecord(data.asset);
  const tusEndpoint = data.tusEndpoint ?? data.url;
  if (!tusEndpoint) throw new Error("no_upload_target");
  if (!asset.id || !asset.playbackId) throw new Error("livepeer_response_invalid");
  return {
    tusEndpoint: String(tusEndpoint),
    assetId: String(asset.id),
    playbackId: String(asset.playbackId),
  };
}

/** Upload a file to the tus endpoint, reporting 0–100 progress. Resumable. */
export function uploadToTus(
  endpoint: string,
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    if (signal?.aborted) {
      reject(new DOMException("Upload cancelled", "AbortError"));
      return;
    }
    const upload = new tus.Upload(file, {
      endpoint,
      metadata: { filename: file.name, filetype: file.type },
      // Livepeer recommends these chunk/retry settings for resumable VOD.
      chunkSize: 5 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000],
      onError: (error) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      },
      onProgress: (sent, total) => onProgress?.(total ? Math.round((sent / total) * 100) : 0),
      onSuccess: () => {
        if (settled) return;
        settled = true;
        resolve();
      },
    });
    signal?.addEventListener("abort", () => {
      if (settled) return;
      settled = true;
      void upload.abort(true).finally(() => reject(new DOMException("Upload cancelled", "AbortError")));
    }, { once: true });
    upload.findPreviousUploads().then((prev) => {
      if (signal?.aborted) return;
      if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    }).catch((error) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

/**
 * Check Livepeer playback for a processing draft and, when transcoded, flip our
 * row to `ready`. Returns the resolved status so the UI can update in place.
 */
export async function syncVideoStatus(
  video: Pick<Video, "playbackId" | "livepeerPlaybackId">,
  walletAddress?: string,
): Promise<Video["status"]> {
  const resolveId = video.livepeerPlaybackId ?? video.playbackId;
  const info = await fetch(`/api/livepeer/playback/${encodeURIComponent(resolveId)}`, { cache: "no-store" })
    .then((r) => r.json())
    .catch(() => ({ state: "processing" }));

  if (info?.state !== "ready") return info?.state === "not_found" ? "not_found" : "processing";

  await authed(`/api/videos/${encodeURIComponent(video.playbackId)}`, "PATCH", { status: "ready" }, walletAddress);
  return "ready";
}

/** Edit a video's fields (title, viewMode/amount, status). */
export async function updateVideo(
  playbackId: string,
  patch: { title?: string; viewMode?: Video["viewMode"]; amount?: string | number; thumbnailUrl?: string | null },
  walletAddress?: string,
): Promise<Video | null> {
  const res = await authed(`/api/videos/${encodeURIComponent(playbackId)}`, "PATCH", patch, walletAddress);
  const data = await readJson(res);
  return (data?.video as Video) ?? null;
}

/** Soft-delete a video (hidden from the channel and library). */
export async function deleteVideo(playbackId: string, walletAddress?: string): Promise<void> {
  await readJson(await authed(`/api/videos/${encodeURIComponent(playbackId)}`, "PATCH", { disabled: true }, walletAddress));
}

export async function postVideoComment(
  playbackId: string,
  body: { message: string; sender: string; walletAddress: string },
): Promise<VodComment> {
  const res = await authed(`/api/videos/${encodeURIComponent(playbackId)}/comments`, "POST", body, body.walletAddress);
  const data = await readJson(res);
  return data.comment as VodComment;
}

export async function uploadVideoThumbnail(file: File, walletAddress?: string): Promise<string | null> {
  const token = await getAccessToken();
  const form = new FormData();
  form.append("file", file);
  if (walletAddress) form.append("walletAddress", walletAddress.toLowerCase());
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (walletAddress) headers.set("x-tvinbio-wallet", walletAddress.toLowerCase());
  const res = await fetch("/api/creator/video-thumbnail", { method: "POST", headers, body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.ok === false) throw new Error(data?.error ?? "thumbnail_upload_failed");
  return typeof data?.url === "string" ? data.url : null;
}

async function authed(path: string, method: "POST" | "PATCH", body: unknown, walletAddress?: string) {
  const token = await getAccessToken();
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (walletAddress) headers.set("x-tvinbio-wallet", walletAddress.toLowerCase());
  return fetch(path, {
    method,
    headers,
    body: JSON.stringify({ ...(body && typeof body === "object" ? body : {}), walletAddress }),
  });
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error ?? "video_request_failed");
  }
  return data;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
