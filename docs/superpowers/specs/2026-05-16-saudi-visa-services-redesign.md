# Saudi Visa Services — Visual Redesign Spec

**Date:** 2026-05-16
**Project:** GlobalHire@ELAB — `/visa*` + `/visa-start` + `/dashboard-visas*` + `/admin-visas*`
**Status:** Approved direction; pending user review of this spec before implementation plan
**Supersedes (visually):** §5 (Visual / Brand System) and §8.5 (Visual continuity) of `2026-05-16-saudi-visa-services-design.md`. Backend, IA, schema, operations, and rollout from that spec all stand.

---

## 1. Problem & Goal

The v1 visa pages shipped functionally complete but visually flat — text on the existing dark-navy GlobalHire chrome, no hero imagery, no animation, no design ambition. User feedback: *"not inspiring at all, just so dull, no animations, no images, doesn't look like a modern design."*

**Goal:** redesign the visual layer of every visa-touching surface so the line feels like a premium, modern Saudi-themed product — without changing the backend, the information architecture, or the case-management workflow already shipped in v1.

**Constraints (locked from brainstorm):**

1. Direction: **Visit-Saudi cinematic** — gold + ivory + walnut palette, serif headlines, full-bleed imagery, aspirational tone.
2. Brand boundary: **contained** — the cinematic look lives only inside `<main>` on `/visa*` + `/dashboard/visas*` + `/admin/visas*` routes. The existing GlobalHire dark-navy nav + footer remain untouched.
3. Scope: **all visa surfaces** — marketing pages get full cinematic; intake + dashboard + admin get a restrained version of the same palette so density and workflow are preserved.
4. Imagery: **free stock** (Unsplash, Pexels, Wikimedia) for AlUla / Red Sea / Riyadh / family scenes; **Wikimedia / partner-licensed only** for any religious imagery (Kaaba, Masjid al-Haram, Madinah). AI-generated imagery is **out of scope** for this redesign — that was a B option not chosen.
5. Motion budget: **heavy** — hero video on `/visa` hub, ken-burns on visa-detail pages, View Transitions API between routes, GSAP ScrollTrigger for pinned story sections and parallax, IntersectionObserver scroll reveals, vanilla rAF animated price counters, mouse-tracking spotlight on hub hero, Lenis momentum scroll on marketing pages. All gated by `prefers-reduced-motion` and (for video) Network Information API.

**Out of scope:**

- Changes to the GlobalHire global nav, footer, or unrelated pages (`/`, `/jobs`, `/about`, etc.)
- Schema / RLS / edge function changes
- Information-architecture changes (URLs, page set, content sections)
- Operational workflow (state machine, refund policy, notifications)
- AI image generation
- A separate visa subdomain (still served at `globalhire.elabsolution.org/visa*`)

---

## 2. Surface Inventory

| URL | Tier | What this redesign does |
|---|---|---|
| `/visa.html` | Marketing (cinematic) | New hero with video + parallax; new wizard surface; pinned story; new catalog cards; trust strip |
| `/visa-tourist-evisa.html` | Marketing (cinematic) | New hero photo + ken-burns; two-column body; new price card; FAQ |
| `/visa-umrah.html` | Marketing (cinematic) | Same as Tourist, with **authentic** Kaaba photo |
| `/visa-family-visit.html` | Marketing (cinematic) | Same template, family hero |
| `/visa-family-residence.html` | Marketing (cinematic) | Same template, family hero |
| `/visa-about.html` | Marketing (cinematic) | Editorial one-pager; partner card; six-step "How it works" |
| `/visa-start.html` | Functional (restrained) | Same three-step intake, ivory + gold styling, no hero photo |
| `/dashboard-visas.html` | Functional (restrained) | Case list with serif titles, semantic-pill statuses, gold left-rail |
| `/dashboard-visa-case.html` | Functional (restrained) | Case detail with gold timeline rail, semantic invoices, action card |
| `/admin-visas.html` | Functional (restrained) | Dense queue table with gold-underlined column headers |
| `/admin-visa-case.html` | Functional (restrained) | Per-case admin with inline accept/reject and sticky action panel |

---

## 3. Foundation

### 3.1 Palette

