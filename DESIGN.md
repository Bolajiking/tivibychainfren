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
