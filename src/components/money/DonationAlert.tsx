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
      <div className="cta-gradient animate-[tvPop_.5s_cubic-bezier(.22,1,.36,1)_both] rounded-[20px] p-4 shadow-[0_16px_50px_rgba(0,145,255,.5)]">
        <div className="flex items-center gap-3">
          <div className="flex size-[46px] items-center justify-center rounded-full bg-white/25 text-white animate-[tvBob_1.6s_ease-in-out_infinite]">
            <HandCoins className="size-[22px]" />
          </div>
          <div className="flex-1">
            <div className="font-display text-[21px] font-bold text-white">You sent ${amount}!</div>
            <div className="mt-0.5 text-xs text-white/90">{creatorName} can see it on stream now</div>
          </div>
        </div>
        {message && (
          <div className="mt-3 rounded-xl bg-white/20 px-3 py-2.5 text-[12.5px] text-white">“{message}”</div>
        )}
      </div>
    </div>
  );
}
