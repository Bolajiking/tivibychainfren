import type { Metadata } from "next";
import { getCreatorByUsername } from "@/lib/data";

// Every creator surface (channel, /live, /video) is installable as *that
// channel*: its own manifest, its avatar as the home-screen icon, and a
// standalone title. Falls back to the app defaults when the channel is unknown.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const creator = await getCreatorByUsername(username);
  if (!creator) return {};

  const iconBase = `/api/pwa/${creator.username}/icon`;
  return {
    title: `${creator.displayName} · TVinBio`,
    manifest: `/api/pwa/${creator.username}/manifest`,
    appleWebApp: {
      capable: true,
      title: creator.displayName,
      statusBarStyle: "black-translucent",
    },
    icons: {
      icon: [{ url: `${iconBase}?size=192`, sizes: "192x192", type: "image/png" }],
      apple: [{ url: `${iconBase}?size=180`, sizes: "180x180", type: "image/png" }],
    },
  };
}

export default function ChannelLayout({ children }: { children: React.ReactNode }) {
  return children;
}
