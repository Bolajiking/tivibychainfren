# Design System — TVinBio

System of record for tokens and design rules. Code must match this file. The full designer framework (brand strategy, logo brief, flows, deliverables) lives in `docs/design/tvinbio-brand-framework.md` — read it before designing anything new.

## Product Context
- **What this is:** A creator's own TV channel behind their bio link — livestream, VOD, store, live shopping, USDC-on-Base payments, 0% platform cut.
- **Who it's for:** Fans on phones arriving from social bios (design target #1); creator middle class (10K–100K followers) running a home base.
- **Space/industry:** Creator economy · live streaming + link-in-bio storefront convergence. Peers: Stan Store, Linktree, Fourthwall, Twitch (none combine streaming + storefront + owned audience).
- **Project type:** Consumer web app + PWA (Next.js 15, Tailwind v4, dark-only).
- **Brand relationship:** Sibling of Chainfren (parent system: vault `.claude/skills/chainfren-design/README.md`). Inherits accent lineage, voice rules, serif-italic accent, "by Chainfren" endorsement lockup. Everything else is TVinBio's own.

## Aesthetic Direction
- **Direction:** "The Stream Is the Stage" — broadcast-industrial on cinema dark. The creator's page is a stage, not a list; chrome never out-brights the stream.
- **Decoration level:** Intentional — signal motifs only (ON-AIR glow, waveform meters, ≤3% scanline, corner ticks). No blobs, no gradient washes, no shadows-as-elevation.
- **Mood:** Composed, broadcast-grade, warm-dark. The creator is loud; the platform is quiet. Anti-hype: no crypto jargon on fan surfaces.
- **Operating principle:** TVinBio lives downstream of social platforms — arrival flows, link previews, and share-back assets are first-class brand surfaces (framework §11).

## Typography
- **Display/Hero:** Funnel Display — distinctive geometric display, already shipped via next/font. 500–600 weight, tracking -0.02em, line-height ≤1.05 at large sizes. Sentence case.
- **Body/UI:** Host Grotesk — 400/500/600, 14–16px product baseline.
- **Data/Receipt:** Geist Mono, `tabular-nums` — MANDATORY for every numeral representing value: prices, earnings, tips, viewer counts, percentages, URLs-as-identity (`tvin.bio/{handle}`), wallet addresses. This is the ownership layer. Never for prose.
- **Accent:** Georgia italic (system) — outcome lines only ("a channel you *own*"), max one per screen.
- **Loading:** next/font/google (Funnel_Display, Host_Grotesk; add Geist_Mono).
- **Scale (rem-based px):** 12 · 14 · 16 · 18 · 21 · 26 · 32 · 42 · 56 · 72. Eyebrows 11px UPPERCASE tracking 0.12em.
- **Casing:** sentence case headlines; UPPERCASE only for eyebrows + status chips (`LIVE`, `ON AIR`, `REPLAY`). No title case. No emoji in product voice.

