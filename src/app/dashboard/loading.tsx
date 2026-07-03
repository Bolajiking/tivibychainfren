import { DashboardSidebar, CreatorBottomNav } from "@/components/nav/Rails";

/** Instant dashboard shell while creator data loads. */
export default function Loading() {
  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="hidden md:flex">
        <DashboardSidebar active="overview" />
      </div>
      <main className="flex min-h-screen flex-1 flex-col">
        <div className="hidden h-14 shrink-0 items-center border-b border-white/[0.06] px-6 md:flex">
          <div className="h-4 w-24 animate-pulse rounded bg-white/[0.06]" />
        </div>
        <div className="flex-1 px-4 py-5 md:px-6">
          <div className="mb-5 h-7 w-56 animate-pulse rounded-lg bg-white/10" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/[0.06]" />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1fr]">
            <div className="h-48 animate-pulse rounded-2xl bg-white/[0.06]" />
            <div className="h-48 animate-pulse rounded-2xl bg-white/[0.06]" />
          </div>
        </div>
        <div className="md:hidden">
          <CreatorBottomNav />
        </div>
      </main>
    </div>
  );
}
