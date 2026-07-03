import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";

/**
 * supabase-js builds a realtime client in its constructor, which needs a
 * WebSocket. Node < 22 has no global WebSocket, so on the server we hand it the
 * `ws` package. The browser uses its native WebSocket (don't ship `ws` there).
 */
function realtimeOpts() {
  if (typeof window !== "undefined") return undefined;
  // eval("require") keeps `ws` out of the browser bundle (server-only dep).
  const nodeRequire = eval("require") as NodeRequire;
  return { transport: nodeRequire("ws") } as const;
}

/**
 * Supabase clients.
 *  - `supabase`       : anon key, safe for browser + RSC reads (RLS-scoped).
 *  - `supabaseAdmin()`: service-role, SERVER-ONLY. Bypasses RLS for the money/
 *                       access writes that must not be client-trusted. Never
 *                       import this into a "use client" module.
 *
 * Both are null in mock mode (no env) — callers fall back to seed data.
 */
let _anon: SupabaseClient | null = null;
let _admin: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!config.supabase.enabled) return null;
  if (!_anon) {
    _anon = createClient(config.supabase.url, config.supabase.anonKey, {
      auth: { persistSession: false },
      realtime: realtimeOpts(),
    });
  }
  return _anon;
}

export function supabaseAdmin(): SupabaseClient | null {
  if (typeof window !== "undefined") {
    throw new Error("supabaseAdmin() is server-only");
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!config.supabase.url || !serviceKey) return null;
  if (!_admin) {
    _admin = createClient(config.supabase.url, serviceKey, {
      auth: { persistSession: false },
      realtime: realtimeOpts(),
    });
  }
  return _admin;
}
