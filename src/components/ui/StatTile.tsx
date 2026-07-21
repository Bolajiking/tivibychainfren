import { cn } from "@/lib/cn";

/**
 * The receipt tile (Package 3) — numbers do the arguing.
 * Every value is receipt layer; earn-green appears only on money *received*.
 * Deltas and context stay ink.
 */
export function StatTile({
  label,
  value,
  sub,
  tone = "ink",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** "earn" is reserved for money received — never for growth or engagement. */
  tone?: "ink" | "earn";
  className?: string;
}) {
  return (
    <div className={cn("rounded-[14px] border border-white/[0.06] bg-surface-2 p-[18px]", className)}>
      <div className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-faint">{label}</div>
      <div className="receipt text-[26px] leading-none text-ink-soft">{value}</div>
      {sub != null && (
        <div className={cn("receipt mt-1.5 text-[12px]", tone === "earn" ? "text-earn" : "text-muted")}>{sub}</div>
      )}
    </div>
  );
}
