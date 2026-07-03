import { notFound } from "next/navigation";
import { getCreatorByUsername, getVideoByPlaybackId, getVideoComments, getProductsByCreator } from "@/lib/data";
import { VodWatch } from "@/components/watch/VodWatch";

export default async function VideoPage({ params }: { params: Promise<{ username: string; playbackId: string }> }) {
  const { username, playbackId } = await params;
  const creator = await getCreatorByUsername(username);
  if (!creator) notFound();
  const video = await getVideoByPlaybackId(playbackId);
  if (!video || video.creatorId !== creator.creatorId) notFound();
  const [comments, products] = await Promise.all([
    getVideoComments(video.playbackId),
    getProductsByCreator(creator.creatorId),
  ]);

  return <VodWatch creator={creator} video={video} initialComments={comments} products={products} />;
}
