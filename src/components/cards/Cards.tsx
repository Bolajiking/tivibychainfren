"use client";

import Link from "next/link";
import { Thumb, Avatar } from "@/components/ui/Media";
import { GateBadge, LivePill, ReplayPill } from "@/components/ui/Badges";
import { resolveCreatorAccent } from "@/lib/creator-theme";
import { formatCount } from "@/lib/cn";
import type { Video, Product, Stream, Creator } from "@/lib/types";

function duration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}

function shortDate(iso: string) {
  // Pin the timezone so server (UTC) and client (local TZ) format the same
  // calendar day — otherwise dates near midnight cause a hydration mismatch.
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Media cards (Package 3). Metadata always sits on a bottom scrim, never in a
 * box; duration and counts are receipt layer; radius 12–14.
 */
export function VideoCard({ video, href, onClick }: { video: Video; href?: string; onClick?: () => void }) {
  const inner = (
    <div className="group tap cursor-pointer" onClick={onClick}>
      <div className="img-outline relative aspect-video overflow-hidden rounded-[12px] border border-white/[0.06] bg-surface-2">
        <Thumb seed={video.thumbColor} src={video.thumbnailUrl} radial />
        <span className="scrim-bottom absolute inset-x-0 bottom-0 h-[62%]" />
        <span className="absolute left-2.5 top-2.5">
          <ReplayPill small />
        </span>
        <span className="receipt absolute bottom-2.5 right-2.5 rounded-[6px] bg-black/65 px-1.5 py-[3px] text-[10px] text-ink-soft">
          {duration(video.durationSec)}
        </span>
      </div>
      <div className="pt-2.5">
        <div className="line-clamp-1 text-[14px] font-medium text-ink-soft">{video.title}</div>
        <div className="receipt mt-1 text-[11.5px] text-faint">
          {formatCount(video.views)} views · {shortDate(video.publishedAt)}
        </div>
        {video.viewMode !== "free" && (
          <div className="mt-2">
            <GateBadge viewMode={video.viewMode} amount={video.amount} />
          </div>
        )}
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function ProductCard({ product, onClick }: { product: Product; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="group tap block w-full text-left">
      <div className="img-outline relative aspect-square overflow-hidden rounded-[14px] border border-white/[0.06] bg-surface-2">
        <Thumb seed={product.imageColor} src={product.imageUrl} />
        {product.subsOnly && (
          <span className="absolute left-2.5 top-2.5 rounded-full border border-beam/45 bg-beam/[0.12] px-2.5 py-1 text-[9px] font-semibold tracking-[0.12em] text-beam-soft">
            SUBSCRIBERS
          </span>
        )}
        {product.status === "sold_out" && (
          <span className="absolute inset-0 grid place-items-center bg-black/60 text-[10px] font-semibold tracking-[0.12em] text-ink-soft">
            SOLD OUT
          </span>
        )}
      </div>
      <div className="mt-2.5 line-clamp-1 text-[12.5px] font-medium text-ink-soft">{product.name}</div>
      <div className="receipt mt-1 text-[13px] text-muted">${product.price.toFixed(2)}</div>
    </button>
  );
}

/**
 * The "what's on" tile. Creator identity leads every tile — the platform is
 * showing you people, not content slots.
 */
export function LiveCard({ stream, creator, wide }: { stream: Stream; creator: Creator; wide?: boolean }) {
  const accent = resolveCreatorAccent(creator.accentColor);
  return (
    <Link href={`/${creator.username}`} className="group tap block">
      <div
        className={`img-outline relative overflow-hidden rounded-[12px] border border-white/[0.06] bg-surface-2 ${wide ? "aspect-[16/8]" : "aspect-video"}`}
      >
        <Thumb seed={stream.thumbColor} src={creator.headerUrl ?? creator.avatarUrl} radial />
        <span className="scrim-bottom absolute inset-x-0 bottom-0 h-[70%]" />
        <span className="absolute left-2.5 top-2.5">
          <LivePill small />
        </span>
        <div className="absolute inset-x-2.5 bottom-2.5">
          <div className="line-clamp-1 text-[13px] font-semibold text-white">
            {creator.displayName} — {stream.title}
          </div>
          <div className="receipt mt-1 text-[10px] text-ink-dim">
            {formatCount(stream.viewerCount)} watching · tvin.bio/{creator.username}
          </div>
        </div>
      </div>
      {!wide && (
        <div className="mt-2.5 flex items-center gap-2.5">
          <Avatar seed={creator.avatarColor} src={creator.avatarUrl} size={26} ring={accent.accent} />
          <span className="min-w-0 truncate text-[12px] text-ink-dim">{creator.displayName}</span>
        </div>
      )}
    </Link>
  );
}

/** Featured channel — avatar-led, accent-ringed, schedule underneath. */
export function CreatorCard({ creator, status }: { creator: Creator; status?: string }) {
  const accent = resolveCreatorAccent(creator.accentColor);
  return (
    <Link
      href={`/${creator.username}`}
      className="tap flex flex-col items-center gap-2 rounded-[14px] border border-white/[0.08] bg-surface-2 p-3 text-center transition-colors hover:border-white/[0.16]"
    >
      <Avatar seed={creator.avatarColor} src={creator.avatarUrl} size={44} ring={accent.accent} />
      <div className="line-clamp-1 text-[12px] font-medium text-ink-soft">{creator.displayName}</div>
      <div className="receipt text-[9.5px] text-faint">
        {status ?? `${formatCount(creator.subscriberCount)} fans`}
      </div>
    </Link>
  );
}
