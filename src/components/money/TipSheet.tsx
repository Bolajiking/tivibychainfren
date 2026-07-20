"use client";

import { useState } from "react";
import { HandCoins } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Tile } from "@/components/ui/Media";
import { PaymentProgress } from "./PaymentProgress";
import { FundSheet } from "./FundSheet";
import { usePaymentFlow } from "@/lib/usePaymentFlow";
import { useAuthIntent } from "@/lib/auth/useAuthIntent";
import { cn } from "@/lib/cn";

export function TipSheet({
  open,
  onOpenChange,
  creatorName,
  recipient,
  presets,
  avatarSeed,
  resource,
  onSent,
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
}) {
  const [amount, setAmount] = useState(presets[1] ?? presets[0]);
  const [message, setMessage] = useState("");
  const [fundOpen, setFundOpen] = useState(false);
  const { phase, run, reset, error } = usePaymentFlow();
  const { user, requireAuth, getAuthedUser } = useAuthIntent("viewer");
  const insufficient = error === "insufficient_balance";

  async function send() {
    if (!requireAuth({ role: "viewer" })) return;
    const sender = getAuthedUser()?.displayName ?? "You";
    const tx = await run({
      moment: "tip", amountUsd: amount, recipient, resource,
      message: message || undefined, sender, recipientName: creatorName,
    });
    if (tx) {
      onSent(amount, message);
      onOpenChange(false);
      setMessage("");
      reset();
    }
  }

  function close(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={close} title={`Tip ${creatorName}`}>
        {phase === "preparing" || phase === "confirming" ? (
          <PaymentProgress phase={phase} amountUsd={amount} label="tip" />
        ) : (
          <>
            <div className="mb-3.5 flex items-center gap-2.5">
              <Tile seed={avatarSeed} size={36} radius={11} />
              <div>
                <div className="text-[13px] font-semibold">Send {creatorName} a tip</div>
                <div className="mt-0.5 text-[11px] text-muted">
                  goes directly to {creatorName} · <span className="receipt">0%</span> platform cut
                </div>
              </div>
              <span className="ml-auto flex size-9 items-center justify-center rounded-full bg-beam/[0.16] text-beam-soft">
                <HandCoins className="size-4" />
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {presets.map((p) => (
                <button
                  key={p}
                  onClick={() => setAmount(p)}
                  className={cn(
                    "receipt h-12 rounded-[14px] text-center text-sm transition duration-150 ease-[cubic-bezier(.22,1,.36,1)]",
                    amount === p
                      ? "border-2 border-beam bg-beam/[0.08] text-white"
                      : "border border-white/12 bg-transparent text-ink-dim hover:border-white/25",
                  )}
                >
                  ${p}
                </button>
              ))}
            </div>

            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message…"
              className="mt-3 h-[46px] w-full rounded-full border border-white/12 bg-white/[0.04] px-4 text-xs text-white placeholder:text-faint focus:border-beam focus:outline-none"
            />

            <div className="mt-3 flex items-center gap-3 rounded-[14px] border border-white/10 px-3.5 py-2.5 opacity-55">
              <span className="text-[12.5px] font-medium text-muted">Mobile money</span>
              <span className="ml-auto text-[9.5px] font-semibold tracking-[0.12em] text-faint">SOON</span>
            </div>

            {insufficient ? (
              <Button size="lg" className="mt-3 w-full" onClick={() => setFundOpen(true)}>
                Add money & send&nbsp;<span className="receipt">${amount}</span>
              </Button>
            ) : (
              <Button size="lg" className="mt-3 w-full" onClick={send}>
                Send&nbsp;<span className="receipt">${amount}</span>
              </Button>
            )}
            {error && !insufficient && (
              <div className="mt-2 rounded-[11px] border border-error/25 bg-error/[0.08] px-3 py-2.5 text-center text-[11px] leading-relaxed text-ink-dim">
                That didn&apos;t go through — your balance wasn&apos;t charged. Try again, or come back in a moment.
              </div>
            )}
            <div className="receipt mt-2.5 text-center text-[9.5px] text-ghost">
              Balance ${user?.balanceUsd.toFixed(2) ?? "0.00"} · USDC
            </div>
          </>
        )}
      </Sheet>
      <FundSheet open={fundOpen} onOpenChange={setFundOpen} needFor={amount} actionLabel="send" onFunded={() => { reset(); send(); }} />
    </>
  );
}
