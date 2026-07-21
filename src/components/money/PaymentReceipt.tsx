import { cn } from "@/lib/cn";

/**
 * The receipt block — pure receipt layer. This is the ownership thesis rendered
 * as UI: the fan can read, in monospace, that 100% reached the creator and the
 * platform took nothing. Numbers do the arguing.
 */
export function PaymentReceipt({
  lines,
  className,
}: {
  lines: { label: string; value: string }[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "receipt rounded-[14px] border border-white/[0.08] bg-canvas p-3.5 text-[12px] leading-[1.8] text-muted",
        className,
      )}
    >
      {lines.map((line) => (
        <div key={line.label} className="flex gap-3">
          <dt className="w-[68px] shrink-0 text-faint">{line.label}</dt>
          <dd className="min-w-0 flex-1 break-words text-ink-dim">{line.value}</dd>
        </div>
      ))}
    </dl>
  );
}
