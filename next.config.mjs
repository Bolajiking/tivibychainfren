/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @supabase/supabase-js's realtime client conditionally requires "ws" for
  // its Node WebSocket polyfill. Vercel's dependency tracer doesn't always
  // follow that dynamic require, so it silently drops "ws" from some
  // serverless function bundles, causing an intermittent
  // "Cannot find module 'ws'" MODULE_NOT_FOUND at runtime on any route that
  // touches Supabase (/explore, /[username], /api/profile, ...). Marking it
  // external forces Next to keep it as a real node_modules dependency in
  // every function bundle instead of trying to trace/bundle it.
  serverExternalPackages: ["ws"],
  async headers() {
    return [
      {
        source: "/field/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.lp-playback.studio" },
      { protocol: "https", hostname: "**.livepeer.cloud" },
    ],
  },
};

export default nextConfig;