| Token | Hex | Role |
|---|---|---|
| `--ivory` | `#FAF6EE` | Body background |
| `--sand` | `#F0E6D0` | Card background, hover bg |
| `--gold` | `#D4A85A` | Accent, CTAs, focus rings, left-rails, top-borders, highlights |
| `--gold-soft` | `#fcd34d` | Hero accent text (`em` inside h1/h2), button fill |
| `--bronze` | `#A87830` | Price displays, secondary numbers, link hover |
| `--walnut` | `#6B4E2C` | Muted text, secondary buttons, dark sections |
| `--espresso` | `#3D2818` | Body text, primary headlines |
| `--midnight` | `#1A0F05` | Hero gradient bottom, deepest sections |
| `--fef3c7` | `#FEF3C7` | Text on espresso/walnut/midnight backgrounds |

**Semantic colours (preserved from existing tokens.css for the functional pages):**

| Token | Hex | Role |
|---|---|---|
| `--success` | `#2EC4B6` (teal) | Issued, paid, accepted |
| `--warning` | `#F4A261` (amber) | Action needed, revision, stale |
| `--error` | `#E63946` (coral) | Rejected, refund |
| `--info` | `#48CAE4` (cyan) | Informational |

**Hero overlay rule (every cinematic hero):** `linear-gradient(180deg, rgba(26,15,5,0.1) 30%, rgba(26,15,5,0.75) 100%)` over the background image, to guarantee text legibility.

**Global chrome untouched:** the existing dark-navy GlobalHire nav (`--bg-void: #0A1628` from `tokens.css`) and footer remain. The cinematic palette begins at the `<main>` boundary on visa routes.

### 3.2 Type

| Family | Weights | Used for |
|---|---|---|
| **Cormorant Garamond** (Google Fonts, variable, italic) | 300, 400, 500, 600 + italic | `h1`, `h2`, price displays, "step N" labels |
| **Inter** (already loaded site-wide) | 400, 500, 600 | Body, buttons, labels, tables, forms |

**Scale (mobile-first, fluid):**

| Selector | Size | Family | Notes |
|---|---|---|---|
| `h1.cinematic` | `clamp(2.5rem, 6vw, 5rem)` | Cormorant 400 italic | Used as `… Your Saudi visa, <em>handled.</em>` — italic carries the second clause |
| `h2.cinematic` | `clamp(1.5rem, 4vw, 2.75rem)` | Cormorant 500 | Section headings |
| `h3` | `1.25rem` | Inter 600 | Card titles |
| `.kicker` | `0.6875rem` | Inter 500 uppercase, 2 px letter-spacing, `opacity .55` | "— Section name —" labels |
| Body | `1rem / 1.65` | Inter 400 | Max-width `65ch` |
| `.price-display` | `clamp(2rem, 4vw, 3rem)` | Cormorant 500, colour `--bronze` | "$210" in price cards + catalog |

**Functional pages:** body type stays Inter throughout; Cormorant appears only on the `h1` (page title) and any `.price-display` element. Tables, form labels, status pills, and button labels are always Inter.

### 3.3 Spacing & shape

- 8 px base unit (consistent with existing `tokens.css`)
- Soft radii: cards `4 px`, buttons `0` (sharp, editorial), pills `999 px`
- Editorial whitespace: marketing pages use `padding-block: clamp(3rem, 8vw, 6rem)` on sections; functional pages use the existing dashboard spacing
- One shadow scale: `0 4px 16px rgba(107,78,44,0.08)` for cards on ivory; no shadows on espresso/walnut sections

### 3.4 Motion system

| Effect | Where | Implementation |
|---|---|---|
| Hero video bg | `/visa` hub only (1 hero) | `<video autoplay muted loop playsinline poster="…">` with WebM + MP4 sources; attached after LCP via `requestIdleCallback`. Removed if `prefers-reduced-motion` OR Network Information API reports `< 3 Mbps` |
| Hero photo + ken-burns | Every cinematic visa-detail page | Pure CSS `@keyframes ken-burns` — `transform: scale(1) → scale(1.08)` over 18 s, infinite alternate |
| Page transitions | Between `/visa*` routes | `document.startViewTransition()` (Chrome / Edge / Safari 18+); CSS `opacity` fade fallback elsewhere |
| Scroll reveals | Section entries on all cinematic pages | IntersectionObserver toggling `.is-visible` class; CSS handles the actual fade + 20px slide-up |
| Pinned story sections | `/visa` hub + `/visa-about` | GSAP 3 + ScrollTrigger via CDN (~70 KB), `async` loaded |
| Multi-layer parallax | All cinematic hero sections | GSAP ScrollTrigger — 3 layers (bg image, mid silhouette, fg text) move at `0.3×`, `0.6×`, `1.0×` scroll |
| Animated price counters | Catalog cards + visa-detail price card | Vanilla `requestAnimationFrame` loop, 800 ms easeOutCubic, triggered on viewport enter |
| Mouse-tracking spotlight | `/visa` hub hero only | `--mouse-x`, `--mouse-y` CSS custom properties updated via throttled `mousemove`; CSS `radial-gradient` overlay reads them |
| Smooth scroll | All marketing pages | Lenis (~6 KB) via CDN; disabled by `prefers-reduced-motion` |
| Hover + focus | Everything | Pure CSS transitions, 150 ms ease |

