import { getLiveStreams, getCreatorById } from "@/lib/data";
import { Logo } from "@/components/brand/Logo";
import { LiveCard } from "@/components/cards/Cards";
import { LandingNav, LandingHeroCta } from "@/components/brand/LandingCtas";

// ISR: serve the landing statically, refresh the live rail every 30s.
// Client surfaces re-check live status themselves, so 30s staleness is safe.
export const revalidate = 30;

export default async function Landing() {
  const live = await getLiveStreams();
  const cards = await Promise.all(
    live.slice(0, 4).map(async (s) => ({ stream: s, creator: (await getCreatorById(s.creatorId))! })),
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* nav */}
      <header className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-5">
        <Logo size={34} withWordmark href="/" />
        <LandingNav />
      </header>

      {/* hero — the address is the product, so the address is the hero (F4) */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[460px] animate-[tvGlow_6s_ease-in-out_infinite]"
          style={{ background: "radial-gradient(60% 100% at 30% 0%,rgba(64,172,255,.16),transparent 60%)" }}
        />
        <div className="relative mx-auto max-w-[720px] px-5 pb-10 pt-14 text-center md:pt-20">
          <h1 className="font-display mx-auto text-[44px] font-semibold leading-[1.02] tracking-[-0.02em] md:text-[64px]">
            Your channel.<br />Your audience.<br />
            <span className="text-beam">Your revenue.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-[520px] text-[15px] leading-relaxed text-muted">
            One link in your bio becomes your own TV channel — live streams, replays and a store.
            Fans watch, shop and tip from one page.
          </p>
          {/* The one Georgia-italic outcome line on this page. */}
          <p className="outcome mt-3 text-[16px] text-muted">a channel you own</p>

          <div className="mx-auto mt-8 max-w-[440px] text-left">
            <LandingHeroCta />
          </div>

          <div className="receipt mx-auto mt-6 text-[11px] text-ghost">
            100% revenue yours · 0% platform cut · live in under a minute
          </div>
        </div>
      </section>

      {/* what's on right now — proof the stage is real */}
      {cards.length > 0 && (
        <section className="mx-auto max-w-[880px] px-5 pb-24">
          <div className="mb-4 flex items-center gap-2">
            <span className="size-[7px] rounded-full bg-live animate-[tvLive_1.5s_cubic-bezier(.22,1,.36,1)_infinite]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-dim">Live right now</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cards.map(({ stream, creator }) => (
              <LiveCard key={stream.playbackId} stream={stream} creator={creator} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
