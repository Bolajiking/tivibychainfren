import { getFundWallet } from "@/lib/auth/privy-bridge";
import { getOfframp } from "@/lib/payments/offramp";
import { MOCK_MODE } from "@/lib/config";

export type OnrampMode = "mock" | "provider" | "none";
export type OfframpMode = "mock" | "fiat" | "onchain";

export interface PaymentCapabilities {
  /** how "Add money" funds the wallet */
  onramp: OnrampMode;
  /** how "Cash out" moves money out */
  offramp: OfframpMode;
  mock: boolean;
}

/**
 * What the money rail can do right now, for the wallet UI to adapt to. Onramp is
 * Privy's managed flow when configured; offramp is a registered fiat provider when
 * present, else a self-custody on-chain withdraw (always available).
 */
export function paymentCapabilities(): PaymentCapabilities {
  if (MOCK_MODE) return { onramp: "mock", offramp: "mock", mock: true };
  return {
    onramp: getFundWallet() ? "provider" : "none",
    offramp: getOfframp() ? "fiat" : "onchain",
    mock: false,
  };
}