**Reduced-motion guarantee:** a single `@media (prefers-reduced-motion: reduce)` block disables ken-burns, parallax, GSAP timelines, Lenis, video autoplay (poster only stays), price counters (final value rendered immediately), and mouse-tracking. The page remains fully functional and visually intact.

**Slow-connection guarantee:** video is gated by `navigator.connection?.downlink >= 3` (Mbps). On slower connections, the static poster image is shown and `<video>` is never attached.

### 3.5 Imagery

| Page | Hero | Section accents | Source |
|---|---|---|---|
| `/visa` | Saudi montage video, ~12s loop (AlUla → Riyadh → Red Sea); poster PNG | 3 landscape stills inside story sections | Pexels / Wikimedia |
| `/visa-tourist-evisa` | AlUla rock formations at sunset | Red Sea, Diriyah | Unsplash |
| `/visa-umrah` | **Authentic Masjid al-Haram photo** | Madinah, Nusuk-style | **Wikimedia (mandatory)** |
| `/visa-family-visit` | Family at Riyadh airport arrival | Saudi family-friendly destinations | Unsplash / Pexels |
| `/visa-family-residence` | Family home / community in Riyadh | Schools, neighborhoods | Unsplash / Pexels |
| `/visa-about` | Diriyah heritage / partner motif | Partner logo card | Wikimedia + partner-supplied |
| `/visa-start` | Subtle ivory→sand gradient (no photo) | — | CSS only |
| `/dashboard-visas*` + `/admin-visas*` | Solid ivory body (no photo) | — | CSS only |

**Format rules:**

- AVIF + WebP fallback via `<picture>` for every hero. JPEG fallback inside `<picture>` as a last resort.
- Hero dimensions: 1920×1080 desktop, 750×1000 mobile (orientation-aware via `<source media="…">`).
- Video: H.264 MP4 + VP9 WebM, ~1500 kbps, total ≤ 1 MB. Poster: AVIF/WebP/JPEG.
- All images `loading="lazy"` except the LCP hero, which uses `<link rel="preload">` and `fetchpriority="high"`.
- **Attribution lives in `/visa-about`** footer block — list each image with its source + author per Unsplash / Wikimedia licence requirements.

**Religious imagery rule:** any depiction of Masjid al-Haram, the Kaaba, the Prophet's Mosque in Madinah, or pilgrim crowds MUST come from Wikimedia Commons (or a partner-licensed source). No AI generation, no purely stock photography from sites that may have generated/composited material. The image's Wikimedia URL is logged in `docs/visa-imagery-attribution.md`.

### 3.6 Performance budget

| Metric | Target |
|---|---|
| LCP | < 2.5 s on Moto-G-class device over 4G |
| Total page weight, first load (`/visa` hub) | < 1.5 MB |
| Total page weight, subsequent visa pages | < 600 KB (assets cached) |
| JS budget | < 100 KB total (GSAP + ScrollTrigger ~90 KB, Lenis ~6 KB, bespoke ~4 KB) |
| Lighthouse mobile, marketing pages | ≥ 90 |
| Lighthouse mobile, functional pages | ≥ 95 (no hero imagery, no GSAP, no video) |

**Strategy:**

- Hero image preloaded via `<link rel="preload" as="image" fetchpriority="high">`.
- GSAP + ScrollTrigger + Lenis loaded with `<script async>` after first paint.
- Video element only created after LCP fires, behind reduced-motion + connection-speed checks.
- All non-LCP imagery `loading="lazy"`.
- Functional pages do NOT load GSAP, Lenis, or any video — only the shared `css/visa.css` + per-page JS already present.

---

## 4. Marketing-page anatomy (cinematic)

### 4.1 `/visa` hub

**Layout (top to bottom):**

