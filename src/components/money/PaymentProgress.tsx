"use client";

import { Check, HandCoins } from "lucide-react";

export function PaymentProgress({ phase, amountUsd, label }: { phase: "preparing" | "confirming"; amountUsd: number; label: string }) {
  if (phase === "preparing") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <div className="size-12 rounded-full border-[3px] border-white/12 border-t-beam animate-[tvSpin_1s_linear_infinite]" />
        <div className="text-[13px] font-semibold text-ink-soft">Preparing your {label}…</div>
        <div className="text-[11px] text-faint">Just a moment</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
      <div className="flex size-[54px] items-center justify-center rounded-full border-[1.5px] border-beam bg-beam/[0.16] text-beam-soft animate-[tvBob_1.6s_ease-in-out_infinite]">
        <HandCoins className="size-6" />
      </div>
      <div className="receipt text-[13px] text-ink-soft">
        Confirming your ${amountUsd} · balance not yet charged
      </div>
      <div className="h-[3px] w-40 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full w-3/5 rounded-full bg-beam animate-[tvGlow_1.4s_ease-in-out_infinite]" />
      </div>
      <div className="text-[11px] text-faint">Usually under 5 seconds. Don&apos;t close this sheet.</div>
    </div>
  );
}

export function Confetti() {
  const bits = [
    { c: "#c8eb6d", l: "22%", t: "12%", d: "0s", s: 7 },
    { c: "#40acff", r: "26%", t: "18%", d: ".2s", s: 6 },
    { c: "#fff", l: "30%", t: "22%", d: ".4s", s: 5, round: true },
    { c: "#5acdff", r: "34%", t: "14%", d: ".1s", s: 6 },
    { c: "#40ffcc", l: "44%", t: "20%", d: ".3s", s: 5 },
  ];
  return (
    <>
      {bits.map((b, i) => (
        <span
          key={i}
          className="confetti animate-[tvConf_1.5s_ease-out_infinite]"
          style={{
            background: b.c,
            left: b.l,
            right: b.r,
            top: b.t,
            width: b.s,
            height: b.s,
            borderRadius: b.round ? "50%" : 1,
            animationDelay: b.d,
          }}
        />
      ))}
    </>
  );
}

export function SuccessBurst({ title, subtitle, tone = "blue" }: { title: string; subtitle?: string; tone?: "blue" | "green" }) {
  const ring = tone === "green" ? "bg-earn shadow-[0_14px_40px_rgba(34,197,94,.35)]" : "bg-beam shadow-[0_14px_40px_rgba(64,172,255,.35)]";
  return (
    <div className="flex flex-col items-center justify-center gap-3.5 py-8 text-center animate-[tvPop_.5s_cubic-bezier(.22,1,.36,1)_both]">
      <div className={`flex size-16 items-center justify-center rounded-full text-white ${ring}`}>
        <Check className="size-8" />
      </div>
      <div className="font-display text-[20px] font-semibold">{title}</div>
      {subtitle && <div className="text-[11.5px] text-muted">{subtitle}</div>}
    </div>
  );
}
