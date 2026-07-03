import { NextResponse } from "next/server";

// Root PWA manifest, served as a plain route (not the `app/manifest` file
// convention) so a channel's `metadata.manifest` can override this link on
// creator pages — the file convention can't be overridden per-route.
export function GET() {
  return NextResponse.json(
    {
      name: "TVinBio — Your Audience. Your Platform.",
      short_name: "TVinBio",
      description:
        "A creator-owned streaming platform that lives behind a single bio link. Live, video, store, community.",
      id: "/",
      start_url: "/?source=pwa",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#060606",
      theme_color: "#060606",
      categories: ["entertainment", "social", "shopping"],
      icons: [
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
