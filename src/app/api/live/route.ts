import { NextResponse } from "next/server";
import { getLiveStreams, listCreators } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * The current live set for the Explore "What's on" grid. The page renders an
 * initial snapshot server-side; the client polls this so a stream that just
 * went live appears and — the bug this addresses — a stream that ended
 * disappears, without a full reload. Pairs each live stream with its creator so
 * the card can lead with identity.
 */
export async function GET() {
  const [live, creators] = await Promise.all([getLiveStreams(), listCreators()]);
  const byId = new Map(creators.map((creator) => [creator.creatorId, creator]));
  const items = live.flatMap((stream) => {
    const creator = byId.get(stream.creatorId);
    return creator ? [{ stream, creator }] : [];
  });
  return NextResponse.json({ ok: true, items }, { headers: { "cache-control": "no-store" } });
}
