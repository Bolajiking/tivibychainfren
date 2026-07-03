interface SelectableStreamRow {
  playback_id?: string;
  playbackId?: string;
  is_active?: boolean | null;
  isActive?: boolean | null;
  started_at?: string | null;
  startedAt?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
}

export function selectActiveStreamRow<T extends SelectableStreamRow>(rows: T[]): T | null {
  return sortStreamRows(rows.filter((row) => isActive(row)))[0] ?? null;
}

export function selectCanonicalStreamRow<T extends SelectableStreamRow>(rows: T[]): T | null {
  return sortStreamRows(rows)[0] ?? null;
}

export function sortStreamRows<T extends SelectableStreamRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (isActive(a) !== isActive(b)) return isActive(b) ? 1 : -1;

    const startedDiff = timestamp(b.started_at ?? b.startedAt) - timestamp(a.started_at ?? a.startedAt);
    if (startedDiff !== 0) return startedDiff;

    const createdDiff = timestamp(b.created_at ?? b.createdAt) - timestamp(a.created_at ?? a.createdAt);
    if (createdDiff !== 0) return createdDiff;

    return streamId(a).localeCompare(streamId(b));
  });
}

function isActive(row: SelectableStreamRow): boolean {
  return Boolean(row.is_active ?? row.isActive);
}

function streamId(row: SelectableStreamRow): string {
  return row.playback_id ?? row.playbackId ?? "";
}

function timestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}
