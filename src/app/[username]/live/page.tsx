import { notFound, redirect } from "next/navigation";
import { getCreatorByUsername, getCreatorLiveStream, getChatMessages, getFeaturedProducts } from "@/lib/data";
import { LiveWatch } from "@/components/watch/LiveWatch";

export default async function LivePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const creator = await getCreatorByUsername(username);
  if (!creator) notFound();
  const stream = await getCreatorLiveStream(creator.creatorId);
  // Not live (or ended) → send viewers to the channel rather than a dead 404.
  if (!stream) redirect(`/${creator.username}`);

  const [chat, featured] = await Promise.all([
    getChatMessages(stream.playbackId),
    getFeaturedProducts(stream.playbackId),
  ]);

  return <LiveWatch creator={creator} stream={stream} initialChat={chat} featured={featured} />;
}
