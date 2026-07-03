import { cn } from "@/lib/cn";

/** Avatar — real channel image when `src` is set, else gradient placeholder. */
export function Avatar({
  seed = "#2b2b2b",
  src,
  size = 44,
  ring,
  live,
  className,
}: {
  seed?: string;
  src?: string | null;
  size?: number;
  ring?: string;
  live?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${seed}, #141414)`,
        border: ring ? `2px solid ${ring}` : undefined,
      }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      )}
      {live && (
        <span
          className="absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-surface-2"
          style={{ width: size * 0.25, height: size * 0.25, background: "#ef4444" }}
        />
      )}
    </div>
  );
}

/** Rounded-square channel/brand tile — real image when `src` is set. */
export function Tile({ seed = "#2b2b2b", src, size = 46, radius = 14 }: { seed?: string; src?: string | null; size?: number; radius?: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden border border-white/[0.12]"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(140deg, ${seed}, #0f0f0f)`,
      }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      )}
    </div>
  );
}

/** Gradient thumbnail with hover-zoom (cards). */
export function Thumb({
  seed = "#1c2230",
  src,
  radial,
  className,
}: {
  seed?: string;
  src?: string | null;
  radial?: boolean;
  className?: string;
}) {
  const bg = radial
    ? `radial-gradient(80% 80% at 50% 40%, ${seed}, #0a0a0c)`
    : `linear-gradient(160deg, ${seed}, #0d0d0c)`;
  return (
    <div className={cn("absolute inset-0 transition-transform duration-[400ms] ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.03]", className)} style={{ background: bg }}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      )}
    </div>
  );
}