1. **Hero** (`height: 100vh`, min `560 px`):
   - Background: full-bleed Saudi montage video with hero overlay. Poster image displayed during load and as fallback.
   - SVG silhouette layers (foreground rocks, mid silhouette) overlaid for depth + parallax.
   - Centred or left-aligned content block:
     - Kicker: `— in partnership with [Partner Name] · MoFA-licensed —`
     - H1: `Your Saudi visa, <em>handled.</em>` (Cormorant 400 italic for the em)
     - Lede: `Tourist · Umrah · Family Visit · Family Residence. From $135 all-in.`
     - Primary CTA: `Find my visa →` (gold-soft fill, sentence-case, sharp corners)
     - Secondary CTA: `Watch how it works` (gold outline on transparent bg)
   - Scroll cue (`▼ SCROLL`) at bottom-right.
   - Mouse-tracking spotlight overlay reads `--mouse-x` / `--mouse-y`.

2. **Wizard section** (ivory bg):
   - Kicker `Step 1 of 3`
   - H2 `Tell us why you're going.`
   - 9 outcome cards (sand-on-ivory, 1px gold-soft border, serif card titles, Inter sub-copy). 4 lead to v1 visa-detail pages, 5 are "More options" coming-soon deflections grouped into a single highlighted card per §2 of original spec.

3. **Pinned story section** (espresso bg, white text):
   - Kicker `— Why us —`
   - H2 `A licensed Saudi specialist <em>behind every application</em>, and ELAB on your side from intake to issued.`
   - Three animated counter stats: `5 days · $50 · 7/7` with serif numbers in gold-soft, Inter sub-labels.
   - Pinned for `~150%` of viewport via GSAP ScrollTrigger; the headline crossfades to a longer story body as the user scrolls within the pin.

4. **Catalog section** (ivory bg):
   - Kicker `— Browse —`
   - H2 `All Saudi visas we issue.`
   - 9 catalog cards (4 v1 active + 5 coming-soon) in a 3-up grid. Each card: gradient-tinted hero strip (60–90 px) hinting at the destination palette, white card body, Cormorant title, Inter price + ETA. Coming-soon cards have 55% opacity and "Coming soon" instead of price.

5. **Trust strip** (walnut bg, white text):
   - 4 single-line claims with gold-soft check icon, kicker-style heading + Inter sub.
   - First claim: `✓ MoFA-licensed — Partner licence #[XXXX]`

6. **Existing GlobalHire footer** (dark navy, untouched).

### 4.2 `/visa/:slug` detail (template for all 4)

**Layout:**

1. **Hero** (`height: 60vh`, min `400 px`):
   - Background: visa-specific hero image with ken-burns + overlay.
   - Per-page silhouette SVG (e.g., AlUla rocks for Tourist eVisa).
   - Content block:
     - Breadcrumb kicker: `Family › <strong>Family Visit Visa</strong>`
     - H1: visa-specific headline with em accent (e.g., `Bring your family <em>to Saudi.</em>`)
     - Lede: 1–2 lines from existing visa content

