"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { PaymentProgress, SuccessBurst } from "./PaymentProgress";
import { PaymentMethodPicker } from "./PaymentMethodPicker";
import { PaymentFailure } from "./PaymentFailure";
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
    if (!requireAuth({ role: "viewer", reason: "unlock", subject: creatorName })) return;
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
            <div className="font-display text-[20px] font-semibold tracking-[-0.01em]">Choose how to watch</div>
            <div className="mt-1 text-[12px] text-muted">
              goes directly to {creatorName} · <span className="receipt">0%</span> platform cut
            </div>
            <div className="mt-0.5 text-[11.5px] text-faint">{contextLabel}</div>

            <button
              onClick={() => setDoor("one-time")}
              aria-pressed={door === "one-time"}
              className={cn(
                "mt-4 flex w-full items-center justify-between rounded-[18px] border p-3.5 text-left transition-colors",
                door === "one-time" ? "border-2 border-beam bg-beam/[0.08]" : "border border-white/12 hover:border-white/25",
              )}
            >
              <div>
                <div className="text-[13.5px] font-semibold text-ink-soft">Unlock this once</div>
                <div className="mt-0.5 text-[11.5px] text-muted">
                  {resource?.kind === "video" ? "This replay, yours forever" : "This stream + the replay, yours forever"}
                </div>
              </div>
              <div className="receipt text-[19px] text-ink-soft">${oneTimeAmount.toFixed(2)}</div>
            </button>

            <button
              onClick={() => setDoor("monthly")}
              aria-pressed={door === "monthly"}
              className={cn(
                "mt-2.5 flex w-full items-center justify-between rounded-[18px] border p-3.5 text-left transition-colors",
                door === "monthly" ? "border-2 border-beam bg-beam/[0.08]" : "border border-white/12 hover:border-white/25",
              )}
            >
              <div>
                <div className="text-[13.5px] font-semibold text-ink-soft">Subscribe</div>
                <div className="mt-0.5 text-[11.5px] text-muted">Every stream, the replays, the chat</div>
              </div>
              <div className="receipt text-[19px] text-ink-soft">
                ${monthlyAmount.toFixed(2)}
                <span className="text-[11px] text-faint">/mo</span>
              </div>
            </button>

            <Button size="lg" className="mt-3.5 w-full" onClick={() => setStep("checkout")}>Continue</Button>
            <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-faint">
              <Lock className="size-3" /> Cancel anytime
            </div>
          </>
        ) : (
          <>
            <div className="font-display text-[20px] font-semibold tracking-[-0.01em]">
              {door === "monthly" ? `Subscribe to ${creatorName}` : `Unlock this ${contentNoun}`}
            </div>
            <div className="mt-1 text-[12px] text-muted">
              goes directly to {creatorName} · <span className="receipt">0%</span> platform cut
            </div>
            <div className="mt-3.5 flex items-center justify-between border-y border-white/[0.07] py-3.5">
              <span className="text-[12.5px] text-muted">Total</span>
              <span className="receipt text-[21px] text-ink-soft">
                ${amount.toFixed(2)}{door === "monthly" && <span className="text-[12px] text-faint">/mo</span>}
              </span>
            </div>

            <PaymentMethodPicker className="mt-3.5" balance={user?.balanceUsd ?? 0} />

            {insufficient ? (
              <>
                <Button size="lg" className="mt-3.5 w-full" onClick={() => setFundOpen(true)}>
                  Add money & unlock
                </Button>
                <div className="mt-2.5 text-center text-[11px] text-faint">
                  You&apos;ll review before anything is charged
                </div>
              </>
            ) : (
              <>
                <Button size="lg" className="mt-3.5 w-full" onClick={pay}>
                  {door === "monthly" ? "Confirm subscription" : "Unlock"} ·&nbsp;
                  <span className="receipt">${amount.toFixed(2)}</span>
                </Button>
                {error && <PaymentFailure className="mt-3" onRetry={pay} />}
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
