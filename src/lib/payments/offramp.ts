/**
 * Offramp seam. Mirrors the onramp bridge (`registerFundWallet`/`getFundWallet`)
 * so a fiat cash-out provider (Coinbase Offramp, MoonPay, Privy offramp when GA)
 * can be plugged in without touching the wallet UI or actions.
 *
 * To wire one: mount a bridge component inside the provider tree that opens the
 * provider's hosted flow and `registerOfframp(fn)`. When an offramp is registered
 * the wallet's "Cash out" switches to the hosted bank flow; otherwise it falls
 * back to a self-custody on-chain withdraw to an address.
 */
export type OfframpResult = { status: "completed" | "cancelled"; txHash?: string };
export type OfframpFn = (args: { address: string; amountUsd: number }) => Promise<OfframpResult>;

let _offramp: OfframpFn | null = null;

export function registerOfframp(fn: OfframpFn | null) { _offramp = fn; }
export function getOfframp(): OfframpFn | null { return _offramp; }
