# TVinBio Brand & Product Design Framework

**"The Stream Is the Stage" — v2**
Status: adopted 2026-07-19 · Direction approved by operator · Canonical copy of this framework lives here; summary spec filed in the second-brain vault (`wiki/specs/tvinbio-design-framework.md`).

This is the implementation framework for a designer to construct the entire TVinBio brand: identity, iconography, color, type, layout, motion, theming, and every core UX flow. It defines *what to build and why*, with acceptance criteria. It deliberately does not contain finished designs.

Companion documents:
- `DESIGN.md` (repo root) — the token-level system of record. Code must match it.
- Chainfren design system (vault: `.claude/skills/chainfren-design/README.md`) — the parent brand this framework inherits DNA from.

---

## 0. TL;DR for the designer

TVinBio is a creator's own TV channel behind their bio link: livestream, VOD, store, live shopping, USDC payments, 0% platform cut. The design thesis: **the creator's page is a stage, not a list.** Dark room, the video is the show, the interface is stage rigging that stays out of the light.

Four signature moves make the brand:
1. **Two-tier brand.** Creator identity leads on creator pages; TVinBio is the frame and a small stamp.
2. **Logo as state machine.** The mark has idle and live states. It goes on air with the creator.
3. **Ownership receipt layer.** Monospace tabular numerals wherever value appears. Numbers do the arguing.
4. **Serif-italic inheritance.** Chainfren's italic emphasis device on outcome lines: "a channel you *own*."

One operating principle governs the UX: **TVinBio lives downstream of social platforms and must feel continuous with them.** The product's job is to gracefully funnel a creator's existing social audience into their owned channel — never to fight the behaviors those fans arrive with (see §11, The Social Funnel).

If a screen doesn't make the creator look bigger or the ownership story clearer, it's off-framework.

---

## 1. Brand foundation

### 1.1 What TVinBio is
- One line: **"Your link-in-bio, but you actually own it."** (live positioning on chainfren.com)
- Market position: **"Shopify for live creators."** The gap: no one combines live streaming + storefront + creator-owned audience data. Stan Store has no streaming; Twitch/YouTube have no storefront; Linktree hosts nothing.
- Product line: *"Your channel. Your audience. Your revenue."*
- Strategic arc: platform aggregation → link-in-bio → sovereign video commerce. TVinBio is the middle step and the wedge: the first step out of rented attention.
- Corporate context: sibling surface to TiVi, self-serve front door of Chainfren's **Creator Growth OS**. One platform underneath, two go-to-market surfaces on top.

### 1.2 Audiences (design for these, in this order)
1. **Fan on a phone** (demand side). Arrived from Instagram/TikTok/X bio tap. Mobile, possibly 3G, possibly Lagos, possibly mid-stream. Must know in 5 seconds: who this creator is, what's live, what's for sale.
2. **Creator middle class** (10K–100K followers, the 96% earning under $100K). Wants a home base, not another platform. Judges the product by how good *their* page makes *them* look.
3. **Crypto-native early adopter** (Farcaster/Livepeer ecosystem). Tolerates wallets; everyone else must never be blocked by them.
4. **Educator/coach** (high-value niche): needs gated content and clean checkout.

### 1.3 Brand relationship: sibling with shared DNA
TVinBio is a standalone consumer brand that inherits four Chainfren threads:
- **Accent lineage:** electric blue anchored on Chainfren's `#40ACFF` (not the superseded `#0091FF`).
- **Voice rules:** declarative, contrast-driven, Lagos-rooted, italic emphasis, numbers do the arguing, no emoji (see §9).
- **Serif accent:** Georgia italic for outcome lines, mirroring Chainfren product pages.
- **Lockup:** a "by Chainfren" endorsement stamp in footers, about pages, and app store listings. Never in creator-page content.

Everything else (dark canvas, type stack, logo, iconography) is TVinBio's own. Chainfren is light, navy, bordered bento on off-white. TVinBio is a dark stage. That contrast is intentional: infrastructure brand vs. consumer stage.

