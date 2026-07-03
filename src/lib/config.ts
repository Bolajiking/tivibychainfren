/** Single place to read feature/service availability. Mock mode is the default. */
export const config = {
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    enabled: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  },
  privy: {
    appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "",
    enabled: Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID),
  },
  livepeer: {
    enabled: Boolean(process.env.LIVEPEER_API_KEY),
  },
  payments: {
    usdcContract: (process.env.NEXT_PUBLIC_BASE_USDC_CONTRACT ??
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as `0x${string}`,
    chainId: Number(process.env.NEXT_PUBLIC_BASE_CHAIN_ID ?? 8453),
    gasSponsored: Boolean(process.env.PAYMASTER_URL),
    onramp: process.env.ONRAMP_PROVIDER ?? "",
  },
} as const;

/** True when no real backend is wired — UI runs on in-memory seed data. */
export const MOCK_MODE = !config.supabase.enabled;
