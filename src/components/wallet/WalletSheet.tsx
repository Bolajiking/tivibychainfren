"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { isAddress } from "viem";
import {
  ChevronLeft, X, Copy, Check, RefreshCw, Loader2, ArrowDownLeft, ArrowUpRight,
  HandCoins, Lock, UserPlus, ShoppingBag, Wallet,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useSession, type WalletTx } from "@/lib/store/session";
import { PersonaSwitch } from "@/components/nav/PersonaSwitch";
import { fundWallet, withdrawToAddress, cashOut } from "@/lib/payments/wallet-actions";
import { refreshBalance } from "@/lib/payments/refresh";
import { paymentCapabilities } from "@/lib/payments/capabilities";

const PRESETS = [10, 20, 50];
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export function WalletSheet() {
  const user = useSession((s) => s.user);
  const wallet = useSession((s) => s.wallet);
  const transactions = useSession((s) => s.transactions);
  const closeWallet = useSession((s) => s.closeWallet);
  const setWalletView = useSession((s) => s.setWalletView);

  const [addAmount, setAddAmount] = useState(20);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const [destination, setDestination] = useState("");

  const open = wallet !== "idle";

  // Close the sheet after in-sheet navigation, such as switching personas.
  const pathname = usePathname();
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== lastPath.current) {
      lastPath.current = pathname;
      closeWallet();
    }
  }, [pathname, closeWallet]);

  // Pull the live on-chain balance whenever the wallet opens (no-op in mock).
  useEffect(() => {
    if (open && user) void refreshBalance();
  }, [open, user]);

  // Keep the balance fresh when the user returns to the tab (e.g. after an
  // onramp/offramp handoff completes in another window).
  useEffect(() => {
    if (!user) return;
    const onFocus = () => void refreshBalance();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [user]);

  const caps = paymentCapabilities();

  const balance = user?.balanceUsd ?? 0;
  const withdrawAmount = Number(cashAmount || balance);
  const canAddMoney = caps.onramp !== "none";
  const canWithdraw =
    balance > 0 &&
    Number.isFinite(withdrawAmount) &&
    withdrawAmount > 0 &&
    withdrawAmount <= balance + 1e-9 &&
    (caps.offramp === "fiat" || isAddress(destination.trim()));
  const [whole, cents] = balance.toFixed(2).split(".");

  const { inflow, outflow } = useMemo(() => {
    const since = Date.now() - THIRTY_DAYS;
    let i = 0;
    let o = 0;
    for (const t of transactions) {
      if (new Date(t.createdAt).getTime() < since) continue;
      if (t.amountUsd > 0) i += t.amountUsd;
      else o += Math.abs(t.amountUsd);
    }
    return { inflow: i, outflow: o };
  }, [transactions]);

  async function onRefresh() {
    setRefreshing(true);
    await refreshBalance();
    setTimeout(() => setRefreshing(false), 500);
  }

  async function copyAddress() {
    if (!user) return;
    try {
      await navigator.clipboard.writeText(user.walletAddress);
      setCopied(true);
      toast.success("Address copied");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy");
    }
  }

  async function onAdd() {
    if (busy) return;
    setBusy(true);
    const res = await fundWallet(addAmount);
    setBusy(false);
    if (res.ok) {
      toast.success(`Added $${formatAmt(res.amountUsd)}`);
      setWalletView("home");
    } else if (res.cancelled) {
      toast("Funding cancelled");
    } else {
      toast.error(res.error ?? "Couldn't add money");
    }
  }

  async function onWithdraw() {
    if (busy) return;
    const amt = withdrawAmount;
    setBusy(true);
    // Fiat offramp when a provider is plugged in (bank), else self-custody withdraw.
    const res = caps.offramp === "fiat" ? await cashOut(amt) : await withdrawToAddress(amt, destination.trim());
    setBusy(false);
    if (res.ok) {
      toast.success(caps.offramp === "fiat" ? `Cashed out $${formatAmt(amt)}` : `Withdrew $${formatAmt(amt)}`);
      setCashAmount("");
      setDestination("");
      setWalletView("home");
    } else if (!res.cancelled) {
      toast.error(res.error ?? "Couldn't cash out");
    }
  }

  const title = wallet === "add" ? "Add money" : wallet === "cashout" ? "Cash out" : "Wallet";

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && closeWallet()}>
      <Dialog.Portal>
        {/* Semi-transparent dim — the page stays visible behind the wallet. */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=open]:animate-[tvFadeIn_.22s_ease] data-[state=closed]:animate-[tvFadeOut_.2s_ease]" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[480px] rounded-t-[24px] border border-white/12 bg-elevated p-4 pb-[max(20px,env(safe-area-inset-bottom))] text-white shadow-[0_24px_60px_rgba(0,0,0,.6)] will-change-transform focus:outline-none data-[state=open]:animate-[tvSheet_.34s_cubic-bezier(.22,1,.36,1)] data-[state=closed]:animate-[tvSheetOut_.24s_cubic-bezier(.4,0,1,1)] md:inset-y-0 md:left-auto md:right-0 md:bottom-0 md:mx-0 md:flex md:h-full md:w-[404px] md:max-w-none md:flex-col md:rounded-none md:border-y-0 md:border-r-0 md:border-l md:border-white/12 md:bg-[#0c0c0f]/70 md:p-6 md:backdrop-blur-[30px] md:backdrop-saturate-150 md:data-[state=open]:animate-[tvSlideInRight_.32s_cubic-bezier(.22,1,.36,1)] md:data-[state=closed]:animate-[tvSlideOutRight_.26s_cubic-bezier(.4,0,1,1)]">
          <Dialog.Title asChild><VisuallyHidden>{title}</VisuallyHidden></Dialog.Title>

          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/25 md:hidden" />
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {wallet !== "home" && (
                <button onClick={() => setWalletView("home")} aria-label="Back" className="flex size-7 items-center justify-center rounded-full bg-white/[0.06] text-muted hover:text-white">
                  <ChevronLeft className="size-4" />
                </button>
              )}
              <span className="font-display text-[18px] font-semibold">{title === "Wallet" ? "Balance" : title}</span>
            </div>
            <button onClick={closeWallet} aria-label="Close" className="flex size-[30px] items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-muted hover:text-white">
              <X className="size-[14px]" />
            </button>
          </div>

          {!user ? (
            <div className="py-8 text-center text-[13px] text-muted">Sign in to open your balance.</div>
          ) : wallet === "add" ? (
            <div>
              <p className="text-[12.5px] text-muted">Top up with Apple Pay, card or a transfer. Funds land as USDC on Base.</p>
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setAddAmount(p)}
                    className={`h-[54px] rounded-[14px] text-[15px] font-bold transition ${addAmount === p ? "border-2 border-blue bg-blue/[0.14] text-white" : "border border-white/12 bg-white/[0.04] text-ink-dim hover:text-white"}`}
                  >
                    ${p}
                  </button>
                ))}
              </div>
              <label className="mt-2.5 flex items-center gap-2 rounded-[14px] border border-white/12 bg-white/[0.04] px-4">
                <span className="text-muted">$</span>
                <input
                  inputMode="decimal"
                  value={String(addAmount)}
                  onChange={(e) => setAddAmount(Math.max(0, Number(e.target.value.replace(/[^\d.]/g, "")) || 0))}
                  className="h-[46px] flex-1 bg-transparent text-[15px] font-semibold text-white focus:outline-none"
                  aria-label="Custom amount"
                />
                <span className="text-[11px] text-faint">USD</span>
              </label>
              <button onClick={onAdd} disabled={busy || addAmount <= 0 || !canAddMoney} className="mt-3.5 flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-white text-[14px] font-bold text-[#080808] transition hover:bg-white/90 disabled:opacity-50">
                {busy ? <Loader2 className="size-[18px] animate-spin" /> : `Add $${addAmount}`}
              </button>
              <div className="mt-2.5 text-center text-[11px] text-faint">
                {caps.onramp === "provider" ? "Apple Pay, card or transfer · no fees to add" : caps.mock ? "Demo mode · top-up is simulated" : "Funding isn't available yet"}
              </div>
            </div>
          ) : wallet === "cashout" ? (
            <div>
              <p className="text-[12.5px] text-muted">
                {caps.offramp === "fiat" ? "Move money to your bank — usually instant, up to 30 min." : "Send USDC to any wallet. Usually confirms in seconds on Base."}
              </p>
              <label className="mt-4 block">
                <span className="text-[10px] uppercase tracking-[0.08em] text-faint">Amount · max ${formatAmt(balance)}</span>
                <div className="mt-1 flex items-center gap-2 rounded-[14px] border border-white/12 bg-white/[0.04] px-4">
                  <span className="text-muted">$</span>
                  <input
                    inputMode="decimal"
                    value={cashAmount}
                    placeholder={formatAmt(balance)}
                    onChange={(e) => setCashAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    className="h-[50px] flex-1 bg-transparent font-display text-[22px] font-bold text-white placeholder:text-[#55555c] focus:outline-none"
                  />
                  <button onClick={() => setCashAmount(balance.toFixed(2))} className="text-[11px] font-semibold text-blue-light">MAX</button>
                </div>
              </label>
              {caps.offramp === "fiat" ? (
                <div className="mt-3 flex items-center justify-between rounded-[14px] border border-white/10 bg-white/[0.04] px-4 py-3 text-[12.5px]">
                  <span className="text-ink-dim">Linked bank account</span>
                  <span className="text-faint">Change</span>
                </div>
              ) : (
                <label className="mt-3 block">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-faint">Destination wallet</span>
                  <input
                    value={destination}
                    placeholder="0x…"
                    onChange={(e) => setDestination(e.target.value)}
                    className="mt-1 h-[46px] w-full rounded-[14px] border border-white/12 bg-white/[0.04] px-4 font-mono text-[12.5px] text-white placeholder:text-faint focus:border-blue/60 focus:outline-none"
                  />
                </label>
              )}
              <button onClick={onWithdraw} disabled={busy || !canWithdraw} className="mt-3.5 flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-white text-[14px] font-bold text-[#080808] transition hover:bg-white/90 disabled:opacity-50">
                {busy ? <Loader2 className="size-[18px] animate-spin" /> : caps.offramp === "fiat" ? "Cash out" : "Withdraw"}
              </button>
              <div className="mt-2 text-center text-[11px] text-faint">
                {caps.offramp === "fiat" ? "No fee on standard transfers" : destination.trim() ? "Double-check the address — on-chain sends can't be reversed" : "Enter the destination wallet to continue"}
              </div>
            </div>
          ) : (
            <div>
              <div className="receipt text-[52px] leading-none text-ink-soft">
                ${whole}
                <span className="text-[28px] text-[#55555c]">.{cents}</span>
                <button onClick={onRefresh} aria-label="Refresh balance" className="ml-3 inline-flex size-7 -translate-y-2 items-center justify-center rounded-full bg-white/[0.06] text-muted align-middle hover:text-white">
                  <RefreshCw className={`size-[14px] ${refreshing ? "animate-spin" : ""}`} />
                </button>
              </div>

              {/* Provisioned wallet address — the user's USDC-on-Base account. */}
              <button onClick={copyAddress} className="mt-3 flex w-full items-center gap-3 rounded-[13px] border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-left transition hover:border-white/[0.16]">
                <span className="flex size-8 items-center justify-center rounded-full bg-blue/[0.16] text-blue-light"><Wallet className="size-[16px]" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold text-ink-dim">USDC · Base</span>
                  <span className="block truncate font-mono text-[11px] text-faint">{user.walletAddress}</span>
                </span>
                {copied ? <Check className="size-4 shrink-0 text-online" /> : <Copy className="size-4 shrink-0 text-faint" />}
              </button>

              <div className="mt-4 flex gap-7 border-b border-white/[0.07] pb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.06em] text-faint">In · 30d</div>
                  <div className="receipt mt-1 text-[17px] text-earn">+${formatAmt(inflow)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.06em] text-faint">Out · 30d</div>
                  <div className="receipt mt-1 text-[17px] text-[#cfcfd4]">−${formatAmt(outflow)}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <button onClick={() => setWalletView("add")} className="flex h-[46px] items-center justify-center rounded-[13px] bg-white text-[13px] font-bold text-[#080808] transition hover:bg-white/90">Add money</button>
                <button onClick={() => setWalletView("cashout")} className="flex h-[46px] items-center justify-center rounded-[13px] border border-white/[0.16] text-[13px] font-semibold text-white transition hover:bg-white/[0.05]">Cash out</button>
              </div>

              <div className="mt-6 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">Recent</div>
              <div className="mt-3 flex max-h-[200px] flex-col gap-3.5 overflow-y-auto md:max-h-[280px]">
                {transactions.length ? (
                  transactions.map((t) => <LedgerRow key={t.id} tx={t} />)
                ) : (
                  <div className="rounded-[12px] border border-dashed border-white/10 py-7 text-center">
                    <div className="text-[12.5px] font-semibold text-ink-dim">No activity yet</div>
                    <div className="mt-0.5 text-[11px] text-faint">Tips, unlocks, purchases and top-ups show up here.</div>
                  </div>
                )}
              </div>

              <div className="mt-5 border-t border-white/[0.06] pt-4">
                <PersonaSwitch variant="full" />
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LedgerRow({ tx }: { tx: WalletTx }) {
  const inbound = tx.amountUsd > 0;
  return (
    <div className="flex items-center gap-3">
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${toneFor(tx.kind)}`}>{iconFor(tx.kind)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-ink-soft">{tx.label}</div>
        <div className="mt-0.5 truncate text-[10.5px] text-faint">{relativeTime(tx.createdAt)} · {tx.sub}</div>
      </div>
      <div className={`receipt text-[14px] ${inbound ? "text-earn" : "text-[#cfcfd4]"}`}>
        {inbound ? "+" : "−"}${formatAmt(Math.abs(tx.amountUsd))}
      </div>
    </div>
  );
}

function iconFor(kind: WalletTx["kind"]) {
  const cls = "size-[15px]";
  switch (kind) {
    case "fund": return <ArrowDownLeft className={cls} />;
    case "cashout": return <ArrowUpRight className={cls} />;
    case "tip": return <HandCoins className={cls} />;
    case "unlock": return <Lock className={cls} />;
    case "subscribe": return <UserPlus className={cls} />;
    case "buy": return <ShoppingBag className={cls} />;
  }
}

function toneFor(kind: WalletTx["kind"]) {
  if (kind === "fund") return "bg-online/[0.16] text-online";
  if (kind === "subscribe") return "bg-online/[0.16] text-online";
  if (kind === "tip") return "bg-blue/[0.16] text-blue-light";
  return "bg-white/[0.07] text-muted";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatAmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