### 1.4 Personality dials
- Confident, not loud. The creator is loud; the platform is composed.
- Broadcast-grade, not gamer. Reference broadcast control rooms and cinema title cards, not neon gaming rigs.
- Warm-dark, not techno-cold. Lagos energy lives in the creator content and the pastels, not in gimmicks.
- Anti-hype. No NFT stunts, no crypto jargon on any fan-facing surface. "USDC" appears; "web3" does not.

---

## 2. Identity system (logo brief)

### 2.1 The mark — design brief
Design a mark that reads as **a screen/stage that can go on air**. Required properties:

- **Two states, one geometry.**
  - **Idle:** flat, single-color (ink white on dark, or beam blue), calm.
  - **Live:** the same geometry gains an ON-AIR treatment: a live-red element and/or a soft beam glow, optionally a 1.5s pulse (the existing `tvLive` keyframe is the timing reference).
  - The state change must be achievable in CSS/SVG with no redraw: think a dot that fills, a scanline that lights, an aperture that opens.
- Works at 16px favicon and at 512px PWA icon without modification of geometry (only the live treatment may drop at small sizes).
- Geometrically simple enough to survive 1-color, single-weight reproduction (stickers, merch, OG images).
- Candidate territories to explore (explore at least 3, at least one from each row):
  - *Screen family:* rounded-rect viewport with a play/beam element; a "tv" silhouette abstracted to two strokes.
  - *Signal family:* broadcast beacon (dot + arcs), waveform tick, aperture/iris.
  - *Bio family:* the mark doubles as an @ or link glyph read second (the "in bio" pun, kept subtle).
- Avoid: play-button-in-circle clichés, chat bubbles, generic "live" badges, anything that reads as Twitch/YouTube adjacent.

### 2.2 Wordmark
- Set in **Funnel Display**, weight 500–600, tracking -0.02em. Casing: **TVinBio** exactly (product casing already in code and market).
- Two lockups: horizontal (mark + wordmark) and stacked (mark above wordmark). Mark-only is the default in product chrome.
- Endorsement lockup: `TVinBio · by Chainfren` with the Chainfren wordmark rules from the parent system (Inter Display 500). Used only on marketing, footer, stores.

### 2.3 Usage rules
- Clearspace: 1× mark height on all sides. Minimum sizes: mark 16px, horizontal lockup 88px wide.
- On creator pages the mark appears **once**: small, in chrome (header or footer stamp), idle state, never colored with the creator accent.
- The live state of the mark is earned, not decorative: it activates only when the viewer is on a page where the creator is actually live.
- Never: stretch, add shadows/gradients to the mark, place it over busy video without a scrim, recolor outside the approved set (ink, beam, live composition).

### 2.4 Icon/avatar export matrix (deliverable)
Favicon 16/32/48 · PWA maskable 192/512 (dark `#060606` plate) · Apple touch 180 · OG default image 1200×630 (dark plate, mark + wordmark + creator-name slot template) · app-store/social avatars 400×400. The PWA manifest already exists (`src/app/site.webmanifest`); exports must match its slots.

---

## 3. Color system

Canvas and surfaces stay as shipped (they are correct). The accent retunes to Chainfren lineage. Full token law lives in `DESIGN.md`; this section is the reasoning and the rules.

### 3.1 Foundation (keep)
| Role | Token | Value |
|---|---|---|
| Canvas | `--color-canvas` | `#060606` |
| Surface / raised / elevated | `--color-surface..` | `#080808 · #0b0b0b · #0f0f12 · #0c0c0f` |
| Lines | `--color-line*` | white at 6/8/12% |
| Ink ramp | `--color-ink..ghost` | `#ffffff → #555555` (6 steps) |

### 3.2 The beam ramp (change)
Replace the `#0091ff` accent family with a ramp anchored on Chainfren's electric blue:

| Token | Value | Use |
|---|---|---|
| `--color-beam` | `#40ACFF` | Primary accent: primary buttons, focus rings, links, active nav |
| `--color-beam-deep` | `#1B84E8` | Pressed/hover-on-dark states |
| `--color-beam-soft` | `#9FD3FF` | Tints, secondary emphasis on dark |
| `--color-beam-glow` | `#40ACFF` at 12–24% | The on-air glow, meters, ambient light |

