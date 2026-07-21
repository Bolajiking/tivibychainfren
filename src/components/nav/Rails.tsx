"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Compass, Search, BarChart3, MessageSquare, LayoutGrid, Heart, Crown,
  ChevronRight, Wallet, PanelLeftClose, PanelLeftOpen, Settings,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { OnAirGlyph, WalletGlyph, StoreGlyph, GoLiveGlyph, StageGlyph, ClipGlyph } from "@/components/brand/Glyphs";
import { Avatar } from "@/components/ui/Media";
import { useSession } from "@/lib/store/session";
import { buildAuthHref } from "@/lib/auth/redirect";
import { PersonaSwitch } from "@/components/nav/PersonaSwitch";
import { AddChannel } from "@/components/nav/AddChannel";
import { cn } from "@/lib/cn";
import type { Creator } from "@/lib/types";

/**
 * The single desktop sidebar used on Explore and on every channel page. It
 * unifies what used to be two separate components (a 230px expanded rail and an
 * 84px icon rail) into one surface that collapses/expands — width animates, the
 * brand wordmark, search and every nav label fade away to leave icons, and the
 * choice persists across sessions. Every action (Explore, Following, Wallet,
 * owned channel, joined channels, add-a-channel, persona switch) is present in
 * both states.
 */
export function Sidebar({ query = "", active }: { query?: string; active?: "explore" | "following" }) {
  const router = useRouter();
  const { creator, subscriptions } = useSession();
  const collapsed = useSession((s) => s.navCollapsed);
  const toggleNav = useSession((s) => s.toggleNav);
  const openWallet = useSession((s) => s.openWallet);

  function onWallet() {
    if (!useSession.getState().user) router.push(buildAuthHref({ role: "viewer", next: "/wallet", reason: "wallet" }));
    else openWallet();
  }

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden border-r border-white/[0.06] bg-surface-2 transition-[width] duration-300 ease-[cubic-bezier(.22,1,.36,1)]",
        collapsed ? "w-[74px]" : "w-[248px]",
      )}
    >
      {/* brand + collapse */}
      <div className={cn("flex h-[60px] shrink-0 items-center border-b border-white/[0.05]", collapsed ? "justify-center px-2" : "justify-between pl-4 pr-3")}>
        {collapsed ? (
          <CollapsedRailToggle onClick={toggleNav} />
        ) : (
          <>
            <Logo size={30} withWordmark href="/explore" />
            <button onClick={toggleNav} aria-label="Collapse sidebar" className="grid size-7 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-white/[0.06] hover:text-white">
              <PanelLeftClose className="size-[17px]" />
            </button>
          </>
        )}
      </div>

      {/* scroll body */}
      <div className="flex flex-1 flex-col gap-[3px] overflow-y-auto overflow-x-hidden px-3 py-3">
        {!collapsed && (
          <form action="/explore" className="mb-1 flex h-[38px] items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 text-[11.5px] text-faint">
            <Search className="size-[15px] shrink-0" />
            <input
              name="q"
              defaultValue={query}
              placeholder="Search"
              className="min-w-0 flex-1 bg-transparent text-[11.5px] text-white placeholder:text-faint focus:outline-none"
            />
          </form>
        )}

        {/* Same vocabulary as the mobile triad — one name per destination. */}
        <NavRow href="/explore" icon={<Compass className="size-[18px]" />} label="What's on" active={active === "explore"} collapsed={collapsed} />
        <NavRow href="/explore" icon={<Heart className="size-[18px]" />} label="Following" active={active === "following"} collapsed={collapsed} />
        <NavRow icon={<WalletGlyph size={18} />} label="Wallet" collapsed={collapsed} onClick={onWallet} />

        {creator &&
          (collapsed ? (
            <div className="mt-2 flex flex-col items-center gap-2">
              <span aria-hidden className="h-px w-7 bg-white/[0.08]" />
              <OwnedChannelIcon creator={creator} />
            </div>
          ) : (
            <>
              <SidebarLabel className="text-beam-soft">Your channel</SidebarLabel>
              <OwnedChannelRow
                href={`/${creator.username}`}
                name={creator.displayName}
                handle={creator.username}
                seed={creator.avatarColor ?? "#242424"}
                src={creator.avatarUrl}
              />
            </>
          ))}

        {subscriptions.length > 0 &&
          (collapsed ? (
            <div className="mt-1.5 flex flex-col items-center gap-2.5">
              {!creator && <span aria-hidden className="h-px w-7 bg-white/[0.08]" />}
              {subscriptions.slice(0, 6).map((c) => (
                <Link key={c.creatorId} href={`/${c.username}`} aria-label={c.displayName} className="opacity-90 transition-opacity hover:opacity-100">
                  <Avatar seed={c.avatarColor ?? "#242424"} src={c.avatarUrl} size={38} />
                </Link>
              ))}
            </div>
          ) : (
            <>
              <SidebarLabel>Following</SidebarLabel>
              {subscriptions.map((c) => (
                <ChannelLink key={c.creatorId} seed={c.avatarColor ?? "#242424"} src={c.avatarUrl} name={c.displayName} href={`/${c.username}`} />
              ))}
            </>
          ))}

        <div className={cn("mt-1.5", collapsed && "flex justify-center")}>
          <AddChannel variant={collapsed ? "rail" : "row"} />
        </div>
      </div>

      {/* footer persona */}
      <div className={cn("shrink-0 border-t border-white/[0.06] p-3", collapsed && "flex justify-center")}>
        <PersonaSwitch variant={collapsed ? "compact" : "full"} />
      </div>
    </aside>
  );
}

