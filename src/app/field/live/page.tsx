import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveFieldBroadcaster } from "@/components/field/LiveFieldBroadcaster";
import {
  authorizeLiveFieldRequest,
  readLiveFieldConfig,
  toLiveFieldPublicConfig,
} from "@/lib/livepeer/field";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browser live field check | TVinBio",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function LiveFieldPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;
  const config = readLiveFieldConfig(process.env);
  if (!authorizeLiveFieldRequest(config, token, config?.streamId)) notFound();

  const publicConfig = toLiveFieldPublicConfig(config);
  if (!publicConfig) notFound();
  return <LiveFieldBroadcaster config={publicConfig} />;
}
