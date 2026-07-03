import Link from "next/link";

const LIVE_GRADIENT = "linear-gradient(100deg,#40ACFF,#40CBFF 46%,#3FFFC6)";

export function Logo({ size = 32, withWordmark = false, href = "/explore" }: { size?: number; withWordmark?: boolean; href?: string }) {
  const content = withWordmark ? <Wordmark fontSize={Math.round(size * 0.68)} /> : <Icon size={size} />;
  return href ? (
    <Link href={href} className="inline-flex items-center" aria-label="TVinBio">
      {content}
    </Link>
  ) : (
    content
  );
}

function Wordmark({ fontSize = 22 }: { fontSize?: number }) {
  return (
    <span
      className="font-display inline-flex select-none items-baseline font-semibold leading-none"
      style={{
        fontSize,
        letterSpacing: "-0.04em",
        backgroundImage: LIVE_GRADIENT,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        filter: "drop-shadow(0 4px 16px rgba(64,200,255,.28))",
      }}
    >
      TVin
      <span
        aria-hidden
        style={{
          width: "0.16em",
          height: "0.16em",
          margin: "0 0.13em",
          borderRadius: "0.045em",
          background: "#3FFFC6",
          boxShadow: "0 0 0.5em rgba(63,255,198,.75)",
          alignSelf: "center",
        }}
      />
      bio
    </span>
  );
}

function Icon({ size = 32 }: { size?: number }) {
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden border border-white/[0.08]"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: "#0b0b0e" }}
    >
      <span className="absolute inset-0" style={{ background: "radial-gradient(62% 62% at 50% 44%, rgba(64,200,255,.28), transparent 72%)" }} />
      <span
        className="relative"
        style={{
          width: size * 0.3,
          height: size * 0.3,
          borderRadius: Math.max(2, size * 0.06),
          background: LIVE_GRADIENT,
          boxShadow: `0 0 ${size * 0.28}px rgba(63,255,198,.6)`,
        }}
      />
    </span>
  );
}
