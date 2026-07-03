"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { Thumb } from "@/components/ui/Media";
import { Avatar } from "@/components/ui/Media";
import { GateBadge } from "@/components/ui/Badges";
import { formatCount } from "@/lib/cn";
import type { Video, Product, Stream, Creator } from "@/lib/types";

function dur(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function shortDate(iso: string) {
  // Pin the timezone so server (UTC) and client (local TZ) format the same
  // calendar day — otherwise dates near midnight cause a hydration mismatch.
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function VideoCard({ video, href, onClick }: { video: Video; href?: string; onClick?: () => void }) {
  const inner = (
    <div className="group cursor-pointer" onClick={onClick}>
      <div className="relative aspect-[16/10] overflow-hidden rounded-[14px] border border-white/[0.06] bg-[#0e0e0e]">
        <Thumb seed={video.thumbColor} src={video.thumbnailUrl} radial />
        <span className="absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/35 text-white shadow-[0_10px_30px_rgba(0,0,0,.35)] backdrop-blur-sm transition-transform group-hover:scale-105">
          <Play className="ml-0.5 size-4 fill-white" />
        </span>
        <span className="absolute bottom-2.5 left-2.5 rounded-md bg-black/60 px-2 py-[3px] text-[10px] font-semibold text-ink-dim">
          {formatCount(video.views)} views
        </span>
        <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/60 px-2 py-[3px] text-[10px] font-semibold text-ink-dim">
          {dur(video.durationSec)}
        </span>
      </div>
      <div className="px-0.5 pt-2.5">
        <div className="text-[14.5px] font-semibold text-ink-soft">{video.title}</div>
        <div className="mt-1.5 text-[11.5px] text-faint">{shortDate(video.publishedAt)}</div>
        <div className="mt-2"><GateBadge viewMode={video.viewMode} amount={video.amount} /></div>
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function ProductCard({ product, onClick }: { product: Product; onClick?: () => void }) {
  return (
    <div className="group cursor-pointer" onClick={onClick}>
      <div className="relative aspect-square overflow-hidden rounded-[14px] border border-white/[0.06] bg-[#0e0e0e]">
        <Thumb seed={product.imageColor} src={product.imageUrl} />
        {product.subsOnly && (
          <span className="absolute left-2.5 top-2.5 rounded-[5px] bg-blue/90 px-2 py-0.5 text-[8.5px] font-bold tracking-[0.04em] text-white">
            SUBS ONLY
          </span>
        )}
        {product.status === "sold_out" && (
          <span className="absolute inset-0 grid place-items-center bg-black/55 text-[10px] font-bold tracking-[0.12em] text-white">
            SOLD OUT
          </span>
        )}
      </div>
      <div className="mt-2.5 text-[12.5px] font-semibold">{product.name}</div>
      <div className="mt-1 font-display text-[15px] font-bold">${product.price}</div>
    </div>
  );
}

export function LiveCard({ stream, creator }: { stream: Stream; creator: Creator }) {
  return (
    <Link href={`/${creator.username}`} className="group block">
      <div className="relative aspect-[16/10] overflow-hidden rounded-[13px] border border-white/[0.06] bg-[#0e0e0e]">
        <Thumb seed={stream.thumbColor} src={creator.headerUrl ?? creator.avatarUrl} radial />
        <span className="absolute left-2 top-2"><LiveBadgeMini /></span>
        <span className="absolute bottom-2 right-2 rounded-[5px] bg-black/60 px-1.5 py-0.5 text-[9.5px] font-semibold text-ink-dim">
          {formatCount(stream.viewerCount)}
        </span>
      </div>
      <div className="mt-2.5 flex gap-2.5">
        <Avatar seed={creator.avatarColor} src={creator.avatarUrl} size={26} />
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">{stream.title}</div>
          <div className="mt-0.5 text-[10.5px] text-faint">{creator.displayName}</div>
        </div>
      </div>
    </Link>
  );
}

export function CreatorCard({ creator }: { creator: Creator }) {
  return (
    <Link href={`/${creator.username}`} className="group block">
      <div className="relative aspect-[16/11] overflow-hidden rounded-[13px] border border-white/[0.06] bg-[#0e0e0e]">
        <Thumb seed={creator.avatarColor} src={creator.headerUrl ?? creator.avatarUrl} />
        <div className="absolute inset-x-2 bottom-2 flex items-center gap-2 rounded-[10px] bg-black/45 p-2 backdrop-blur-sm">
          <Avatar seed={creator.avatarColor} src={creator.avatarUrl} size={28} />
          <div className="min-w-0">
            <div className="truncate text-[11.5px] font-semibold text-white">{creator.displayName}</div>
            <div className="truncate text-[9.5px] text-white/60">@{creator.username}</div>
          </div>
        </div>
      </div>
      <div className="mt-2 text-xs font-semibold">{creator.displayName}</div>
      <div className="mt-0.5 text-[10.5px] text-faint">{formatCount(creator.subscriberCount)} subscribers</div>
    </Link>
  );
}

function LiveBadgeMini() {
  return (
    <span className="rounded-[5px] bg-live px-[7px] py-0.5 text-[8.5px] font-extrabold text-white">LIVE</span>
  );
}
