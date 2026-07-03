import { redactSecrets } from "@/lib/livepeer/policy";

export function livepeerSessionProxyPath(parentId: string): string {
  return livepeerSessionApiPath(parentId).replace(/^\//, "");
}

export function livepeerSessionApiPath(parentId: string): string {
  const params = new URLSearchParams({ parentId: parentId.trim() });
  return `/session?${params.toString()}`;
}

export function livepeerSessionUpstreamUrl(apiBase: string, parentId: string): string {
  return `${apiBase.replace(/\/+$/, "")}${livepeerSessionApiPath(parentId)}`;
}

export function filterSessionsByParentId(payload: unknown, parentId: string): unknown[] {
  const normalizedParentId = parentId.trim();
  return extractSessionRows(payload)
    .filter((session) => asRecord(session).parentId === normalizedParentId)
    .map((session) => redactSecrets(session));
}

export function shouldReuseLivepeerStream(existingLivepeerId: unknown, forceNew: boolean): existingLivepeerId is string {
  return typeof existingLivepeerId === "string" && existingLivepeerId.trim().length > 0 && !forceNew;
}

export function parseForceNewLivepeerStream(value: unknown): boolean {
  return value === true || value === "true";
}

function extractSessionRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const data = asRecord(payload).data;
  return Array.isArray(data) ? data : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