Rationale: streaming accents are claimed (Twitch purple, YouTube red, Kick green, TikTok cyan/pink). **Electric blue on black is open territory**, and it is the family thread to Chainfren. `#0091FF` is explicitly Chainfren's superseded palette; staying on it puts the sibling on the parent's discarded color.

Discipline (Twitch's lesson, adopted): the beam is the **single brand-action color**. If everything glows, nothing is on air.

### 3.3 Reserved semantics (hard rules)
- `--color-live` `#EF4444` — **LIVE state only.** Never errors, never sales, never emphasis. (Errors get their own darker token, e.g. `#DC2626`, visually distinct in usage context.)
- `--color-earn` `#22C55E` — earnings/money-received only (currently `--color-online`; rename and reserve; presence dots may keep a muted variant).
- Chat pastels `#5ACDFF · #C8EB6D · #8DAAFF` — chat identity only. These are literal Chainfren product pastels; a quiet DNA thread. Never for UI states.

### 3.4 Creator accent slot (two-tier brand, tier 1)
- `--creator-accent` (+ derived `-soft`, `-glow`): set per channel from the creator's theme choice. Drives the creator page hero, their buttons, their store highlights.
- Guardrails the designer must spec: minimum contrast 4.5:1 against `#060606` for text uses (auto-adjust lightness if the picked color fails); the beam and the creator accent never appear in the same component; live-red and earn-green cannot be picked as creator accents.

### 3.5 Contrast floor
AA minimum everywhere: 4.5:1 body text, 3:1 large text and icons, on every surface step. The muted ramp (`#9a9aa2`, `#7a7a82`) must be audited against `#0f0f12` surfaces, not just canvas.

---

## 4. Typography

Three voices plus one inherited accent. All wired via `next/font`.

| Voice | Face | Role | Rules |
|---|---|---|---|
| Display | **Funnel Display** | Headlines, creator names, section titles, wordmark | 500–600 weight, tracking -0.02em, line-height ≤1.05 at large sizes. Sentence case. |
| Body/UI | **Host Grotesk** | Everything else: body, labels, buttons, chat | 400/500/600. 14–16px product baseline. |
| Receipt | **Geist Mono** (add) | Every numeral that represents value: prices, earnings, tips, viewer counts, percentages, wallet addresses | `tabular-nums` always. Never for prose. This is the ownership layer: "100% yours · 0% cut" is set in it. |
| Accent | **Georgia italic** (system, inherited) | Outcome lines and italic emphasis only: "a channel you *own*" | Sparingly: max one per screen. Marketing + empty states, not dense UI. |

Type scale (modular, rem): 12 · 14 · 16 · 18 · 21 · 26 · 32 · 42 · 56 · 72. Eyebrows: 11px uppercase, tracking 0.12em (Chainfren convention carried over).

Casing: sentence case headlines; UPPERCASE for eyebrows and status chips (`LIVE`, `ON AIR`, `REPLAY`) only. No title case.

---

## 5. Iconography & illustration

- **UI icons:** Lucide as the base library. 2px stroke, round caps, `currentColor`, 20/24px grid. Matches parent-brand convention.
- **Custom glyph set (deliverable, ~14 glyphs):** on-air/beacon, go live, replay/VOD, clip, tip, store, product, checkout, USDC (circle-dollar variant, not a crypto logo), wallet, capture/follow, channel, stage/dashboard, signal-strength (for low-bandwidth mode). Same 2px/round-cap DNA so they interleave with Lucide invisibly.
- **No emoji anywhere.** Inherited hard rule. Chat may render user emoji; the product's own voice never uses them.
- **Illustration:** none in v1. TVinBio's imagery IS creator content: video frames, thumbnails, avatars. Empty states use the signal motifs (below), not mascots. The Chainfren frens do **not** appear inside TVinBio product surfaces (they belong to the parent brand's light canvas); they may appear in co-branded marketing only.
- **Signal motif kit (deliverable):** the decoration vocabulary, used sparingly: ON-AIR glow (beam at 12–24%), thin waveform/level meters, scanline texture (≤3% opacity, dark surfaces only), viewport corner ticks. These are the only permitted decorations. No blobs, no mesh gradients, no purple washes, no 3-column icon grids.
- **Thumbnails/video:** metadata always on a scrim (bottom gradient black 60% → 0%), never boxed. 16:9 default, 9:16 supported for mobile-first creators.

