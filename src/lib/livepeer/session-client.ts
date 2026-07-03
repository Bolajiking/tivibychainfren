export interface LivepeerStreamSession {
  id?: string;
  parentId?: string;
  createdAt?: number;
  lastSeen?: number;
  sourceBytes?: number;
  sourceSegments?: number;
  ingestRate?: number;
  isHealthy?: boolean | null;
  issues?: string[] | null;
  playbackId?: string;
}

export type LivepeerSessionLoader = (
  livepeerId: string,
  walletAddress?: string,
) => Promise<LivepeerStreamSession[]>;

export function parseLivepeerStreamSessions(data: unknown): LivepeerStreamSession[] {
  const nested = asRecord(data).data;
  const rows: unknown[] = Array.isArray(data) ? data : Array.isArray(nested) ? nested : [];
  return rows.map(toSession).filter((session): session is LivepeerStreamSession => Boolean(session));
}

function toSession(value: unknown): LivepeerStreamSession | null {
  const record = asRecord(value);
  const id = normalizeNonEmpty(record.id) ?? undefined;
  const parentId = normalizeNonEmpty(record.parentId) ?? undefined;
  return {
    id,
    parentId,
    createdAt: normalizeNumber(record.createdAt),
    lastSeen: normalizeNumber(record.lastSeen),
    sourceBytes: normalizeNumber(record.sourceBytes),
    sourceSegments: normalizeNumber(record.sourceSegments),
    ingestRate: normalizeNumber(record.ingestRate),
    isHealthy: typeof record.isHealthy === "boolean" || record.isHealthy === null ? record.isHealthy : undefined,
    issues: Array.isArray(record.issues) ? record.issues.map(String) : undefined,
    playbackId: normalizeNonEmpty(record.playbackId) ?? undefined,
  };
}

function normalizeNumber(value: unknown): number | undefined {
  const next = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(next) ? next : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeNonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
