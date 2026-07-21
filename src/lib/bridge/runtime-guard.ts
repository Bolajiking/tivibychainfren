/**
 * Whether the bridge may run in this deployment.
 *
 * Bridge session state (attempts, leases, WHIP resource mapping) must be
 * readable by whichever instance receives the next signaling request. With the
 * in-memory store that means one process only, so the bridge historically
 * refused to enable on serverless. Migration 0019 adds a Supabase-backed store;
 * when its env is present, multi-instance is safe and the bridge is allowed.
 *
 * Pure and zero-import so the test harness can load it directly.
 */
export function bridgeAllowedInRuntime(env: Record<string, string | undefined>): boolean {
  if (env.TVINBIO_BRIDGE_ENABLED !== "true") return false;
  if (!env.VERCEL) return true;
  // Explicit override for single-instance deploys that still set VERCEL.
  if (env.TVINBIO_BRIDGE_ALLOW_SERVERLESS === "true") return true;
  // Otherwise a shared store must be reachable: service-role Supabase for the
  // state, plus the control secret that seals credentials at rest.
  return Boolean(env.SUPABASE_SERVICE_ROLE_KEY && env.TVINBIO_BRIDGE_CONTROL_SECRET);
}
