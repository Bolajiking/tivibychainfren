import { isAddress } from "viem";
import { getFundWallet } from "@/lib/auth/privy-bridge";
import { getOfframp } from "@/lib/payments/offramp";
import { useSession } from "@/lib/store/session";
import { MOCK_MODE } from "@/lib/config";
import { refreshBalance } from "@/lib/payments/refresh";
import { sendUsdcPayment } from "@/lib/payments";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type FundOutcome = { ok: true; amountUsd: number; txHash?: string } | { ok: false; cancelled?: boolean; error?: string };
export type WithdrawOutcome = { ok: true; txHash?: string } | { ok: false; error?: string; cancelled?: boolean };

function shorten(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/**
 * Add money to the wallet. Real mode hands off to Privy's managed onramp (card /
 * Apple Pay / external transfer) for USDC on Base, then re-reads the on-chain
 * balance. Mock mode credits the optimistic local balance. Either way the move
 * lands in the wallet ledger.
 */
export async function fundWallet(amountUsd: number): Promise<FundOutcome> {
  const u = useSession.getState().user;
  if (!u) return { ok: false, error: "Sign in to add money" };
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return { ok: false, error: "Enter a valid amount" };

  const fund = getFundWallet();
  if (fund) {
    try {
      const res = await fund({ address: u.walletAddress, amountUsd });
      if (res.status !== "completed") return { ok: false, cancelled: true };
      const settledAmount = normalizedAmount(res.amount) ?? amountUsd;
      await refreshBalance();
      useSession.getState().addTransaction({ kind: "fund", label: "Added money", sub: "Card · Apple Pay", amountUsd: settledAmount, txHash: res.txHash });
      return { ok: true, amountUsd: settledAmount, txHash: res.txHash };
    } catch {
      return { ok: false, error: "Funding didn't complete" };
    }
  }

  if (!MOCK_MODE) return { ok: false, error: "Funding isn't configured yet" };

  // Mock onramp — simulate the hop, credit optimistically.
  await delay(700);
  useSession.getState().addFunds(amountUsd);
  useSession.getState().addTransaction({ kind: "fund", label: "Added money", sub: "Apple Pay", amountUsd });
  return { ok: true, amountUsd };
}

/**
 * Withdraw USDC to an external wallet address (self-custody cash-out). Real mode
 * signs an on-chain transfer via Privy; mock mode debits the optimistic balance.
 */
export async function withdrawToAddress(amountUsd: number, destination: string): Promise<WithdrawOutcome> {
  const u = useSession.getState().user;
  if (!u) return { ok: false, error: "Sign in first" };
  if (!isAddress(destination)) return { ok: false, error: "Enter a valid wallet address" };
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return { ok: false, error: "Enter an amount" };
  if (amountUsd > u.balanceUsd + 1e-9) return { ok: false, error: "Amount is more than your balance" };

  if (MOCK_MODE) {
    await delay(700);
    useSession.getState().setBalance(Math.max(0, u.balanceUsd - amountUsd));
    useSession.getState().addTransaction({ kind: "cashout", label: "Withdrawal", sub: shorten(destination), amountUsd: -amountUsd });
    return { ok: true };
  }

  try {
    const txHash = await sendUsdcPayment({ payerAddress: u.walletAddress, recipientAddress: destination, amountUsd });
    useSession.getState().addTransaction({ kind: "cashout", label: "Withdrawal", sub: shorten(destination), amountUsd: -amountUsd, txHash });
    await refreshBalance();
    return { ok: true, txHash };
  } catch {
    return { ok: false, error: "Withdrawal failed. Try again." };
  }
}

/**
 * Cash out to fiat via a registered offramp provider (bank). Only callable when
 * `paymentCapabilities().offramp === "fiat"`; otherwise use `withdrawToAddress`.
 */
export async function cashOut(amountUsd: number): Promise<WithdrawOutcome> {
  const u = useSession.getState().user;
  if (!u) return { ok: false, error: "Sign in first" };
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return { ok: false, error: "Enter an amount" };
  if (amountUsd > u.balanceUsd + 1e-9) return { ok: false, error: "Amount is more than your balance" };

  const offramp = getOfframp();
  if (!offramp) return { ok: false, error: "Cash-out to bank isn't available yet" };

  try {
    const res = await offramp({ address: u.walletAddress, amountUsd });
    if (res.status !== "completed") return { ok: false, cancelled: true };
    useSession.getState().addTransaction({ kind: "cashout", label: "Cashed out", sub: "Bank transfer", amountUsd: -amountUsd, txHash: res.txHash });
    await refreshBalance();
    return { ok: true, txHash: res.txHash };
  } catch {
    return { ok: false, error: "Cash-out didn't complete" };
  }
}

function normalizedAmount(value: string | undefined): number | null {
  if (!value) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}
