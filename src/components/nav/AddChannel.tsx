"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/lib/store/session";
import { resolveChannel } from "@/lib/channel-search";

/**
 * Add a channel to your profile by its link or handle (tvin.bio/<name>, @name,
 * or a bare username). Resolves the channel and adds it to your "Your channels"
 * rail. Not channel creation — that's one-per-account via onboarding.
 */
export function AddChannel({ variant = "rail" }: { variant?: "rail" | "row" }) {
  const router = useRouter();
  const subscribe = useSession((s) => s.subscribe);
  const isSubscribed = useSession((s) => s.isSubscribed);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!value.trim()) return;
    setBusy(true);
    try {
      const creator = await resolveChannel(value);
      if (!creator) {
        toast.error("No channel found at that link");
        return;
      }
      if (isSubscribed(creator.creatorId)) {
        toast(`${creator.displayName} is already on your list`);
      } else {
        subscribe(creator.creatorId, {
          creatorId: creator.creatorId,
          username: creator.username,
          displayName: creator.displayName,
          avatarColor: creator.avatarColor,
          avatarUrl: creator.avatarUrl,
        });
        toast.success(`Added ${creator.displayName}`);
      }
      setOpen(false);
      setValue("");
      router.push(`/${creator.username}`);
    } catch {
      toast.error("Couldn't add that channel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {variant === "rail" ? (
        <button
          onClick={() => setOpen(true)}
          aria-label="Add a channel"
          className="flex size-11 items-center justify-center rounded-full border border-dashed border-white/[0.18] text-faint hover:text-white"
        >
          <Plus className="size-5" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2.5 text-[11.5px] font-semibold text-muted hover:text-white"
        >
          <span className="flex size-[30px] items-center justify-center rounded-full border border-dashed border-white/20"><Plus className="size-4" /></span>
          Add a channel
        </button>
      )}

      <Sheet open={open} onOpenChange={setOpen} title="Add a channel">
        <div className="font-display text-[19px] font-semibold">Add a channel</div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">Paste a channel link or handle to add it to your channels.</p>
        <div className="mt-4 flex items-center gap-2 rounded-[13px] border border-white/12 bg-white/[0.06] px-3.5">
          <span className="text-[13px] text-faint">tvin.bio/</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="username or link"
            autoFocus
            className="h-[46px] flex-1 bg-transparent text-[13.5px] font-medium text-white placeholder:text-faint focus:outline-none"
          />
        </div>
        <Button size="lg" className="mt-4 w-full" onClick={add} disabled={busy || !value.trim()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add channel
        </Button>
      </Sheet>
    </>
  );
}
