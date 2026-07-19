import { ImageResponse } from "next/og";

// iOS home-screen icon — Viewport mark tile on canvas, no transparency
// (Identity Package 1 export matrix; iOS rounds the corners itself).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#060606",
        }}
      >
        <svg width={108} height={108} viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4.5" width="18" height="15" rx="4.5" stroke="#f0f0f2" strokeWidth="2" />
          <circle cx="12" cy="12" r="2.4" fill="#f0f0f2" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
