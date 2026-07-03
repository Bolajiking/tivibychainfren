"use client";

import { useEffect, useState } from "react";
import { watchStreamPresence } from "@/lib/realtime";

/**
 * Live concurrent-viewer count via Supabase Realtime presence. Returns `null`
 * until presence syncs (callers fall back to the DB viewer_count). Watchers pass
 * `track:true`; read-only surfaces (broadcast desk, channel page) omit it.
 */
export function useStreamPresence(streamId: string | undefined, opts: { enabled: boolean; track?: boolean }): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!opts.enabled || !streamId) {
      setCount(null);
      return;
    }
    return watchStreamPresence(streamId, setCount, { track: opts.track });
  }, [streamId, opts.enabled, opts.track]);
  return count;
}
