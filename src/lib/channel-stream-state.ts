import type { Stream } from "@/lib/types";

export type CreatorStreamChange =
  | { type: "upsert"; stream: Stream }
  | { type: "delete"; playbackId: string };

export function applyCreatorStreamChange(current: Stream | null, event: CreatorStreamChange): Stream | null {
  if (event.type === "delete") {
    return current?.playbackId === event.playbackId ? null : current;
  }
  return mergePolledCreatorStream(current, event.stream);
}

export function mergePolledCreatorStream(current: Stream | null, next: Stream | null): Stream | null {
  if (!next) return current;
  if (!current) return next;
  if (next.isActive) return next;
  if (next.playbackId === current.playbackId) return next;
  return current;
}
