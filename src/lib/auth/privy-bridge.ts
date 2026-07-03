/**
 * Module-level bridge so non-React, non-Privy code (payments, fetch layer) can
 * reach the Privy wallet send fn + a fresh access token without importing Privy
 * hooks. A `<PrivyBridge/>` mounted inside the provider registers these.
 * Mirrors the spec's PrivyAccessTokenBridge pattern.
 */
type SendTxFn = (
  tx: { to: `0x${string}`; data: `0x${string}`; chainId: number },
  opts: { address: string },
) => Promise<string>;

/** Privy's onramp result, normalized for our wallet layer. */
export type FundResult = { status: "completed" | "cancelled"; txHash?: string; amount?: string };
type FundWalletFn = (opts: { address: string; amountUsd: number }) => Promise<FundResult>;

let _sendTx: SendTxFn | null = null;
let _getToken: (() => Promise<string | null>) | null = null;
let _fundWallet: FundWalletFn | null = null;

export function registerSendTx(fn: SendTxFn | null) { _sendTx = fn; }
export function getSendTx(): SendTxFn | null { return _sendTx; }

export function registerGetToken(fn: (() => Promise<string | null>) | null) { _getToken = fn; }
export async function getAccessToken(): Promise<string | null> {
  return _getToken ? _getToken() : null;
}

/** Privy's managed funding flow (card / Apple Pay / external transfer). Null in mock mode. */
export function registerFundWallet(fn: FundWalletFn | null) { _fundWallet = fn; }
export function getFundWallet(): FundWalletFn | null { return _fundWallet; }
