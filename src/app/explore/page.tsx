import { Search } from "lucide-react";
import { getLiveStreams, listCreators } from "@/lib/data";
import { Sidebar, ViewerTabBar } from "@/components/nav/Rails";
import { CreatorCard } from "@/components/cards/Cards";
import { ExploreLive } from "@/components/cards/ExploreLive";
import { Logo } from "@/components/brand/Logo";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionLabel } from "@/components/ui/Badges";
import { WalletButton } from "@/components/wallet/WalletButton";
import { filterExploreResults, normalizeExploreQuery } from "@/lib/explore";

export const metadata = { title: "What's on — TVinBio" };

/**
 * F7 — deliberately shallow. TVinBio is a home base, not a discovery platform:
 * creators bring their own audience, so this page promises only "what's on"
 * and never pretends to be a feed. Live now leads; featured channels follow.
 */
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
  const liveCreatorIds = new Set(results.liveItems.map(({ creator }) => creator.creatorId));
  const featured = [...results.creators]
    .sort((a, b) => b.subscriberCount - a.subscriberCount)
    .slice(0, 6);

  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="hidden md:flex">
        <Sidebar query={query} active="explore" />
      </div>

      <main className="flex min-h-screen flex-1 flex-col">
        <div className="flex items-center justify-between px-4 pt-4 md:hidden">
          <Logo size={32} withWordmark />
          <WalletButton variant="pill" />
        </div>

        <div className="mx-auto w-full max-w-[880px] flex-1 px-4 py-5 md:px-6">
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em]">What&apos;s on</h1>

          <form action="/explore" className="mt-4 flex h-[42px] items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.05] px-4 text-faint md:hidden">
            <Search className="size-4" />
            <input
              name="q"
              defaultValue={query}
              placeholder="Search channels"
              className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder:text-faint focus:outline-none"
            />
          </form>

          {/* Live now — client-polled so it reflects go-lives and, crucially,
              reverts the moment a stream ends. Creator identity leads each tile. */}
          <div className="mt-5">
            <ExploreLive initial={results.liveItems} query={query} />
          </div>

          <SectionLabel className="mb-3 mt-7">Featured channels</SectionLabel>
          {featured.length ? (
            <div className="stagger grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
              {featured.map((creator) => (
                <CreatorCard
                  key={creator.creatorId}
                  creator={creator}
                  status={liveCreatorIds.has(creator.creatorId) ? "LIVE NOW" : undefined}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No channels match that search" />
          )}

          <p className="mt-8 text-center text-[12px] text-faint">
            Deliberately shallow — a home base, not a feed.
          </p>
        </div>

        <div className="md:hidden">
          <ViewerTabBar />
        </div>
      </main>
    </div>
  );
}
