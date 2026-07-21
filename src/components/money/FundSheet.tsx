"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard, ChevronRight, Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/lib/store/session";
import { fundWallet } from "@/lib/payments/wallet-actions";
import { paymentCapabilities } from "@/lib/payments/capabilities";
import { cn } from "@/lib/cn";
import { toast } from "sonner";

export function FundSheet({
  open,
  onOpenChange,
  needFor,
  actionLabel = "unlock",
  onFunded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** requested spend amount, used in helper copy */
  needFor?: number;
  actionLabel?: string;
  onFunded?: (amount: number) => void;
}) {
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);
  const user = useSession((s) => s.user);
  const caps = paymentCapabilities();
  const minimum = needFor ? roundMoney(needFor) : 0;
  const presets = useMemo(() => fundPresets(minimum), [minimum]);
  const canFund = caps.onramp !== "none";

  useEffect(() => {
    if (open && minimum > 0 && amount < minimum) setAmount(minimum);
  }, [amount, minimum, open]);

  async function add() {
    if (busy || !canFund || amount < minimum) return;
    setBusy(true);
    const res = await fundWallet(amount);
    setBusy(false);
    if (res.ok) {
      toast.success(`$${formatMoney(res.amountUsd)} added to your balance`);
      onOpenChange(false);
      onFunded?.(res.amountUsd);
    } else if (res.cancelled) {
      toast("Funding cancelled");
    } else {
      toast.error(res.error ?? "Couldn't add money");
    }
  }

  const remaining = needFor ? amount - needFor : amount;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add money">
      <div className="font-display text-[19px] font-semibold">Add money</div>
      <div className="mt-1 text-[11.5px] text-faint">
        Top up your balance, then we {needFor ? `${actionLabel} instantly` : "keep you going"}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => setAmount(p)}
            aria-pressed={amount === p}
            className={cn(
              "receipt rounded-[14px] py-[15px] text-center text-[15px] transition-colors",
              amount === p
                ? "border-2 border-beam bg-beam/[0.08] text-ink-soft"
                : "border border-white/12 text-ink-dim hover:border-white/25",
            )}
          >
            ${p}
          </button>
        ))}
      </div>

      <div className="mt-3.5 flex items-center gap-2.5 rounded-[14px] border border-white/12 p-3.5">
        <div className="grid size-9 place-items-center rounded-[10px] border border-white/12 text-beam-soft">
          <CreditCard className="size-4" />
        </div>
        <div className="flex-1">
          <div className="text-[12.5px] font-semibold text-ink-soft">
            {caps.onramp === "provider" ? "Apple Pay" : caps.mock ? "Demo top-up" : "Funding unavailable"}
          </div>
          <div className="mt-0.5 text-[10.5px] text-faint">
            {caps.onramp === "provider" ? "or card · local methods" : caps.mock ? "simulated balance for previews" : "not available yet"}
          </div>
        </div>
        <ChevronRight className="size-4 text-faint" />
      </div>

      <Button size="lg" className="mt-3.5 w-full" onClick={add} disabled={busy || !canFund || amount <= 0 || amount < minimum}>
        {busy ? <Loader2 className="size-[18px] animate-spin" /> : <>Add ${formatMoney(amount)}{needFor ? ` & ${actionLabel}` : ""}</>}
      </Button>
      <div className="mt-2.5 text-center text-[10px] text-ghost">
        {needFor
          ? `$${formatMoney(amount)} added · $${formatMoney(needFor)} to ${actionLabel} · $${formatMoney(Math.max(remaining, 0))} stays in your balance`
          : "You'll review before anything is charged"}
        {user && ` · balance $${user.balanceUsd.toFixed(2)}`}
      </div>
    </Sheet>
  );
}

function fundPresets(minimum: number): number[] {
  if (minimum <= 0) return [5, 10, 25];
  const values = [minimum, ...[5, 10, 25].filter((p) => p > minimum), minimum + 10, minimum + 25];
  return [...new Set(values.map(roundMoney))].slice(0, 3);
}

function roundMoney(value: number): number {
  return Math.ceil(value * 100) / 100;
}

function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: value % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
}
