"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Radio } from "lucide-react";
import { DashboardSidebar, CreatorBottomNav } from "@/components/nav/Rails";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Media";
import { useSession } from "@/lib/store/session";
import { useHydrated } from "@/lib/store/useHydrated";
import { getMyCreatorProfile } from "@/lib/profile-client";
import { MOCK_MODE } from "@/lib/config";
import { cn } from "@/lib/cn";
import type { Creator, CreatorProfilePayload, Stream } from "@/lib/types";

/**
 * Shared plumbing for the creator dashboard management pages (Streams, Store,
 * Monetization, Analytics, Chat). One loader, one chrome — each page just
 * renders its body inside `DashboardShell` and reads `useCreatorProfile`.
 */

/** A safe placeholder stream for a freshly-claimed channel with no live config yet. */
export function fallbackStream(creator?: Creator | null): Stream | null {
  if (!creator) return null;
  return {
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
  };
}

/** True once the persisted session store has rehydrated. Re-exported for back-compat. */
export const useStoreHydrated = useHydrated;

export function useCreatorProfile() {
  const { user, creator: sessionCreator, setCreator } = useSession();
  const hydrated = useStoreHydrated();
  const [payload, setPayload] = useState<CreatorProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for the persisted session to settle before deciding — otherwise a hard
    // refresh fetches against a not-yet-hydrated (null) user and hangs / flashes.
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
        setPayload(
          sessionCreator
            ? { creator: sessionCreator, stream: fallbackStream(sessionCreator), videos: [], products: [], featuredProducts: [], notifications: [], orders: [] }
            : null,
        );
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const next = await getMyCreatorProfile(user.walletAddress);
        if (!alive) return;
        setPayload(next);
        if (next?.creator) setCreator(next.creator);
      } catch {
        if (!alive) return;
        setPayload(null);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
    // Stable ids only — setCreator writes a fresh object each fetch (avoids a loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user?.walletAddress, sessionCreator?.creatorId]);

  const creator = payload?.creator ?? sessionCreator;
  return { user, payload, creator, loading, setPayload };
}

/**
 * The mobile bottom-nav destinations (Channel · Store · Wallet). A page that
 * IS a bottom tab never shows a back button; every other room does, so nothing
 * is reachable only by the browser's chrome. Must stay in sync with
 * `CreatorBottomNav`.
 */
const PRIMARY_DASHBOARD_TABS = new Set(["overview", "store", "money"]);

/**
 * Mobile-only top bar for dashboard pages: a back affordance (only where the
 * page isn't reachable from the bottom tab bar) plus the page title. Sticky so
 * it stays put while the content scrolls.
 */
export function DashboardMobileTopbar({ title, active }: { title: string; active: string }) {
  const showBack = !PRIMARY_DASHBOARD_TABS.has(active);
  return (
    <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-1.5 border-b border-white/[0.06] bg-canvas/90 px-3 backdrop-blur md:hidden">
      {showBack ? (
        <Link href="/dashboard" aria-label="Back to dashboard" className="-ml-1 flex size-10 shrink-0 items-center justify-center rounded-full text-ink-dim transition-transform active:scale-[0.92] hover:text-white">
          <ChevronLeft className="size-[22px]" />
        </Link>
      ) : (
        <span className="w-1 shrink-0" />
      )}
      <div className="min-w-0 flex-1 truncate font-display text-[16px] font-semibold">{title}</div>
    </div>
  );
}

export function DashboardShell({
  title,
  active,
  creator,
  actions,
  children,
}: {
  title: string;
  active: string;
  creator?: Creator | null;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="hidden md:flex">
        <DashboardSidebar active={active} creator={creator} />
      </div>
      <main className="flex min-h-screen min-w-0 flex-1 flex-col">
        <div className="hidden h-14 shrink-0 items-center justify-between border-b border-white/[0.06] px-6 md:flex">
          <div className="font-display text-[16px] font-semibold">{title}</div>
          <div className="flex items-center gap-2.5">
            {actions}
            <Avatar seed={creator?.avatarColor ?? "#2a2a2a"} src={creator?.avatarUrl} size={32} />
          </div>
        </div>
        <DashboardMobileTopbar title={title} active={active} />
        <div className="min-w-0 flex-1 overflow-x-clip px-4 py-5 md:px-6">{children}</div>
        <div className="md:hidden">
          <CreatorBottomNav />
        </div>
      </main>
    </div>
  );
}

export function DashboardEmpty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex min-h-[62vh] items-center justify-center">
      <div className="max-w-[390px] text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-beam-soft">
          {icon}
        </div>
        <h1 className="mt-4 font-display text-[24px] font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{body}</p>
        <Button asChild size="lg" className="mt-5">
          <Link href="/start"><Radio className="size-4" /> Claim your channel</Link>
        </Button>
      </div>
    </div>
  );
}

/** A bordered surface used across the management pages. */
export function Panel({ title, action, className, children }: { title?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-white/[0.06] bg-raised p-4", className)}>
      {(title || action) && (
        <div className="mb-3.5 flex items-center justify-between">
          {title && <span className="text-xs font-semibold text-ink-dim">{title}</span>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-raised p-4">
      <div className="text-[10.5px] text-faint">{label}</div>
      <div className="receipt mt-1.5 text-2xl text-ink-soft">{value}</div>
      {hint && <div className="mt-1 text-[10px] text-faint">{hint}</div>}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-44 rounded-xl bg-white/10" />
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-white/[0.06]" />)}
      </div>
      <div className="mt-4 h-64 rounded-2xl bg-white/[0.06]" />
    </div>
  );
}
