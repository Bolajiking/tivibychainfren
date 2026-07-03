import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/client";
import { verifyUsdcTransfer } from "@/lib/payments/verify";
import { MOCK_MODE } from "@/lib/config";
import { normalizeAddress, isEvmAddress, matchesAny } from "@/lib/access";
import { requirePrivyUser, PrivyAuthError } from "@/lib/auth/server";
import { asRecord, isViewMode } from "@/lib/input-normalizers";
import type { MoneyMoment, NotificationType, ViewMode } from "@/lib/types";

interface SettlePaymentBody {
  moment?: unknown;
  txHash?: unknown;
  payer?: unknown;
  recipient?: unknown;
  amountUsd?: unknown;
  resource?: unknown;
  product?: unknown;
  message?: unknown;
  sender?: unknown;
}

interface SettleResourceBody {
  kind?: unknown;
  playbackId?: unknown;
  viewMode?: unknown;
}

interface SettleProductBody {
  id?: unknown;
  name?: unknown;
  imageColor?: unknown;
}

/**
 * The single trust gate for every money moment. The client sends USDC (Privy
 * signs), then POSTs the txHash here. We verify the transfer on-chain, then —
 * and only then — write the DB state that grants access / records the order.
 *
 * Body: { moment, txHash, payer, recipient, amountUsd,
 *         resource?: { kind:'stream'|'video', playbackId, viewMode },
 *         product?: { id, name, imageColor },
 *         message?, sender? }
 */
