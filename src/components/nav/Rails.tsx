"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Compass, User, Search, BarChart3, ShoppingBag, Tv, HandCoins,
  MessageSquare, LayoutGrid, Heart, Crown, ChevronRight, Wallet,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
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
    if (!useSession.getState().user) router.push(buildAuthHref({ role: "viewer", next: "/wallet" }));
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

        <NavRow href="/explore" icon={<Compass className="size-[18px]" />} label="Explore" active={active === "explore"} collapsed={collapsed} />
        <NavRow href="/explore" icon={<Heart className="size-[18px]" />} label="Following" active={active === "following"} collapsed={collapsed} />
        <NavRow icon={<Wallet className="size-[18px]" />} label="Wallet" collapsed={collapsed} onClick={onWallet} />

        {creator &&
          (collapsed ? (
            <div className="mt-2 flex flex-col items-center gap-2">
              <span aria-hidden className="h-px w-7 bg-white/[0.08]" />
              <OwnedChannelIcon creator={creator} />
            </div>
          ) : (
            <>
              <SidebarLabel className="text-blue-soft">Your channel</SidebarLabel>
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
    active ? "bg-blue/[0.14] font-semibold text-white" : "text-muted hover:bg-white/[0.05] hover:text-white",
  );
  const inner = (
    <>
      <span className={cn("grid shrink-0 place-items-center", active ? "text-blue-light" : "text-faint")}>{icon}</span>
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
      <span aria-hidden className="absolute -inset-1.5 rounded-full bg-blue/30 opacity-70 blur-md transition-opacity group-hover:opacity-100" />
      <Avatar seed={creator.avatarColor ?? "#2a2a2a"} src={creator.avatarUrl} size={42} ring="#0091FF" className="relative" />
      <span className="absolute -right-1 -top-1 z-10 flex size-[15px] items-center justify-center rounded-full border-2 border-surface-2 bg-blue text-white shadow-[0_2px_8px_rgba(0,145,255,.5)]">
        <Crown className="size-[8px] fill-current" />
      </span>
    </Link>
  );
}

function OwnedChannelRow({ href, name, handle, seed, src }: { href: string; name: string; handle: string; seed: string; src?: string | null }) {
  return (
    <Link
      href={href}
      className="group relative flex items-center gap-2.5 overflow-hidden rounded-[12px] border border-blue/30 bg-gradient-to-r from-blue/[0.13] via-blue/[0.05] to-transparent px-2.5 py-2 transition-colors hover:border-blue/55"
    >
      <span className="relative shrink-0">
        <Avatar seed={seed} src={src} size={32} ring="#0091FF" />
        <span className="absolute -right-1 -top-1 flex size-[14px] items-center justify-center rounded-full border-2 border-surface-2 bg-blue text-white shadow-[0_2px_8px_rgba(0,145,255,.5)]">
          <Crown className="size-[7px] fill-current" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-semibold text-white">{name}</span>
          <span className="shrink-0 rounded bg-blue/25 px-1.5 py-px text-[7.5px] font-bold tracking-[0.06em] text-blue-soft">OWNER</span>
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-faint">@{handle}</span>
      </span>
      <ChevronRight className="size-3.5 shrink-0 text-blue-soft/50 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-soft" />
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
    { id: "overview", label: "Overview", icon: <LayoutGrid className="size-4" />, href: "/dashboard" },
    { id: "streams", label: "Streams", icon: <Tv className="size-4" />, href: "/dashboard/streams" },
    { id: "store", label: "Store", icon: <ShoppingBag className="size-4" />, href: "/dashboard/store" },
    { id: "money", label: "Monetization", icon: <HandCoins className="size-4" />, href: "/dashboard/monetization" },
    { id: "stats", label: "Analytics", icon: <BarChart3 className="size-4" />, href: "/dashboard/analytics" },
    { id: "chat", label: "Chat", icon: <MessageSquare className="size-4" />, href: "/dashboard/chat" },
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
                ? collapsed ? "font-semibold text-blue-light hover:bg-white/[0.05]" : "bg-blue/[0.14] font-semibold text-white"
                : "text-muted hover:bg-white/[0.05] hover:text-white",
            )}
          >
            <span className={active === it.id ? "text-blue-light" : "text-faint"}>{it.icon}</span>
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
      className="grid size-8 place-items-center rounded-[10px] border border-white/12 bg-white/[0.035] text-ink-dim transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/60"
    >
      <PanelLeftOpen className="size-[17px]" />
    </button>
  );
}

export function CreatorBottomNav() {
  const path = usePathname();
  const items = [
    { label: "Home", icon: <LayoutGrid className="size-[18px]" />, href: "/dashboard" },
    { label: "Streams", icon: <Tv className="size-[18px]" />, href: "/dashboard/streams" },
    { label: "Money", icon: <HandCoins className="size-[18px]" />, href: "/dashboard/monetization" },
    { label: "Stats", icon: <BarChart3 className="size-[18px]" />, href: "/dashboard/analytics" },
  ];
  return (
    <div className="flex h-[58px] shrink-0 items-center border-t border-white/[0.06] bg-surface-2 pt-1">
      {items.map((it) => {
        const active = path === it.href;
        return (
          <Link key={it.label} href={it.href} className={cn("flex flex-1 flex-col items-center gap-[3px]", active ? "text-blue" : "text-faint")}>
            {it.icon}
            <span className="text-[9px] font-semibold">{it.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function ViewerTabBar() {
  const path = usePathname();
  const router = useRouter();
  const openWallet = useSession((s) => s.openWallet);

  function onWallet() {
    if (!useSession.getState().user) router.push(buildAuthHref({ role: "viewer", next: "/wallet" }));
    else openWallet();
  }

  const links = [
    { label: "Explore", icon: <Compass className="size-[19px]" />, href: "/explore" },
    { label: "Following", icon: <Heart className="size-[19px]" />, href: "/explore" },
  ];
  return (
    <div className="flex h-[62px] shrink-0 items-center border-t border-white/[0.06] bg-surface-2 pt-1">
      {links.map((it) => {
        const active = path === it.href;
        return (
          <Link key={it.label} href={it.href} className={cn("flex flex-1 flex-col items-center gap-[3px]", active ? "text-blue" : "text-faint")}>
            {it.icon}
            <span className="text-[9px] font-semibold">{it.label}</span>
          </Link>
        );
      })}
      <button onClick={onWallet} className="flex flex-1 flex-col items-center gap-[3px] text-faint hover:text-white">
        <User className="size-[19px]" />
        <span className="text-[9px] font-semibold">You</span>
      </button>
    </div>
  );
}
