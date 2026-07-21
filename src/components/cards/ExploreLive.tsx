"use client";

import { useEffect, useRef, useState } from "react";
import { LiveCard } from "@/components/cards/Cards";
import { EmptyState } from "@/components/ui/EmptyState";
import { OnAirGlyph } from "@/components/brand/Glyphs";
import type { Creator, Stream } from "@/lib/types";

export interface LiveItem {
  stream: Stream;
  creator: Creator;
}

/**
 * The Explore "What's on" live grid, kept honest client-side. The server passes
 * an initial snapshot; this polls `/api/live` so a newly-live creator appears
 * and — the reported bug — an ended stream drops off, with no reload. Polling
 * pauses while the tab is hidden and resumes on focus.
 *
 * `query` is only used to decide the empty-state copy; server-side filtering
 * still produces the initial set.
 */
export function ExploreLive({ initial, query }: { initial: LiveItem[]; query?: string }) {
  const [items, setItems] = useState<LiveItem[]>(initial);
  const abortRef = useRef<AbortController | null>(null);
  const filtered = query ? items.filter((it) => matches(it, query)) : items;

  useEffect(() => setItems(initial), [initial]);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/live", { cache: "no-store", signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (alive && data?.items) setItems(data.items as LiveItem[]);
      } catch {
        /* transient — keep the last good set until the next tick */
      }
    }
    const timer = window.setInterval(refresh, 12_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      abortRef.current?.abort();
    };
  }, []);

  if (!filtered.length) {
    return (
      <EmptyState
        icon={<OnAirGlyph size={30} />}
        title={query ? "Nothing live matches that" : "Nobody's on air right now"}
        outcome={query ? undefined : "the stage is dark, not empty"}
      />
    );
  }

  return (
    <div className="stagger flex flex-col gap-2.5">
      {filtered.map(({ stream, creator }) => (
        <LiveCard key={stream.playbackId} stream={stream} creator={creator} wide />
      ))}
    </div>
  );
}

function matches({ stream, creator }: LiveItem, query: string): boolean {
  const q = query.toLowerCase();
  return (
    creator.displayName.toLowerCase().includes(q) ||
    creator.username.toLowerCase().includes(q) ||
    stream.title.toLowerCase().includes(q)
  );
}