export async function POST(req: Request) {
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "server_unconfigured" }, { status: 503 });

  let body: SettlePaymentBody;
  try { body = settlePaymentBody(await req.json()); } catch { return bad("invalid_json"); }

  const moment = body.moment;
  const txHash = String(body.txHash ?? "");
  const payer = normalizeAddress(String(body.payer ?? ""));
  const recipient = normalizeAddress(String(body.recipient ?? ""));
  const amountUsd = Number(body.amountUsd ?? 0);
  const resource = settleResourceBody(body.resource);
  const product = settleProductBody(body.product);

  if (!moment) return bad("missing_moment");
  if (!isMoneyMoment(moment)) return bad("unknown_moment");

  // `fund` is an on-ramp top-up: no recipient/access write, nothing to verify.
  if (moment === "fund") return NextResponse.json({ ok: true });

  if (!isEvmAddress(payer)) return bad("bad_payer");
  if (!isEvmAddress(recipient)) return bad("bad_recipient");
  if (!Number.isFinite(amountUsd) || !(amountUsd > 0)) return bad("bad_amount");
  if (moment === "unlock" && !isSettleResource(resource)) return bad("bad_resource");
  if (moment === "tip" && hasResourcePayload(body.resource) && !isSettleResource(resource)) return bad("bad_resource");
  if (moment === "buy" && !isSettleProduct(product)) return bad("bad_product");
  if (moment === "buy" && isSettleProduct(product)) {
    const availability = await productAvailability(db, product.id, payer, amountUsd);
    if (!availability.ok) return NextResponse.json({ ok: false, error: availability.error }, { status: availability.status });
  }

  // Trust gate is only meaningful with a real backend (route is unreachable in
  // pure mock mode — settlePayment short-circuits client-side). When a backend
  // is wired we ALWAYS require auth + on-chain proof.
  if (!MOCK_MODE) {
    // 1. Authenticate the caller and bind the claimed payer to a wallet they
    //    actually control. Without this, anyone could claim access for any wallet.
    let user;
    try {
      user = await requirePrivyUser(req);
    } catch (e) {
      const status = e instanceof PrivyAuthError ? e.status : 401;
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status });
    }
    if (!matchesAny(user.walletAddresses, payer)) return bad("payer_not_owned", 403);

    // 2. Verify the transfer on-chain, binding sender → payer so a payment made
    //    by another wallet can't be claimed here.
    const ok = await verifyUsdcTransfer({
      txHash, expectedSender: payer, expectedRecipient: recipient, expectedAmountUsd: amountUsd,
    });
    if (!ok) return NextResponse.json({ ok: false, error: "tx_unverified" }, { status: 402 });

    // 3. Claim the tx_hash before any write. A replay of the same transaction
    //    hits the primary-key violation and is rejected — no double access/order.
    const claim = await db.from("settled_payments").insert({
      tx_hash: txHash, moment, payer, recipient, amount: amountUsd,
      resource_id: resourceId(resource, product),
    });
    if (claim.error) {
      if (claim.error.code === "23505") {
        return NextResponse.json({ ok: false, error: "tx_already_settled" }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: "claim_failed" }, { status: 500 });
    }
  }

  try {
    switch (moment) {
      case "unlock": {
        if (!isSettleResource(resource)) return bad("bad_resource");
        const viewMode: ViewMode = isViewMode(resource.viewMode) ? resource.viewMode : "one-time";
        assertDbResult(
          await db.rpc("append_paid_user", {
            p_kind: resource.kind === "video" ? "video" : "stream",
            p_id: resource.playbackId,
            p_wallet: payer,
          }),
          "append_paid_user_failed",
        );
        assertDbResult(
          await db.from("subscriptions").insert({
            creator_id: recipient, subscriber_address: payer, view_mode: viewMode,
            amount: amountUsd, tx_hash: txHash,
            expires_at: viewMode === "monthly" ? thirtyDays() : null,
          }),
          "subscription_write_failed",
        );
        await notify(db, recipient, "payment", "Content unlocked", `${short(payer)} unlocked your content`, payer, txHash, amountUsd);
        break;
      }
      case "subscribe": {
        const viewMode: ViewMode = isViewMode(resource.viewMode) ? resource.viewMode : "monthly";
        const existing = await db
          .from("subscriptions")
          .select("id")
          .eq("creator_id", recipient)
          .eq("subscriber_address", payer)
          .eq("view_mode", "monthly")
          .limit(1)
          .maybeSingle();
        assertDbResult(
          await db.from("subscriptions").insert({
            creator_id: recipient, subscriber_address: payer, view_mode: viewMode,
            amount: amountUsd, tx_hash: txHash,
            expires_at: viewMode === "monthly" ? thirtyDays() : null,
          }),
          "subscription_write_failed",
        );
        if (!existing.data && viewMode === "monthly") {
          assertDbResult(
            await db.rpc("increment_subscriber_count", { p_creator_id: recipient }),
            "subscriber_count_update_failed",
          );
        }
        await notify(db, recipient, "subscription", "New subscriber", `${short(payer)} subscribed`, payer, txHash, amountUsd);
        break;
      }
      case "tip": {
        await notify(db, recipient, "donation", "New tip", `${short(payer)} tipped $${amountUsd}`, payer, txHash, amountUsd);
        if (isSettleResource(resource)) {
          assertDbResult(
            await db.from("chats").insert({
              stream_id: resource.playbackId,
              sender: String(body.sender ?? short(payer)),
              wallet_address: payer,
              message: String(body.message ?? `tipped $${amountUsd}`),
              kind: "donation", amount: amountUsd, name_color: "#9fd3ff",
            }),
            "chat_write_failed",
          );
        }
        break;
      }
      case "buy": {
        const p = isSettleProduct(product) ? product : null;
        if (!p) return bad("bad_product");
        assertDbResult(
          await db.from("orders").insert({
            product_id: p.id, buyer_address: payer, seller_address: recipient,
            amount: amountUsd, tx_hash: txHash, status: "completed",
            product_snapshot: { name: optionalString(p.name) ?? "", price: amountUsd, imageColor: optionalString(p.imageColor) ?? "#2b2b2b" },
          }),
          "order_write_failed",
        );
        assertDbResult(
          await db.rpc("decrement_inventory", { p_product_id: p.id }),
          "inventory_update_failed",
        );
        await notify(db, recipient, "order", "New order", `${short(payer)} bought ${optionalString(p.name) ?? "a product"}`, payer, txHash, amountUsd);
        break;
      }
      default:
        return bad("unknown_moment");
    }
  } catch (e) {
    console.error("[payments/settle] write failed:", e);
    // Writes failed after the tx was claimed. Release the claim so the real
    // payment can be retried (re-verify + re-claim are both idempotent-safe).
    if (!MOCK_MODE) {
      const rollback = await db.from("settled_payments").delete().eq("tx_hash", txHash);
      if (rollback.error) console.error("[payments/settle] claim rollback failed:", rollback.error);
    }
    return NextResponse.json({ ok: false, error: "write_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function bad(error: string, status = 400) { return NextResponse.json({ ok: false, error }, { status }); }
function thirtyDays() { return new Date(Date.now() + 30 * 864e5).toISOString(); }
function short(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }
function isMoneyMoment(value: unknown): value is MoneyMoment {
  return value === "unlock" || value === "subscribe" || value === "tip" || value === "buy" || value === "fund";
}
function assertDbResult(result: { error: unknown }, message: string) {
  if (result.error) throw new Error(message);
}

function settlePaymentBody(value: unknown): SettlePaymentBody {
  return asRecord(value);
}

function settleResourceBody(value: unknown): SettleResourceBody {
  return asRecord(value);
}

function settleProductBody(value: unknown): SettleProductBody {
  return asRecord(value);
}

function hasResourcePayload(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSettleResource(value: SettleResourceBody): value is { kind: "stream" | "video"; playbackId: string; viewMode?: unknown } {
  return (value.kind === "stream" || value.kind === "video") && isNonEmptyString(value.playbackId);
}

function isSettleProduct(value: SettleProductBody): value is SettleProductBody & { id: string } {
  return isNonEmptyString(value.id);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function resourceId(resource: SettleResourceBody, product: SettleProductBody): string | null {
  if (isNonEmptyString(resource.playbackId)) return resource.playbackId;
  if (isNonEmptyString(product.id)) return product.id;
  return null;
}

async function productAvailability(
  db: NonNullable<ReturnType<typeof supabaseAdmin>>,
  productId: string,
  payer: string,
  amountUsd: number,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const product = await db.from("products").select("creator_id,status,inventory,price,subs_only").eq("id", productId).maybeSingle();
  if (product.error || !product.data) return { ok: false, error: "bad_product", status: 400 };
  if (product.data.status !== "active" || Number(product.data.inventory ?? 0) <= 0) {
    return { ok: false, error: "product_unavailable", status: 409 };
  }
  if (amountUsd + 1e-9 < Number(product.data.price ?? 0)) {
    return { ok: false, error: "bad_amount", status: 400 };
  }
  if (product.data.subs_only) {
    const subs = await db.from("subscriptions")
      .select("expires_at")
      .eq("creator_id", product.data.creator_id)
      .eq("subscriber_address", payer)
      .eq("view_mode", "monthly")
      .limit(100);
    const hasActiveSubscription = (subs.data ?? []).some((sub) =>
      !sub.expires_at || new Date(String(sub.expires_at)).getTime() > Date.now(),
    );
    if (!hasActiveSubscription) {
      return { ok: false, error: "subscription_required", status: 403 };
    }
  }
  return { ok: true };
}

async function notify(
  db: NonNullable<ReturnType<typeof supabaseAdmin>>,
  creatorId: string, type: NotificationType, title: string, message: string,
  wallet: string, txHash: string, amount?: number,
) {
  assertDbResult(
    await db.from("notifications").insert({
      creator_id: creatorId, type, title, message,
      wallet_address: wallet, tx_hash: txHash, amount: amount ?? null,
    }),
    "notification_write_failed",
  );
}
