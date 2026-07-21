"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Tile } from "@/components/ui/Media";
import { PaymentProgress } from "./PaymentProgress";
import { PaymentMethodPicker } from "./PaymentMethodPicker";
import { PaymentReceipt } from "./PaymentReceipt";
import { PaymentFailure } from "./PaymentFailure";
import { FundSheet } from "./FundSheet";
import { usePaymentFlow } from "@/lib/usePaymentFlow";
import { useAuthIntent } from "@/lib/auth/useAuthIntent";
import { useSession } from "@/lib/store/session";
import { canFeatureProduct } from "@/lib/product-availability";
import { approxLocal } from "@/lib/fx";
import type { Product } from "@/lib/types";

/**
 * F2 sibling — same trust anatomy as the tip sheet: 0%-cut line, receipt
 * numerals, method picker, visible progress, no-dead-end failure. A fan should
 * not be able to tell which money surface they're on by how it treats them.
 */
export function PurchaseSheet({
  product,
  open,
  onOpenChange,
  creatorName,
  onFollow,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  creatorName?: string;
  /** Post-purchase capture (F3). Omitted when the fan already follows. */
  onFollow?: () => void;
}) {
  const { phase, run, reset, error } = usePaymentFlow();
  const { user, requireAuth } = useAuthIntent("viewer");
  const subscribed = useSession((s) => (product ? s.isSubscribed(product.creatorId) : false));
  const [fundOpen, setFundOpen] = useState(false);
  const [receipt, setReceipt] = useState<{ ref: string } | null>(null);

  const insufficient = error === "insufficient_balance";
  const soldOut = product ? !canFeatureProduct(product) : true;
  const subsOnly = product ? Boolean(product.subsOnly && !subscribed) : false;
  const unavailable = soldOut || subsOnly;
  const seller = creatorName ?? "the creator";

  if (!product) return null;

  async function buy() {
    if (!requireAuth({ role: "viewer" })) return;
    if (unavailable) return;
    const tx = await run({
      moment: "buy",
      amountUsd: product!.price,
      recipient: product!.creatorId,
      product: { id: product!.id, name: product!.name, imageColor: product!.imageColor },
    });
    if (tx) {
      setReceipt({ ref: referenceFrom(tx) });
      reset();
    }
  }

  function close(next: boolean) {
    if (!next) {
      reset();
      setReceipt(null);
    }
    onOpenChange(next);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={close} title={`Buy ${product.name}`}>
        {phase === "preparing" || phase === "confirming" ? (
          <PaymentProgress phase={phase} amountUsd={product.price} label="order" />
        ) : receipt ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-[26px] place-items-center rounded-full border border-earn/40 bg-earn/[0.15]">
                <Check className="size-3.5 text-earn" />
              </span>
              <span className="text-[15px] font-semibold text-ink-soft">Order placed</span>
            </div>
            <PaymentReceipt
              lines={[
                { label: "item", value: product.name },
                { label: "paid", value: `$${product.price.toFixed(2)}` },
                { label: "to", value: `${seller} · 100%` },
                { label: "platform", value: "$0.00 · 0%" },
                { label: "ref", value: receipt.ref },
              ]}
            />
            {onFollow && (
              <div className="flex items-center gap-3 rounded-[14px] border border-white/[0.08] bg-canvas p-3.5">
                <div className="flex-1 text-[13px] text-ink-dim">Never miss a drop</div>
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
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="font-display text-[20px] font-semibold tracking-[-0.01em]">Checkout</div>
            <div className="mt-1 text-[12px] text-muted">
              goes directly to {seller} · <span className="receipt">0%</span> platform cut
            </div>

            <div className="mt-3.5 flex items-center gap-3.5">
              <Tile seed={product.imageColor} src={product.imageUrl} size={60} radius={13} />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium text-ink-soft">{product.name}</div>
                <div className="receipt mt-1 text-[19px] text-ink-soft">${product.price.toFixed(2)}</div>
                <div className="receipt mt-0.5 text-[11px] text-faint">{approxLocal(product.price)}</div>
              </div>
            </div>

            {unavailable ? (
              <>
                <div className="mt-4 rounded-[14px] border border-white/10 bg-white/[0.04] p-3.5 text-[12px] leading-relaxed text-muted">
                  {soldOut
                    ? "This one's sold out. Follow the channel and you'll hear when it's restocked."
                    : "This drop is for subscribers. Subscribe to the channel to buy it."}
                </div>
                <Button size="lg" className="mt-3.5 w-full" disabled>
                  {soldOut ? "Sold out" : "Subscribers only"}
                </Button>
              </>
            ) : (
              <>
                <PaymentMethodPicker className="mt-3.5" balance={user?.balanceUsd ?? 0} />
                {insufficient ? (
                  <Button size="lg" className="mt-3.5 w-full" onClick={() => setFundOpen(true)}>
                    Add money & buy
                  </Button>
                ) : (
                  <Button size="lg" className="mt-3.5 w-full" onClick={buy}>
                    Buy now ·&nbsp;<span className="receipt">${product.price.toFixed(2)}</span>
                  </Button>
                )}
                {error && !insufficient && <PaymentFailure className="mt-3" onRetry={buy} />}
              </>
            )}
          </>
        )}
      </Sheet>
      <FundSheet
        open={fundOpen}
        onOpenChange={setFundOpen}
        needFor={product.price}
        actionLabel="buy"
        onFunded={() => {
          reset();
          void buy();
        }}
      />
    </>
  );
}

function referenceFrom(tx: string): string {
  const tail = tx.replace(/[^0-9a-zA-Z]/g, "").slice(-5).toUpperCase();
  return `#TB-${tail || "00000"}`;
}
