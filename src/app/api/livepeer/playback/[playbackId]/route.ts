import { NextResponse } from "next/server";
import { getPlaybackInfo } from "@/lib/livepeer/playback";

/**
 * Public, secret-free playback resolver. Returns a discriminated state the
 * player can switch on. The LIVEPEER_API_KEY stays server-side; the browser
 * only ever sees an HLS URL (or a non-ready status).
 */
export async function GET(req: Request, ctx: { params: Promise<{ playbackId: string }> }) {
  const { playbackId } = await ctx.params;
  const modeParam = new URL(req.url).searchParams.get("mode");
  const mode = modeParam === "live" ? "live" : "vod";
  const info = await getPlaybackInfo(String(playbackId ?? ""), { mode });
  // not_found is a real state, not an error — still 200 so the player can render it.
  return NextResponse.json(info, { headers: { "cache-control": "no-store" } });
}
