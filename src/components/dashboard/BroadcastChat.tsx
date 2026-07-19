"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, X } from "lucide-react";
import { useSession } from "@/lib/store/session";
import { fetchRecentChat, sendChatMessage, subscribeToChatMessages } from "@/lib/realtime";
import { moderateDeleteMessage } from "@/lib/chat-client";
import { createLocalChatMessage, mergeChatMessage, removeChatMessage } from "@/lib/realtime-state";
import { MOCK_MODE } from "@/lib/config";
import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/lib/types";

const SEED: { sender: string; color: string; message: string; role?: ChatMessage["role"] }[] = [
  { sender: "tobi", color: "#5acdff", message: "this set is unreal" },
  { sender: "zee", color: "#c8eb6d", message: "where's the hoodie from" },
  { sender: "dami", color: "#c8eb6d", message: "keep it kind in here", role: "mod" },
];

/**
 * The creator control-room chat: live messages with one-tap moderation. Deletes
 * go through the owner-scoped route and propagate to every viewer via the
 * realtime DELETE event. The host can also post (role: host).
 */
export function BroadcastChat({ streamId, hostName, live }: { streamId: string; hostName: string; live: boolean }) {
  const { user } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Seed mock-mode demo chat; load recent real chat for moderation context.
  useEffect(() => {
    if (MOCK_MODE) {
      setMessages(
        SEED.map((s, i) => ({
          id: `seed-${i}`,
          streamId,
          sender: s.sender,
          walletAddress: `0x${i}`,
          message: s.message,
          kind: "message",
          role: s.role ?? "viewer",
          nameColor: s.color,
          timestamp: new Date().toISOString(),
        })),
      );
      return;
    }
    let alive = true;
    fetchRecentChat(streamId).then((recent) => alive && setMessages(recent));
    return () => {
      alive = false;
    };
  }, [streamId]);

  // Live realtime: new messages and viewer/mod deletes both reflect here.
  useEffect(() => {
    if (MOCK_MODE) return;
    return subscribeToChatMessages(streamId, (event) => {
      setMessages((current) =>
        event.type === "delete" ? removeChatMessage(current, event.id) : mergeChatMessage(current, event.message),
      );
    });
  }, [streamId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function remove(message: ChatMessage) {
    if (!user) return;
    setRemovingId(message.id);
    // Optimistic — realtime DELETE will confirm for other clients.
    setMessages((current) => removeChatMessage(current, message.id));
    try {
      if (!MOCK_MODE) await moderateDeleteMessage(message.id, user.walletAddress);
    } catch {
      // Re-add on failure so the creator knows it didn't stick.
      setMessages((current) => mergeChatMessage(current, message));
      toast.error("Couldn't remove message");
    } finally {
      setRemovingId(null);
    }
  }

  async function send() {
    if (!user || !draft.trim()) return;
    const local = createLocalChatMessage({
      streamId,
      sender: user.displayName || hostName,
      walletAddress: user.walletAddress,
      message: draft,
    });
    if (!local) return;
    const hostMessage: ChatMessage = { ...local, role: "host", nameColor: "#40acff" };

    setSending(true);
    setDraft("");
    try {
      if (MOCK_MODE) {
        setMessages((current) => mergeChatMessage(current, hostMessage));
      } else {
        const inserted = await sendChatMessage({
          streamId,
          sender: user.displayName || hostName,
          walletAddress: user.walletAddress,
          message: draft,
          role: "host",
        });
        setMessages((current) => mergeChatMessage(current, inserted ?? hostMessage));
      }
    } catch {
      toast.error("Message failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
        {messages.length ? (
          messages.map((m) => (
            <ModRow key={m.id} m={m} busy={removingId === m.id} onRemove={() => remove(m)} />
          ))
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-faint">
            <span className="text-sm font-semibold text-ink-dim">{live ? "No messages yet" : "Chat opens when you go live"}</span>
            <span className="text-[11.5px]">Tips, orders and fan messages appear here</span>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Message as host…"
            className="h-10 flex-1 rounded-[12px] border border-white/12 bg-white/[0.06] px-3 text-sm text-white placeholder:text-faint focus:border-blue focus:outline-none"
          />
          <button onClick={send} disabled={sending || !draft.trim()} aria-label="Send" className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-blue text-white disabled:opacity-45">
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModRow({ m, busy, onRemove }: { m: ChatMessage; busy: boolean; onRemove: () => void }) {
  if (m.kind === "donation") {
    return (
      <div className="group flex items-center gap-2 rounded-xl border border-blue-light/40 bg-gradient-to-r from-blue/20 to-[#40ffcc]/[0.08] px-2.5 py-2">
        <span className="flex-1 text-[11.5px] font-bold text-blue-soft">{m.sender} tipped ${m.amount}{m.message ? ` · ${m.message}` : ""}</span>
        <RemoveBtn busy={busy} onRemove={onRemove} />
      </div>
    );
  }
  return (
    <div className="group flex items-center gap-1.5">
      <span className="shrink-0 text-[11.5px] font-semibold" style={{ color: m.nameColor }}>{m.sender}</span>
      {m.role === "host" && <Badge color="#40acff">HOST</Badge>}
      {m.role === "mod" && <Badge color="#c8eb6d">MOD</Badge>}
      <span className="flex-1 text-[12px] text-[#d6d6db]">{m.message}</span>
      <RemoveBtn busy={busy} onRemove={onRemove} />
    </div>
  );
}

function RemoveBtn({ busy, onRemove }: { busy: boolean; onRemove: () => void }) {
  return (
    <button
      onClick={onRemove}
      disabled={busy}
      aria-label="Remove message"
      className={cn("shrink-0 text-ghost opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100", busy && "opacity-100")}
    >
      {busy ? <Loader2 className="size-[13px] animate-spin" /> : <X className="size-[13px]" />}
    </button>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return <span className="rounded px-1.5 py-px text-[8px] font-bold text-canvas" style={{ background: color }}>{children}</span>;
}
