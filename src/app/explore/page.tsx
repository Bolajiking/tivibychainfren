import { getLiveStreams, listCreators } from "@/lib/data";
import { Sidebar, ViewerTabBar } from "@/components/nav/Rails";
import { LiveCard, CreatorCard } from "@/components/cards/Cards";
import { Logo } from "@/components/brand/Logo";
import { WalletButton } from "@/components/wallet/WalletButton";
import { filterExploreResults, normalizeExploreQuery } from "@/lib/explore";
import { Search } from "lucide-react";

export const metadata = { title: "What's on — TVinBio" };

export default async function ExplorePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = normalizeExploreQuery(params?.q);
  const [live, creators] = await Promise.all([getLiveStreams(), listCreators()]);
  const creatorsById = new Map(creators.map((creator) => [creator.creatorId, creator]));
  const liveWithCreator = live.flatMap((stream) => {
    const creator = creatorsById.get(stream.creatorId);
    return creator ? [{ stream, creator }] : [];
  });
  const results = filterExploreResults({ creators, liveItems: liveWithCreator, query });
  const trending = [...results.creators].sort((a, b) => b.subscriberCount - a.subscriberCount).slice(0, 4);

  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="hidden md:flex">
        <Sidebar query={query} active="explore" />
      </div>

      <main className="flex min-h-screen flex-1 flex-col">
        {/* mobile top bar */}
        <div className="flex items-center justify-between px-4 pt-4 md:hidden">
          <Logo size={32} withWordmark />
          <WalletButton variant="pill" />
        </div>

        <div className="flex-1 px-4 py-5 md:px-6">
          <div className="mb-5 flex items-center justify-between">
            <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] md:text-[22px]">What&apos;s on</h1>
            <div className="hidden gap-1.5 md:flex">
              {["All", "Gaming", "Music", "Learn"].map((f, i) => (
                <span
                  key={f}
                  className={
                    i === 0
                      ? "rounded-full bg-beam px-3.5 py-1.5 text-[11px] font-semibold text-canvas"
                      : "rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5 text-[11px] font-medium text-muted"
                  }
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* mobile search */}
          <form action="/explore" className="mb-5 flex h-[42px] items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.06] px-4 text-faint md:hidden">
            <Search className="size-4" />
            <input
              name="q"
              defaultValue={query}
              placeholder="Search creators, topics..."
              className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder:text-faint focus:outline-none"
            />
          </form>

          {/* live now */}
          <div className="mb-3 flex items-center gap-2">
            <span className="size-[7px] rounded-full bg-live animate-[tvLive_1.5s_infinite]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-dim">Live now</span>
          </div>
          {results.liveItems.length ? (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
              {results.liveItems.map(({ stream, creator }) => (
              <LiveCard key={stream.playbackId} stream={stream} creator={creator} />
              ))}
            </div>
          ) : (
            <EmptySearch label={query ? "No live streams match that search" : "Nobody's on air right now"} />
          )}

          {/* trending */}
          <div className="mb-3 mt-6 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-dim">Trending channels</div>
          {trending.length ? (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
              {trending.map((c) => (
                <CreatorCard key={c.creatorId} creator={c} />
              ))}
            </div>
          ) : (
            <EmptySearch label="No channels match that search" />
          )}
        </div>

        <div className="md:hidden">
          <ViewerTabBar />
        </div>
      </main>
    </div>
  );
}

function EmptySearch({ label }: { label: string }) {
  return (
    <div className="flex min-h-[150px] items-center justify-center rounded-2xl border border-dashed border-white/10 px-5 text-center text-[12px] text-faint">
      {label}
    </div>
  );
}