---

## 6. Layout, spacing, radii

- **Base unit 4px.** Scale: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64.
- **Density:** comfortable in dashboard, spacious on creator pages, compact in chat.
- **Radii (keep):** card 18px, sheet 24px, pill 999px. Buttons and status chips are pills; media is 12–18px; the video player itself is square-cornered when fullbleed.
- **Grid:** mobile-first, 4-column at ≤640, 8 at tablet, 12 at ≥1024. Creator page max-width 680px single column on mobile, bento at ≥768. Watch layout: player + right-rail chat ≥1024, stacked below.
- **Two page grammars:**
  - **Stage grammar** (watch, live, broadcast): video owns the viewport; chrome is flat, quiet, dismissible; no cards floating over video without scrims; the UI may never out-bright the stream.
  - **Bento grammar** (creator public page, explore, dashboard home): cards on canvas, varying sizes creating hierarchy: live/hero card first, then store, then VOD rail, then capture. Three-tier conversion architecture: discovery (who/what) → engagement (follow/capture) → conversion (buy/tip) ordered top to bottom.
- Elevation on dark = lighter surface + line, **not** shadows. Flat by design.

---

## 7. Motion

- **Easing:** `cubic-bezier(0.22, 1, 0.36, 1)` (shipped, kept; also the parent brand's curve). Durations 150/250/400/700ms.
- **The choreography budget is spent on live moments only:** going live (mark state change + beam sweep), tip received (DonationAlert pop), sale made, viewer milestone. Everything else is functional: fades, sheet slides (the `tvSheet`/`tvSlideInRight` set is the reference), 150–250ms.
- Existing keyframe kit (`tvLive`, `tvGlow`, `tvPop`, `tvRise`, sheet in/out) is the base vocabulary; the designer formalizes when each fires and adds the go-live sequence spec.
- **`prefers-reduced-motion` honored always:** live pulse becomes a static red dot, glows become static tints, sheets become fades.

---

## 8. The two-tier theming framework (the differentiator)

**Tier 1 — the creator's brand (leads).** On `/{username}` pages the visible brand is the creator's:
- Creator tokens: `--creator-accent`, cover media, avatar, display-name set in Funnel Display at hero scale, optional theme variant (v1 ships: `midnight` default; spec two more: `dim` slightly lifted surfaces, `voltage` higher-contrast accent usage).
- The creator's name is always the largest text on their page. Bigger than anything TVinBio says.

**Tier 2 — the TVinBio frame (recedes).** Platform chrome (nav rails, sheets, player controls, checkout) stays in system tokens: canvas, ink, beam. The platform stamp is one small idle mark + "on TVinBio" in the footer of creator pages. That's the entire platform presence a fan sees.

Rules that keep it premium:
- Creator customization is *constrained*: accent + cover + avatar + theme variant. No font choice, no layout breaking in v1. Constraint is what keeps every page looking expensive (Linktree's failure is unconstrained sameness; MySpace's was unconstrained chaos).
- Checkout, wallet, and money surfaces always render in system tokens: trust surfaces don't theme.
- Contrast auto-guard on `--creator-accent` (see §3.4).

---

## 9. Voice & copy rules (inherited, adapted)

- Declarative. No hedging ("aims to", "strives to" banned).
- Contrast is the engine: rented vs. owned, followers vs. fans you keep. "Attention is not ownership."
- **Numbers do the arguing**, set in the receipt layer: "100% yours · 0% platform cut", "Launch in under a minute".
- Second person to the creator ("your channel"), the fan-facing pages speak *for* the creator, not for TVinBio.
- Italic emphasis device on outcome lines; sentence case; UPPERCASE only for eyebrows/status chips; no emoji.
- Crypto is invisible plumbing in copy: "Get paid instantly" not "on-chain payments". USDC named only at the money moment.
- Lagos voice, not San Francisco: "Stop renting your audience" beats "audience ownership platform."

---

## 10. UX flows (the designer designs each of these end-to-end)

Each flow below must be delivered as: flow diagram → screen list → per-screen states (default / loading / empty / error / offline / low-bandwidth) → acceptance criteria. Existing routes in parentheses map flows to the shipped app.

### F1 — Fan: bio tap → stage (the money flow)
`social bio tap → /{username}` →
- **If live:** land directly in the stream (`/{username}/live`) with join-in-progress UX: player playing muted-autoplay with tap-to-unmute, LIVE chip, viewer count (receipt layer), chat one gesture away, tip/store reachable without leaving the stream.
- **If not live:** bento landing: hero (identity + next-stream/latest-VOD), store row, VOD rail, capture module.
- Acceptance: 5-second comprehension test; first contentful paint of identity < 1.5s on 3G; zero wallet/crypto language visible.

### F2 — Fan: watch → pay (tip, unlock, buy)
Tip: `TipComposer/TipSheet` from stream → amount presets (receipt layer numerals) → pay (Privy wallet, funded or `FundSheet`) → `DonationAlert` celebrates on stream (`PaymentProgress` states). Unlock gated content: `UnlockGate` → price → pay → instant play. Buy: product card → `PurchaseSheet` → confirm → success + receipt.
- Design requirement: **the pay sheet is the trust ceremony.** System tokens only, receipt-layer numerals, explicit "goes directly to {creator} · 0% platform cut" line. Payment progress always visible; failure states never dead-end (retry + support path).
- Future-proof: sheet architecture must accommodate a second payment method slot (mobile money is the researched highest-ROI add for the Africa market; design the method-picker now, ship one method).

### F3 — Fan: capture (the ownership loop)
Follow/subscribe module on every creator surface: one field or one tap (wallet/social via Privy) → creator owns the relationship. Post-tip and post-purchase screens always offer capture ("Never miss {creator} live"). Acceptance: capture is never a modal ambush; always contextual, one step, dismissible.

### F4 — Creator: claim → live in under a minute (onboarding, `/start`, `/onboarding`, `/auth`)
Claim handle (`ClaimCta`: the `tvin.bio/you` moment, make the URL the hero) → Privy auth (email/social first, wallet optional) → 3-step brand setup (avatar, accent, cover; skippable) → dashboard with one dominant action: **Go live**. Acceptance: claim-to-live under 60 seconds is a designed, measured path; every step shows the creator's page assembling itself live in a preview.

### F5 — Creator: go live (`/dashboard/broadcast`, `/field/live`, bridge)
Browser broadcast (WHIP) primary: preview → device check → title/thumbnail → ON AIR (mark flips to live state; this is the brand's hero moment: design the go-live sequence). OBS/RTMP path for pros: keys screen with copy-paste ergonomics. Field mode (`/field`): stripped mobile-broadcast UI, thumb-reach controls, battery/signal indicators (signal-strength glyph), restricted-network bridge status surfaced honestly.
- Acceptance: going live never requires reading docs; failure states name the actual problem (camera permission vs network vs bridge) with one-tap retry.

### F6 — Creator: run the business (`/dashboard/*`)
Streams, videos (VOD publish + trim + thumbnail), store (product CRUD, featured), monetization (pricing, gates), analytics (RPDM-first: revenue per delivered minute is the headline metric, receipt layer, then audience), chat moderation, settings, wallet (`/wallet`, `tvSlideInRight` dock). Dashboard home answers three questions above the fold: Am I making money? (earn-green receipt) Is anything live/scheduled? Who arrived? Empty states teach: every empty dashboard panel shows the action that fills it, one Georgia-italic outcome line each.

### F7 — Explore (`/explore`)
Deliberately secondary: TVinBio is a home base, not a discovery platform. Simple live-now + featured grid. Never promise discovery the product doesn't deliver; frame as "what's on."

### F8 — PWA & resilience (`/offline`, manifest, low-bandwidth)
Install prompt after second visit or post-follow (moment of demonstrated intent). Offline page on-brand with cached channel shortcuts. **Low-bandwidth mode is a first-class design deliverable** (2G/3G reality): audio-only toggle in player, data-saver flag that swaps video rails for text lists, skeleton states that resolve progressively. Signal-strength glyph communicates state honestly.

### F9 — System states (cross-cutting inventory)
Loading (skeletons on surface-2, no spinners over video), errors (plain language + retry + never live-red), empty (teach + outcome line), offline, permission-denied (camera/mic/notifications), payment-pending/failed, stream-degraded (auto quality drop notice).

### F10 — Social handoff (arrive from a platform)
The most common first contact with TVinBio is a tap inside Instagram, TikTok, X, or WhatsApp. Design the arrival, not just the page:
- **In-app webview is the default context, not an edge case.** Most bio taps open in the platform's embedded browser: no PWA install, restricted storage, hostile popups. Everything in F1–F3 must work fully inside a webview; auth (Privy) must have an email/OTP path that survives webview restrictions; an unobtrusive "open in browser" affordance appears only when a capability actually requires it (never as a nag).
- **The link preview is the real front door.** See §11 OG system: by the time the fan taps, the preview card has already made the first impression.
- **Behavior continuity.** Fans arrive with platform muscle memory: muted autoplay + tap-to-unmute, vertical 9:16 comfort, double-tap/heart affordances, swipe-down to dismiss sheets, stories-style progress. Adopt these patterns where they map cleanly; never invent a new gesture where a platform-standard one exists.
- **No toll gates on arrival.** The funnel ladder is watch → capture → pay. Nothing interrupts the first 30 seconds of watching. Capture and payment surfaces slide in from the creator's content moments, not from the platform's impatience.

---

## 11. The Social Funnel (platform integration kit)

TVinBio's wedge is that it meets creators where they already stand: a bio link. The design system therefore treats **the surfaces that live inside other platforms** as first-class brand surfaces: they do the funneling.

### 11.1 The OG / link-preview system (deliverable)
Auto-generated per creator, live-aware, in three states:
- **LIVE:** creator name + avatar + `LIVE` chip + stream title on dark plate with beam/creator-accent treatment. Urgency without clickbait.
- **Idle:** creator identity + latest VOD or next scheduled stream.
- **Commerce:** product image + price in receipt-layer numerals for shared store links.
Formats: 1200×630 (OG), 1:1 and 9:16 crops for platforms that re-crop. Title/description copy templates follow §9 voice, speaking as the creator ("{Creator} is live now") not as the platform. WhatsApp preview rendering explicitly QA'd: it is the dominant share channel in the core market.

### 11.2 The share-back kit (the funnel runs both directions)
Creators announce on social to pull fans in; make the announcement a designed product surface:
- **Go-live cards:** auto-generated, platform-sized (9:16 story-safe with margin guides, 1:1 feed, 16:9 X/YouTube) with creator accent, stream title, and the `tvin.bio/{handle}` URL set in the receipt layer. One tap from the broadcast studio: go live → share everywhere.
- **Clip cards:** clips exported with a subtle branded end-frame (creator name + URL, TVinBio stamp small) so shared moments route audiences back to the owned channel.
- **Milestone/receipt cards:** shareable "first 100 fans," "sold out" cards — social proof that markets ownership itself.
These assets are the platform brand's largest public exposure: they must be beautiful enough that creators *want* to post them unedited.

### 11.3 Identity continuity
- Handle mirroring: onboarding (F4) encourages claiming the same handle as the creator's dominant social handle; `tvin.bio/{handle}` is the product's public face and is always displayed as a typed URL in the receipt layer, reinforcing "this address is yours."
- The creator page hero mirrors the social-profile mental model (avatar, name, one-line bio, action row) before diverging into stage/bento content: familiarity first, differentiation one scroll later.

### 11.4 Platform behavior map (designer reference, maintain as platforms shift)
| Arriving from | Context to design for | Carry-over behavior |
|---|---|---|
| Instagram | In-app webview, bio tap or story link | Stories progress affordance, 9:16, tap-to-advance |
| TikTok | In-app webview, aggressive re-engagement pulls | Vertical full-bleed video, swipe patterns, instant sound-on expectation after tap |
| X | Card preview scrutiny, desktop share | 16:9 cards, link-forward culture |
| WhatsApp | Preview card is the pitch; low-bandwidth likely | 1:1 preview crop, data-saver mode prominent |
| YouTube | Description links, VOD-first audiences | Replay/VOD landing emphasis |

---

## 12. Screen & component inventory (deliverable checklist)

**Screens (map 1:1 to routes):** creator page (idle + live variants) · live watch · VOD watch · explore · start/claim · auth · onboarding (3) · dashboard home · broadcast studio · field live · streams · videos · store · monetization · analytics · chat · settings · wallet dock · offline · plus sheets: tip, fund, purchase, unlock, capture.

**Core components (extend what's shipped):** Button (primary beam / secondary line / ghost / creator-accent / destructive) · Badges (`LIVE`, `REPLAY`, `UPCOMING`, price chip) · Sheet (bottom mobile, right dock desktop, center desktop) · Media (thumbnail + scrim + duration) · Player chrome · Chat message + pastel identity · Stat/receipt tile · Capture module · Product card · Empty-state pattern · Nav rails/triad · Toast/DonationAlert.

Each component spec'd in all states (default/hover/active/focus/disabled/loading) on all surface steps, both grammars (stage/bento), light never (dark-only product in v1).

---

## 13. Accessibility & performance budgets (non-negotiable)

- WCAG AA contrast (see §3.5); visible beam focus rings on every interactive element; full keyboard paths through watch + checkout; captions slot in player spec'd from day one.
- Touch targets ≥44px; thumb-reach primary actions on mobile broadcast and watch.
- `prefers-reduced-motion` variants spec'd per §7.
- Performance is design: identity paint <1.5s on 3G, creator page total <200KB before video, system fonts fallback stack defined, skeletons for everything network-bound.

---

## 14. Designer deliverables & handoff

**Package 1 — Identity:** mark explorations (≥3 territories) → chosen mark idle+live states + motion spec → wordmark + lockups + endorsement lockup → export matrix (§2.4) → one-page usage sheet.
**Package 2 — Foundations:** token sheet (color/type/space/radii/motion) mirroring `DESIGN.md`; custom glyph set + signal motif kit.
**Package 3 — Components:** Figma library matching §12 inventory, variants + states, dark-only.
**Package 4 — Flows:** F1–F9 as flow diagrams + full-state screen designs; F1, F2, F4, F5 are the priority order.
**Package 5 — Theming:** creator-token demo: the same page rendered as 3 different creators proving tier-1/tier-2 separation.

Figma structure: `01 Identity · 02 Foundations · 03 Components · 04 Flows · 05 Theming · 99 Explorations`. Tokens named exactly as `DESIGN.md` CSS variables so handoff is mechanical.

**Acceptance review:** every screen passes: (1) 5-second creator-recognition test, (2) chrome never out-brights content, (3) reserved colors unviolated, (4) receipt layer on every value numeral, (5) AA contrast, (6) reduced-motion variant exists.

---

## 15. Anti-patterns (instant rejection list)

Purple/violet gradients · icons in colored circles in 3-column grids · centered-everything marketing pages · gradient primary buttons · drop shadows for elevation on dark · live-red used for anything but live · beam accent spread across multiple simultaneous elements · crypto jargon on fan surfaces · emoji in product voice · platform brand bigger than creator brand on creator pages · spinners over video · unconstrained creator theming.

---

## 16. Decisions log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-19 | Sibling brand with Chainfren DNA (not child, not standalone) | Consumer stage needs its own face; ownership story needs the family thread. Operator-approved. |
| 2026-07-19 | Dark stage foundation kept; accent retuned `#0091ff` → `#40ACFF` beam ramp | `#0091ff` is Chainfren's superseded palette; blue-on-black is unclaimed among streaming brands. |
| 2026-07-19 | Four signature risks adopted: two-tier brand, state-machine logo, receipt layer, serif-italic inheritance | Each dramatizes the ownership thesis in UI. Operator-approved. |
| 2026-07-19 | Type: Funnel Display + Host Grotesk kept, Geist Mono receipt layer added | Shipped faces are distinctive and good; rethink budget spent on color + identity instead. |
| 2026-07-19 | Mobile-money method slot designed now, shipped later | Africa research: highest-ROI build; design the picker before the second method exists. |
