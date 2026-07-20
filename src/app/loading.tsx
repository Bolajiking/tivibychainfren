// Root loading skeleton — identity paints first (F9: skeletons on surface-2,
// never spinners), so navigation to any server-rendered page feels instant.
export default function RootLoading() {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <span className="size-7 animate-pulse rounded-[8px] bg-white/[0.07]" />
          <span className="h-4 w-20 animate-pulse rounded-full bg-white/[0.07]" />
        </div>
        <span className="h-9 w-36 animate-pulse rounded-full bg-white/[0.06]" />
      </div>
      <div className="mx-auto max-w-[1180px] px-5 pt-14 text-center">
        <div className="mx-auto h-6 w-64 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="mx-auto mt-6 h-12 w-3/4 max-w-[560px] animate-pulse rounded-[14px] bg-white/[0.07]" />
        <div className="mx-auto mt-3 h-12 w-2/3 max-w-[480px] animate-pulse rounded-[14px] bg-white/[0.07]" />
        <div className="mx-auto mt-8 h-4 w-1/2 max-w-[420px] animate-pulse rounded-full bg-white/[0.05]" />
        <div className="mx-auto mt-2 h-4 w-2/5 max-w-[360px] animate-pulse rounded-full bg-white/[0.05]" />
        <div className="mx-auto mt-8 h-[52px] w-48 animate-pulse rounded-full bg-white/[0.08]" />
      </div>
    </div>
  );
}
