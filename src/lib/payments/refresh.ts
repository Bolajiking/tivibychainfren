import { getUsdcBalance } from "@/lib/payments/balance";
import { useSession } from "@/lib/store/session";
import { MOCK_MODE } from "@/lib/config";

/**
 * Pull the real on-chain USDC balance for the signed-in wallet and write it into
 * the session. The single source of truth after any money moment. In mock mode
 * the balance is the optimistic local number, so this is a no-op there.
 */
export async function refreshBalance(): Promise<void> {
  if (MOCK_MODE) return;
  const u = useSession.getState().user;
  if (!u) return;
  try {
    const balance = await getUsdcBalance(u.walletAddress);
    useSession.getState().setBalance(balance);
  } catch {
    /* leave the prior balance in place on RPC hiccups */
  }
}
