"use client";

import { useState, useCallback } from "react";
import { sendUsdcPayment, settlePayment } from "@/lib/payments";
import { refreshBalance } from "@/lib/payments/refresh";
import { useSession, type WalletTxKind } from "@/lib/store/session";
import type { MoneyMoment, PaymentPhase } from "@/lib/types";

interface RunArgs {
  moment: MoneyMoment;
  amountUsd: number;
  recipient: string;
  /** local access keys to mark unlocked optimistically (unlock/subscribe) */
  unlockKeys?: string[];
  /** gated resource being unlocked/tipped (drives server-side DB writes) */
  resource?: { kind: "stream" | "video"; playbackId: string; viewMode?: string };
  /** product being bought */
  product?: { id: string; name: string; imageColor?: string };
  /** optional tip message + display handle */
  message?: string;
  sender?: string;
  /** display name of who's being paid (creator), for the wallet ledger */
  recipientName?: string;
}

/** Shared payment flow: send the transfer, settle it server-side, then update local state. */
export function usePaymentFlow() {
  const [phase, setPhase] = useState<PaymentPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const { user, spend, markUnlocked, addTransaction } = useSession();

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
  }, []);

  const run = useCallback(
    async ({ moment, amountUsd, recipient, unlockKeys = [], resource, product, message, sender, recipientName }: RunArgs): Promise<string | null> => {
      setError(null);
      const activeUser = useSession.getState().user ?? user;
      if (!activeUser) {
        setError("Please sign in to continue.");
        return null;
      }
      if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
        setError("Enter a valid amount.");
        return null;
      }
      if (moment !== "fund" && activeUser.balanceUsd < amountUsd) {
        setError("insufficient_balance");
        return null;
      }

      try {
        setPhase("preparing");
        const txHash = await sendUsdcPayment({
          payerAddress: activeUser.walletAddress,
          recipientAddress: recipient,
          amountUsd,
        });

        setPhase("confirming");
        // Server verifies the transfer on-chain, then writes the DB state that
        // grants access / records the order. Mock mode short-circuits to true.
        const settled = await settlePayment({
          moment, txHash, payer: activeUser.walletAddress, recipient, amountUsd,
          resource, product, message, sender,
        });
        if (!settled.ok) throw new Error(settled.error);

        spend(amountUsd);
        unlockKeys.forEach(markUnlocked);

        // Record the money moment in the wallet ledger, then reconcile to the
        // real on-chain balance (no-op in mock mode).
        if (moment !== "fund") {
          addTransaction({
            kind: moment as WalletTxKind,
            label: txLabel(moment, product?.name, recipientName),
            sub: recipientName ?? "TVinBio",
            amountUsd: -amountUsd,
            txHash,
          });
        }
        void refreshBalance();

        setPhase("success");
        return txHash;
      } catch (e) {
        setPhase("error");
        setError(e instanceof Error ? paymentErrorMessage(e.message) : "Something went wrong. Try again.");
        return null;
      }
    },
    [user, spend, markUnlocked, addTransaction],
  );

  return { phase, error, run, reset };
}

function paymentErrorMessage(code: string): string {
  switch (code) {
    case "bad_amount":
      return "Enter a valid amount.";
    case "bad_payer":
      return "Your wallet address looks invalid. Reconnect and try again.";
    case "bad_recipient":
      return "This creator wallet looks invalid. Try again from the channel page.";
    case "wallet_send_unavailable":
      return "Your wallet is still connecting. Reopen the wallet or refresh, then try again.";
    case "unauthorized":
      return "Sign in again to confirm this payment.";
    case "payer_not_owned":
      return "This payment must come from your signed-in wallet.";
    case "tx_unverified":
      return "We couldn't verify the transfer yet. Wait a moment and try again.";
    case "tx_already_settled":
      return "That payment was already confirmed.";
    case "bad_resource":
      return "This content is missing payment details. Refresh and try again.";
    case "bad_product":
      return "This product is missing checkout details. Refresh and try again.";
    case "product_unavailable":
      return "This item is no longer available.";
    case "subscription_required":
      return "Subscribe to this channel before buying this drop.";
    case "server_unconfigured":
      return "Payments are not configured for this environment.";
    case "write_failed":
    case "settle_failed":
      return "Payment sent, but access could not be recorded. Try again in a moment.";
    case "settle_unreachable":
      return "Payment confirmation is unreachable. Check your connection and try again.";
    default:
      return code || "Something went wrong. Try again.";
  }
}

function txLabel(moment: MoneyMoment, productName?: string, name?: string): string {
  switch (moment) {
    case "buy": return productName ?? "Purchase";
    case "tip": return name ? `Tip to ${name}` : "Tip sent";
    case "subscribe": return name ? `Subscribed to ${name}` : "Subscription";
    case "unlock": return "Unlocked content";
    default: return "Payment";
  }
}
