import { Sidebar, ViewerTabBar } from "@/components/nav/Rails";

/** Instant explore shell while live streams + creators load. */
export default function Loading() {
  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="hidden md:flex">
        <Sidebar active="explore" />
      </div>
      <main className="flex min-h-screen flex-1 flex-col">
        <div className="flex-1 px-4 py-5 md:px-6">
          <div className="mb-5 h-7 w-32 animate-pulse rounded-lg bg-white/10" />
          <div className="mb-3 h-3 w-24 animate-pulse rounded-full bg-white/[0.08]" />
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="aspect-[16/10] animate-pulse rounded-[13px] bg-white/[0.06]" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-white/[0.06]" />
              </div>
            ))}
          </div>
        </div>
        <div className="md:hidden">
          <ViewerTabBar />
        </div>
      </main>
    </div>
  );
}
