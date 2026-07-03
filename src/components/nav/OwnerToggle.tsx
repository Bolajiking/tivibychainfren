"use client";

import { cn } from "@/lib/cn";

export function OwnerToggle({ mode, onChange }: { mode: "public" | "manage"; onChange: (m: "public" | "manage") => void }) {
  return (
    <div className="flex rounded-full border border-white/10 bg-white/[0.06] p-[3px]">
      {(["public", "manage"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={cn(
            "rounded-full px-3 py-1.5 text-[10.5px] font-semibold transition",
            mode === m ? "bg-blue text-white" : "text-muted",
          )}
        >
          {m === "public" ? "View as public" : "Manage"}
        </button>
      ))}
    </div>
  );
}
