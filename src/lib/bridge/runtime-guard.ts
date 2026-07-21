/**
 * The session manager keeps attempts in per-process memory. On serverless
 * (multiple instances) that breaks WHIP signaling mid-broadcast, so the bridge
 * refuses to enable there unless explicitly overridden (single-instance deploys).
 */
export function bridgeAllowedInRuntime(env: Record<string, string | undefined>): boolean {
  if (env.TVINBIO_BRIDGE_ENABLED !== "true") return false;
  if (env.VERCEL && env.TVINBIO_BRIDGE_ALLOW_SERVERLESS !== "true") return false;
  return true;
}
