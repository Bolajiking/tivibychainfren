import { createPublicClient, http, erc20Abi, formatUnits } from "viem";
import { base } from "viem/chains";
import { config } from "@/lib/config";

/**
 * Read a wallet's real USDC balance on Base. Powers the "your balance" mental
 * model (framed in dollars). Falls back to 0 on any RPC hiccup so the UI never
 * dead-ends. USDC has 6 decimals.
 */
const client = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org"),
});

export async function getUsdcBalance(address: string): Promise<number> {
  try {
    const raw = await client.readContract({
      address: config.payments.usdcContract,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    });
    return Number(formatUnits(raw, 6));
  } catch {
    return 0;
  }
}
