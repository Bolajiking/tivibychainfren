"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subscribeToCreatorStreams } from "@/lib/realtime";
import { applyCreatorStreamChange, mergePolledCreatorStream } from "@/lib/channel-stream-state";
import { channelLiveStatusPollMs, createSingleFlightChannelRefresh } from "@/lib/channel-live-polling";
import type { Creator, Stream } from "@/lib/types";

/**
 * Keeps a channel's stream status live on the client — the single source of the
 * "is this creator on air right now" truth used by the channel page banner.
 *
 * Two signals, belt and suspenders:
 *   1. Supabase realtime (`subscribeToCreatorStreams`) — instant on start/end
 *      when realtime is configured.
 *   2. Polling `/api/channels/{username}/stream` — the endpoint reconciles the
 *      row against Livepeer and *repairs* a stuck `is_active` in the database,
 *      so a stream that ended reverts here AND everywhere else (explore) on the
 *      next read. Polls faster while idle (catch the go-live), slower while
 *      live, and only when the tab is visible.
 *
 * The revert bug this fixes: without polling, a page rendered while live never
 * learned the stream had ended and stayed "LIVE" forever.
 */
export function useChannelLiveStream(creator: Creator, initialStream: Stream | null) {
  const [stream, setStream] = useState<Stream | null>(initialStream);
  const pollAbortRef = useRef<AbortController | null>(null);

  useEffect(() => setStream(initialStream), [initialStream]);

  // Realtime — start/end arrive as row changes on the creator's streams.
  useEffect(() => {
    return subscribeToCreatorStreams(creator.creatorId, (event) => {
      setStream((current) => applyCreatorStreamChange(current, event));
    });
  }, [creator.creatorId]);

  const performRefresh = useCallback(async () => {
    const controller = new AbortController();
    pollAbortRef.current = controller;
    try {
      const res = await fetch(`/api/channels/${encodeURIComponent(creator.username)}/stream`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const next = data && typeof data === "object" && "stream" in data ? (data.stream as Stream | null) : null;
      if (!controller.signal.aborted) {
        setStream((current) => mergePolledCreatorStream(current, next));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    } finally {
      if (pollAbortRef.current === controller) pollAbortRef.current = null;
    }
  }, [creator.username]);

  const refresh = useMemo(() => createSingleFlightChannelRefresh(performRefresh), [performRefresh]);

  useEffect(() => {
    const intervalMs = channelLiveStatusPollMs(Boolean(stream?.isActive));
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, intervalMs);
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      pollAbortRef.current?.abort();
    };
  }, [stream?.isActive, refresh]);

  return stream;
}
