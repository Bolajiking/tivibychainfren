import { notFound } from "next/navigation";
import {
  getCreatorByUsername,
  getCreatorLiveStream,
  getCreatorStream,
  getVideosByCreator,
  getProductsByChannel,
  getFeaturedProducts,
  getChatMessages,
} from "@/lib/data";
import { ChannelLanding } from "@/components/channel/ChannelLanding";
import { LiveWatch } from "@/components/watch/LiveWatch";

/**
 * F1 — the money flow. A bio tap lands here and the page branches on one fact:
 *
 *   live  → the fan joins the stream in progress, on this URL. The address they
 *           tapped is the address they stay on; nothing interrupts the first
 *           30 seconds of watching.
 *   idle  → the bento landing: who this is, what's next, what's for sale.
 *
 * There is no platform sidebar on a creator page. The creator's brand leads and
 * TVinBio is one idle mark in the footer.
 */
export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams?: Promise<{ view?: string }>;
}) {
  const { username } = await params;
  // "?view=channel" is the escape hatch out of a running stage back to the
  // bento landing — the store and replays stay reachable mid-stream.
  const wantsChannel = (await searchParams)?.view === "channel";
  const creator = await getCreatorByUsername(username);
  if (!creator) notFound();

  const [liveStream, defaultStream, videos] = await Promise.all([
    getCreatorLiveStream(creator.creatorId),
    getCreatorStream(creator.creatorId),
    getVideosByCreator(creator.creatorId),
  ]);
  const stream = liveStream ?? defaultStream;

  if (liveStream && !wantsChannel) {
    // Join in progress — the stage owns the viewport.
    const [chat, featured] = await Promise.all([
      getChatMessages(liveStream.playbackId),
      getFeaturedProducts(liveStream.playbackId),
    ]);
    return <LiveWatch creator={creator} stream={liveStream} initialChat={chat} featured={featured} />;
  }

  const products = stream ? await getProductsByChannel(stream.playbackId) : [];

  return <ChannelLanding creator={creator} stream={stream} videos={videos} products={products} />;
}
