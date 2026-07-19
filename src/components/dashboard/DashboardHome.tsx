"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Download, Film, HandCoins, Radio, Settings, ShoppingBag, TrendingUp, UserPlus, LayoutGrid } from "lucide-react";
import { DashboardSidebar, CreatorBottomNav } from "@/components/nav/Rails";
import { OwnerToggleStatic } from "@/components/dashboard/OwnerToggleStatic";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Media";
import { GateBadge } from "@/components/ui/Badges";
import { useSession } from "@/lib/store/session";
import { getMyCreatorProfile } from "@/lib/profile-client";
import { MOCK_MODE } from "@/lib/config";
import { formatCount } from "@/lib/cn";
import { useStoreHydrated } from "@/components/dashboard/DashboardScaffold";
import { buildAuthHref } from "@/lib/auth/redirect";
import type { CreatorNotification, CreatorProfilePayload, ViewMode } from "@/lib/types";

export function DashboardHome() {
  const { user, creator: sessionCreator, setCreator } = useSession();
  const hydrated = useStoreHydrated();
  const [payload, setPayload] = useState<CreatorProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for the persisted session before deciding (avoids a hard-refresh hang).
    if (!hydrated) return;
    let alive = true;
    async function load() {
      if (!user) {
        setPayload(null);
        setLoading(false);
        return;
      }

      if (MOCK_MODE) {
        // No backend in mock mode — never hit the real API (it can't resolve).
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
    // Depend on stable ids only — `setCreator` writes a fresh creator object each
    // fetch, so depending on the object/user reference would loop forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user?.walletAddress, sessionCreator?.creatorId]);

  const creator = payload?.creator ?? sessionCreator;
  const stats = useMemo(() => buildStats(payload), [payload]);

  if (loading) {
    return <DashboardShell creator={creator}><DashboardSkeleton /></DashboardShell>;
  }

  if (!user) {
    return (
      <DashboardShell creator={creator}>
        <EmptyState
          title="Sign in to your dashboard"
          body="Your creator dashboard lives behind sign-in. Continue to access your streams, store and earnings."
          action="Sign in"
          href={buildAuthHref({ role: "creator", next: "/dashboard" })}
        />
      </DashboardShell>
    );
  }

  if (!creator) {
    return (
      <DashboardShell creator={creator}>
        <EmptyState
          title="Create your channel profile"
          body="Your dashboard becomes useful after your profile exists. Claim a link, then every stream, product and payment rolls up here."
          action="Set up profile"
          href="/onboarding"
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell creator={creator}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate font-display text-[22px] font-semibold tracking-[-0.02em]">Welcome back, {creator.displayName}</h1>
          <div className="mt-1 text-[12.5px] text-muted">/{creator.username} is ready for the next drop.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:shrink-0">
          <Button asChild variant="secondary" size="pill" className="shrink-0"><Link href={`/${creator.username}?install=1`}><Download className="size-4" /> Save channel</Link></Button>
          <Button asChild variant="secondary" size="pill" className="shrink-0"><Link href="/dashboard/settings" aria-label="Channel settings"><Settings className="size-4" /></Link></Button>
          <Button asChild variant="secondary" size="pill" className="shrink-0"><Link href="/dashboard/videos"><Film className="size-4" /> Videos</Link></Button>
          <Button asChild variant="golive" size="pill" className="flex-1 sm:flex-none"><Link href="/dashboard/broadcast"><Radio className="size-4" /> Go live</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/[0.06] bg-raised p-4">
            <div className="text-[10.5px] text-faint">{s.label}</div>
            <div className="receipt mt-1.5 text-2xl text-ink-soft">{s.value}</div>
            {s.delta && <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-earn"><TrendingUp className="size-[11px]" /> {s.delta}</div>}
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-white/[0.06] bg-raised p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-dim">Recent content</span>
            <Link href="/dashboard/broadcast" className="text-[11px] font-semibold text-blue">Manage</Link>
          </div>
          <div className="flex flex-col gap-3">
            {payload?.stream && (
              <ContentRow
                color={payload.stream.thumbColor}
                src={creator.headerUrl ?? creator.avatarUrl}
                title={payload.stream.title}
                meta={payload.stream.isActive ? `${formatCount(payload.stream.viewerCount)} watching` : "Ready to go live"}
                viewMode={payload.stream.viewMode}
                amount={payload.stream.amount}
              />
            )}
            {payload?.videos.map((v) => (
              <ContentRow
                key={v.playbackId}
                color={v.thumbColor}
                src={v.thumbnailUrl}
                title={v.title}
                meta={`${formatCount(v.views)} views`}
                viewMode={v.viewMode}
                amount={v.amount}
              />
            ))}
            {!payload?.stream && !payload?.videos.length && (
              <EmptyList icon={<LayoutGrid className="size-4" />} label="No content yet. Go live or upload a replay." />
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-raised p-4">
          <div className="mb-3 text-xs font-semibold text-ink-dim">Activity</div>
          <div className="flex flex-col gap-3">
            {payload?.notifications.length ? payload.notifications.map((a) => (
              <ActivityRow key={a.id} activity={a} />
            )) : (
              <EmptyList icon={<HandCoins className="size-4" />} label="Payments, tips and orders will appear here." />
            )}
          </div>
        </div>
      </div>

    </DashboardShell>
  );
}

function DashboardShell({ creator, children }: { creator?: CreatorProfilePayload["creator"] | null; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="hidden md:flex"><DashboardSidebar active="overview" creator={creator} /></div>
      <main className="flex min-h-screen min-w-0 flex-1 flex-col">
        <div className="hidden h-14 shrink-0 items-center justify-between border-b border-white/[0.06] px-6 md:flex">
          <div className="font-display text-[16px] font-semibold">Overview</div>
          <div className="flex items-center gap-2.5">
            <OwnerToggleStatic username={creator?.username} />
            <Avatar seed={creator?.avatarColor ?? "#2a2a2a"} src={creator?.avatarUrl} size={32} />
          </div>
        </div>
        <div className="min-w-0 flex-1 overflow-x-clip px-4 py-5 md:px-6">{children}</div>
        <div className="md:hidden"><CreatorBottomNav /></div>
      </main>
    </div>
  );
}

function ContentRow({ color, src, title, meta, viewMode, amount }: { color: string; src?: string | null; title: string; meta: string; viewMode: ViewMode; amount: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-10 w-[62px] shrink-0 overflow-hidden rounded-lg" style={{ background: `radial-gradient(80% 80% at 50% 40%,${color},#0a0a0c)` }}>
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-semibold">{title}</div>
        <div className="mt-1 flex items-center gap-2">
          <GateBadge viewMode={viewMode} amount={amount} />
          <span className="text-[10px] text-faint">{meta}</span>
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ activity }: { activity: CreatorNotification }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex size-6 items-center justify-center rounded-full ${actColor(activity.type)}`}>{actIcon(activity.type)}</span>
      <div className="text-[11px] text-ink-dim">{activity.message}</div>
    </div>
  );
}

function EmptyState({ title, body, action, href }: { title: string; body: string; action: string; href: string }) {
  return (
    <div className="flex min-h-[62vh] items-center justify-center">
      <div className="max-w-[390px] text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-blue-light">
          <Radio className="size-5" />
        </div>
        <h1 className="mt-4 font-display text-[24px] font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{body}</p>
        <Button asChild size="lg" className="mt-5"><Link href={href}>{action}</Link></Button>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-48 rounded-xl bg-white/10" />
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 rounded-2xl bg-white/[0.06]" />)}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1fr]">
        <div className="h-64 rounded-2xl bg-white/[0.06]" />
        <div className="h-64 rounded-2xl bg-white/[0.06]" />
      </div>
    </div>
  );
}

function EmptyList({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.035] px-3 py-3 text-[11.5px] text-faint">{icon}{label}</div>;
}

function buildStats(payload: CreatorProfilePayload | null): { label: string; value: string; delta?: string }[] {
  const notifications = payload?.notifications ?? [];
  const orders = payload?.orders ?? [];
  const videos = payload?.videos ?? [];
  const earnings = [...notifications.map((n) => n.amount ?? 0), ...orders.map((o) => o.amount)].reduce((a, b) => a + b, 0);
  const tips = notifications.filter((n) => n.type === "donation").reduce((sum, n) => sum + (n.amount ?? 0), 0);
  const views = videos.reduce((sum, v) => sum + v.views, 0);

  return [
    { label: "Subscribers", value: formatCount(payload?.creator.subscriberCount ?? 0) },
    { label: "Earnings", value: `$${earnings.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
    { label: "Video views", value: formatCount(views) },
    { label: "Tips", value: `$${tips.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
  ];
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

function actColor(t: string) {
  if (t === "donation") return "bg-blue/[0.16] text-blue-light";
  if (t === "subscription") return "bg-online/[0.16] text-online";
  return "bg-lime/[0.16] text-lime";
}

function actIcon(t: string) {
  if (t === "donation") return <HandCoins className="size-3" />;
  if (t === "subscription") return <UserPlus className="size-3" />;
  return <ShoppingBag className="size-3" />;
}

function dashboardError(error: string) {
  if (error === "profile_not_found") return "Create your channel profile first";
  if (error === "missing_token" || error === "invalid_token") return "Sign in again to load your dashboard";
  return "Could not load dashboard";
}
