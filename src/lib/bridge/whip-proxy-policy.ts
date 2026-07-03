import { randomUUID } from "node:crypto";

export const WHIP_PROXY_MAX_POST_BODY_BYTES = 128 * 1024;
export const WHIP_PROXY_MAX_PATCH_BODY_BYTES = 32 * 1024;
export const WHIP_PROXY_UPSTREAM_POST_TIMEOUT_MS = 8_000;
export const WHIP_PROXY_UPSTREAM_PATCH_TIMEOUT_MS = 5_000;
export const WHIP_PROXY_UPSTREAM_DELETE_TIMEOUT_MS = 5_000;

const RESPONSE_HEADER_ALLOW_LIST = ["content-type", "location", "etag", "link"];
const UPSTREAM_REQUEST_HEADER_ALLOW_LIST = ["content-type", "content-length"];

export type WhipProxyRequestVerdict =
  | { ok: true }
  | { ok: false; status: 405 | 413 | 415; reasonCode: "method_not_allowed" | "payload_too_large" | "unsupported_media_type" };

function normalizedContentType(contentType: string | null | undefined): string {
  return String(contentType ?? "").split(";")[0].trim().toLowerCase();
}

export function evaluateWhipProxyRequest(input: {
  method: string;
  contentType: string | null | undefined;
  bodyBytes: number;
}): WhipProxyRequestVerdict {
  const method = String(input.method ?? "").toUpperCase();
  const contentType = normalizedContentType(input.contentType);

  if (method === "POST") {
    if (contentType !== "application/sdp") {
      return { ok: false, status: 415, reasonCode: "unsupported_media_type" };
    }
    if (input.bodyBytes > WHIP_PROXY_MAX_POST_BODY_BYTES) {
      return { ok: false, status: 413, reasonCode: "payload_too_large" };
    }
    return { ok: true };
  }
  if (method === "PATCH") {
    if (contentType !== "application/trickle-ice-sdpfrag") {
      return { ok: false, status: 415, reasonCode: "unsupported_media_type" };
    }
    if (input.bodyBytes > WHIP_PROXY_MAX_PATCH_BODY_BYTES) {
      return { ok: false, status: 413, reasonCode: "payload_too_large" };
    }
    return { ok: true };
  }
  if (method === "DELETE") return { ok: true };
  return { ok: false, status: 405, reasonCode: "method_not_allowed" };
}

export type WhipUpstreamOutcome =
  | { kind: "success"; status: number }
  | { kind: "error"; status: 502 | 503; reasonCode: "bridge_signaling_rejected" | "bridge_unavailable" };

export function mapWhipUpstreamOutcome(input: {
  method: string;
  upstreamStatus: number | null;
}): WhipUpstreamOutcome {
  const method = String(input.method ?? "").toUpperCase();
  const status = input.upstreamStatus;

  if (method === "DELETE" && (status === 200 || status === 204 || status === 404)) {
    return { kind: "success", status: 204 };
  }
  if (method === "POST" && status === 201) return { kind: "success", status: 201 };
  if (method === "PATCH" && status === 204) return { kind: "success", status: 204 };

  if (status === null || status >= 500) {
    return { kind: "error", status: 503, reasonCode: "bridge_unavailable" };
  }
  return { kind: "error", status: 502, reasonCode: "bridge_signaling_rejected" };
}

function filterHeaders(headers: Record<string, string>, allowList: string[]): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    const key = name.toLowerCase();
    if (allowList.includes(key)) filtered[key] = value;
  }
  return filtered;
}

export function filterWhipResponseHeaders(headers: Record<string, string>): Record<string, string> {
  return filterHeaders(headers, RESPONSE_HEADER_ALLOW_LIST);
}

export function filterWhipUpstreamRequestHeaders(headers: Record<string, string>): Record<string, string> {
  return filterHeaders(headers, UPSTREAM_REQUEST_HEADER_ALLOW_LIST);
}

export function rewriteWhipLocation(attemptId: string, resourceId: string): string {
  return `/api/bridge/attempts/${attemptId}/whip/resource/${resourceId}`;
}

export interface WhipResourceMap {
  register(attemptId: string, upstreamUrl: string): { resourceId: string; replacedUpstreamUrl: string | null };
  resolve(attemptId: string, resourceId: string): string | null;
  release(attemptId: string, resourceId: string): string | null;
  releaseAttempt(attemptId: string): string | null;
}

export function createWhipResourceMap(opts?: { mintId?: () => string }): WhipResourceMap {
  const mintId = opts?.mintId ?? (() => randomUUID());
  const byAttempt = new Map<string, { resourceId: string; upstreamUrl: string }>();

  return {
    register(attemptId, upstreamUrl) {
      const previous = byAttempt.get(attemptId) ?? null;
      const resourceId = mintId();
      byAttempt.set(attemptId, { resourceId, upstreamUrl });
      return { resourceId, replacedUpstreamUrl: previous?.upstreamUrl ?? null };
    },
    resolve(attemptId, resourceId) {
      const entry = byAttempt.get(attemptId);
      return entry && entry.resourceId === resourceId ? entry.upstreamUrl : null;
    },
    release(attemptId, resourceId) {
      const entry = byAttempt.get(attemptId);
      if (!entry || entry.resourceId !== resourceId) return null;
      byAttempt.delete(attemptId);
      return entry.upstreamUrl;
    },
    releaseAttempt(attemptId) {
      const entry = byAttempt.get(attemptId);
      if (!entry) return null;
      byAttempt.delete(attemptId);
      return entry.upstreamUrl;
    },
  };
}
