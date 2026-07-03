import { notFound } from "next/navigation";
import {
  getCreatorByUsername,
  getCreatorLiveStream,
  getCreatorStream,
  getVideosByCreator,
  getProductsByChannel,
  getFeaturedProducts,
} from "@/lib/data";
import { Sidebar } from "@/components/nav/Rails";
import { ChannelExperience } from "@/components/channel/ChannelExperience";

export default async function ChannelPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const creator = await getCreatorByUsername(username);
  if (!creator) notFound();

  // Fetch the independent resources in parallel (was 5 sequential round-trips).
  const [liveStream, defaultStream, videos] = await Promise.all([
    getCreatorLiveStream(creator.creatorId),
    getCreatorStream(creator.creatorId),
    getVideosByCreator(creator.creatorId),
  ]);
  const stream = liveStream ?? defaultStream;
  const [products, featured] = stream
    ? await Promise.all([getProductsByChannel(stream.playbackId), getFeaturedProducts(stream.playbackId)])
    : [[], []];

  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <main className="flex-1">
        <ChannelExperience
          creator={creator}
          stream={stream}
          videos={videos}
          products={products}
          featured={featured}
        />
      </main>
    </div>
  );
}
