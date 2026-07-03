import { NextResponse } from "next/server";
import { getCreatorByUsername } from "@/lib/data";

// Per-creator PWA manifest. Linked from the channel layout's metadata so
// "Add to Home Screen" on a creator page installs *that channel* — its own
// name, its own icon (the channel avatar), opening straight to /[username].
export async function GET(_req: Request, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const creator = await getCreatorByUsername(username);
  if (!creator) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const start = `/${creator.username}?source=pwa`;
  const iconBase = `/api/pwa/${creator.username}/icon`;

  const manifest = {
    name: `${creator.displayName} · TVinBio`,
    short_name: creator.displayName.slice(0, 30),
    description: creator.bio || `Watch ${creator.displayName} live on TVinBio.`,
    id: `/${creator.username}`,
    start_url: start,
    scope: `/${creator.username}`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#060606",
    theme_color: creator.avatarColor ?? "#0091ff",
    icons: [
      { src: `${iconBase}?size=192`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${iconBase}?size=512`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${iconBase}?size=512&mask=1`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}
