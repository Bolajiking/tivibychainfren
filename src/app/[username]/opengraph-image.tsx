import { ImageResponse } from "next/og";
import { getCreatorByUsername, getCreatorLiveStream } from "@/lib/data";

// Live-aware creator OG card (framework §11.1) — the real front door: by the
// time a fan taps the bio link, this card already made the first impression.
// Speaks as the creator; creator accent appears as ambient light only.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default async function OgImage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const creator = await getCreatorByUsername(username).catch(() => null);
  const live = creator
    ? await getCreatorLiveStream(creator.creatorId).catch(() => null)
    : null;
  const isLive = Boolean(live?.isActive);
  const accent = creator?.avatarColor ?? "#40ACFF";
  const name = creator?.displayName ?? "TVinBio";
  const title = isLive
    ? live?.title ?? "Live now"
    : creator?.bio ?? "Live, video, store — one link they own.";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 56,
          background: `radial-gradient(90% 90% at 85% 15%, ${accent}24, transparent 60%), #060606`,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 104,
              height: 104,
              borderRadius: 999,
              background: creator?.avatarUrl ? "transparent" : `linear-gradient(135deg, ${accent}, #101014)`,
              border: `4px solid ${accent}`,
              display: "flex",
              overflow: "hidden",
            }}
          >
            {creator?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creator.avatarUrl} alt="" width={104} height={104} style={{ objectFit: "cover" }} />
            ) : null}
          </div>
          {isLive ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                background: "rgba(239,68,68,0.92)",
                borderRadius: 999,
                padding: "12px 28px",
                color: "#ffffff",
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "0.12em",
              }}
            >
              <div style={{ width: 14, height: 14, borderRadius: 999, background: "#ffffff", display: "flex" }} />
              LIVE NOW
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 68, fontWeight: 600, color: "#ffffff", letterSpacing: "-0.02em", lineHeight: 1.02 }}>
            {isLive ? `${name} is live` : name}
          </div>
          <div style={{ fontSize: 32, color: "#cfcfd4" }}>{title}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 28, color: "#9FD3FF", fontFamily: "monospace" }}>tvin.bio/{username}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#7a7a82" }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4.5" width="18" height="15" rx="4.5" stroke="#7a7a82" strokeWidth="2" />
              <circle cx="12" cy="12" r="2.4" fill={isLive ? "#EF4444" : "#7a7a82"} />
            </svg>
            <div style={{ fontSize: 24 }}>TVinBio</div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
