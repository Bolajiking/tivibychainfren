import { ImageResponse } from "next/og";

// App icon (favicon + PWA 192/512 fallback) — the Viewport mark at 60% on
// canvas #060606 (Identity Package 1 export matrix). Rendered, no binary asset.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
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
        <svg width={307} height={307} viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4.5" width="18" height="15" rx="4.5" stroke="#f0f0f2" strokeWidth="2" />
          <circle cx="12" cy="12" r="2.4" fill="#f0f0f2" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
