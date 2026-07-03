import { Sidebar } from "@/components/nav/Rails";

/** Instant channel shell (stage + rooms) while the channel loads. */
export default function Loading() {
  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1180px] px-4 pb-24 pt-4 md:px-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="h-4 w-28 animate-pulse rounded-full bg-white/[0.06]" />
          </div>
          <div className="aspect-video w-full animate-pulse rounded-[18px] bg-white/[0.06] md:aspect-auto md:h-[460px]" />
          <div className="mt-5 h-10 w-full animate-pulse rounded-full bg-white/[0.05]" />
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="aspect-video animate-pulse rounded-[13px] bg-white/[0.06]" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
