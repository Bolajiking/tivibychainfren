"use client";

import { useState, type FormEvent } from "react";
import { HandCoins, Send, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Tile } from "@/components/ui/Media";
import { PaymentProgress } from "./PaymentProgress";
import { usePaymentFlow } from "@/lib/usePaymentFlow";
import { useAuthIntent } from "@/lib/auth/useAuthIntent";
import { normalizeChatText } from "@/lib/realtime-state";
import { cn } from "@/lib/cn";

export function TipComposer({
  creatorName,
  recipient,
  presets,
  resource,
  onSent,
  onMessage,
  onNeedFunds,
}: {
  creatorName: string;
  recipient: string;
  presets: number[];
  /** live stream the tip is posted to (drives the chat donation message) */
  resource?: { kind: "stream" | "video"; playbackId: string };
  onSent: (amount: number, message: string) => void;
  onMessage?: (message: string) => Promise<boolean | void> | boolean | void;
  onNeedFunds: (amount: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(presets[1] ?? presets[0]);
  const [message, setMessage] = useState("");
  const [chatText, setChatText] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const { phase, run, reset, error } = usePaymentFlow();
  const { user, requireAuth, getAuthedUser } = useAuthIntent("viewer");
  const normalizedChatText = normalizeChatText(chatText);
  const insufficient = error === "insufficient_balance";

  async function send() {
    if (!requireAuth({ role: "viewer" })) return;
    const activeUser = getAuthedUser();
    if (activeUser && activeUser.balanceUsd < amount) {
      setOpen(false);
      reset();
      onNeedFunds(amount);
      return;
    }
    const sender = activeUser?.displayName ?? "You";
    const tx = await run({
      moment: "tip", amountUsd: amount, recipient, resource,
      message: message || undefined, sender, recipientName: creatorName,
    });
    if (tx) {
      onSent(amount, message);
      setOpen(false);
      setMessage("");
      reset();
    }
  }

  function fundAndClose() {
    setOpen(false);
    reset();
    onNeedFunds(amount);
  }

  function closeComposer() {
    setOpen(false);
    reset();
  }

  async function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onMessage || !normalizedChatText || sendingChat) return;
    if (!requireAuth({ role: "viewer" })) return;

    setSendingChat(true);
    try {
      const sent = await onMessage(normalizedChatText);
      if (sent !== false) setChatText("");
    } finally {
      setSendingChat(false);
    }
  }

  if (!open) {
    return (
      <form onSubmit={submitChat} className="flex items-center gap-2.5">
        {onMessage ? (
          <>
            <input
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Say something…"
              className="h-[42px] min-w-0 flex-1 rounded-full border border-white/12 bg-white/[0.06] px-4 text-xs text-white placeholder:text-faint focus:border-blue focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Send chat message"
              disabled={!normalizedChatText || sendingChat}
              className="flex size-[42px] shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.08] text-ink-dim transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </>
        ) : (
          <div className="flex h-[42px] flex-1 items-center rounded-full border border-white/12 bg-white/[0.06] px-4 text-xs text-faint">
            Say something…
          </div>
        )}
        <button
          type="button"
          aria-label={`Tip ${creatorName}`}
          onClick={() => { if (requireAuth({ role: "viewer" })) setOpen(true); }}
          className="relative flex size-[46px] shrink-0 items-center justify-center rounded-full bg-blue text-white glow-blue active:scale-95"
        >
          <HandCoins className="size-5" />
          <span className="absolute -inset-1 rounded-full border-2 border-blue/40 animate-[tvLive_1.8s_infinite]" />
        </button>
      </form>
    );
  }

  return (
    <div className="rounded-t-[22px] border-t border-white/10 bg-[#0c0c0f]/95 p-4 animate-[tvRise_.28s_cubic-bezier(.22,1,.36,1)]">
      {phase === "preparing" || phase === "confirming" ? (
        <PaymentProgress phase={phase} amountUsd={amount} label="tip" />
      ) : (
        <>
          <div className="mb-3.5 flex items-center gap-2.5">
            <Tile size={34} radius={11} />
            <div>
              <div className="text-[12.5px] font-semibold">Send {creatorName} a tip</div>
              <div className="mt-0.5 text-[10px] text-faint">100% goes to the creator</div>
            </div>
            <button onClick={closeComposer} className="ml-auto flex size-7 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-muted">
              <X className="size-3" />
            </button>
          </div>

          <div className="mb-3 grid grid-cols-4 gap-2">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => setAmount(p)}
                className={cn(
                  "rounded-[13px] py-3 text-center text-sm font-semibold transition",
                  amount === p
                    ? "border-[1.5px] border-blue bg-blue/[0.18] text-white shadow-[0_6px_18px_rgba(64,172,255,.28)]"
                    : "border border-white/12 bg-white/[0.06] text-ink-dim",
                )}
              >
                ${p}
              </button>
            ))}
          </div>

          <div className="flex gap-2.5">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message…"
              className="h-[46px] flex-1 rounded-full border border-white/12 bg-white/[0.06] px-4 text-xs text-white placeholder:text-faint focus:border-blue focus:outline-none"
            />
            {insufficient ? (
              <Button size="pill" onClick={fundAndClose} className="whitespace-nowrap">
                Add money
              </Button>
            ) : (
              <Button size="pill" onClick={send} className="whitespace-nowrap">
                Send ${amount}
              </Button>
            )}
          </div>
          {error && !insufficient && (
            <div className="mt-2 rounded-[11px] border border-red-400/20 bg-red-400/[0.08] px-3 py-2 text-[10.5px] text-red-100">
              {error}
            </div>
          )}
          <div className="mt-2.5 text-center text-[9.5px] text-ghost">
            Balance ${user?.balanceUsd.toFixed(2)} · Apple Pay · Card
          </div>
        </>
      )}
    </div>
  );
}
