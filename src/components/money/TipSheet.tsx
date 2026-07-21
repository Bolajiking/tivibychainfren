"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { PaymentProgress } from "./PaymentProgress";
import { PaymentMethodPicker } from "./PaymentMethodPicker";
import { PaymentReceipt } from "./PaymentReceipt";
import { PaymentFailure } from "./PaymentFailure";
import { FundSheet } from "./FundSheet";
import { usePaymentFlow } from "@/lib/usePaymentFlow";
import { useAuthIntent } from "@/lib/auth/useAuthIntent";
import { approxLocal } from "@/lib/fx";
import { cn } from "@/lib/cn";

/**
 * F2 — the pay sheet IS the trust ceremony.
 *
 * System tokens only (money surfaces never carry the creator's accent),
 * receipt-layer numerals on every value, an explicit 0%-cut line, progress that
 * is always visible, and a failure state that never dead-ends. USDC is named
 * here and nowhere else — this is the money moment.
 */
export function TipSheet({
  open,
  onOpenChange,
  creatorName,
  recipient,
  presets,
  resource,
  onSent,
  onFollow,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  creatorName: string;
  recipient: string;
  presets: number[];
  avatarSeed?: string;
  /** live stream the tip is posted to (drives the chat donation message) */
  resource?: { kind: "stream" | "video"; playbackId: string };
  onSent: (amount: number, message: string) => void;
  /** Post-pay capture (F3). Omitted when the fan already follows. */
  onFollow?: () => void;
}) {
  const [amount, setAmount] = useState(presets[1] ?? presets[0]);
  const [message, setMessage] = useState("");
  const [fundOpen, setFundOpen] = useState(false);
  const [receipt, setReceipt] = useState<{ amount: number; ref: string } | null>(null);
  const { phase, run, reset, error } = usePaymentFlow();
  const { user, requireAuth, getAuthedUser } = useAuthIntent("viewer");
  const insufficient = error === "insufficient_balance";
  const firstName = creatorName.split(" ")[0];
  const balance = user?.balanceUsd ?? 0;

  async function send() {
    if (!requireAuth({ role: "viewer", reason: "tip", subject: creatorName })) return;
    const sender = getAuthedUser()?.displayName ?? "You";
    const tx = await run({
      moment: "tip",
      amountUsd: amount,
      recipient,
      resource,
      message: message || undefined,
      sender,
      recipientName: creatorName,
    });
    if (tx) {
      onSent(amount, message);
      setReceipt({ amount, ref: referenceFrom(tx) });
      setMessage("");
      reset();
    }
  }

  function close(open: boolean) {
    if (!open) {
      reset();
      setReceipt(null);
    }
    onOpenChange(open);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={close} title={`Tip ${creatorName}`}>
        {phase === "preparing" || phase === "confirming" ? (
          <PaymentProgress phase={phase} amountUsd={amount} label="tip" />
        ) : receipt ? (
          /* Success — the fan saw their tip land on stream; here's the proof. */
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-[26px] place-items-center rounded-full border border-earn/40 bg-earn/[0.15]">
                <Check className="size-3.5 text-earn" />
              </span>
              <span className="text-[15px] font-semibold text-ink-soft">
                Sent — {firstName} saw it on stream
              </span>
            </div>
            <PaymentReceipt
              lines={[
                { label: "tip", value: `$${receipt.amount.toFixed(2)}` },
                { label: "to", value: `${creatorName} · 100%` },
                { label: "platform", value: "$0.00 · 0%" },
                { label: "ref", value: receipt.ref },
              ]}
            />
            {onFollow && (
              <div className="flex items-center gap-3 rounded-[14px] border border-white/[0.08] bg-canvas p-3.5">
                <div className="flex-1 text-[13px] text-ink-dim">Never miss {firstName} live</div>
                <Button
                  size="sm"
                  onClick={() => {
                    onFollow();
                    close(false);
                  }}
                >
                  Follow
                </Button>
              </div>
            )}
            <Button variant="ghost" size="sm" className="self-center" onClick={() => close(false)}>
              Back to the stream
            </Button>
          </div>
        ) : (
          <>
            <div className="font-display text-[20px] font-semibold tracking-[-0.01em]">Tip {firstName}</div>
            <div className="mt-1 text-[12px] text-muted">
              goes directly to {creatorName} · <span className="receipt">0%</span> platform cut
            </div>

            <div className="mt-3.5 grid grid-cols-4 gap-2">
              {presets.slice(0, 4).map((preset) => (
                <button
                  key={preset}
                  onClick={() => setAmount(preset)}
                  aria-pressed={amount === preset}
                  className={cn(
                    "receipt h-12 rounded-[14px] text-center text-sm transition duration-150 ease-[cubic-bezier(.22,1,.36,1)]",
                    amount === preset
                      ? "border-2 border-beam bg-beam/[0.08] text-ink-soft"
                      : "border border-white/12 text-ink-dim hover:border-white/25",
                  )}
                >
                  ${preset}
                </button>
              ))}
            </div>

            {/* Local-currency echo: the fan reasons in the money they hold. */}
            <div className="receipt mt-2.5 text-[11px] text-faint">
              ${amount.toFixed(2)} {approxLocal(amount)}
            </div>

            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message…"
              className="mt-3 h-[46px] w-full rounded-full border border-white/12 bg-white/[0.04] px-4 text-xs text-white placeholder:text-faint focus:border-beam focus:outline-none"
            />

            <PaymentMethodPicker className="mt-3.5" balance={balance} />

            {insufficient ? (
              <Button size="lg" className="mt-3.5 w-full" onClick={() => setFundOpen(true)}>
                Add money & send&nbsp;<span className="receipt">${amount.toFixed(2)}</span>
              </Button>
            ) : (
              <Button size="lg" className="mt-3.5 w-full" onClick={send}>
                Send&nbsp;<span className="receipt">${amount.toFixed(2)}</span>
              </Button>
            )}

            {error && !insufficient && (
              <PaymentFailure className="mt-3" onRetry={send} />
            )}
          </>
        )}
      </Sheet>
      <FundSheet
        open={fundOpen}
        onOpenChange={setFundOpen}
        needFor={amount}
        actionLabel="send"
        onFunded={() => {
          reset();
          void send();
        }}
      />
    </>
  );
}

/** A short, human reference the fan can quote in a support message. */
function referenceFrom(tx: string): string {
  const tail = tx.replace(/[^0-9a-zA-Z]/g, "").slice(-5).toUpperCase();
  return `#TB-${tail || "00000"}`;
}
