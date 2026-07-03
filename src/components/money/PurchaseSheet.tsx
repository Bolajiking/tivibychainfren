"use client";

import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { PaymentProgress, SuccessBurst } from "./PaymentProgress";
import { FundSheet } from "./FundSheet";
import { usePaymentFlow } from "@/lib/usePaymentFlow";
import { useAuthIntent } from "@/lib/auth/useAuthIntent";
import { useSession } from "@/lib/store/session";
import { useState } from "react";
import { canFeatureProduct } from "@/lib/product-availability";
import type { Product } from "@/lib/types";
import { Tile } from "@/components/ui/Media";

export function PurchaseSheet({
  product,
  open,
  onOpenChange,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { phase, run, reset, error } = usePaymentFlow();
  const { user, requireAuth } = useAuthIntent("viewer");
  const subscribed = useSession((s) => (product ? s.isSubscribed(product.creatorId) : false));
  const [fundOpen, setFundOpen] = useState(false);
  const insufficient = error === "insufficient_balance";
  const productUnavailable = product ? !canFeatureProduct(product) : true;
  const unavailable = productUnavailable || (product ? Boolean(product.subsOnly && !subscribed) : true);

  if (!product) return null;

  async function buy() {
    if (!requireAuth({ role: "viewer" })) return;
    if (unavailable) return;
    await run({
      moment: "buy", amountUsd: product!.price, recipient: product!.creatorId,
      product: { id: product!.id, name: product!.name, imageColor: product!.imageColor },
    });
  }

  function close(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={close} title={`Buy ${product.name}`}>
        {phase === "preparing" || phase === "confirming" ? (
          <PaymentProgress phase={phase} amountUsd={product.price} label="order" />
        ) : phase === "success" ? (
          <div className="pb-2">
            <SuccessBurst title="Order placed" subtitle="It's in your order history" tone="green" />
            <Button size="lg" className="w-full" onClick={() => close(false)}>Done</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3.5">
              <Tile seed={product.imageColor} src={product.imageUrl} size={60} radius={13} />
              <div className="flex-1">
                <div className="text-[14px] font-semibold">{product.name}</div>
                <div className="mt-1 font-display text-[20px] font-bold">${product.price}</div>
              </div>
            </div>

            {unavailable ? (
              <>
                <div className="mt-4 rounded-[14px] border border-white/10 bg-white/[0.04] p-3.5 text-[12px] text-muted">
                  {productUnavailable ? "This item is sold out." : "Subscribe to this channel to buy subscriber-only drops."}
                </div>
                <Button size="lg" className="mt-3.5 w-full" disabled>{productUnavailable ? "Unavailable" : "Subscribers only"}</Button>
              </>
            ) : insufficient ? (
              <>
                <div className="mt-4 rounded-[14px] border border-white/10 bg-white/[0.04] p-3.5 text-[12px] text-muted">
                  Your balance is ${user?.balanceUsd.toFixed(2)} — add a little to check out.
                </div>
                <Button size="lg" className="mt-3.5 w-full" onClick={() => setFundOpen(true)}>Add money & buy</Button>
              </>
            ) : (
              <>
                <Button size="lg" className="mt-4 w-full" onClick={buy}>Buy now · ${product.price}</Button>
                {error && (
                  <div className="mt-2 rounded-[11px] border border-red-400/20 bg-red-400/[0.08] px-3 py-2 text-center text-[10.5px] text-red-100">
                    {error}
                  </div>
                )}
                <div className="mt-2.5 text-center text-[10px] text-ghost">
                  Same secure checkout as tips · balance ${user?.balanceUsd.toFixed(2)}
                </div>
              </>
            )}
          </>
        )}
      </Sheet>
      <FundSheet open={fundOpen} onOpenChange={setFundOpen} needFor={product.price} actionLabel="buy" onFunded={() => { reset(); buy(); }} />
    </>
  );
}
