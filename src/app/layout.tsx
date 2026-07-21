import type { Metadata, Viewport } from "next";
import { Funnel_Display, Geist_Mono, Host_Grotesk } from "next/font/google";
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

// Receipt layer — every numeral that represents value (tips, prices, counts).
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://tvin.bio"),
  title: "TVinBio — Your Audience. Your Platform. Your Revenue.",
  description:
    "A creator-owned streaming platform that lives behind a single bio link. Live, video, store, community — owned by the creator.",
  applicationName: "TVinBio",
  manifest: "/site.webmanifest",
  openGraph: {
    title: "TVinBio — Your channel. Your audience. Your revenue.",
    description: "Your link-in-bio, but you actually own it. Live, video, store — 100% yours, 0% platform cut.",
    siteName: "TVinBio",
    images: [{ url: "/brand/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-default.png"],
  },
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

// Runs at parse time (beforeInteractive), so it self-heals even when a stale
// bundle would otherwise crash React hydration.
const devServiceWorkerCleanupScript = `(function(){try{if('caches' in window){caches.keys().then(function(k){k.forEach(function(n){caches.delete(n);});});}if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister();});});}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${funnel.variable} ${host.variable} ${geistMono.variable}`}>
      <body suppressHydrationWarning>
        <Script
          id="extension-hydration-attribute-cleanup"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: extensionHydrationAttributeCleanupScript }}
        />
        {/* Dev only: a service worker registered in a prior session caches
            /_next/static cache-first, which serves stale chunks after a rebuild
            and breaks module resolution. Clear its caches before React loads so
            the very next fetch hits the network. Absent from production HTML. */}
        {process.env.NODE_ENV !== "production" && (
          <Script
            id="dev-sw-cleanup"
            strategy="beforeInteractive"
            dangerouslySetInnerHTML={{ __html: devServiceWorkerCleanupScript }}
          />
        )}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
