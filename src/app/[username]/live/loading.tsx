/** Instant full-bleed stage while the live room loads (mobile + desktop). */
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas md:flex-row">
      <div className="relative flex-1 animate-pulse" style={{ background: "linear-gradient(150deg,#1d1f24,#0a0a0c 78%)" }} />
      <aside className="hidden w-[340px] shrink-0 flex-col gap-3 border-l border-white/[0.06] bg-surface p-4 md:flex">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-4 w-full animate-pulse rounded bg-white/[0.06]" />
        ))}
      </aside>
    </div>
  );
}
