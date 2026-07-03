import { ImageResponse } from "next/og";

// App icon (favicon + PWA 192/512 fallback). Rendered, no binary asset needed.
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
          background: "linear-gradient(150deg,#0b1830,#060606 78%)",
          color: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 300,
            height: 300,
            borderRadius: 72,
            background: "linear-gradient(140deg,#33a8ff,#0091ff 60%,#0060c0)",
            boxShadow: "0 20px 60px rgba(0,145,255,.5)",
            fontSize: 150,
            fontWeight: 800,
            letterSpacing: -6,
          }}
        >
          TV
        </div>
      </div>
    ),
    { ...size },
  );
}