2. **Body** (ivory bg, 2-column on desktop, stacked on mobile):
   - **Left column (2fr):**
     - Kicker `— What's included —` + bulleted list from existing copy
     - Kicker `— What you'll need —` + requirements line
     - Kicker `— FAQ —` + 3-4 questions in an `<details>` accordion (replaces v1's plain text); first question open by default
   - **Right column (1fr, sticky):**
     - White price card with gold top-border + soft shadow
     - "From" kicker, Cormorant price display, breakdown, primary CTA (gold-soft), secondary "WhatsApp us" outline, refund footnote

3. **Story strip** (espresso bg, white text):
   - One-line testimonial-style endorsement or value statement per visa type
   - Animated underline on the key phrase

4. **Existing GlobalHire footer.**

### 4.3 `/visa-about` editorial

**Layout:**

1. **Hero** (`height: 45vh`):
   - Background: Diriyah heritage photo with overlay
   - Kicker `— About this service —`
   - H1: `Two names on every receipt. <em>ELAB and your visa specialist.</em>`
   - Lede: 1 paragraph

2. **Partner section** (walnut bg):
   - 2-column block: square partner logo placeholder (or actual logo when supplied) + name + MoFA licence + bio paragraph
   - Gold underline divider

3. **"How it works" section** (ivory bg):
   - Kicker `— How it works —`
   - 6 numbered steps in an editorial vertical layout, hairline dividers between, serif step number + Inter description

4. **Image attribution footer** (sand bg, small Inter type):
   - List of all images used across visa pages with attribution per source licence

5. **Existing GlobalHire footer.**

---

## 5. Functional-page anatomy (restrained cinematic)

### 5.1 Restraint rules

| Aspect | Marketing (§4) | Functional (§5) |
|---|---|---|
| Page hero | Full-bleed 280–320 px photo + headline | 120 px ivory band, no photo, serif `h1` |
| Body type | Inter + Cormorant headlines | Inter throughout; Cormorant on `h1` + `.price-display` only |
| Background | Alternating ivory / espresso bands | Solid ivory body with sand cards |
| Motion | Parallax + video + GSAP + Lenis | Hover + focus only; no parallax, no Lenis. No JS animation libraries loaded |
| Status pills | N/A | Solid teal / walnut / amber / coral pills (high contrast) |
| Tables | N/A | Plain rows, 1 px hairline dividers, **2 px gold underline on column headers** |
| CTA buttons | Big serif label, gold fill | Inter sentence-case, gold-soft fill, normal size |

### 5.2 `/visa-start` intake

- Top band: ivory, kicker `Step 3 of 3 · Eligibility ✓ · Documents · <strong>Confirm & pay</strong>`, Cormorant h1 `Start your visa case`
- Body (2-column, stacks on mobile):
  - **Form column:** kicker'd sections (Applicant, Sponsor, Documents). Each input is white-on-sand with 1px gold-soft border, Inter labels.
  - Document uploads use 1px **dashed gold-soft** border + gold "UPLOAD" pill — signals "drop here".
  - **Sticky price card (right):** identical pattern to visa-detail price card — white bg, gold-soft top border, soft shadow, gold CTA `Pay $50 & start →`.

### 5.3 `/dashboard-visas` + `/dashboard-visa-case`

- List view: serif h1 `My Visa Cases`, secondary line `N active · M issued`. Each case is a white card with a 3 px gold-soft left rail + sand hover. Card body has Cormorant visa-type title, semantic status pill, relative time.
- Case detail: serif h1, breadcrumb kicker `← My Cases`, then a 12 px vertical gold-soft rail timeline (one event per line with date and bold label). Documents and invoices sit below in plain sand-bordered cards. PDF download CTA when issued.

### 5.4 `/admin-visas` queue

- Top band: serif h1 `Visa Case Queue`. Below it, a horizontal filter row (status dropdown + search input) — both white-on-sand with gold-soft borders.
- Table: header row with 2 px gold-soft underline; rows alternate white / sand; case ID in gold; semantic status pill; opacity-55 timestamp. No row shadows or pop-out hover — keep scannable.

### 5.5 `/admin-visa-case` per-case admin

- Same `/dashboard-visa-case` shell but adds inline accept/reject buttons (mini teal / coral pills) on each document row.
- Sticky white action panel on the right with 4 stacked CTAs (gold-soft primary `Submit to partner`, amber `Request revision`, teal `Mark issued`, coral `Reject & refund`).

---

## 6. CSS architecture

- `css/visa.css` (existing v1 file) is **rewritten** in this redesign. Estimated final size: 12–15 KB. All visa-specific styles live here; nothing leaks into other GlobalHire pages.
- One new CSS file: `css/visa-functional.css` for the restrained styles used by `/visa-start`, `/dashboard-visas*`, `/admin-visas*`. Lets functional pages skip the marketing CSS and stay lean. ~6–8 KB.
- Cormorant Garamond loaded via Google Fonts only on visa marketing pages — added to existing fonts link with a second `<link href="…&family=Cormorant+Garamond…">`.
- Custom properties for the new palette live at `:root` inside `visa.css` so they only apply where the visa CSS is included; existing `--bg-void` / `--primary` tokens are untouched.

## 7. JS architecture

| Module | Loaded on | What it does |
|---|---|---|
| `js/visa-motion.js` (new, ~4 KB) | Marketing pages | IntersectionObserver scroll-reveal, mouse-tracking variables, animated price counters, Lenis init, reduced-motion guard |
| `js/visa-hero-video.js` (new, ~1 KB) | `/visa` hub only | After LCP + reduced-motion check + connection check, attaches the `<video>` element and starts playback |
| GSAP 3 + ScrollTrigger (CDN) | `/visa` hub + `/visa-about` only | Pinned story sections + multi-layer parallax. Loaded `async`. |
| Lenis (CDN, ~6 KB) | All marketing pages | Smooth momentum scroll. Loaded `async`. |
| `js/visa-wizard.js` (existing) | `/visa` hub | Unchanged from v1 — outcome routing + lead submission |
| `js/visa-intake.js` (existing) | `/visa-start` | Unchanged |
| `js/dashboard-visas.js`, `js/dashboard-visa-case.js` (existing) | `/dashboard-visas*` | Unchanged |
| `js/admin-visas.js`, `js/admin-visa-case.js` (existing) | `/admin-visas*` | Unchanged |

The redesign deliberately keeps backend-facing JS untouched — only the visual/motion layer changes.

## 8. View Transitions

Visa marketing pages (`/visa*` excluding intake / dashboard / admin) opt in to View Transitions via a small shared handler on link clicks:

```js
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || !a.href.includes('/visa') || a.target === '_blank') return;
  if (!document.startViewTransition) return;            // graceful fallback
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  e.preventDefault();
  document.startViewTransition(() => { window.location.href = a.href; });
});
```

Hero element gets `view-transition-name: visa-hero` so the cross-fade is anchored. Functional pages do not opt in — direct navigation only.

## 9. Migration & deploy

- This redesign is implemented on branch `feat/saudi-visa-redesign` (already created) off `main`.
- All work is HTML + CSS + JS only. No schema migrations, no edge function changes, no Supabase deploys required.
- Vercel auto-deploys on push; PR can land in one merge.
- Before merging, run Lighthouse mobile on the preview URL for `/visa` and `/visa/family-visit` and confirm the perf targets from §3.6 are met.

## 10. Open items

| Item | Owner | Blocker? |
|---|---|---|
| Source the 12 hero/section images per §3.5 (AVIF + WebP + JPEG renditions, 1920×1080 + 750×1000) | implementer | YES — blocks visual realism |
| Source the `/visa` hub montage video (~12 s loop, ≤ 1 MB WebM/MP4) | implementer (Pexels search) | YES — blocks hub |
| Authentic Masjid al-Haram photo from Wikimedia for `/visa-umrah` | implementer | YES — blocks Umrah page |
| Partner logo image | partner | NO — text placeholder works v0; swap when supplied |
| `MoFA #[XXXX]` and `[Partner Name]` placeholders | partner | NO — same as v1; tracked in existing checklist |
| `docs/visa-imagery-attribution.md` listing every external image's licence + author | implementer | YES — required by Unsplash / Wikimedia licences |

## 11. Acceptance criteria

The redesign is considered complete when:

1. All 11 visa surfaces (§2) render in the new palette with the new typography and the per-page hero treatment described in §4 + §5.
2. Hero video plays on `/visa` hub when reduced-motion is off and connection ≥ 3 Mbps; otherwise poster only.
3. Cross-page navigation between `/visa*` routes uses the View Transitions fade in supported browsers; standard navigation elsewhere.
4. GSAP-driven pinned story section on `/visa` hub triggers and crossfades on scroll; parallax on every cinematic hero.
5. `prefers-reduced-motion: reduce` disables ken-burns, GSAP, Lenis, video autoplay, and price-counter animations — and the pages remain visually intact and fully functional.
6. Lighthouse mobile scores meet §3.6 targets on the deployed Vercel preview.
7. Every external image carries attribution in `docs/visa-imagery-attribution.md` per its source licence.
8. The redesign touches zero backend code, zero schema, zero edge functions. Diff is HTML + CSS + JS + images + docs only.

## 12. Self-review pass

- **Placeholder scan:** `[Partner Name]`, `MoFA #[XXXX]` — both are partner-data-dependent, called out in §10 and inherited from v1 spec, intentional.
- **Internal consistency:** every page in §2 is covered by an anatomy section in §4 or §5. Motion budget in §3.4 matches the per-effect implementation in §7. Imagery sources in §3.5 match the religious-imagery rule restated in §3.5 ("Religious imagery rule").
- **Scope check:** v1 backend untouched; spec is implementation-plannable in one pass (one CSS rewrite + two new JS modules + per-page HTML edits + asset acquisition). Reasonable for a single subagent-driven plan.
- **Ambiguity check:** "heavy motion" is decomposed in §3.4 into a specific per-effect table, removing room for interpretation. Restraint rules in §5.1 are explicit per aspect, no judgement calls left.
