/**
 * Server-only config sanity check. Pure function over an env-shaped record so
 * it is unit-testable; `warnOnMisconfiguration` logs once at module load from
 * the root layout. Warnings, not throws: mock mode with zero env stays a
 * first-class local path.
 */
type EnvLike = Record<string, string | undefined>;

export function configWarnings(env: EnvLike): string[] {
  const warnings: string[] = [];
  const supabase = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const production = env.NODE_ENV === "production" && Boolean(env.VERCEL || env.TVINBIO_PRODUCTION);

  if (!supabase) {
    if (production) {
      warnings.push(
        "TVinBio is running in MOCK MODE in production: Supabase env is unset, so real users are seeing in-memory seed data. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
    }
    return warnings; // full mock mode: the remaining pairings don't apply
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    warnings.push(
      "Supabase is configured but SUPABASE_SERVICE_ROLE_KEY is missing: payments, chat, moderation, and all admin writes will fail with server_unconfigured.",
    );
  }
  if (!env.NEXT_PUBLIC_PRIVY_APP_ID) {
    warnings.push(
      "Supabase is configured but Privy is not (NEXT_PUBLIC_PRIVY_APP_ID unset): every owner/creator API route (and chat posting) will respond 503 / unauthorized.",
    );
  } else if (!env.PRIVY_APP_SECRET) {
    warnings.push(
      "NEXT_PUBLIC_PRIVY_APP_ID is set but PRIVY_APP_SECRET is missing: server-side auth verification cannot run; owner routes will respond 503.",
    );
  }
  if (!env.LIVEPEER_API_KEY) {
    warnings.push("LIVEPEER_API_KEY is unset: live and VOD provisioning are disabled (livepeer_unconfigured).");
  } else if (!env.LIVEPEER_WEBHOOK_SECRET) {
    warnings.push(
      "LIVEPEER_API_KEY is set but LIVEPEER_WEBHOOK_SECRET is missing: streams will not auto-flip live/offline (webhook receiver fail-closes).",
    );
  }
  return warnings;
}

let warned = false;
export function warnOnMisconfiguration(): void {
  if (warned || typeof window !== "undefined") return;
  warned = true;
  for (const warning of configWarnings(process.env)) {
    console.warn(`[tvinbio config] ${warning}`);
  }
}
