"use client";

import { useMemo } from "react";
import Link from "next/link";
import { BarChart3, Film, Users, Eye, HandCoins } from "lucide-react";
import { GateBadge } from "@/components/ui/Badges";
import { DashboardShell, DashboardEmpty, Panel, StatTile, useCreatorProfile, PageSkeleton } from "@/components/dashboard/DashboardScaffold";
import { useSession } from "@/lib/store/session";
import { formatCount } from "@/lib/cn";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function AnalyticsDashboard() {
  const user = useSession((s) => s.user);
  const { creator, payload, loading } = useCreatorProfile();

  const stats = useMemo(() => {
    const videos = payload?.videos ?? [];
    const notifications = payload?.notifications ?? [];
    const orders = payload?.orders ?? [];
    const views = videos.reduce((s, v) => s + v.views, 0);
    const earnings =
      notifications.reduce((s, n) => s + (n.amount ?? 0), 0) +
      orders.filter((o) => o.status === "completed").reduce((s, o) => s + o.amount, 0);
    const newSubs = notifications.filter((n) => n.type === "subscription").length;
    return { views, earnings, newSubs, videoCount: videos.length };
  }, [payload]);

  const topVideos = useMemo(() => [...(payload?.videos ?? [])].sort((a, b) => b.views - a.views).slice(0, 6), [payload?.videos]);
  const maxViews = topVideos[0]?.views ?? 1;

  if (loading) return <DashboardShell title="Analytics" active="stats" creator={creator}><PageSkeleton /></DashboardShell>;
  if (!user || !creator) {
    return (
      <DashboardShell title="Analytics" active="stats" creator={creator}>
        <DashboardEmpty icon={<BarChart3 className="size-5" />} title="Set up your channel first" body="Analytics roll up across your streams, videos and store once your channel is live." />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Analytics" active="stats" creator={creator}>
      <div className="mb-5">
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em]">Analytics</h1>
        <p className="mt-1 text-[12.5px] text-muted">How your channel is growing across audience, content and revenue.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Subscribers" value={formatCount(creator.subscriberCount ?? 0)} hint={stats.newSubs ? `+${stats.newSubs} recently` : "All-time"} />
        <StatTile label="Video views" value={formatCount(stats.views)} hint={`${stats.videoCount} ${stats.videoCount === 1 ? "video" : "videos"}`} />
        <StatTile label="Total earned" value={money(stats.earnings)} />
        <StatTile label="Avg / video" value={formatCount(stats.videoCount ? Math.round(stats.views / stats.videoCount) : 0)} hint="views" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* top content */}
        <Panel title="Top content by views" action={<Link href="/dashboard/videos" className="text-[11px] font-semibold text-beam">Manage</Link>}>
          {topVideos.length ? (
            <div className="flex flex-col gap-3">
              {topVideos.map((v) => (
                <div key={v.playbackId} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] font-medium">{v.title}</span>
                      <span className="shrink-0 font-display text-[12px] font-semibold text-ink-dim">{formatCount(v.views)}</span>
                    </div>
                    <div className="mt-1.5 h-[6px] overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-gradient-to-r from-beam to-[#40ffcc]" style={{ width: `${Math.max(6, (v.views / maxViews) * 100)}%` }} />
                    </div>
                  </div>
                  <GateBadge viewMode={v.viewMode} amount={v.amount} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 py-10 text-center">
              <Film className="size-6 text-ghost" />
              <div className="text-[12.5px] font-semibold text-ink-dim">No videos yet</div>
              <div className="text-[10.5px] text-faint">Upload replays to start tracking views.</div>
            </div>
          )}
        </Panel>

        {/* audience snapshot */}
        <Panel title="Snapshot">
          <div className="flex flex-col gap-3">
            <SnapshotRow icon={<Users className="size-4" />} tone="bg-earn/[0.16] text-earn" label="Subscribers" value={formatCount(creator.subscriberCount ?? 0)} />
            <SnapshotRow icon={<Eye className="size-4" />} tone="bg-beam/[0.16] text-beam-soft" label="Total views" value={formatCount(stats.views)} />
            <SnapshotRow icon={<HandCoins className="size-4" />} tone="bg-earn/[0.16] text-earn" label="Total earned" value={money(stats.earnings)} />
            <SnapshotRow icon={<Film className="size-4" />} tone="bg-white/[0.08] text-muted" label="Published videos" value={String(stats.videoCount)} />
          </div>
          <p className="mt-4 text-[10.5px] leading-relaxed text-faint">Numbers update from real videos, orders, tips, subscriptions and notifications as fans watch and pay.</p>
        </Panel>
      </div>
    </DashboardShell>
  );
}

function SnapshotRow({ icon, tone, label, value }: { icon: React.ReactNode; tone: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`flex size-8 items-center justify-center rounded-full ${tone}`}>{icon}</span>
      <span className="flex-1 text-[12.5px] text-ink-dim">{label}</span>
      <span className="font-display text-[14px] font-semibold">{value}</span>
    </div>
  );
}
