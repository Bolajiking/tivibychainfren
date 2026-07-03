import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-canvas px-5 text-center">
      <Logo size={44} href="" />
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">This channel isn't here.</h1>
      <p className="max-w-[360px] text-[13px] text-muted">The link may be wrong, or the creator hasn't claimed it yet.</p>
      <Button asChild><Link href="/explore">Explore creators</Link></Button>
    </div>
  );
}
