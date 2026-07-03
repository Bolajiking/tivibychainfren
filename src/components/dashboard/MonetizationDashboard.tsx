"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { HandCoins, Wallet, ShoppingBag, UserPlus, Loader2, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DashboardShell, DashboardEmpty, Panel, StatTile, useCreatorProfile, fallbackStream, PageSkeleton } from "@/components/dashboard/DashboardScaffold";
import { updateCreatorStream } from "@/lib/creator-client";
import { useSession } from "@/lib/store/session";
import type { CreatorNotification, Order } from "@/lib/types";

function shortenAddress(a?: string) {
  return a && a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a ?? "—";
}

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function MonetizationDashboard() {
  const user = useSession((s) => s.user);
  const { creator, payload, loading } = useCreatorProfile();
  const stream = payload?.stream ?? fallbackStream(creator);

  const totals = useMemo(() => {
    const notifications = payload?.notifications ?? [];
    const orders = payload?.orders ?? [];
    const tips = notifications.filter((n) => n.type === "donation").reduce((s, n) => s + (n.amount ?? 0), 0);
    const subs = notifications.filter((n) => n.type === "subscription").reduce((s, n) => s + (n.amount ?? 0), 0);
    const sales = orders.filter((o) => o.status === "completed").reduce((s, o) => s + o.amount, 0);
    return { tips, subs, sales, total: tips + subs + sales };
  }, [payload?.notifications, payload?.orders]);

  const [subPrice, setSubPrice] = useState("9");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (stream?.viewMode === "monthly" && stream.amount) setSubPrice(String(stream.amount));
  }, [stream?.playbackId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <DashboardShell title="Monetization" active="money" creator={creator}><PageSkeleton /></DashboardShell>;
  if (!user || !creator || !stream) {
    return (
      <DashboardShell title="Monetization" active="money" creator={creator}>
        <DashboardEmpty icon={<HandCoins className="size-5" />} title="Set up your channel first" body="Subscriptions, tips and sales all settle to your channel — set up your profile to start earning." />
      </DashboardShell>
    );
  }

  async function saveSubPrice() {
    if (!user || !stream) return;
    setSaving(true);
    try {
      await updateCreatorStream(
        { playbackId: stream.playbackId, viewMode: "monthly", amount: subPrice, currentStream: stream },
        user.walletAddress,
      );
      toast.success("Subscription price updated");
    } catch {
      toast.error("Couldn't update price");
    } finally {
      setSaving(false);
    }
  }

  const ledger = buildLedger(payload?.notifications ?? [], payload?.orders ?? []);

  return (
    <DashboardShell title="Monetization" active="money" creator={creator}>
      <div className="mb-5">
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em]">Monetization</h1>
        <p className="mt-1 text-[12.5px] text-muted">Your earnings, pricing and payouts — paid in USDC on Base.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Total earned" value={money(totals.total)} />
        <StatTile label="Subscriptions" value={money(totals.subs)} />
        <StatTile label="Tips" value={money(totals.tips)} />
        <StatTile label="Store sales" value={money(totals.sales)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
        <div className="flex flex-col gap-4">
          {/* subscription tier */}
          <Panel title="Subscription tier">
            <p className="text-[11.5px] text-muted">What members pay monthly to unlock your subscriber content.</p>
            <div className="mt-3 flex items-center gap-2 rounded-[12px] border border-white/12 bg-white/[0.05] px-3">
              <span className="text-muted">$</span>
              <input value={subPrice} onChange={(e) => setSubPrice(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className="h-[46px] flex-1 bg-transparent text-[15px] font-semibold text-white focus:outline-none" />
              <span className="text-[12px] text-faint">/mo</span>
            </div>
            <Button onClick={saveSubPrice} disabled={saving} className="mt-3 w-full">
              {saving ? <Loader2 className="size-[18px] animate-spin" /> : "Save price"}
            </Button>
          </Panel>

          {/* payout */}
          <Panel title="Payout destination">
            <div className="flex items-center gap-3 rounded-[12px] border border-white/10 bg-white/[0.03] px-3.5 py-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-blue/[0.16] text-blue-light"><Wallet className="size-[18px]" /></span>
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold">USDC · Base</div>
                <div className="truncate font-mono text-[11px] text-faint">{shortenAddress(creator.creatorId)}</div>
              </div>
            </div>
            <p className="mt-2.5 text-[10.5px] leading-relaxed text-faint">Earnings settle straight to your channel wallet — no payout schedule, no minimums. Withdraw anytime from your wallet.</p>
          </Panel>
        </div>

        {/* transactions */}
        <Panel title="Recent transactions">
          {ledger.length ? (
            <div className="flex flex-col">
              {ledger.map((row) => (
                <div key={row.id} className="flex items-center gap-3 border-b border-white/[0.05] py-2.5 last:border-0">
                  <span className={`flex size-7 items-center justify-center rounded-full ${row.tone}`}>{row.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium text-ink-soft">{row.label}</div>
                    <div className="mt-0.5 text-[10px] text-faint">{row.sub}</div>
                  </div>
                  <div className="font-display text-[13px] font-semibold text-online">+{money(row.amount)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 py-10 text-center">
              <ArrowUpRight className="size-6 text-ghost" />
              <div className="text-[12.5px] font-semibold text-ink-dim">No earnings yet</div>
              <div className="text-[10.5px] text-faint">Subscriptions, tips and orders will show up here.</div>
            </div>
          )}
        </Panel>
      </div>
    </DashboardShell>
  );
}

type LedgerRow = { id: string; label: string; sub: string; amount: number; icon: React.ReactNode; tone: string };

function buildLedger(notifications: CreatorNotification[], orders: Order[]): LedgerRow[] {
  const fromNotifs: LedgerRow[] = notifications
    .filter((n) => typeof n.amount === "number" && n.amount! > 0)
    .map((n) => ({
      id: n.id,
      label: n.title || labelForType(n.type),
      sub: new Date(n.createdAt).toLocaleDateString(),
      amount: n.amount ?? 0,
      icon: n.type === "donation" ? <HandCoins className="size-3.5" /> : n.type === "subscription" ? <UserPlus className="size-3.5" /> : <ShoppingBag className="size-3.5" />,
      tone: n.type === "donation" ? "bg-blue/[0.16] text-blue-light" : n.type === "subscription" ? "bg-online/[0.16] text-online" : "bg-lime/[0.16] text-lime",
    }));
  const fromOrders: LedgerRow[] = orders
    .filter((o) => o.status === "completed")
    .map((o) => ({
      id: o.id,
      label: o.productSnapshot.name,
      sub: new Date(o.createdAt).toLocaleDateString(),
      amount: o.amount,
      icon: <ShoppingBag className="size-3.5" />,
      tone: "bg-lime/[0.16] text-lime",
    }));
  return [...fromNotifs, ...fromOrders]
    .sort((a, b) => (a.sub < b.sub ? 1 : -1))
    .slice(0, 12);
}

function labelForType(t: string) {
  if (t === "donation") return "Tip received";
  if (t === "subscription") return "New subscriber";
  if (t === "order") return "Store sale";
  return "Payment";
}
