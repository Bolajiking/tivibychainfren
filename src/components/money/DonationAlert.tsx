"use client";

import { useEffect } from "react";
import { HandCoins } from "lucide-react";
import { Confetti } from "./PaymentProgress";

export function DonationAlert({
  amount,
  message,
  creatorName,
  onDone,
}: {
  amount: number;
  message?: string;
  creatorName: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 4200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="pointer-events-none absolute inset-x-4 top-[18%] z-30">
      <Confetti />
      <div className="animate-[tvPop_.5s_cubic-bezier(.22,1,.36,1)_both] rounded-[14px] border border-earn/30 bg-raised p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-[42px] items-center justify-center rounded-full bg-earn/[0.15] text-earn animate-[tvBob_1.6s_ease-in-out_infinite]">
            <HandCoins className="size-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm text-ink-soft">
              <span className="font-semibold">you</span> tipped {creatorName}
            </div>
            <div className="mt-0.5 text-xs text-muted">seen on stream now</div>
          </div>
          <span className="receipt text-lg text-earn">${amount}</span>
        </div>
        {message && (
          <div className="mt-3 rounded-xl bg-white/[0.06] px-3 py-2.5 text-[12.5px] text-ink-dim">“{message}”</div>
        )}
      </div>
    </div>
  );
}
