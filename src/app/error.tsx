"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";

/** Graceful recovery boundary — a thrown render/data error never blanks the app. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 text-center">
      <div className="max-w-[360px] animate-[tvRise_.3s_ease]">
        <Logo size={40} href="" />
        <h1 className="mt-5 font-display text-[22px] font-semibold tracking-[-0.02em]">Something hiccuped</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">That page didn’t load. Try again — it’s usually a blip.</p>
        <div className="mt-5 flex items-center justify-center gap-2.5">
          <Button size="lg" onClick={reset}>Try again</Button>
          <Button size="lg" variant="secondary" asChild><Link href="/explore">Explore</Link></Button>
        </div>
      </div>
    </main>
  );
}
