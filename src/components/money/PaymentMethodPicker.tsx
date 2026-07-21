"use client";

import { UsdcGlyph } from "@/components/brand/Glyphs";
import { cn } from "@/lib/cn";

/**
 * The method picker is designed now and ships with one method live.
 *
 * Mobile money is the researched highest-ROI addition for the core market
 * (68% of Africans pay by mobile money; only 32% of OTT platforms accept it),
 * so the slot exists in the design from day one — the second row is honest
 * about not being ready rather than absent.
 */
export function PaymentMethodPicker({
  balance,
  className,
}: {
  balance: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-3 rounded-[14px] border-2 border-beam bg-beam/[0.06] px-3.5 py-3">
        <UsdcGlyph size={18} className="text-ink-soft" />
        <span className="flex-1 text-[13px] font-medium text-ink-soft">Pay with balance</span>
        <span className="receipt text-[12px] text-muted">${balance.toFixed(2)}</span>
      </div>
      <div className="flex items-center gap-3 rounded-[14px] border border-white/10 px-3.5 py-3 opacity-55">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted" aria-hidden>
          <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
          <path d="M10.5 18.5h3" />
        </svg>
        <span className="flex-1 text-[13px] font-medium text-muted">Mobile money</span>
        <span className="text-[10px] font-semibold tracking-[0.12em] text-faint">SOON</span>
      </div>
    </div>
  );
}
