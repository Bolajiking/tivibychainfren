import { createBridgeAgentClient, type BridgeAgentClient } from "@/lib/bridge/agent-client";
import {
  createBroadcastSessionManager,
  type BroadcastSessionManager,
} from "@/lib/bridge/broadcast-session";
import { createWhipProxy, type WhipProxy } from "@/lib/bridge/whip-proxy";
import { bridgeAllowedInRuntime } from "@/lib/bridge/runtime-guard";
import { createInMemorySessionStore } from "@/lib/bridge/session-store";
import {
  WHIP_PROXY_UPSTREAM_DELETE_TIMEOUT_MS,
  WHIP_PROXY_UPSTREAM_PATCH_TIMEOUT_MS,
  WHIP_PROXY_UPSTREAM_POST_TIMEOUT_MS,
} from "@/lib/bridge/whip-proxy-policy";
import { supabaseAdmin } from "@/lib/db/client";
import { LIVEPEER_API } from "@/lib/livepeer/policy";

export interface BridgeRuntime {
  manager: BroadcastSessionManager;
  proxy: WhipProxy;
}

const globalStore = globalThis as unknown as { __tvinbioBridgeRuntime?: BridgeRuntime };

export function bridgeEnabled(): boolean {
  if (!bridgeAllowedInRuntime(process.env)) return false;
  return (
    typeof process.env.TVINBIO_BRIDGE_CONTROL_URL === "string" &&
    process.env.TVINBIO_BRIDGE_CONTROL_URL.length > 0 &&
    typeof process.env.TVINBIO_BRIDGE_CONTROL_SECRET === "string" &&
    process.env.TVINBIO_BRIDGE_CONTROL_SECRET.length > 0
  );
}

function buildAgent(): BridgeAgentClient | null {
  if (!bridgeEnabled()) return null;
  return createBridgeAgentClient({
    controlUrl: process.env.TVINBIO_BRIDGE_CONTROL_URL as string,
    controlSecret: process.env.TVINBIO_BRIDGE_CONTROL_SECRET as string,
    log: (entry) => console.warn("[bridge agent]", JSON.stringify(entry)),
  });
}

/** Owner-verified server-side stream key load; the key never joins a browser payload. */
async function loadStreamKey(livepeerId: string): Promise<string | null> {
  if (!process.env.LIVEPEER_API_KEY) return null;
  try {
    const response = await fetch(`${LIVEPEER_API}/stream/${encodeURIComponent(livepeerId)}`, {
      headers: { authorization: `Bearer ${process.env.LIVEPEER_API_KEY}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const key = payload?.streamKey;
    return typeof key === "string" && key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

function timeoutFetch(timeoutMs: number) {
  return async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    } finally {
      clearTimeout(timer);
    }
  };
}

function upstreamFetchByMethod() {
  const post = timeoutFetch(WHIP_PROXY_UPSTREAM_POST_TIMEOUT_MS);
  const patch = timeoutFetch(WHIP_PROXY_UPSTREAM_PATCH_TIMEOUT_MS);
  const del = timeoutFetch(WHIP_PROXY_UPSTREAM_DELETE_TIMEOUT_MS);
  return (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    if (init.method === "POST") return post(url, init);
    if (init.method === "PATCH") return patch(url, init);
    return del(url, init);
  };
}

function buildRuntime(): BridgeRuntime {
  const agent = buildAgent();
  const upstreamFetch = upstreamFetchByMethod();

  const manager = createBroadcastSessionManager({
    agent,
    bridgeEnabled: bridgeEnabled(),
    store: createInMemorySessionStore(),
    loadStreamKey,
    leaseRepo: {
      async record(row) {
        const db = supabaseAdmin();
        if (!db) return;
        if (row.event === "created") {
          await db.from("broadcast_bridge_leases").insert({
            lease_id: row.leaseId,
            attempt_id: row.attemptId,
            creator_id: row.creatorId,
            livepeer_id: row.livepeerId,
            status: "created",
          });
          return;
        }
        await db
          .from("broadcast_bridge_leases")
          .update({ status: "ended", reason: row.reason, ended_at: new Date(row.atMs).toISOString() })
          .eq("attempt_id", row.attemptId);
      },
    },
    onReleaseResource(upstreamUrl, publishToken) {
      void upstreamFetch(upstreamUrl, {
        method: "DELETE",
        headers: publishToken ? { authorization: `Bearer ${publishToken}` } : {},
      }).catch(() => {});
    },
  });

  const proxy = createWhipProxy({
    // Signaling routes verify ownership via manager.getAttempt before proxying;
    // peekAttempt only supplies the upstream context after that check passed.
    resolveAttempt: (attemptId) => manager.peekAttempt(attemptId),
    resources: manager.store,
    upstreamFetch,
  });

  return { manager, proxy };
}

export function bridgeRuntime(): BridgeRuntime {
  if (!globalStore.__tvinbioBridgeRuntime) {
    globalStore.__tvinbioBridgeRuntime = buildRuntime();
  }
  return globalStore.__tvinbioBridgeRuntime;
}
