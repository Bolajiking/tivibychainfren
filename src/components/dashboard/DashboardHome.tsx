"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BarChart3, Copy, HandCoins, MessageSquare, Settings, ShoppingBag, UserPlus } from "lucide-react";
import { DashboardSidebar, CreatorBottomNav } from "@/components/nav/Rails";
import { OwnerToggleStatic } from "@/components/dashboard/OwnerToggleStatic";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Media";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionLabel, ReplayPill } from "@/components/ui/Badges";
import { Mark } from "@/components/brand/Logo";
import { GoLiveGlyph, StoreGlyph, StageGlyph, ClipGlyph, WalletGlyph } from "@/components/brand/Glyphs";
import { useSession } from "@/lib/store/session";
import { getMyCreatorProfile } from "@/lib/profile-client";
import { MOCK_MODE } from "@/lib/config";
import { formatCount } from "@/lib/cn";
import { computeRpdm, revenueMix } from "@/lib/rpdm";
import { useStoreHydrated } from "@/components/dashboard/DashboardScaffold";
import { buildAuthHref } from "@/lib/auth/redirect";
import type { CreatorNotification, CreatorProfilePayload } from "@/lib/types";

/**
 * F6 — the dashboard answers three questions above the fold:
 *   Am I making money?  (RPDM + earned, receipt layer)
 *   Is anything live or scheduled?
 *   Who arrived?
 *
 * A creator who just finished onboarding sees something different: one
 * dominant action and the measured claim-to-here time. Everything else waits
 * until they've been on air once.
 */
