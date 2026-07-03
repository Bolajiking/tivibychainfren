import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline · TVinBio" };

export default function Offline() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-blue-light">
        <WifiOff className="size-6" />
      </div>
      <h1 className="mt-5 font-display text-[22px] font-semibold tracking-[-0.02em] text-white">You&apos;re offline</h1>
      <p className="mt-2 max-w-[300px] text-[13px] leading-relaxed text-muted">
        TVinBio needs a connection for live video and chat. Reconnect and this page will pick right back up.
      </p>
    </div>
  );
}
