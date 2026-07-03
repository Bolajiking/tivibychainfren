"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PackageCheck, Radio } from "lucide-react";
import { StoreManager } from "@/components/dashboard/StoreManager";
import { DashboardSidebar, CreatorBottomNav } from "@/components/nav/Rails";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Media";
import { useSession } from "@/lib/store/session";
import { getMyCreatorProfile } from "@/lib/profile-client";
import { MOCK_MODE } from "@/lib/config";
import { useStoreHydrated } from "@/components/dashboard/DashboardScaffold";
import type { Creator, CreatorProfilePayload, Stream } from "@/lib/types";

export function StoreDashboard() {
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
      } catch (error) {
        if (!alive) return;
        setPayload(null);
        toast.error(error instanceof Error && error.message === "profile_not_found" ? "Create your channel profile first" : "Could not load store");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
    // Stable ids only — setCreator writes a new object each fetch (avoids a refetch loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user?.walletAddress, sessionCreator?.creatorId]);

  const creator = payload?.creator ?? sessionCreator;
  const stream = useMemo(() => payload?.stream ?? fallbackStream(creator), [creator, payload?.stream]);

  if (loading) {
    return <StoreShell creator={creator}><StoreSkeleton /></StoreShell>;
  }

  if (!user || !creator) {
    return (
      <StoreShell creator={creator}>
        <EmptyState />
      </StoreShell>
    );
  }

  return (
    <StoreShell creator={creator}>
      <StoreManager initial={payload?.products ?? []} creator={creator} stream={stream} />
    </StoreShell>
  );
}

function StoreShell({ creator, children }: { creator?: Creator | null; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="hidden md:flex"><DashboardSidebar active="store" creator={creator} /></div>
      <main className="flex min-h-screen flex-1 flex-col">
        <div className="hidden h-14 shrink-0 items-center justify-between border-b border-white/[0.06] px-6 md:flex">
          <div className="font-display text-[16px] font-semibold">Store</div>
          <Avatar seed={creator?.avatarColor ?? "#2a2a2a"} src={creator?.avatarUrl} size={32} />
        </div>
        <div className="flex-1 px-4 py-5 md:px-6">{children}</div>
        <div className="md:hidden"><CreatorBottomNav /></div>
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[62vh] items-center justify-center">
      <div className="max-w-[390px] text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-blue-light">
          <PackageCheck className="size-5" />
        </div>
        <h1 className="mt-4 font-display text-[24px] font-semibold tracking-[-0.02em]">Create your channel first</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">Your store attaches products to your TVinBio channel, so profile setup comes first.</p>
        <Button asChild size="lg" className="mt-5"><Link href="/onboarding"><Radio className="size-4" /> Set up profile</Link></Button>
      </div>
    </div>
  );
}

function StoreSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-36 rounded-xl bg-white/10" />
      <div className="mt-5 flex flex-col gap-2.5">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-[78px] rounded-2xl bg-white/[0.06]" />)}
      </div>
    </div>
  );
}

function fallbackStream(creator?: Creator | null): Stream | null {
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
