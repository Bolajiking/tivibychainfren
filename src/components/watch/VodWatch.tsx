"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, Play, Lock, HandCoins, MessageCircle, Send, Loader2, ShoppingBag } from "lucide-react";
import { Avatar } from "@/components/ui/Media";
import { Button } from "@/components/ui/Button";
import { GateBadge } from "@/components/ui/Badges";
import { UnlockGate } from "@/components/money/UnlockGate";
import { TipSheet } from "@/components/money/TipSheet";
import { PurchaseSheet } from "@/components/money/PurchaseSheet";
import { ProductCard } from "@/components/cards/Cards";
import { Player } from "@/components/watch/Player";
import { useSession } from "@/lib/store/session";
import { useAuthIntent } from "@/lib/auth/useAuthIntent";
import { hasAccess } from "@/lib/access";
import { formatCount } from "@/lib/cn";
import { normalizeChatText } from "@/lib/realtime-state";
import { postVideoComment } from "@/lib/video-client";
import type { Creator, Video, VodComment, Product } from "@/lib/types";

export function VodWatch({ creator, video, initialComments, products }: { creator: Creator; video: Video; initialComments: VodComment[]; products: Product[] }) {
  const { user, requireAuth, getAuthedUser } = useAuthIntent("viewer");
  const { isSubscribed, subscribe, isUnlocked } = useSession();
  const [gateOpen, setGateOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [buy, setBuy] = useState<Product | null>(null);
  const [comments, setComments] = useState(initialComments);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);

  const wallets = user?.walletAddresses ?? [];
  const subscribed = isSubscribed(creator.creatorId);
  const unlocked = isUnlocked(`video_access_${video.playbackId}`) || isUnlocked(`creator_access_${creator.creatorId}`);
  const gated = video.viewMode !== "free";
  const locked = gated && !subscribed && !unlocked && !hasAccess({ resource: video, wallets });

  useEffect(() => { if (locked) setGateOpen(true); }, [locked]);
  const activeProducts = products.filter((p) => p.status === "active");
  const normalizedComment = normalizeChatText(commentText);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normalizedComment || posting) return;
    if (!requireAuth({ role: "viewer" })) return;
    const activeUser = getAuthedUser();
    if (!activeUser) return;

    setPosting(true);
    try {
      const comment = await postVideoComment(video.playbackId, {
        message: normalizedComment,
        sender: activeUser.displayName,
        walletAddress: activeUser.walletAddress,
      });
      setComments((current) => [...current, comment]);
      setCommentText("");
    } catch {
      toast.error("Comment failed to post");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-[900px] bg-canvas px-4 pb-16 pt-4">
      <Link href={`/${creator.username}`} className="mb-4 inline-flex size-9 items-center justify-center rounded-full bg-white/[0.06] text-ink-dim">
        <ChevronLeft className="size-[18px]" />
      </Link>

      <div className="relative aspect-video overflow-hidden rounded-[18px] border border-white/[0.08]"
        style={{ background: `radial-gradient(80% 80% at 50% 40%,${video.thumbColor},#0a0a0c)` }}>
        {video.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" />
        )}
        {locked ? (
          <>
            <div className="absolute inset-0 backdrop-blur-[3px]" style={{ background: "rgba(4,4,6,.55)" }} />
            <button onClick={() => setGateOpen(true)} className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <span className="flex size-14 items-center justify-center rounded-[16px] border border-white/[0.14] bg-white/[0.06] text-ink-dim"><Lock className="size-6" /></span>
              <span className="text-xs font-semibold text-ink-dim">Unlock to watch the full replay</span>
            </button>
          </>
        ) : (
          <Player playbackId={video.livepeerPlaybackId ?? video.playbackId} mode="vod" className="absolute inset-0 size-full">
            <button onClick={() => toast("Playing…")} className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <span className="flex size-[72px] items-center justify-center rounded-full border border-white/25 bg-white/[0.14] backdrop-blur"><Play className="ml-1 size-7 fill-white text-white" /></span>
            </button>
          </Player>
        )}
      </div>

      <div className="mt-4">
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.01em]">{video.title}</h1>
        <div className="mt-2 flex items-center gap-2.5 text-[12px] text-faint">
          <span>{formatCount(video.views)} views</span>
          <span className="size-[3px] rounded-full bg-ghost" />
          <span>{new Date(video.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</span>
          <GateBadge viewMode={video.viewMode} amount={video.amount} />
        </div>

        <div className="mt-4 flex items-center gap-3 border-t border-white/[0.06] pt-4">
          <Avatar seed={creator.avatarColor} src={creator.avatarUrl} size={44} />
          <div className="flex-1">
            <div className="text-sm font-semibold">{creator.displayName}</div>
          <div className="text-[11.5px] text-faint">{formatCount(creator.subscriberCount)} subscribers</div>
          </div>
          <Button size="pill" variant={subscribed ? "secondary" : "primary"} onClick={() => { if (!requireAuth({ role: "viewer" })) return; subscribed || subscribe(creator.creatorId, { creatorId: creator.creatorId, username: creator.username, displayName: creator.displayName, avatarColor: creator.avatarColor, avatarUrl: creator.avatarUrl }); }}>
            {subscribed ? "Subscribed" : "Subscribe"}
          </Button>
          <Button size="pill" variant="secondary" onClick={() => { if (requireAuth({ role: "viewer" })) setTipOpen(true); }}><HandCoins className="size-4" /> Tip</Button>
        </div>
      </div>

      {activeProducts.length > 0 && (
        <section className="mt-6 rounded-[18px] border border-white/[0.07] bg-raised p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-dim">
              <ShoppingBag className="size-4 text-blue-light" /> Shop this replay
            </div>
            <span className="text-[10.5px] text-faint">{activeProducts.length} {activeProducts.length === 1 ? "item" : "items"}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {activeProducts.slice(0, 6).map((product) => (
              <ProductCard key={product.id} product={product} onClick={() => setBuy(product)} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 rounded-[18px] border border-white/[0.07] bg-raised p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-dim">
            <MessageCircle className="size-4 text-blue-light" /> Comments
          </div>
          <span className="text-[10.5px] text-faint">{comments.length}</span>
        </div>

        <form onSubmit={submitComment} className="flex gap-2">
          <input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onFocus={() => requireAuth({ role: "viewer" })}
            placeholder={user ? "Add a thoughtful comment…" : "Sign in to comment"}
            className="h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.05] px-4 text-[12.5px] text-white placeholder:text-faint focus:border-blue focus:outline-none"
          />
          <button
            type="submit"
            disabled={!normalizedComment || posting}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-blue text-white transition hover:bg-blue-light disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Post comment"
          >
            {posting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-3">
          {comments.length ? (
            comments.slice(-12).map((comment) => <CommentRow key={comment.id} comment={comment} />)
          ) : (
            <div className="rounded-[14px] border border-dashed border-white/10 py-8 text-center text-[12px] text-faint">
              No comments yet. Start the replay conversation.
            </div>
          )}
        </div>
      </section>

      <UnlockGate
        open={gateOpen}
        onOpenChange={setGateOpen}
        creatorName={creator.displayName}
        recipient={creator.creatorId}
        contextLabel={`${creator.displayName} · ${video.title}`}
        oneTimeAmount={video.viewMode === "one-time" ? video.amount : 7}
        monthlyAmount={9}
        unlockKeys={{
          "one-time": [`video_access_${video.playbackId}`],
          monthly: [`creator_access_${creator.creatorId}`],
        }}
        resource={{ kind: "video", playbackId: video.playbackId }}
        onUnlocked={(door) => { if (door === "monthly") subscribe(creator.creatorId, { creatorId: creator.creatorId, username: creator.username, displayName: creator.displayName, avatarColor: creator.avatarColor, avatarUrl: creator.avatarUrl }); }}
      />
      <TipSheet open={tipOpen} onOpenChange={setTipOpen} creatorName={creator.displayName} recipient={creator.creatorId} presets={[1, 5, 10, 20]} avatarSeed={creator.avatarColor} onSent={() => toast.success("Tip sent")} />
      <PurchaseSheet product={buy} open={!!buy} onOpenChange={(v) => !v && setBuy(null)} />
    </div>
  );
}

function CommentRow({ comment }: { comment: VodComment }) {
  return (
    <div className="flex gap-3 rounded-[14px] bg-white/[0.035] p-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue/[0.16] text-[11px] font-bold text-blue-light">
        {comment.sender.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[12px] font-semibold text-ink-soft">{comment.sender}</span>
          <span className="text-[10px] text-faint">{relativeTime(comment.timestamp)}</span>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{comment.message}</p>
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
