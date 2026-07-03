"use client";

import { useEffect } from "react";
import { usePrivy, useSendTransaction, useFundWallet } from "@privy-io/react-auth";
import { base } from "viem/chains";
import { registerSendTx, registerGetToken, registerFundWallet } from "@/lib/auth/privy-bridge";

/**
 * Registers Privy's wallet send fn + access-token getter + funding flow into the
 * module bridge, so non-Privy code (payments, wallet) can reach them without
 * importing Privy hooks (which would crash in mock mode). Mounted inside
 * PrivyProvider. Renders nothing.
 */
export function PrivyBridge() {
  const { getAccessToken } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const { fundWallet } = useFundWallet();

  useEffect(() => {
    registerGetToken(getAccessToken);
    registerSendTx(async (tx, opts) => {
      // Privy sponsors gas via the configured paymaster; user just confirms.
      const { hash } = await sendTransaction(
        { to: tx.to, data: tx.data, chainId: tx.chainId },
        { address: opts.address },
      );
      return hash;
    });
    // Privy's managed onramp (Coinbase/MoonPay card · Apple Pay · external transfer),
    // funding the embedded wallet in USDC on Base. Returns the funding result.
    registerFundWallet(async ({ address, amountUsd }) => {
      const res = await fundWallet({ address, options: { chain: base, amount: String(amountUsd) } });
      return { status: res.status, txHash: res.transactionHash, amount: res.amount };
    });
    return () => {
      registerGetToken(null);
      registerSendTx(null);
      registerFundWallet(null);
    };
  }, [getAccessToken, sendTransaction, fundWallet]);

  return null;
}
