"use client";

import { useRouter } from "next/navigation";
import { OwnerToggle } from "@/components/nav/OwnerToggle";

export function OwnerToggleStatic({ username }: { username?: string }) {
  const router = useRouter();
  // "View as public" jumps to the channel's public surface — but only once we
  // know which channel (no bogus fallback while the profile is still loading).
  return <OwnerToggle mode="manage" onChange={(m) => m === "public" && username && router.push(`/${username}`)} />;
}
