import { ImageResponse } from "next/og";
import { getCreatorByUsername } from "@/lib/data";

// Renders a channel's PWA icon from its avatar (or initials on the channel's
// gradient when no avatar is set). `size` picks the square dimension; `mask=1`
// adds a maskable safe-zone so Android's adaptive icon never clips the face.
export async function GET(req: Request, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const url = new URL(req.url);
  const size = Math.min(1024, Math.max(48, Number(url.searchParams.get("size")) || 512));
  const maskable = url.searchParams.get("mask") === "1";

  const creator = await getCreatorByUsername(username);
  const seed = creator?.avatarColor ?? "#40acff";
  const initials = (creator?.displayName ?? username).trim().slice(0, 2).toUpperCase();
  // Maskable icons keep content inside an ~80% safe zone.
  const inset = maskable ? Math.round(size * 0.1) : 0;
  const inner = size - inset * 2;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(150deg,${seed}33,#060606 78%)`,
        }}
      >
        <div
          style={{
            width: inner,
            height: inner,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            borderRadius: maskable ? inner : Math.round(inner * 0.22),
            background: `linear-gradient(140deg,${seed},#101010)`,
            color: "#fff",
            fontSize: Math.round(inner * 0.42),
            fontWeight: 800,
            letterSpacing: -2,
          }}
        >
          {creator?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={creator.avatarUrl} alt="" width={inner} height={inner} style={{ objectFit: "cover" }} />
          ) : (
            initials
          )}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
