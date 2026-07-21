"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/Media";
import { SectionLabel } from "@/components/ui/Badges";
import { InstallButton } from "@/components/pwa/InstallButton";
import { Mark } from "@/components/brand/Logo";
import { useSession } from "@/lib/store/session";
import { useHydrated } from "@/lib/store/useHydrated";
import { resolveCreatorAccent } from "@/lib/creator-theme";

/**
 * F8 — offline stays useful. The channels this fan follows are already in
 * local state, so their addresses remain readable and tappable with no
 * network: the moment connectivity returns, the tap resolves.
 *
 * The install prompt sits here rather than on arrival — being offline and
 * wanting a channel back is demonstrated intent, which is the only moment the
 * framework allows us to ask.
 */
export function OfflineChannels() {
  const hydrated = useHydrated();
  const subscriptions = useSession((s) => s.subscriptions);
  const creator = useSession((s) => s.creator);

  if (!hydrated) return null;

  const channels = [
    ...(creator
      ? [{
          creatorId: creator.creatorId,
          username: creator.username,
          displayName: creator.displayName,
          avatarColor: creator.avatarColor,
          avatarUrl: creator.avatarUrl,
          accentColor: creator.accentColor,
        }]
      : []),
    ...subscriptions,
  ];

  return (
    <div className="mt-8 w-full max-w-[360px] text-left">
      {channels.length > 0 && (
        <>
          <SectionLabel className="mb-3">Your channels — cached</SectionLabel>
          <div className="flex flex-col gap-2">
            {channels.map((channel) => {
              const accent = resolveCreatorAccent(
                "accentColor" in channel ? (channel.accentColor as string | undefined) : undefined,
              );
              return (
                <Link
                  key={channel.creatorId}
                  href={`/${channel.username}`}
                  className="flex items-center gap-3 rounded-[14px] border border-white/[0.08] bg-surface-2 px-3.5 py-2.5 transition-colors hover:border-white/[0.16]"
                >
                  <Avatar seed={channel.avatarColor ?? "#242424"} src={channel.avatarUrl} size={34} ring={accent.accent} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-soft">
                    {channel.displayName}
                  </span>
                  <span className="receipt shrink-0 text-[10px] text-ghost">tvin.bio/{channel.username}</span>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-4 flex items-center gap-3 rounded-[14px] border border-white/[0.08] bg-surface-2 p-3.5">
        <Mark size={20} className="shrink-0 text-beam" />
        <div className="flex-1 text-[12.5px] leading-relaxed text-ink-dim">
          Add TVinBio to your home screen — channels open instantly, even on 2G.
        </div>
        <InstallButton subject="app" size="sm" label="Install" className="shrink-0" />
      </div>
    </div>
  );
}
