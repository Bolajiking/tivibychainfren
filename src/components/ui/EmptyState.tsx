import { cn } from "@/lib/cn";

/**
 * The empty-state pattern (Package 3): glyph at ink-5 · what this is · one
 * Georgia-italic outcome line · the action that fills it. No mascots, no
 * illustration — empty states teach.
 *
 * Only one outcome line per screen, so pass `outcome` on the primary empty
 * state of a page and leave it off secondary ones.
 */
export function EmptyState({
  icon,
  title,
  outcome,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  outcome?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed border-white/[0.1] px-6 py-12 text-center",
        className,
      )}
    >
      {icon && <span className="text-ghost">{icon}</span>}
      <div className="text-[15px] font-medium text-ink-soft">{title}</div>
      {outcome && <div className="outcome text-[14px] text-muted">{outcome}</div>}
      {action}
    </div>
  );
}