export function DashboardHome() {
  const { user, creator: sessionCreator, setCreator } = useSession();
  const hydrated = useStoreHydrated();
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<CreatorProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);

  // "?claimed=<ms>" is set by onboarding so the 60-second path can be measured
  // and shown back to the creator — the promise, kept in front of them.
  const claimedAt = Number(searchParams.get("claimed")) || null;
  const [elapsed, setElapsed] = useState<number | null>(null);
  useEffect(() => {
    if (!claimedAt) return;
    setElapsed(Math.max(0, Math.round((Date.now() - claimedAt) / 1000)));
  }, [claimedAt]);

  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    async function load() {
      if (!user) {
        setPayload(null);
        setLoading(false);
        return;
      }
      if (MOCK_MODE) {
        setPayload(sessionCreator ? mockPayload(sessionCreator) : null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const next = await getMyCreatorProfile(user.walletAddress);
        if (!alive) return;
        setPayload(next);
        if (next?.creator) setCreator(next.creator);
      } catch (error) {
        if (!alive) return;
        setPayload(null);
        toast.error(error instanceof Error ? dashboardError(error.message) : "Could not load dashboard");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user?.walletAddress, sessionCreator?.creatorId]);

  const creator = payload?.creator ?? sessionCreator;
  const rpdm = useMemo(() => computeRpdm(payload), [payload]);
  const mix = useMemo(() => revenueMix(payload), [payload]);
  const hasHistory = rpdm.revenueUsd > 0 || (payload?.videos.length ?? 0) > 0;

  function copyLink() {
    if (!creator) return;
    navigator.clipboard?.writeText(`https://tvin.bio/${creator.username}`);
    toast.success("Link copied");
  }

  if (loading) {
    return (
      <DashboardShell creator={creator}>
        <DashboardSkeleton />
      </DashboardShell>
    );
  }

  if (!user) {
    return (
      <DashboardShell creator={creator}>
        <SignedOut
          title="Sign in to your dashboard"
          body="Your streams, store and earnings live behind sign-in."
          action="Sign in"
          href={buildAuthHref({ role: "creator", next: "/dashboard" })}
        />
      </DashboardShell>
    );
  }

  if (!creator) {
    return (
      <DashboardShell creator={creator}>
        <SignedOut
          title="Claim your channel first"
          body="Your dashboard becomes useful the moment your address exists."
          action="Claim your channel"
          href="/start"
        />
      </DashboardShell>
    );
  }

  // ── The first-run landing: one dominant action ────────────────────────
  if (!hasHistory) {
    return (
      <DashboardShell creator={creator}>
        <h1 className="font-display text-[24px] font-semibold tracking-[-0.02em]">
          Welcome, {creator.displayName.split(" ")[0]}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Your channel is live at <span className="receipt text-ink-soft">tvin.bio/{creator.username}</span> — share
          it, or go straight on air.
        </p>

        <div className="mt-4 flex flex-col items-center gap-4 rounded-[18px] border border-white/[0.08] bg-surface-2 px-5 py-10 text-center">
          <Mark size={44} className="text-ink-soft" />
          <Button asChild variant="golive" size="lg">
            <Link href="/dashboard/broadcast">
              <GoLiveGlyph size={18} /> Go live
            </Link>
          </Button>
          {elapsed != null && elapsed < 3600 && (
            <div className="receipt text-[11px] text-ghost">claimed → here in {formatElapsed(elapsed)}</div>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="pill" className="flex-1" onClick={copyLink}>
            <Copy className="size-[15px]" /> Copy my link
          </Button>
          <Button asChild variant="secondary" size="pill" className="flex-1">
            <Link href="/dashboard/store">
              <StoreGlyph size={15} /> Add a product
            </Link>
          </Button>
        </div>

        <p className="outcome mt-8 text-center text-[14px] text-muted">a channel you own</p>
      </DashboardShell>
    );
  }

  // ── The running channel ───────────────────────────────────────────────
  return (
    <DashboardShell creator={creator}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em]">This week</h1>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={copyLink}>
            <Copy className="size-[15px] md:mr-0" />
            <span className="hidden md:inline">Copy link</span>
          </Button>
          <Button asChild variant="golive" size="sm">
            <Link href="/dashboard/broadcast">
              <GoLiveGlyph size={16} /> Go live
            </Link>
          </Button>
        </div>
      </div>

      {/* Am I making money? RPDM leads — the metric that ties airtime to income. */}
      <div className="stagger grid grid-cols-2 gap-3">
        <StatTile
          label="Rev / delivered min"
          value={rpdm.perMinute != null ? `$${rpdm.perMinute.toFixed(2)}` : "—"}
          sub={
            rpdm.deliveredMinutes > 0
              ? `est. ${formatCount(rpdm.deliveredMinutes)} min delivered`
              : "no minutes delivered yet"
          }
        />
        <StatTile
          label="Earned"
          value={`$${rpdm.revenueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
          sub={rpdm.revenueUsd > 0 ? "100% yours · 0% cut" : undefined}
          tone="earn"
        />
      </div>

      {/* Revenue mix in beam steps — earn-green is reserved for money received. */}
      {mix.total > 0 && (
        <div className="mt-3 rounded-[14px] border border-white/[0.06] bg-surface-2 p-[14px]">
          <div className="flex flex-col gap-2.5">
            {mix.rows.map((row, index) => (
              <div key={row.label}>
                <div className="flex justify-between text-[12px]">
                  <span className="text-muted">{row.label}</span>
                  <span className="receipt text-ink-soft">
                    ${row.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-white/[0.08]">
                  <span
                    className="block h-full rounded-full bg-beam"
                    style={{ width: `${Math.max(row.share * 100, row.value > 0 ? 4 : 0)}%`, opacity: 1 - index * 0.3 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Is anything live or scheduled? */}
      <div className="mt-5">
        <SectionLabel className="mb-3">On air</SectionLabel>
        {payload?.stream ? (
          <div className="flex items-center gap-3 rounded-[14px] border border-white/[0.06] bg-surface-2 p-3">
            <div
              className="relative aspect-video w-[72px] shrink-0 overflow-hidden rounded-[8px]"
              style={{ background: `linear-gradient(135deg, ${payload.stream.thumbColor}, #0d1420)` }}
            >
              {(creator.headerUrl ?? creator.avatarUrl) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={creator.headerUrl ?? creator.avatarUrl} alt="" className="absolute inset-0 size-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] text-ink-soft">{payload.stream.title}</div>
              <div className="receipt mt-1 text-[10px] text-faint">
                {payload.stream.isActive
                  ? `LIVE · ${formatCount(payload.stream.viewerCount)} watching`
                  : "READY · not on air"}
              </div>
            </div>
            <Button asChild size="sm" variant={payload.stream.isActive ? "secondary" : "primary"}>
              <Link href="/dashboard/broadcast">{payload.stream.isActive ? "Manage" : "Go live"}</Link>
            </Button>
          </div>
        ) : (
          <EmptyState
            icon={<StageGlyph size={28} />}
            title="Nothing scheduled"
            action={
              <Button asChild size="sm">
                <Link href="/dashboard/broadcast">Go live</Link>
              </Button>
            }
          />
        )}
      </div>

      {/* Replays waiting to be published — one card, one action. */}
      {(payload?.videos.length ?? 0) > 0 && (
        <div className="mt-5">
          <SectionLabel className="mb-3">Replays</SectionLabel>
          <div className="flex flex-col gap-2">
            {payload!.videos.slice(0, 4).map((video) => (
              <div key={video.playbackId} className="flex items-center gap-3 rounded-[14px] border border-white/[0.06] bg-surface-2 p-3">
                <div
                  className="relative aspect-video w-[72px] shrink-0 overflow-hidden rounded-[8px]"
                  style={{ background: `linear-gradient(135deg, ${video.thumbColor}, #0d1420)` }}
                >
                  {video.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={video.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-ink-soft">{video.title}</div>
                  <div className="receipt mt-1 text-[10px] text-faint">{formatCount(video.views)} views</div>
                </div>
                <ReplayPill small />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Every room, one tap from the Channel tab — the mobile bottom nav is a
          triad, so the other rooms live here (desktop uses the left rail). */}
      <div className="mt-5 md:hidden">
        <SectionLabel className="mb-3">Manage</SectionLabel>
        <div className="stagger grid grid-cols-3 gap-2.5">
          <RoomLink href="/dashboard/streams" label="Streams" icon={<GoLiveGlyph size={18} />} />
          <RoomLink href="/dashboard/videos" label="Videos" icon={<ClipGlyph size={18} />} />
          <RoomLink href="/dashboard/store" label="Store" icon={<StoreGlyph size={18} />} />
          <RoomLink href="/dashboard/monetization" label="Money" icon={<WalletGlyph size={18} />} />
          <RoomLink href="/dashboard/analytics" label="Analytics" icon={<BarChart3 className="size-[18px]" />} />
          <RoomLink href="/dashboard/chat" label="Chat" icon={<MessageSquare className="size-[18px]" />} />
          <RoomLink href="/dashboard/settings" label="Settings" icon={<Settings className="size-[18px]" />} />
        </div>
      </div>

      {/* Who arrived? */}
      <div className="mt-5">
        <SectionLabel className="mb-3">Who arrived</SectionLabel>
        {payload?.notifications.length ? (
          <div className="flex flex-col gap-2.5 rounded-[14px] border border-white/[0.06] bg-surface-2 p-[14px]">
            {payload.notifications.slice(0, 6).map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<UserPlus className="size-7" />}
            title="No arrivals yet"
            outcome="fans you keep, not followers you rent"
          />
        )}
      </div>
    </DashboardShell>
  );
}

function DashboardShell({
  creator,
  children,
}: {
  creator?: CreatorProfilePayload["creator"] | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="hidden md:flex">
        <DashboardSidebar active="overview" creator={creator} />
      </div>
      <main className="flex min-h-screen min-w-0 flex-1 flex-col">
        <div className="hidden h-14 shrink-0 items-center justify-between border-b border-white/[0.06] px-6 md:flex">
          <div className="font-display text-[16px] font-semibold">Overview</div>
          <div className="flex items-center gap-2.5">
            <OwnerToggleStatic username={creator?.username} />
            <Avatar seed={creator?.avatarColor ?? "#2a2a2a"} src={creator?.avatarUrl} size={32} />
          </div>
        </div>
        <div className="mx-auto min-w-0 w-full max-w-[880px] flex-1 overflow-x-clip px-4 py-5 md:px-6">{children}</div>
        <div className="md:hidden">
          <CreatorBottomNav />
        </div>
      </main>
    </div>
  );
}

function RoomLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="tap flex flex-col items-center gap-2 rounded-[14px] border border-white/[0.06] bg-surface-2 py-3.5 text-faint transition-colors hover:border-white/[0.16] hover:text-ink-dim"
    >
      {icon}
      <span className="text-[11px] font-medium">{label}</span>
    </Link>
  );
}

function ActivityRow({ activity }: { activity: CreatorNotification }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`grid size-6 place-items-center rounded-full ${actColor(activity.type)}`}>
        {actIcon(activity.type)}
      </span>
      <div className="min-w-0 flex-1 truncate text-[12px] text-ink-dim">{activity.message}</div>
      {activity.amount != null && <span className="receipt shrink-0 text-[12px] text-earn">${activity.amount.toFixed(2)}</span>}
    </div>
  );
}

function SignedOut({ title, body, action, href }: { title: string; body: string; action: string; href: string }) {
  return (
    <div className="flex min-h-[62vh] items-center justify-center">
      <div className="max-w-[390px] text-center">
        <Mark size={40} className="mx-auto text-ghost" />
        <h1 className="font-display mt-4 text-[24px] font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{body}</p>
        <Button asChild size="lg" className="mt-5">
          <Link href={href}>{action}</Link>
        </Button>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-48 rounded-xl bg-raised" />
      <div className="mt-5 grid grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="h-28 rounded-[14px] bg-raised" />
        ))}
      </div>
      <div className="mt-4 h-40 rounded-[14px] bg-raised" />
    </div>
  );
}

/** mm:ss — the claim-to-live path, measured and shown back. */
function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function mockPayload(creator: CreatorProfilePayload["creator"]): CreatorProfilePayload {
  return {
    creator,
    stream: {
      playbackId: `live-${creator.username}`,
      creatorId: creator.creatorId,
      title: `${creator.displayName} live`,
      description: "A new TVinBio channel.",
      viewMode: "free",
      amount: 0,
      isActive: false,
      viewerCount: 0,
      thumbColor: creator.avatarColor ?? "#2a2a2a",
      paidUsers: [],
      donationPresets: [3, 5, 10, 25],
      record: true,
    },
    videos: [],
    products: [],
    featuredProducts: [],
    notifications: [],
    orders: [],
  };
}

function actColor(type: string) {
  if (type === "donation") return "bg-earn/[0.15] text-earn";
  if (type === "subscription") return "bg-beam/[0.16] text-beam-soft";
  return "bg-white/[0.08] text-muted";
}

function actIcon(type: string) {
  if (type === "donation") return <HandCoins className="size-3" />;
  if (type === "subscription") return <UserPlus className="size-3" />;
  return <ShoppingBag className="size-3" />;
}

function dashboardError(error: string) {
  if (error === "profile_not_found") return "Create your channel profile first";
  if (error === "missing_token" || error === "invalid_token") return "Sign in again to load your dashboard";
  return "Could not load dashboard";
}
