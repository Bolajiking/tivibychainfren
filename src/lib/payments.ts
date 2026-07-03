import { encodeFunctionData, erc20Abi, isAddress, parseUnits } from "viem";
import { config, MOCK_MODE } from "@/lib/config";
import { getSendTx, getAccessToken } from "@/lib/auth/privy-bridge";
import type { MoneyMoment } from "@/lib/types";

/**
 * The single ERC-20-transfer primitive. Every money moment funnels through it.
 *
 * In mock mode it simulates the on-chain hop. With a real Privy wallet you pass
 * a `sendTransaction` fn; gas is sponsored by a paymaster so the user never
 * needs ETH ("invisible crypto"). The encoded calldata below is exactly what
 * the production rail signs.
 */
interface SendUsdcArgs {
  payerAddress: string;
  recipientAddress: string;
  amountUsd: number;
  /** Privy's wallet send fn. Omitted in mock mode. */
  sendTransaction?: (tx: {
    to: `0x${string}`;
    data: `0x${string}`;
    chainId: number;
  }, opts: { address: string }) => Promise<string>;
}

function encodeUsdcTransfer(recipient: `0x${string}`, amountUsd: number) {
  return {
    to: config.payments.usdcContract,
    chainId: config.payments.chainId,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      // USDC = 6 decimals
      args: [recipient, parseUnits(amountUsd.toFixed(6), 6)],
    }),
  } as const;
}

export async function sendUsdcPayment(args: SendUsdcArgs): Promise<string> {
  const { payerAddress, recipientAddress, amountUsd } = args;
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new Error("bad_amount");
  if (!isAddress(payerAddress)) throw new Error("bad_payer");
  if (!isAddress(recipientAddress)) throw new Error("bad_recipient");

  const tx = encodeUsdcTransfer(recipientAddress, amountUsd);

  // Real rail: Privy signs (gas sponsored by paymaster when configured). The send
  // fn is supplied either explicitly or via the Privy bridge.
  const sendTransaction = args.sendTransaction ?? getSendTx() ?? undefined;
  if (sendTransaction) {
    return sendTransaction(tx, { address: payerAddress });
  }

  if (!MOCK_MODE) throw new Error("wallet_send_unavailable");

  // Mock rail: simulate network latency + return a deterministic-looking hash.
  await delay(900);
  const rand = Math.random().toString(16).slice(2).padEnd(64, "0").slice(0, 64);
  return `0x${rand}`;
}

/** Payload the server settle route needs to grant access / record the order. */
interface SettleArgs {
  moment: MoneyMoment;
  txHash: string;
  payer: string;
  recipient: string;
  amountUsd: number;
  resource?: { kind: "stream" | "video"; playbackId: string; viewMode?: string };
  product?: { id: string; name: string; imageColor?: string };
  message?: string;
  sender?: string;
}

export type SettlePaymentResult = { ok: true } | { ok: false; error: string };

/**
 * Server-side trust gate. POSTs the txHash to /api/payments/settle, which
 * verifies the transfer on-chain (reads the Base receipt) before writing DB
 * state. In pure mock mode there's no backend → optimistic success.
 * Returns ok when access/record is confirmed; otherwise preserves the server's
 * reason so the UI can show the right recovery path.
 */
export async function settlePayment(args: SettleArgs): Promise<SettlePaymentResult> {
  if (MOCK_MODE) return { ok: true };
  try {
    const token = await getAccessToken();
    const res = await fetch("/api/payments/settle", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(args),
    });
    const json: unknown = await res.json().catch(() => ({ ok: false }));
    if (res.ok && isOkResponse(json)) return { ok: true };
    return { ok: false, error: errorFromResponse(json) ?? "settle_failed" };
  } catch {
    return { ok: false, error: "settle_unreachable" };
  }
}

function isOkResponse(value: unknown): value is { ok: true } {
  return typeof value === "object" && value !== null && "ok" in value && (value as { ok?: unknown }).ok === true;
}

function errorFromResponse(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("error" in value)) return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error ? error : null;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
