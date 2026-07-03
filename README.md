# TVinBio

Creator-owned streaming platform: live streams, VOD, a store, and live shopping behind a single bio link, with USDC-on-Base payments.

## Stack

- Next.js 15 (App Router) · TypeScript · Tailwind CSS v4
- Livepeer (live + VOD) · Supabase (data + realtime) · Privy (auth)
- Browser-live bridge (`bridge/`): MediaMTX + a signed control agent, for browser broadcasting on restricted networks

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run typecheck
npm test
```

Copy `.env.example` to `.env.local` and fill in the values you need; the app runs in mock mode with everything unset.
