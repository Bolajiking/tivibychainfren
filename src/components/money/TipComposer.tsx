"use client";

import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { TipGlyph } from "@/components/brand/Glyphs";
import { useAuthIntent } from "@/lib/auth/useAuthIntent";
import { normalizeChatText } from "@/lib/realtime-state";

/**
 * The live chat line: say something, or tip.
 *
 * Tipping opens the real TipSheet rather than an inline mini-composer. There is
 * exactly one pay surface in the product and it is the trust ceremony (F2) —
 * a second, lighter payment UI would quietly undercut the 0%-cut promise it
 * makes. This component only routes intent.
 */
export function TipComposer({
  creatorName,
  onMessage,
  onTip,
  showTip = true,
}: {
  creatorName: string;
  onMessage?: (message: string) => Promise<boolean | void> | boolean | void;
  /** Opens the TipSheet — the single money surface. */
  onTip: () => void;
  /** The owner watching their own stream can chat but not tip themselves. */
  showTip?: boolean;
}) {
  const [chatText, setChatText] = useState("");
  const [sending, setSending] = useState(false);
  const { requireAuth } = useAuthIntent("viewer");
  const normalized = normalizeChatText(chatText);

  async function submitChat(event: FormEvent) {
    event.preventDefault();
    if (!normalized || sending || !onMessage) return;
    if (!requireAuth({ role: "viewer" })) return;
    setSending(true);
    try {
      const ok = await onMessage(normalized);
      if (ok !== false) setChatText("");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submitChat} className="flex items-center gap-2.5">
      {onMessage ? (
        <>
          <input
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            placeholder="Say something…"
            aria-label="Chat message"
            className="h-[42px] min-w-0 flex-1 rounded-full border border-white/12 bg-white/[0.06] px-4 text-xs text-white placeholder:text-faint focus:border-beam focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Send chat message"
            disabled={!normalized || sending}
            className="grid size-11 shrink-0 place-items-center rounded-full border border-white/12 bg-white/[0.08] text-ink-dim transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </>
      ) : (
        <div className="flex h-[42px] flex-1 items-center rounded-full border border-white/12 bg-white/[0.06] px-4 text-xs text-faint">
          Say something…
        </div>
      )}
      {showTip && (
        <button
          type="button"
          aria-label={`Tip ${creatorName}`}
          onClick={onTip}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-transform active:scale-[0.97]"
        >
          <TipGlyph size={20} />
        </button>
      )}
    </form>
  );
}
