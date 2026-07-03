import {
  createPublicClient, http, parseUnits, decodeEventLog, erc20Abi, getAddress,
} from "viem";
import { base } from "viem/chains";
import { config } from "@/lib/config";

/**
 * SERVER-ONLY on-chain trust gate. Confirms a USDC Transfer actually landed on
 * Base before we grant access or write an order. Checks: receipt success, token
 * = USDC contract, sender (when provided) matches the claiming payer, recipient
 * matches, amount ≥ expected. Returns false on any mismatch or RPC failure
 * (fail-closed). Binding `from` to the payer stops one wallet's real payment
 * from being claimed by a different wallet.
 */
const client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
});

const isHash = (v: string) => /^0x[a-fA-F0-9]{64}$/.test(v);
const isAddr = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v);

export async function verifyUsdcTransfer(opts: {
  txHash: string;
  expectedRecipient: string;
  expectedAmountUsd: number;
  /** When set, the on-chain Transfer `from` must equal this address. */
  expectedSender?: string;
}): Promise<boolean> {
  const { txHash, expectedRecipient, expectedAmountUsd, expectedSender } = opts;
  if (!isHash(txHash)) return false;
  if (!isAddr(expectedRecipient)) return false;
  if (expectedSender !== undefined && !isAddr(expectedSender)) return false;

  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (receipt.status !== "success") return false;

    const usdc = getAddress(config.payments.usdcContract);
    const recipient = getAddress(expectedRecipient as `0x${string}`);
    const sender = expectedSender ? getAddress(expectedSender as `0x${string}`) : null;
    const want = parseUnits(expectedAmountUsd.toFixed(6), 6);

    for (const log of receipt.logs) {
      if (getAddress(log.address) !== usdc) continue;
      try {
        const ev = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
        if (ev.eventName !== "Transfer") continue;
        const { from, to, value } = ev.args as { from: `0x${string}`; to: `0x${string}`; value: bigint };
        if (getAddress(to) !== recipient) continue;
        if (sender && getAddress(from) !== sender) continue;
        if (value >= want) return true;
      } catch {
        /* not a Transfer event — skip */
      }
    }
    return false;
  } catch {
    return false;
  }
}