/** A primary nav item — icon always shown, label fades out in the collapsed rail. */
function NavRow({ href, icon, label, active, collapsed, onClick }: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const cls = cn(
    "flex h-10 items-center rounded-[11px] text-[13px] font-medium transition-colors",
    collapsed ? "justify-center" : "gap-3 px-[11px]",
    active ? "bg-beam/[0.14] font-semibold text-white" : "text-muted hover:bg-white/[0.05] hover:text-white",
  );
  const inner = (
    <>
      <span className={cn("grid shrink-0 place-items-center", active ? "text-beam-soft" : "text-faint")}>{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </>
  );
  return onClick ? (
    <button onClick={onClick} aria-label={label} className={cls}>{inner}</button>
  ) : (
    <Link href={href!} aria-label={label} className={cls}>{inner}</Link>
  );
}

function SidebarLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mt-2 whitespace-nowrap px-2 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ghost", className)}>{children}</div>;
}

/** Collapsed-rail avatar for the owner's own channel (mirrors OwnedChannelRow). */
function OwnedChannelIcon({ creator }: { creator: Creator }) {
  return (
    <Link href={`/${creator.username}`} aria-label={`${creator.displayName} (your channel)`} className="group relative">
      <Avatar seed={creator.avatarColor ?? "#2a2a2a"} src={creator.avatarUrl} size={42} ring="#40ACFF" className="relative" />
      <span className="absolute -right-1 -top-1 z-10 flex size-[15px] items-center justify-center rounded-full border-2 border-surface-2 bg-beam text-white">
        <Crown className="size-[8px] fill-current" />
      </span>
    </Link>
  );
}

function OwnedChannelRow({ href, name, handle, seed, src }: { href: string; name: string; handle: string; seed: string; src?: string | null }) {
  return (
    <Link
      href={href}
      className="group relative flex items-center gap-2.5 overflow-hidden rounded-[12px] border border-beam/30 bg-gradient-to-r from-beam/[0.13] via-beam/[0.05] to-transparent px-2.5 py-2 transition-colors hover:border-beam/55"
    >
      <span className="relative shrink-0">
        <Avatar seed={seed} src={src} size={32} ring="#40ACFF" />
        <span className="absolute -right-1 -top-1 flex size-[14px] items-center justify-center rounded-full border-2 border-surface-2 bg-beam text-white">
          <Crown className="size-[7px] fill-current" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-semibold text-white">{name}</span>
          <span className="shrink-0 rounded bg-beam/25 px-1.5 py-px text-[7.5px] font-bold tracking-[0.06em] text-beam-soft">OWNER</span>
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-faint">@{handle}</span>
      </span>
      <ChevronRight className="size-3.5 shrink-0 text-beam-soft/50 transition-transform group-hover:translate-x-0.5 group-hover:text-beam-soft" />
    </Link>
  );
}

