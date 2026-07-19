"use client";

import { useState } from "react";
import { Lock, Wallet } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { PaymentProgress, SuccessBurst } from "./PaymentProgress";
import { FundSheet } from "./FundSheet";
import { usePaymentFlow } from "@/lib/usePaymentFlow";
import { useAuthIntent } from "@/lib/auth/useAuthIntent";
import { cn } from "@/lib/cn";

type Door = "one-time" | "monthly";
type UnlockKeys = string[] | Record<Door, string[]>;

export function UnlockGate({
  open,
  onOpenChange,
  creatorName,
  recipient,
  contextLabel,
  oneTimeAmount,
  monthlyAmount,
  unlockKeys,
  resource,
  onUnlocked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  creatorName: string;
  recipient: string;
  contextLabel: string;
  oneTimeAmount: number;
  monthlyAmount: number;
  unlockKeys: UnlockKeys;
  /** the gated resource, so the server can record the unlock against it */
  resource?: { kind: "stream" | "video"; playbackId: string };
  onUnlocked: (door: Door) => void;
}) {
  const [step, setStep] = useState<"gate" | "checkout">("gate");
  const [door, setDoor] = useState<Door>("monthly");
  const [fundOpen, setFundOpen] = useState(false);
  const { phase, run, reset, error } = usePaymentFlow();
  const { user, requireAuth } = useAuthIntent("viewer");

  const amount = door === "monthly" ? monthlyAmount : oneTimeAmount;
  const contentNoun = resource?.kind === "video" ? "replay" : "stream";

  async function pay() {
    if (!requireAuth({ role: "viewer" })) return;
    const tx = await run({
      moment: door === "monthly" ? "subscribe" : "unlock",
      amountUsd: amount, recipient, unlockKeys: unlockKeysForDoor(unlockKeys, door),
      resource: resource ? { ...resource, viewMode: door } : undefined,
      recipientName: creatorName,
    });
    if (tx) onUnlocked(door);
  }

  function close(v: boolean) {
    if (!v) { setStep("gate"); reset(); }
    onOpenChange(v);
  }

  const insufficient = error === "insufficient_balance";

  return (
    <>
      <Sheet open={open} onOpenChange={close} title="Choose how to watch">
        {phase === "preparing" || phase === "confirming" ? (
          <PaymentProgress phase={phase} amountUsd={amount} label={door === "monthly" ? "subscription" : "unlock"} />
        ) : phase === "success" ? (
          <div className="pb-2">
            <SuccessBurst
              title={door === "monthly" ? "Subscribed" : "Unlocked"}
              subtitle={door === "monthly" ? `You're in for every ${creatorName} drop` : "Access is ready"}
              tone="green"
            />
            <Button size="lg" className="w-full" onClick={() => close(false)}>Watch now</Button>
          </div>
        ) : step === "gate" ? (
          <>
            <div className="font-display text-[19px] font-semibold">Choose how to watch</div>
            <div className="mt-1 text-[11.5px] text-faint">{contextLabel}</div>

            <button
              onClick={() => setDoor("one-time")}
              className={cn(
                "mt-4 flex w-full items-center justify-between rounded-2xl border p-3.5 text-left transition",
                door === "one-time" ? "border-[1.5px] border-blue bg-blue/[0.1]" : "border-white/12",
              )}
            >
              <div>
                <div className="text-[13.5px] font-semibold text-ink-soft">Unlock this once</div>
                <div className="mt-0.5 text-[11px] text-faint">
                  {resource?.kind === "video" ? "This replay, yours forever" : "This stream + the replay, yours forever"}
                </div>
              </div>
              <div className="font-display text-[20px] font-bold">${oneTimeAmount}</div>
            </button>

            <button
              onClick={() => setDoor("monthly")}
              className={cn(
                "relative mt-2.5 flex w-full items-center justify-between rounded-2xl border p-3.5 text-left transition",
                door === "monthly"
                  ? "border-[1.5px] border-blue bg-blue/[0.1] shadow-[0_8px_28px_rgba(64,172,255,.18)]"
                  : "border-white/12",
              )}
            >
              <span className="absolute -top-2.5 left-3.5 rounded-full bg-blue px-2.5 py-[3px] text-[8.5px] font-bold tracking-[0.08em] text-white">
                BEST VALUE
              </span>
              <div>
                <div className="text-[13.5px] font-bold text-white">Subscribe</div>
                <div className="mt-0.5 text-[11px] text-blue-soft">Every stream, the replays, the chat</div>
              </div>
              <div className="font-display text-[20px] font-bold">
                ${monthlyAmount}
                <span className="text-[11px] font-medium text-blue-soft">/mo</span>
              </div>
            </button>

            <Button size="lg" className="mt-3.5 w-full" onClick={() => setStep("checkout")}>Continue</Button>
            <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-ghost">
              <Lock className="size-3" /> Secure · cancel anytime
            </div>
          </>
        ) : (
          <>
            <div className="font-display text-[19px] font-semibold">
              {door === "monthly" ? `Subscribe to ${creatorName}` : `Unlock this ${contentNoun}`}
            </div>
            <div className="mt-4 flex items-center justify-between border-y border-white/[0.07] py-3.5">
              <span className="text-[12.5px] text-muted">Total</span>
              <span className="font-display text-[22px] font-bold">
                ${amount.toFixed(2)}{door === "monthly" && <span className="text-[12px] font-medium text-faint">/mo</span>}
              </span>
            </div>

            {insufficient ? (
              <>
                <div className="mt-3.5 flex items-center gap-2.5 rounded-[14px] border border-white/10 bg-white/[0.04] p-3.5">
                  <div className="flex size-9 items-center justify-center rounded-[11px] bg-blue/[0.14] text-blue-light">
                    <Wallet className="size-[18px]" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[12.5px] font-semibold text-ink-soft">Your balance is ${user?.balanceUsd.toFixed(2)}</div>
                    <div className="mt-0.5 text-[11px] text-faint">Add a little to keep watching</div>
                  </div>
                </div>
                <Button size="lg" className="mt-3.5 w-full" onClick={() => setFundOpen(true)}>Add money & unlock</Button>
                <div className="mt-2.5 text-center text-[10px] text-ghost">You'll review before anything is charged</div>
              </>
            ) : (
              <>
                <Button size="lg" className="mt-4 w-full" onClick={pay}>
                  {door === "monthly" ? "Confirm subscription" : "Unlock"} · ${amount}
                </Button>
                {error && (
                  <div className="mt-2 rounded-[11px] border border-red-400/20 bg-red-400/[0.08] px-3 py-2 text-center text-[10.5px] text-red-100">
                    {error}
                  </div>
                )}
                <div className="mt-2.5 text-center text-[10px] text-ghost">
                  Balance ${user?.balanceUsd.toFixed(2)} · same secure checkout as tips
                </div>
              </>
            )}
          </>
        )}
      </Sheet>

      <FundSheet open={fundOpen} onOpenChange={setFundOpen} needFor={amount} actionLabel={door === "monthly" ? "subscribe" : "unlock"} onFunded={() => { reset(); pay(); }} />
    </>
  );
}

function unlockKeysForDoor(keys: UnlockKeys, door: Door): string[] {
  return Array.isArray(keys) ? keys : keys[door] ?? [];
}
