/** Instant VOD shell (player + meta) while the video loads. */
export default function Loading() {
  return (
    <div className="mx-auto min-h-screen max-w-[900px] bg-canvas px-4 pb-16 pt-4">
      <div className="mb-4 size-9 animate-pulse rounded-full bg-white/[0.06]" />
      <div className="aspect-video w-full animate-pulse rounded-[18px] bg-white/[0.06]" />
      <div className="mt-4 h-6 w-2/3 animate-pulse rounded bg-white/10" />
      <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-white/[0.06]" />
      <div className="mt-4 flex items-center gap-3 border-t border-white/[0.06] pt-4">
        <div className="size-11 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" />
      </div>
    </div>
  );
}
