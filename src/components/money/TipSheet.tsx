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
                <div className="mt-0.5 text-[10px] text-faint">100% goes to the creator</div>
              </div>
              <span className="ml-auto flex size-9 items-center justify-center rounded-full bg-blue/[0.16] text-blue-light">
                <HandCoins className="size-4" />
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {presets.map((p) => (
                <button
                  key={p}
                  onClick={() => setAmount(p)}
                  className={cn(
                    "rounded-[13px] py-3 text-center text-sm font-semibold transition",
                    amount === p
                      ? "border-[1.5px] border-blue bg-blue/[0.18] text-white shadow-[0_6px_18px_rgba(0,145,255,.28)]"
                      : "border border-white/12 bg-white/[0.06] text-ink-dim",
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
              className="mt-3 h-[46px] w-full rounded-full border border-white/12 bg-white/[0.06] px-4 text-xs text-white placeholder:text-faint focus:border-blue focus:outline-none"
            />

            {insufficient ? (
              <Button size="lg" className="mt-3 w-full" onClick={() => setFundOpen(true)}>Add money & send ${amount}</Button>
            ) : (
              <Button size="lg" className="mt-3 w-full" onClick={send}>Send ${amount}</Button>
            )}
            {error && !insufficient && (
              <div className="mt-2 rounded-[11px] border border-red-400/20 bg-red-400/[0.08] px-3 py-2 text-center text-[10.5px] text-red-100">
                {error}
              </div>
            )}
            <div className="mt-2.5 text-center text-[9.5px] text-ghost">
              Balance ${user?.balanceUsd.toFixed(2) ?? "0.00"} · Apple Pay · Card
            </div>
          </>
        )}
      </Sheet>
      <FundSheet open={fundOpen} onOpenChange={setFundOpen} needFor={amount} actionLabel="send" onFunded={() => { reset(); send(); }} />
    </>
  );
}