## Color
- **Approach:** Restrained on dark — one platform accent (beam), hard-reserved semantics, creator accent as a separate themable slot.
- **Canvas/surfaces (keep as shipped):** canvas `#060606`, surface `#080808`, surface-2 `#0b0b0b`, raised `#0f0f12`, elevated `#0c0c0f`. Lines: white 6/8/12%.
- **Ink ramp (keep):** `#ffffff` → `#f0f0f2` → `#cfcfd4` → `#9a9aa2` → `#7a7a82` → `#555555`.
- **Primary — the beam ramp (CHANGED from #0091ff):**
  - `--color-beam: #40ACFF` — the single brand-action color (primary buttons, focus rings, links, active nav)
  - `--color-beam-deep: #1B84E8` — pressed/hover
  - `--color-beam-soft: #9FD3FF` — tints, secondary emphasis
  - `--color-beam-glow: rgba(64,172,255,0.12–0.24)` — ON-AIR glow, meters
  - Rationale: Chainfren lineage (`#40ACFF` is the parent's current accent; `#0091FF` is its superseded palette). Blue-on-black is unclaimed among streaming brands (Twitch purple, YouTube red, Kick green).
- **Reserved semantics (hard rules):**
  - `--color-live: #EF4444` — LIVE state ONLY. Never errors, never emphasis.
  - `--color-earn: #22C55E` — earnings/money-received ONLY (rename from `--color-online`; presence dots use a muted variant).
  - `--color-error: #DC2626` — errors (distinct from live-red by context and never pulsing).
  - Chat pastels `#5ACDFF · #C8EB6D · #8DAAFF` — chat identity only (Chainfren product pastels; DNA thread).
- **Creator accent slot:** `--creator-accent` (+ `-soft`, `-glow`) set per channel. Guardrails: auto-adjust to ≥4.5:1 on `#060606` for text use; never in the same component as beam; live-red/earn-green not pickable; money/checkout surfaces never theme.
- **Dark mode:** the product is dark-only in v1. No light theme.

## Spacing
- **Base unit:** 4px. Scale: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64.
- **Density:** comfortable (dashboard) / spacious (creator pages) / compact (chat).

## Layout
- **Approach:** Hybrid, two grammars. Stage grammar (watch/live/broadcast): video owns viewport, flat quiet chrome, scrims not boxes. Bento grammar (creator page, explore, dashboard home): cards on canvas, conversion-ordered — discovery → engagement (capture) → conversion (buy/tip).
- **Grid:** mobile-first; 4 cols ≤640, 8 tablet, 12 ≥1024. Creator page 680px single column mobile, bento ≥768. Watch: player + right-rail chat ≥1024.
- **Radius:** card 18px, sheet 24px, pill 999px (buttons, chips). Media 12–18px; fullbleed player square.
- **Elevation:** lighter surface + line. No drop shadows.

## Motion
- **Approach:** Intentional — choreography budget spent on live moments only (go-live sequence, tip received, sale). Everything else functional.
- **Easing:** `cubic-bezier(0.22, 1, 0.36, 1)` (`--ease-expo`) everywhere.
- **Duration:** micro 150ms · short 250ms · medium 400ms · long 700ms.
- **Keyframe kit:** shipped `tvLive/tvGlow/tvPop/tvRise/tvSheet/tvSlideInRight` set is the vocabulary.
- **`prefers-reduced-motion`:** always honored — pulse → static dot, glow → static tint, sheets → fades.

## Iconography
- **Base:** Lucide, 2px stroke, round caps, `currentColor`, 20/24px grid.
- **Custom glyphs (~14):** on-air, go-live, replay, clip, tip, store, product, checkout, USDC, wallet, capture, channel, stage, signal-strength — same stroke DNA.
- **No emoji. No unicode-as-icon.**

## Accessibility & performance floors
- WCAG AA: 4.5:1 body, 3:1 large text/icons, on every surface step. Beam focus rings on all interactives. Touch targets ≥44px.
- Identity paint <1.5s on 3G; creator page <200KB before video; skeletons for everything network-bound; low-bandwidth/audio-only modes are first-class states.
- Everything must work inside Instagram/TikTok in-app webviews (no popup-dependent flows).

## Anti-patterns (reject on sight)
Purple gradients · icons-in-circles grids · gradient CTAs · shadows on dark · live-red misuse · beam on multiple simultaneous elements · crypto jargon on fan surfaces · platform brand bigger than creator brand on creator pages · spinners over video · unconstrained creator theming.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-19 | Initial design system created via /design-consultation | Grounded in vault (tvinbio, market research, Chainfren design system) + shipped code; direction "The Stream Is the Stage v2" operator-approved |
| 2026-07-19 | Accent retuned `#0091ff` → `#40ACFF` beam ramp | Chainfren lineage; `#0091ff` is parent's superseded palette; blue-on-black unclaimed in streaming |
| 2026-07-19 | Geist Mono receipt layer added for all value numerals | Ownership rendered as UI; "numbers do the arguing" |
| 2026-07-19 | Social-funnel surfaces (OG system, share-back kit, webview-first) elevated to brand surfaces | Operator directive: seamless integration with existing social platforms and behaviors |
| 2026-07-19 | Designer packages 1–5 delivered and implemented | Viewport mark (idle/live state machine) chosen from 4 explorations; tokens, components, flows F1–F8, live-aware OG cards, theming guardrails shipped in code. Assets in `public/brand/`; packages archived in `Design work/` |
| 2026-07-20 | Ground-up rebuild of the flows onto the framework | The first pass applied tokens but kept the old layout system underneath (hero "Stage" card, Shop/Watch/Chat room switcher, platform sidebar on creator pages). Screens now follow Package 4 directly. |
| 2026-07-20 | Tier-1 creator theming implemented for real | `--creator-accent` (+ soft/deep/glow/line) and three theme variants persist on the creator row (migration `0016`). `lib/creator-theme.ts` enforces the guardrails in code: ≥4.5:1 auto-lift on canvas, live-red/earn-green hue bands rotated out, money surfaces rendered outside the themed subtree. |
| 2026-07-20 | `/{username}` branches on live, on one URL | Live → the fan joins the stage in progress; idle → the bento landing. `?view=channel` is the escape hatch back. The address the fan tapped is the address they stay on. |
| 2026-07-20 | One money surface, one trust anatomy | Tip/Purchase/Unlock/Fund all carry the 0%-cut line, receipt numerals, the method picker (mobile-money slot designed, one method live), visible progress and a no-dead-end failure. The inline tip mini-composer was deleted — a lighter second pay UI undercuts the promise the real one makes. |
| 2026-07-20 | `/start` is the claim screen and the post-login resolver | The URL is the hero for a stranger; for a signed-in user there is nothing to claim, so it resolves to their channel or to what's on. "Where do I begin" and "where do I land" stay one answer. |
| 2026-07-20 | RPDM is the dashboard headline, labelled as an estimate | Delivered minutes are derived from catalogue data (duration × views) because no watch-time telemetry exists yet, which makes the denominator an over-estimate and the RPDM a floor. Surfaced as "est." until per-session watch events land; see `lib/rpdm.ts`. |
| 2026-07-20 | Legacy aliases and shadow-elevation removed | `bg-blue`/`text-online` class aliases renamed onto `beam`/`earn`; drop-shadow elevation stripped app-wide (elevation on dark is a lighter surface + a line); chat pastels no longer used as UI states. |
| 2026-07-20 | Persona scoping hardened on shared surfaces | `isOwner` (wallet match) is computed client-side on `/{username}`, `/live`, `/video` — SSR always renders the viewer surface, so an owner action never ships in HTML a public viewer can see. Owner on their own page/replay/stream now gets Dashboard/Share/Manage/Desk instead of Follow/Tip-yourself; the owner is never gated out of their own gated content. |
| 2026-07-20 | Navigation reachability + back affordances | Mobile creator triad is Channel/Store/Wallet; the other rooms (Streams/Videos/Analytics/Chat/Settings) are one tap from a "Manage" grid on the overview, and `PRIMARY_DASHBOARD_TABS` was corrected so every non-tab room shows a mobile back button (Streams/Analytics were previously trapped). Added `BackButton` (history-aware, hidden on cold bio-tap arrivals) to the creator page; broadcast desk got a clear back chevron. Fan chrome never routes a pure viewer into the creator claim flow. |
| 2026-07-21 | Channel is profile-first; the stream is a banner, not a redirect | `/{username}` always renders the public profile. Live → the header becomes a broadcast-viewport banner (ON-AIR wash, scanline, corner ticks, viewer count) that opens `/{username}/live` on one tap. A fan is never yanked into the stream from Explore. |
| 2026-07-21 | Live status is client-owned and self-reverting | `useChannelLiveStream` (realtime + polling `/api/channels/{u}/stream`, which reconciles against Livepeer and repairs the stuck `is_active`) drives the channel banner; Explore polls `/api/live` so ended streams drop off. LiveWatch shows a calm "stream ended" close and returns to the channel. Fixes the persisting-LIVE bug on both surfaces. |
| 2026-07-21 | Contextual auth | `requireAuth` carries `reason` + `subject`; the wall speaks to the action ("Follow Ada Eze — set up a free account, no wallet needed") via `authPromptCopy`. Least-friction options (email/social) unchanged. |
| 2026-07-21 | Motion layer added (the functional half of the §7 budget) | Central CSS in `globals.css`: `.enter`/`.enter-N` and `.stagger` split-and-stagger enter choreography (opacity·translateY·blur, `--ease-expo`, reduced-motion collapses to an instant reveal), `.tap` tactile press (scale 0.97, interruptible transition) for non-Button interactives, `.img-outline` 1px inset hairline on media, `text-wrap: balance` on display headings. Applied to channel landing, explore, dashboard, wallet ledger, cards, nav. Live-moment choreography (go-live sequence, tip DonationAlert, sheet slides, wallet dock slide-in) unchanged — the budget still concentrates there. Removed the last two `transition: all` offenders (toggle switches → `transition-[left]`); normalized press values (nav 0.96, icon buttons 0.92). No motion library added — CSS transitions + the existing keyframe kit only. |
