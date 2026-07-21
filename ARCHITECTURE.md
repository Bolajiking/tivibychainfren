# TVinBio Architecture Map

One creator-owned streaming storefront behind a bio link. Next.js 15 App Router,
TypeScript. UI follows the "The Stream Is the Stage" framework.

## The one seam that matters

`src/lib/config.ts` reads env and computes `MOCK_MODE = !supabase.enabled`.
Every data/auth/payment path branches on it:

- **Mock mode** (no Supabase env): reads come from `src/lib/mock/seed.ts` via
  `src/lib/data.ts`; auth accepts an `x-tvinbio-wallet` header (`src/lib/auth/owner.ts`);
  payments short-circuit to success. The whole app works offline this way.
- **Real mode**: Supabase tables (RLS-scoped anon reads, service-role writes),
  Privy-verified auth on every owner/creator route, on-chain USDC verification
  before any access/order write.

## Layers

| Layer | Where | Notes |
|---|---|---|
| Domain types | `src/lib/types.ts` | The contract. `Creator.creatorId` = lowercase EVM address. |
| Data reads | `src/lib/data.ts` | Only place that queries tables for reads. Mock fallback inside. |
| DB clients | `src/lib/db/client.ts` | `getSupabase()` anon (browser-safe), `supabaseAdmin()` service-role (SERVER ONLY). |
| Row mapping | `src/lib/db/map.ts` | snake_case rows ↔ camelCase domain. |
| Auth | `src/lib/auth/server.ts` (`requirePrivyUser`), `src/lib/auth/owner.ts` (`resolveOwner`) | All owner/creator API routes go through these. Never trust a client-supplied wallet in real mode. |
| Access gating | `src/lib/access.ts` (`hasAccess`) | CLIENT-SIDE soft gate for UX. Money writes are enforced server-side; playback lock is UX-level. |
| Payments | `src/app/api/payments/settle/route.ts` + `src/lib/payments/verify.ts` | THE trust gate: Privy auth → on-chain USDC Transfer verification (viem, Base) → replay-proof claim (`settled_payments` PK) → DB writes. |
| Chat writes | `src/app/api/chats/route.ts` (POST, auth-gated) + `src/app/api/chats/[id]/route.ts` (DELETE, owner-gated) | All chat inserts/deletes are service-role after auth. Anon can READ (realtime) but not write. |
| Livepeer proxy | `src/app/api/livepeer/[...path]/route.ts` + `src/lib/livepeer/policy.ts` | Server-held API key; allow-listed surface; per-id owner scoping via DB mapping; ingest secrets redacted on public reads. |
| Live status | `src/app/api/livepeer/webhook/route.ts` | Livepeer `stream.started/idle` → flips `streams.is_active`. Signature-verified, fail-closed. |
| Browser broadcast | `src/components/dashboard/BrowserBroadcaster.tsx` (1.6k lines — do not casually edit) driven by pure cores: `transport-policy.ts` (choose targets), `transport-orchestrator.ts` (state machine), `transport-controller.ts` (shell). | Desktop: direct WHIP → bridge fallback → OBS handoff. Mobile: bridge or OBS. |
| Bridge control | `src/lib/bridge/*`, `bridge/agent/*` | State is IN-MEMORY per process (`runtime.ts` globalThis). **Disabled on serverless** — see `runtime-guard.ts`. OFF for launch. |
| Realtime | `src/lib/realtime.ts` | Supabase channels: chat (read), featured products, stream status, presence viewer counts. |
| PWA | `src/app/api/pwa/[username]/manifest/route.ts`, `public/sw.js`, `src/lib/pwa.ts` | Per-creator installable manifest; SW never caches `/api/`, `/auth/`, `/field`. |
| Field diagnostics | `src/app/field/**`, `src/app/api/field/**`, `src/lib/livepeer/field*.ts` | INTENTIONALLY RETAINED internal broadcast harness. Token-gated + noindexed. Excluded from code review — do not "clean up". |
| Client session | `src/lib/store/session.ts` | Zustand-persisted persona/subscriptions/wallet ledger. Display-only — never trusted server-side. |

## Invariants (do not break)

1. `LIVEPEER_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PRIVY_APP_SECRET`, bridge secrets: server-only, never in a `"use client"` module or response payload.
2. Money + chat state (subscriptions, orders, `paid_users`, notifications, chat rows) is written ONLY by service-role server code, after auth (and, for money, on-chain verification).
3. One Livepeer stream per channel — broadcasts are sessions under the same stream key.
4. Every owner-scoped API route: `resolveOwner` → per-resource ownership check against our DB mapping.
5. Mock mode must keep working with zero env vars (`npm run dev` on a fresh clone).
6. Monthly access expires after 30 days (enforced by the nightly `prune_expired_paid_users` DB job).

## Testing

`npm test` → node:test over `tests/*.test.mjs` (pure-core coverage: transport, bridge auth/leases, policy, payments helpers, webhook parsing, config guard). `tests/helpers/load-ts-module.mjs` compiles a TS module to a data: URL and imports it — **it cannot resolve bare npm imports**, so only load modules whose import graph is `@/`-relative or import-free. Scripts under `scripts/` are MANUAL field/e2e harnesses (need live credentials) — not part of `npm test`.
