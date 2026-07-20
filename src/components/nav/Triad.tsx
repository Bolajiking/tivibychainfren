"use client";

import { ShoppingBag, Tv, MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";

export type Room = "shop" | "watch" | "chat";

export function Triad({
  active,
  onChange,
  chatSoon = true,
}: {
  active: Room;
  onChange: (r: Room) => void;
  chatSoon?: boolean;
}) {
  const items: { id: Room; label: string; icon: React.ReactNode }[] = [
    { id: "shop", label: "Shop", icon: <ShoppingBag className="size-[15px]" /> },
    { id: "watch", label: "Watch", icon: <Tv className="size-[15px]" /> },
    { id: "chat", label: "Chat", icon: <MessageSquare className="size-[15px]" /> },
  ];
  return (
    <div className="flex rounded-2xl border border-white/[0.08] bg-white/[0.05] p-1">
      {items.map((it) => {
        const isActive = active === it.id;
        const isChat = it.id === "chat";
        return (
          <button
            key={it.id}
            onClick={() => (isChat && chatSoon ? undefined : onChange(it.id))}
            className={cn(
              "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[12px] text-[12.5px] font-semibold transition",
              isActive ? "bg-white text-canvas" : "text-muted hover:text-white",
              isChat && chatSoon && "cursor-default",
            )}
          >
            {it.icon}
            {it.label}
            {isChat && chatSoon && (
              <span className="rounded-full bg-white/[0.07] px-[5px] py-0.5 text-[8px] font-bold text-ghost">SOON</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
