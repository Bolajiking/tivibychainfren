import { notFound } from "next/navigation";
import {
  getCreatorByUsername,
  getCreatorLiveStream,
  getCreatorStream,
  getVideosByCreator,
  getProductsByChannel,
} from "@/lib/data";
import { ChannelLanding } from "@/components/channel/ChannelLanding";

/**
 * F1 — the money flow. A bio tap (or an Explore tap) lands here on the creator's
 * PUBLIC PROFILE, always. When the creator is on air, the profile's header
 * becomes a live banner that opens the dedicated stream at `/{username}/live` on
 * one tap — the fan is never yanked straight into the stream, and the page
 * reverts on its own the moment the stream ends (client-side live polling).
 *
 * There is no platform sidebar on a creator page. The creator's brand leads and
 * TVinBio is one idle mark in the footer.
 */
export default async function ChannelPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const creator = await getCreatorByUsername(username);
  if (!creator) notFound();

  // Seed the page with whatever is canonical now (an active stream if there is
  // one) so the banner is correct on first paint; the client keeps it live.
  const [liveStream, defaultStream, videos] = await Promise.all([
    getCreatorLiveStream(creator.creatorId),
    getCreatorStream(creator.creatorId),
    getVideosByCreator(creator.creatorId),
  ]);
  const stream = liveStream ?? defaultStream;
  const products = stream ? await getProductsByChannel(stream.playbackId) : [];

  return <ChannelLanding creator={creator} stream={stream} videos={videos} products={products} />;
}
