"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/lib/store/session";

/**
 * Landing call-to-action. One channel per account: a signed-in creator is sent
 * to their dashboard and never offered "Claim your channel" again; everyone else
 * gets the claim flow.
 */
export function ClaimCta({ size = "lg", arrow, variant }: { size?: "sm" | "lg"; arrow?: boolean; variant?: "ghost" | "secondary" }) {
  const creator = useSession((s) => s.creator);
  const href = creator ? "/dashboard" : "/onboarding";
  const label = creator ? "Your dashboard" : "Claim your channel";
  return (
    <Button asChild size={size} variant={variant}>
      <Link href={href}>
        {label}
        {arrow && <ArrowRight className="size-4" />}
      </Link>
    </Button>
  );
}
