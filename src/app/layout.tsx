import type { Metadata, Viewport } from "next";
import { Funnel_Display, Host_Grotesk } from "next/font/google";
import Script from "next/script";
import { Providers } from "./providers";
import { extensionHydrationAttributeCleanupScript } from "@/lib/hydration";
import "./globals.css";

const funnel = Funnel_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-funnel",
  display: "swap",
});

const host = Host_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-host",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TVinBio — Your Audience. Your Platform. Your Revenue.",
  description:
    "A creator-owned streaming platform that lives behind a single bio link. Live, video, store, community — owned by the creator.",
  applicationName: "TVinBio",
  manifest: "/site.webmanifest",
  appleWebApp: {
    capable: true,
    title: "TVinBio",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#060606",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${funnel.variable} ${host.variable}`}>
      <body suppressHydrationWarning>
        <Script
          id="extension-hydration-attribute-cleanup"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: extensionHydrationAttributeCleanupScript }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