function ChannelLink({ seed, src, ring, name, href }: { seed: string; src?: string | null; ring?: string; name: string; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-[10px] py-0.5 opacity-90 transition-opacity hover:opacity-100">
      <Avatar seed={seed} src={src} size={30} ring={ring} />
      <span className="truncate text-xs text-muted">{name}</span>
    </Link>
  );
}

export function DashboardSidebar({ active = "overview", creator }: { active?: string; creator?: Pick<Creator, "displayName" | "username" | "avatarColor" | "avatarUrl"> | null }) {
  const collapsed = useSession((s) => s.navCollapsed);
  const toggleNav = useSession((s) => s.toggleNav);
  const items = [
    { id: "overview", label: "Overview", icon: <StageGlyph size={16} />, href: "/dashboard" },
    { id: "streams", label: "Streams", icon: <GoLiveGlyph size={16} />, href: "/dashboard/streams" },
    { id: "videos", label: "Videos", icon: <ClipGlyph size={16} />, href: "/dashboard/videos" },
    { id: "store", label: "Store", icon: <StoreGlyph size={16} />, href: "/dashboard/store" },
    { id: "money", label: "Monetization", icon: <WalletGlyph size={16} />, href: "/dashboard/monetization" },
    { id: "stats", label: "Analytics", icon: <BarChart3 className="size-4" />, href: "/dashboard/analytics" },
    { id: "chat", label: "Chat", icon: <MessageSquare className="size-4" />, href: "/dashboard/chat" },
    { id: "settings", label: "Settings", icon: <Settings className="size-4" />, href: "/dashboard/settings" },
  ];
  return (
    <div className={cn(
      "flex shrink-0 flex-col overflow-hidden border-r border-white/[0.06] bg-surface-2 transition-[width] duration-300 ease-[cubic-bezier(.22,1,.36,1)]",
      collapsed ? "w-[74px]" : "w-[230px]",
    )}>
      <div className={cn("flex h-[60px] shrink-0 items-center border-b border-white/[0.05]", collapsed ? "justify-center px-2" : "justify-between pl-4 pr-3")}>
        {collapsed ? (
          <CollapsedRailToggle onClick={toggleNav} />
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar seed={creator?.avatarColor ?? "#2a2a2a"} src={creator?.avatarUrl} size={32} />
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-semibold">{creator?.displayName ?? "Set up profile"}</div>
                <div className="truncate text-[9.5px] text-faint">@{creator?.username ?? "creator"}</div>
              </div>
            </div>
            <button onClick={toggleNav} aria-label="Collapse sidebar" className="grid size-7 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-white/[0.06] hover:text-white">
              <PanelLeftClose className="size-[17px]" />
            </button>
          </>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-[5px] overflow-y-auto overflow-x-hidden px-3 py-3">
        {items.map((it) => (
          <Link
            key={it.id + it.label}
            href={it.href}
            aria-label={it.label}
            className={cn(
              "flex h-10 items-center rounded-[11px] text-xs transition-colors",
              collapsed ? "justify-center" : "gap-2.5 px-2.5",
              active === it.id
                ? collapsed ? "font-semibold text-beam-soft hover:bg-white/[0.05]" : "bg-beam/[0.14] font-semibold text-white"
                : "text-muted hover:bg-white/[0.05] hover:text-white",
            )}
          >
            <span className={active === it.id ? "text-beam-soft" : "text-faint"}>{it.icon}</span>
            {!collapsed && it.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function CollapsedRailToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Expand sidebar"
      className="grid size-8 place-items-center rounded-[10px] border border-white/12 bg-white/[0.035] text-ink-dim transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-beam/60"
    >
      <PanelLeftOpen className="size-[17px]" />
    </button>
  );
}

/**
 * The creator's mobile bar: Dashboard · My channel.
 *
 * Store and Wallet used to sit here, but both are already tiles in the
 * overview's "Manage" grid — a tab bar that repeats the grid beneath it spends
 * its two most valuable slots on duplicates. The slot they vacate solves a real
 * gap instead: on mobile there was no way out of the dashboard back to the
 * public page, so a creator checking how their channel looks had to retype the
 * URL.
 *
 * "My channel" is the same vocabulary `ViewerTabBar` uses for `/{username}`,
 * and the creator page carries its own history-aware `BackButton`, so the
 * round trip closes.
 *
 * Must stay in sync with `PRIMARY_DASHBOARD_TABS` in `DashboardScaffold`:
 * anything not reachable from this bar has to show a mobile back button, or
 * the room is trapped.
 */
export function CreatorBottomNav() {
  const path = usePathname();
  const creator = useSession((s) => s.creator);
  const channelHref = creator?.username ? `/${creator.username}` : null;

  return (
    <div className="sticky bottom-0 z-30 shrink-0 border-t border-white/[0.06] bg-surface-2/95 pt-1 backdrop-blur pb-[max(4px,env(safe-area-inset-bottom))]">
      {/* Centred and width-capped: with two items, edge-to-edge `flex-1` would
          strand the labels at the far corners on wider phones. */}
      <div className="mx-auto flex w-full max-w-[420px] items-center">
        <TabItem
          href="/dashboard"
          label="Dashboard"
          active={path === "/dashboard"}
          icon={<StageGlyph size={19} />}
        />
        {channelHref && (
          <TabItem
            href={channelHref}
            label="My channel"
            active={path === channelHref}
            icon={<OnAirGlyph size={19} />}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The fan nav triad (Package 3): Channel · What's on · Wallet.
 *
 * Fan chrome is deliberately minimal — creator pages carry their own nav and
 * never render this bar. Active state is the beam, one at a time.
 */
export function ViewerTabBar() {
  const path = usePathname();
  const router = useRouter();
  const openWallet = useSession((s) => s.openWallet);
  const creator = useSession((s) => s.creator);
  const subscriptions = useSession((s) => s.subscriptions);

  function onWallet() {
    if (!useSession.getState().user) router.push(buildAuthHref({ role: "viewer", next: "/wallet", reason: "wallet" }));
    else openWallet();
  }

  // "Channel" is only shown when the fan actually has one — a channel they own,
  // else the first they follow. A pure viewer is never pushed toward the claim
  // flow from their fan chrome (that's a creator action). They get What's on +
  // Wallet, and Following once they follow someone.
  const channelHref = creator ? `/${creator.username}` : subscriptions[0] ? `/${subscriptions[0].username}` : null;
  const channelLabel = creator ? "My channel" : "Following";

  return (
    <div className="sticky bottom-0 z-30 flex shrink-0 items-center border-t border-white/[0.06] bg-surface-2/95 pt-1 backdrop-blur pb-[max(4px,env(safe-area-inset-bottom))]">
      {channelHref && (
        <TabItem href={channelHref} label={channelLabel} active={path === channelHref} icon={<OnAirGlyph size={19} />} />
      )}
      <TabItem href="/explore" label="What's on" active={path === "/explore"} icon={<Search className="size-[19px]" />} />
      <TabItem onClick={onWallet} label="Wallet" icon={<WalletGlyph size={19} />} />
    </div>
  );
}

function TabItem({
  href,
  onClick,
  label,
  icon,
  active,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
}) {
  const className = cn(
    "flex h-[54px] flex-1 flex-col items-center justify-center gap-[3px] transition-[color,transform] duration-150 ease-[cubic-bezier(.22,1,.36,1)] active:scale-[0.96]",
    active ? "text-beam" : "text-faint hover:text-ink-dim",
  );
  const inner = (
    <>
      {icon}
      <span className="text-[10px] font-semibold">{label}</span>
    </>
  );
  return onClick ? (
    <button onClick={onClick} aria-label={label} className={className}>
      {inner}
    </button>
  ) : (
    <Link href={href!} aria-label={label} className={className}>
      {inner}
    </Link>
  );
}
