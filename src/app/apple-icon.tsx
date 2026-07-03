import { ImageResponse } from "next/og";

// iOS home-screen icon (rounded corners applied by iOS itself → fill the frame).
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
          background: "linear-gradient(140deg,#33a8ff,#0091ff 60%,#0060c0)",
          color: "#fff",
          fontSize: 96,
          fontWeight: 800,
          letterSpacing: -4,
        }}
      >
        TV
      </div>
    ),
    { ...size },
  );
}
