# Saudi Visa Services Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the visual layer of 11 live visa surfaces in the Visit-Saudi cinematic direction (gold/ivory/walnut + serif + full-bleed imagery + heavy motion on marketing, restrained on functional) — zero backend changes.

**Architecture:** Rewrite `css/visa.css`, add `css/visa-functional.css` for restrained pages, add two new JS modules (`js/visa-motion.js`, `js/visa-hero-video.js`), load GSAP + ScrollTrigger + Lenis from CDN on marketing pages only, source images from Pexels/Unsplash/Wikimedia + one Saudi montage video, rewrite each visa page's `<main>` to use the new markup. Existing globalhire nav + footer + backend untouched.

**Tech Stack:** Vanilla HTML/CSS/JS, GSAP 3 + ScrollTrigger (CDN), Lenis (CDN), Google Fonts (Cormorant Garamond + Inter), View Transitions API, IntersectionObserver, Deno (for the small JS unit tests on motion helpers).

**Spec reference:** `docs/superpowers/specs/2026-05-16-saudi-visa-services-redesign.md`.

**Branch:** `feat/saudi-visa-redesign` (already created, off `main`, spec already committed).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `assets/visa/img/*.{avif,webp,jpg}` | Create | All hero + section images, optimized renditions |
| `assets/visa/video/saudi-montage.{webm,mp4}` | Create | `/visa` hub hero video (≤ 1 MB total) |
| `assets/visa/img/saudi-montage-poster.{avif,webp,jpg}` | Create | Video poster fallback |
| `docs/visa-imagery-attribution.md` | Create | Required by Unsplash/Wikimedia licences |
| `css/visa.css` | **Rewrite** | New tokens, type, layout, motion CSS for cinematic marketing pages |
| `css/visa-functional.css` | Create | Restrained palette for intake/dashboard/admin |
| `supabase/functions/_shared/visa-types.ts` | Untouched | Backend types — already shipped, do not modify |
| `js/visa-motion.js` | Create | Reduced-motion guard, IO scroll reveals, mouse-tracking, price counters, Lenis init, View Transitions link handler |
| `js/visa-hero-video.js` | Create | Post-LCP attach of `<video>` with reduced-motion + downlink gating |
| `js/visa-motion_test.ts` | Create | Deno unit tests for the pure helpers in visa-motion.js (exported as a sibling .ts module for tests) |
| `js/visa-hero-video_test.ts` | Create | Deno unit tests for hero-video helpers |
| `visa.html` | **Rewrite `<main>`** | New cinematic hub: hero video, wizard, pinned story, catalog, trust strip |
| `visa-tourist-evisa.html` | **Rewrite `<main>`** | Cinematic detail page with AlUla hero |
| `visa-umrah.html` | **Rewrite `<main>`** | Cinematic detail page with **authentic** Masjid al-Haram hero |
| `visa-family-visit.html` | **Rewrite `<main>`** | Cinematic detail page with family-airport hero |
| `visa-family-residence.html` | **Rewrite `<main>`** | Cinematic detail page with family-home hero |
| `visa-about.html` | **Rewrite `<main>`** | Editorial one-pager with Diriyah hero + partner card + how-it-works + attribution footer |
| `visa-start.html` | **Modify `<main>`** | Restrained: swap nav-only class names; remove dark navy bg; apply ivory + gold via visa-functional.css |
| `dashboard-visas.html` | **Modify `<main>`** | Restrained variant |
| `dashboard-visa-case.html` | **Modify `<main>`** | Restrained variant with gold timeline rail |
| `admin-visas.html` | **Modify `<main>`** | Restrained: dense table with gold-underlined headers |
| `admin-visa-case.html` | **Modify `<main>`** | Restrained: sticky white action panel with semantic-colored CTAs |

---

## Per-spec acceptance criteria (from §11 of the spec)

These are validation gates the plan must satisfy:

1. All 11 surfaces render in the new palette/type/layout.
2. Hero video plays on `/visa` only when reduced-motion off AND connection ≥ 3 Mbps; otherwise poster only.
3. View Transitions fade between `/visa*` routes in supported browsers.
4. GSAP pinned story + parallax on `/visa` hub + every cinematic hero.
5. `prefers-reduced-motion: reduce` disables ken-burns, GSAP, Lenis, video autoplay, price-counter animations — pages remain fully functional.
6. Lighthouse mobile ≥ 90 on marketing pages, ≥ 95 on functional pages.
7. Every external image attributed in `docs/visa-imagery-attribution.md`.
8. Zero backend code changed in this diff.

---

### Task 1: Source assets and write the attribution doc

The cinematic look fails without imagery. This task acquires every image + video the rest of the plan needs.

**Files:**
- Create: `assets/visa/img/visa-hub-poster.{avif,webp,jpg}` (1920×1080 + 750×1000)
- Create: `assets/visa/video/saudi-montage.{webm,mp4}` (≤ 1 MB total)
- Create: `assets/visa/img/visa-tourist-hero.{avif,webp,jpg}` (1920×1080 + 750×1000)
- Create: `assets/visa/img/visa-umrah-hero.{avif,webp,jpg}` (1920×1080 + 750×1000) — **Wikimedia source mandatory**
- Create: `assets/visa/img/visa-family-visit-hero.{avif,webp,jpg}`
- Create: `assets/visa/img/visa-family-residence-hero.{avif,webp,jpg}`
- Create: `assets/visa/img/visa-about-hero.{avif,webp,jpg}` (Diriyah heritage)
- Create: `assets/visa/img/sec-1.{avif,webp,jpg}`, `sec-2.{avif,webp,jpg}`, `sec-3.{avif,webp,jpg}` (3 landscape stills used as story-section accents on the hub)
- Create: `docs/visa-imagery-attribution.md`

#### Step 1: Create the asset directory structure

```bash
cd /Users/samuel/GLOBALHIRE@ELAB
mkdir -p assets/visa/img assets/visa/video
```

#### Step 2: Source the seven hero images

Each must be either:
- A Pexels photo: visit https://www.pexels.com, search the term below, sort by "Curated", pick a horizontal high-resolution result (≥ 1920 px wide), confirm Pexels licence allows commercial use.
- An Unsplash photo: same workflow at https://unsplash.com.
- A Wikimedia Commons file: https://commons.wikimedia.org/wiki/Special:Search — must be CC-BY-SA 4.0 or CC-BY 4.0 or PD.

Specific image briefs:

| Save as | Subject | Search term suggestion | Source |
|---|---|---|---|
| `visa-hub-poster` | Aerial / sweeping AlUla rock formations at golden hour | "AlUla Saudi Arabia" or "Hegra Madain Saleh" | Pexels (preferred) |
| `visa-tourist-hero` | AlUla rocks at sunset, ground-level perspective | "AlUla sunset" | Unsplash |
| `visa-umrah-hero` | **Authentic** photo of Masjid al-Haram (Kaaba in centre or tawaf) | Wikimedia Commons search: "Masjid al-Haram" | **Wikimedia only** |
| `visa-family-visit-hero` | Family / travellers at an airport arrivals hall (Saudi-themed if available; generic warm-toned arrivals if not) | "airport arrivals reunion" | Pexels |
| `visa-family-residence-hero` | Saudi residential neighbourhood at dusk, or a Saudi family scene | "Riyadh neighbourhood evening" or "Saudi family" | Unsplash |
| `visa-about-hero` | Diriyah / Saudi heritage architecture (mud-brick walls, palm trees) | "Diriyah Saudi" or "At-Turaif" | Wikimedia preferred |
| `sec-1`, `sec-2`, `sec-3` | Red Sea coast, Riyadh skyline, AlUla canyon — three distinct landscape moods | "Red Sea Saudi", "Riyadh skyline", "AlUla canyon" | Pexels / Unsplash |

For each image:
- Download the original.
- Open it in any editor that supports AVIF + WebP export (macOS Preview → Export As works for JPEG/WebP; for AVIF use `cwebp`/`avifenc` CLI or an online converter like https://squoosh.app).
- Produce three renditions per image:
  - Desktop: `<name>.avif` (1920×1080, quality ~50), `<name>.webp` (quality 75), `<name>.jpg` (quality 80) — all at 1920×1080 with smart crop
  - Mobile: `<name>-mobile.avif`, `<name>-mobile.webp`, `<name>-mobile.jpg` — all at 750×1000 (portrait crop)
- Save into `assets/visa/img/`. Confirm each file is ≤ 200 KB.

#### Step 3: Source and convert the hub montage video

- Visit https://www.pexels.com/videos and search for "Saudi Arabia". Pick a short cinematic clip with AlUla or Riyadh imagery, ≤ 30 s, ≥ 1080p.
- Download the MP4.
- Trim to ~12 seconds using `ffmpeg`:

```bash
ffmpeg -i /path/to/downloaded.mp4 -ss 0 -t 12 -c:v libx264 -b:v 1500k -an -movflags +faststart assets/visa/video/saudi-montage.mp4
ffmpeg -i /path/to/downloaded.mp4 -ss 0 -t 12 -c:v libvpx-vp9 -b:v 1200k -an assets/visa/video/saudi-montage.webm
```

- Confirm: `ls -lh assets/visa/video/` — both files combined < 1 MB. If over, lower bitrate (`-b:v 1000k`) and rerun.
- Extract a poster frame:

```bash
ffmpeg -i assets/visa/video/saudi-montage.mp4 -ss 2 -frames:v 1 /tmp/poster.png
# Then convert /tmp/poster.png → visa-hub-poster.{avif,webp,jpg} via the same converter
```

#### Step 4: Write the attribution doc

```markdown
# Visa Imagery Attribution

Required by image-source licences (Pexels, Unsplash, Wikimedia Commons). Rendered on /visa-about under the "Image attribution" footer.

## Hero images

| Page | File | Source URL | Author | Licence |
|---|---|---|---|---|
| /visa | assets/visa/img/visa-hub-poster.* | <pexels url> | <photographer> | Pexels Licence |
| /visa | assets/visa/video/saudi-montage.* | <pexels videos url> | <videographer> | Pexels Licence |
| /visa-tourist-evisa | assets/visa/img/visa-tourist-hero.* | <unsplash url> | <photographer> | Unsplash Licence |
| /visa-umrah | assets/visa/img/visa-umrah-hero.* | <wikimedia url> | <author> | CC BY-SA 4.0 |
| /visa-family-visit | assets/visa/img/visa-family-visit-hero.* | <url> | <author> | <licence> |
| /visa-family-residence | assets/visa/img/visa-family-residence-hero.* | <url> | <author> | <licence> |
| /visa-about | assets/visa/img/visa-about-hero.* | <url> | <author> | <licence> |

## Section accents

| File | Source URL | Author | Licence |
|---|---|---|---|
| assets/visa/img/sec-1.* | <url> | <author> | <licence> |
| assets/visa/img/sec-2.* | <url> | <author> | <licence> |
| assets/visa/img/sec-3.* | <url> | <author> | <licence> |
```

Fill the placeholders with actual URLs / authors / licences from the source pages while sourcing. Do not commit with placeholder text — every row must be populated.

#### Step 5: Verify

```bash
cd /Users/samuel/GLOBALHIRE@ELAB
ls -la assets/visa/img/ | head -30
ls -la assets/visa/video/
du -sh assets/visa/
# Expected: ~10 MB total or less; every file ≤ 200 KB (images) or ≤ 1 MB combined (video)
```

Confirm all rows in `docs/visa-imagery-attribution.md` have a real URL, real author, real licence. No bracketed placeholders.

#### Step 6: Commit

```bash
git add assets/visa/ docs/visa-imagery-attribution.md
git commit -m "feat(visa): source hero imagery + montage video + attribution"
```

---

### Task 2: Add Cormorant Garamond font to all visa pages

**Files:**
- Modify: `visa.html`, `visa-tourist-evisa.html`, `visa-umrah.html`, `visa-family-visit.html`, `visa-family-residence.html`, `visa-about.html`, `visa-start.html`, `dashboard-visas.html`, `dashboard-visa-case.html`, `admin-visas.html`, `admin-visa-case.html`

#### Step 1: Find the existing font link on `visa.html`

The current line is:

```html
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

#### Step 2: Replace with the new link adding Cormorant Garamond on every visa HTML page

```html
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&display=swap" rel="stylesheet">
```

Do this with a one-shot `sed` to keep all 11 pages in lockstep:

```bash
cd /Users/samuel/GLOBALHIRE@ELAB
for f in visa.html visa-tourist-evisa.html visa-umrah.html visa-family-visit.html visa-family-residence.html visa-about.html visa-start.html dashboard-visas.html dashboard-visa-case.html admin-visas.html admin-visa-case.html; do
  sed -i '' 's|family=Inter:wght@300;400;500;600;700&display=swap|family=Inter:wght@300;400;500;600;700\&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600\&display=swap|' "$f"
done
```

#### Step 3: Verify

```bash
grep -c "Cormorant+Garamond" visa*.html dashboard-visa*.html admin-visa*.html
# Expected: 11 lines, each "<filename>:1"
```

#### Step 4: Commit

```bash
git add visa.html visa-tourist-evisa.html visa-umrah.html visa-family-visit.html visa-family-residence.html visa-about.html visa-start.html dashboard-visas.html dashboard-visa-case.html admin-visas.html admin-visa-case.html
git commit -m "feat(fonts): add Cormorant Garamond to all visa pages"
```

---

### Task 3: Rewrite `css/visa.css` for the cinematic marketing pages

This is the big foundation change. Existing `css/visa.css` (4.7 KB) is replaced entirely with ~13 KB of new tokens, type scale, layout primitives, and motion CSS.

**Files:**
- Modify: `css/visa.css` (full rewrite — read existing file first to confirm size, then overwrite)

#### Step 1: Read the existing file to confirm what's being replaced

```bash
wc -l css/visa.css
head -20 css/visa.css
```

#### Step 2: Overwrite `css/visa.css` with the new contents

```css
/* ============================================
   GLOBALHIRE@ELAB — Visa Services CSS
   Cinematic redesign — gold/ivory/walnut palette.
   Spec: docs/superpowers/specs/2026-05-16-saudi-visa-services-redesign.md
   Loaded on /visa* marketing pages. Functional pages also load
   css/visa-functional.css on top of this file.
   ============================================ */

:root {
  --ivory:       #FAF6EE;
  --sand:        #F0E6D0;
  --gold:        #D4A85A;
  --gold-soft:   #FCD34D;
  --bronze:      #A87830;
  --walnut:      #6B4E2C;
  --espresso:    #3D2818;
  --midnight:    #1A0F05;
  --on-dark:     #FEF3C7;

  /* Reuse globalhire semantic colours for status pills */
  --visa-success: #2EC4B6;
  --visa-warning: #F4A261;
  --visa-error:   #E63946;
  --visa-info:    #48CAE4;

  --visa-hero-overlay: linear-gradient(180deg, rgba(26,15,5,0.1) 30%, rgba(26,15,5,0.75) 100%);
  --visa-card-shadow:  0 4px 16px rgba(107,78,44,0.08);
  --visa-card-shadow-lg: 0 8px 32px rgba(107,78,44,0.12);
}

/* ── Layout reset for visa main ── */
body:has(.visa-main) {
  background: var(--ivory);
  color: var(--espresso);
  font-family: 'Inter', system-ui, sans-serif;
}

.visa-main {
  --section-padding: clamp(3rem, 8vw, 6rem);
}

/* ── Type ── */
.visa-h1 {
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-weight: 400;
  font-size: clamp(2.5rem, 6vw, 5rem);
  line-height: 1.02;
  letter-spacing: -0.01em;
  margin: 0;
}
.visa-h1 em { font-style: italic; color: var(--gold-soft); }

.visa-h2 {
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-weight: 500;
  font-size: clamp(1.5rem, 4vw, 2.75rem);
  line-height: 1.1;
  margin: 0;
}
.visa-h2 em { font-style: italic; color: var(--gold-soft); }

.visa-kicker {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.125em;
  text-transform: uppercase;
  opacity: 0.55;
  margin: 0 0 0.5rem;
}

.visa-lede {
  font-family: 'Inter', sans-serif;
  font-size: clamp(1rem, 1.5vw, 1.125rem);
  line-height: 1.65;
  max-width: 65ch;
  opacity: 0.9;
}

.visa-price-display {
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-weight: 500;
  font-size: clamp(2rem, 4vw, 3rem);
  color: var(--bronze);
  line-height: 1;
}

/* ── Section bands ── */
.visa-section { padding: var(--section-padding) clamp(1rem, 5vw, 3rem); }
.visa-section--ivory   { background: var(--ivory); color: var(--espresso); }
.visa-section--sand    { background: var(--sand);  color: var(--espresso); }
.visa-section--walnut  { background: var(--walnut); color: var(--on-dark); }
.visa-section--espresso{ background: var(--espresso); color: var(--on-dark); }
.visa-section--midnight{ background: var(--midnight); color: var(--on-dark); }

/* ── Hero (cinematic, with ken-burns) ── */
.visa-hero {
  position: relative;
  min-height: 560px;
  height: 100vh;
  max-height: 800px;
  overflow: hidden;
  display: grid;
  align-items: end;
  color: var(--on-dark);
}
.visa-hero--detail {
  height: 60vh;
  min-height: 400px;
  max-height: 600px;
}

.visa-hero__bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}
.visa-hero__bg img,
.visa-hero__bg video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  will-change: transform;
}
.visa-hero__bg img { animation: visa-ken-burns 18s ease-in-out infinite alternate; }
.visa-hero__overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: var(--visa-hero-overlay);
}
.visa-hero__silhouette {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  z-index: 2;
  pointer-events: none;
}
.visa-hero__content {
  position: relative;
  z-index: 3;
  padding: clamp(2rem, 6vw, 5rem) clamp(1rem, 5vw, 3rem);
  max-width: 720px;
}
.visa-hero__scroll-cue {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  z-index: 3;
  font-size: 0.6875rem;
  letter-spacing: 0.2em;
  color: rgba(254,243,199,0.6);
}

@keyframes visa-ken-burns {
  from { transform: scale(1)   translate(0,0); }
  to   { transform: scale(1.08) translate(-1%,-1%); }
}

/* ── Mouse-tracking spotlight (hub hero only) ── */
.visa-hero--hub::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: radial-gradient(
    600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
    rgba(252,211,77,0.15) 0%,
    transparent 60%
  );
  transition: opacity 0.3s ease;
}

/* ── Buttons ── */
.visa-btn {
  display: inline-block;
  padding: 0.875rem 1.5rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-decoration: none;
  border: none;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}
.visa-btn--primary {
  background: var(--gold-soft);
  color: var(--espresso);
}
.visa-btn--primary:hover { background: #ffe066; transform: translateY(-1px); }
.visa-btn--outline {
  background: transparent;
  border: 1px solid rgba(254,243,199,0.4);
  color: var(--on-dark);
}
.visa-btn--outline:hover { background: rgba(254,243,199,0.1); }

/* ── Wizard chips (hub) ── */
.visa-wizard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}
.visa-wizard-chip {
  padding: 1rem 1.25rem;
  background: white;
  border: 1px solid var(--sand);
  border-radius: 4px;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease;
  text-align: left;
  font-family: 'Inter', sans-serif;
  color: var(--espresso);
}
.visa-wizard-chip:hover { transform: translateY(-2px); border-color: var(--gold); }
.visa-wizard-chip .title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 1.125rem;
  display: block;
}
.visa-wizard-chip .sub {
  font-size: 0.75rem;
  opacity: 0.65;
  display: block;
  margin-top: 0.25rem;
}
.visa-wizard-chip--more {
  background: #FAF0D0;
  border-color: var(--gold);
}
.visa-wizard-chip--more .title,
.visa-wizard-chip--more .sub { color: var(--walnut); }

/* ── Story counter stats ── */
.visa-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: clamp(1rem, 3vw, 2rem);
  margin-top: 1.5rem;
}
.visa-stats__num {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(2rem, 5vw, 3.5rem);
  color: var(--gold-soft);
  font-weight: 400;
  line-height: 1;
  display: block;
}
.visa-stats__label {
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  opacity: 0.8;
  margin-top: 0.25rem;
  display: block;
}

/* ── Catalog cards ── */
.visa-catalog {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}
.visa-catalog-card {
  background: white;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: var(--visa-card-shadow);
  text-decoration: none;
  color: var(--espresso);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  display: block;
}
.visa-catalog-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--visa-card-shadow-lg);
}
.visa-catalog-card__strip {
  height: 80px;
  background: linear-gradient(135deg, var(--gold), var(--walnut));
}
.visa-catalog-card--tourist  .visa-catalog-card__strip { background: linear-gradient(135deg, #f4d4a0, #c08850); }
.visa-catalog-card--umrah    .visa-catalog-card__strip { background: linear-gradient(135deg, #2c4a70, #0e2842); }
.visa-catalog-card--family   .visa-catalog-card__strip { background: linear-gradient(135deg, #c9a570, #6b4e2c); }
.visa-catalog-card--residence .visa-catalog-card__strip { background: linear-gradient(135deg, #b88c50, #5a3a18); }
.visa-catalog-card__body { padding: 1rem; }
.visa-catalog-card__title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 1.125rem;
  font-weight: 500;
  margin: 0;
}
.visa-catalog-card__meta {
  font-size: 0.75rem;
  opacity: 0.7;
  margin-top: 0.25rem;
}
.visa-catalog-card__meta strong { color: var(--bronze); }
.visa-catalog-card--coming { opacity: 0.55; cursor: not-allowed; }
.visa-catalog-card--more {
  background: var(--sand);
  display: grid;
  place-items: center;
  text-align: center;
  padding: 1rem;
}

/* ── Trust strip ── */
.visa-trust {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  padding: 1rem clamp(1rem, 5vw, 3rem);
}
.visa-trust__item {
  font-size: 0.75rem;
}
.visa-trust__item strong {
  display: block;
  color: var(--gold-soft);
  font-size: 0.8125rem;
  margin-bottom: 0.25rem;
}

/* ── Visa-detail two-column ── */
.visa-detail-layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: clamp(1rem, 4vw, 2.5rem);
  max-width: 1200px;
  margin: 0 auto;
}
@media (max-width: 720px) { .visa-detail-layout { grid-template-columns: 1fr; } }

.visa-detail-body h2 { font-family: 'Cormorant Garamond', serif; }
.visa-detail-body ul {
  padding-left: 1.25rem;
  line-height: 1.7;
  font-size: 0.9375rem;
}

/* Price card (used on visa-detail + visa-start sticky aside) */
.visa-price-card {
  position: sticky;
  top: 100px;
  background: white;
  border-top: 3px solid var(--gold);
  padding: 1.25rem;
  box-shadow: var(--visa-card-shadow);
  height: fit-content;
}
.visa-price-card__from {
  font-size: 0.6875rem;
  letter-spacing: 0.125em;
  text-transform: uppercase;
  opacity: 0.6;
}
.visa-price-card__breakdown {
  font-size: 0.75rem;
  opacity: 0.6;
  margin-top: 0.25rem;
}
.visa-price-card__cta {
  display: block;
  width: 100%;
  text-align: center;
  margin-top: 1rem;
}
.visa-price-card__footnote {
  font-size: 0.6875rem;
  opacity: 0.6;
  margin-top: 0.75rem;
  line-height: 1.5;
}

/* ── FAQ accordion ── */
.visa-faq details {
  padding: 0.75rem 0;
  border-bottom: 1px solid rgba(107,78,44,0.15);
}
.visa-faq summary {
  cursor: pointer;
  font-weight: 500;
  list-style: none;
}
.visa-faq summary::after {
  content: "+";
  float: right;
  color: var(--gold);
  font-weight: 400;
  font-size: 1.25rem;
}
.visa-faq details[open] summary::after { content: "−"; }
.visa-faq details p {
  margin-top: 0.5rem;
  opacity: 0.85;
  line-height: 1.7;
}

/* ── Scroll reveal: opacity + slide-up via IO ── */
.visa-reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.visa-reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}

/* ── View Transitions API anchor ── */
.visa-hero { view-transition-name: visa-hero; }

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  .visa-hero__bg img { animation: none; }
  .visa-reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }
  .visa-hero--hub::before { background: none; }
  .visa-catalog-card,
  .visa-wizard-chip {
    transition: none;
  }
  .visa-catalog-card:hover,
  .visa-wizard-chip:hover {
    transform: none;
  }
}
```

#### Step 3: Sanity check

```bash
wc -l css/visa.css
# Expected: ~320 lines, ~12-13 KB
```

#### Step 4: Visual smoke (existing visa.html still uses OLD class names, so it will look broken)

```bash
python3 -m http.server 8000 &
sleep 1
curl -sLo /dev/null -w "HTTP %{http_code}, %{size_download} bytes\n" http://localhost:8000/css/visa.css
kill %1 2>/dev/null
# Expected: HTTP 200, ~12-13 KB
```

Visual breakage is expected at this point — class names change. Tasks 7-12 rewrite the HTML.

#### Step 5: Commit

```bash
git add css/visa.css
git commit -m "feat(css): rewrite visa.css for cinematic gold/ivory/walnut palette"
```

---

### Task 4: Create `css/visa-functional.css` for restrained pages

**Files:**
- Create: `css/visa-functional.css`

#### Step 1: Write the file

```css
/* ============================================
   GLOBALHIRE@ELAB — Visa Functional CSS
   Restrained palette for intake/dashboard/admin.
   Loaded ON TOP OF css/visa.css.
   Spec §5 (restraint rules)
   ============================================ */

/* Functional pages get a slim ivory band where marketing has a full hero */
.visa-fn-header {
  background: var(--ivory);
  padding: 1.25rem clamp(1rem, 5vw, 3rem) 1rem;
  border-bottom: 1px solid var(--sand);
}
.visa-fn-header__kicker {
  font-size: 0.6875rem;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  letter-spacing: 0.125em;
  text-transform: uppercase;
  opacity: 0.55;
  margin: 0;
}
.visa-fn-header__kicker strong { color: var(--bronze); opacity: 1; }
.visa-fn-header__title {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 400;
  font-size: clamp(1.5rem, 3vw, 1.75rem);
  margin: 0.25rem 0 0;
  color: var(--espresso);
}

.visa-fn-body {
  background: var(--ivory);
  color: var(--espresso);
  padding: clamp(1rem, 3vw, 2rem) clamp(1rem, 5vw, 3rem);
}

/* ── Form fields (intake) ── */
.visa-field {
  display: block;
  width: 100%;
  padding: 0.625rem 0.75rem;
  background: white;
  border: 1px solid var(--sand);
  border-radius: 3px;
  font-family: 'Inter', sans-serif;
  font-size: 0.875rem;
  color: var(--espresso);
}
.visa-field:focus {
  outline: none;
  border-color: var(--gold);
  box-shadow: 0 0 0 3px rgba(212,168,90,0.15);
}

/* ── Doc upload tile ── */
.visa-doc-upload {
  padding: 0.625rem 0.75rem;
  background: white;
  border: 1px dashed var(--gold);
  border-radius: 3px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8125rem;
  color: var(--walnut);
  margin-bottom: 0.375rem;
  cursor: pointer;
}
.visa-doc-upload__badge {
  padding: 0.125rem 0.375rem;
  background: var(--gold);
  color: white;
  border-radius: 2px;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

/* ── Status pills ── */
.visa-pill {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.visa-pill--success  { background: var(--visa-success); color: white; }
.visa-pill--warning  { background: var(--visa-warning); color: var(--espresso); }
.visa-pill--error    { background: var(--visa-error);   color: white; }
.visa-pill--neutral  { background: var(--walnut);       color: var(--on-dark); }

/* ── Dashboard case card ── */
.visa-case-card {
  display: block;
  padding: 0.75rem 1rem;
  background: white;
  border-left: 3px solid var(--gold);
  border-radius: 0 3px 3px 0;
  text-decoration: none;
  color: var(--espresso);
  margin-bottom: 0.5rem;
}
.visa-case-card:hover { background: var(--sand); }
.visa-case-card__title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 1rem;
  font-weight: 500;
}
.visa-case-card__meta {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.visa-case-card__meta time { opacity: 0.55; }

/* ── Timeline (case detail) ── */
.visa-timeline {
  padding-left: 1rem;
  border-left: 2px solid var(--gold);
}
.visa-timeline__item {
  padding: 0.5rem 0;
  font-size: 0.8125rem;
}
.visa-timeline__item strong { display: inline; }
.visa-timeline__item time { opacity: 0.55; margin-left: 0.5rem; }
.visa-timeline__item--current { color: var(--bronze); }

/* ── Admin queue table ── */
.visa-queue {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
.visa-queue thead th {
  text-align: left;
  padding: 0.5rem 1rem;
  font-size: 0.625rem;
  font-weight: 500;
  letter-spacing: 0.125em;
  text-transform: uppercase;
  opacity: 0.55;
  border-bottom: 2px solid var(--gold);
}
.visa-queue tbody td {
  padding: 0.625rem 1rem;
  border-bottom: 1px solid var(--sand);
}
.visa-queue tbody tr:hover { background: var(--sand); }
.visa-queue .case-id { color: var(--bronze); font-weight: 600; }

/* ── Admin action card ── */
.visa-actions {
  background: white;
  border-top: 3px solid var(--gold);
  padding: 1rem;
  box-shadow: var(--visa-card-shadow);
  display: grid;
  gap: 0.5rem;
}
.visa-actions .visa-btn {
  width: 100%;
  text-align: center;
}
.visa-actions .visa-btn--revision { background: var(--visa-warning); color: var(--espresso); }
.visa-actions .visa-btn--issued   { background: var(--visa-success); color: white; }
.visa-actions .visa-btn--reject   { background: var(--visa-error);   color: white; }

/* Functional pages explicitly disable cinematic motion regardless of reduced-motion */
.visa-fn-body * {
  view-transition-name: none;
}
```

#### Step 2: Verify

```bash
wc -l css/visa-functional.css
# Expected: ~150 lines, ~5-7 KB
```

#### Step 3: Commit

```bash
git add css/visa-functional.css
git commit -m "feat(css): add visa-functional.css for restrained intake/dashboard/admin"
```

---

### Task 5: Create `js/visa-motion.js` with TDD

**Files:**
- Create: `js/visa-motion.js`
- Create: `js/visa-motion_test.ts` (Deno test using URL-based import of the JS module's testable helpers)

The browser-only browser-coupled bits (IntersectionObserver, Lenis init) are mounted in the file's bottom auto-init block. The testable helpers — pure functions — are exported at the top.

#### Step 1: Write the failing test FIRST

```typescript
// js/visa-motion_test.ts
import { assertEquals } from 'jsr:@std/assert@^1.0.0';
import {
  shouldEnableMotion,
  shouldUseViewTransitions,
  animatePriceCounter,
} from './visa-motion.ts';

Deno.test('shouldEnableMotion: false when reduced-motion=true', () => {
  assertEquals(shouldEnableMotion({ reducedMotion: true,  hasIO: true }), false);
});

Deno.test('shouldEnableMotion: false when IO unsupported', () => {
  assertEquals(shouldEnableMotion({ reducedMotion: false, hasIO: false }), false);
});

Deno.test('shouldEnableMotion: true when not reduced and IO supported', () => {
  assertEquals(shouldEnableMotion({ reducedMotion: false, hasIO: true }), true);
});

Deno.test('shouldUseViewTransitions: false if API missing', () => {
  assertEquals(shouldUseViewTransitions({ apiSupported: false, reducedMotion: false }), false);
});

Deno.test('shouldUseViewTransitions: false if reduced motion', () => {
  assertEquals(shouldUseViewTransitions({ apiSupported: true, reducedMotion: true }), false);
});

Deno.test('shouldUseViewTransitions: true if API supported and motion allowed', () => {
  assertEquals(shouldUseViewTransitions({ apiSupported: true, reducedMotion: false }), true);
});

Deno.test('animatePriceCounter: easeOutCubic interpolates monotonically and ends at target', () => {
  const values: number[] = [];
  animatePriceCounter({
    from: 0, to: 100, duration: 100,
    onTick: (v) => values.push(v),
    now: (i => () => i++ * 10)(0),  // simulated clock: 0, 10, 20, … ms
    deadline: 12,
  });
  // Final value clamps to target
  assertEquals(values[values.length - 1], 100);
  // Monotonically increasing
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[i-1]) throw new Error(`non-monotonic at ${i}: ${values[i]} < ${values[i-1]}`);
  }
});
```

#### Step 2: Run test — expect FAIL

```bash
cd /Users/samuel/GLOBALHIRE@ELAB
deno test --allow-all js/visa-motion_test.ts
```

Expected: `Module not found "./visa-motion.ts"`.

#### Step 3: Write `js/visa-motion.ts` (TypeScript-style; browser file is the same code with extension `.js`)

We will write TWO files: `visa-motion.ts` (exports the testable helpers, runs only the helper definitions, no DOM access) and `visa-motion.js` (the browser file that imports the helpers via a `<script>` and also wires up DOM listeners).

Actually for simplicity, keep a single `.js` file and re-export from a tiny TS shim. **Simpler approach:** write the testable helpers as pure functions inside `js/visa-motion.js` using ES module exports, and write the test in `.ts` that imports from `./visa-motion.js`. Modern Deno supports `.js` module imports.

Create `js/visa-motion.js`:

```javascript
/* ============================================
   GLOBALHIRE@ELAB — Visa motion module
   Pure-function helpers (top of file) + DOM wiring (bottom).
   Spec §3.4
   ============================================ */

/* ───────── Pure helpers (also imported by visa-motion_test.ts) ───────── */

export function shouldEnableMotion({ reducedMotion, hasIO }) {
  return !reducedMotion && hasIO;
}

export function shouldUseViewTransitions({ apiSupported, reducedMotion }) {
  return apiSupported && !reducedMotion;
}

// Synthesizable test loop: caller supplies now() + deadline so the test can run synchronously.
export function animatePriceCounter({ from, to, duration, onTick, now = () => performance.now(), deadline = Infinity }) {
  const start = now();
  let iter = 0;
  while (iter++ < deadline) {
    const t = Math.min(1, (now() - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);  // easeOutCubic
    const value = Math.round(from + (to - from) * eased);
    onTick(value);
    if (t >= 1) return;
  }
}

/* ───────── DOM wiring — runs only in browsers ───────── */

if (typeof window !== 'undefined') {

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasIO = 'IntersectionObserver' in window;

  // — Scroll reveals —
  if (shouldEnableMotion({ reducedMotion, hasIO })) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });
    document.querySelectorAll('.visa-reveal').forEach((el) => io.observe(el));
  }

  // — Mouse-tracking spotlight (hub hero only) —
  if (!reducedMotion) {
    const hero = document.querySelector('.visa-hero--hub');
    if (hero) {
      let rafId = 0;
      hero.addEventListener('mousemove', (e) => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const rect = hero.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          hero.style.setProperty('--mouse-x', x + '%');
          hero.style.setProperty('--mouse-y', y + '%');
        });
      });
    }
  }

  // — Animated price counters —
  document.querySelectorAll('[data-visa-counter]').forEach((el) => {
    const to = Number(el.dataset.visaCounter);
    if (!Number.isFinite(to)) return;

    if (reducedMotion) { el.textContent = '$' + to; return; }

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.disconnect();
        animatePriceCounter({
          from: 0, to, duration: 800,
          onTick: (v) => { el.textContent = '$' + v; },
        });
      }
    });
    io.observe(el);
  });

  // — View Transitions on /visa* internal links —
  if (shouldUseViewTransitions({
    apiSupported: typeof document.startViewTransition === 'function',
    reducedMotion,
  })) {
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank') return;
      const href = a.getAttribute('href');
      if (!href || !href.startsWith('/') && !href.includes('visa')) return;
      // Only intercept same-origin links to other visa pages
      if (!/^(\/?visa[\w-]*\.html)/.test(href.replace(window.location.origin, '').replace(/^\//, ''))) return;
      e.preventDefault();
      document.startViewTransition(() => { window.location.href = a.href; });
    });
  }

  // — Lenis smooth scroll (only when motion enabled and Lenis is loaded) —
  if (!reducedMotion && typeof window.Lenis === 'function') {
    const lenis = new window.Lenis({ duration: 1.2, smoothTouch: false });
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
  }
}
```

#### Step 4: Run test — expect PASS (7 tests)

```bash
deno test --allow-all js/visa-motion_test.ts
# Expected: ok | 7 passed | 0 failed
```

#### Step 5: Commit

```bash
git add js/visa-motion.js js/visa-motion_test.ts
git commit -m "feat(js): visa-motion module with TDD helpers + DOM wiring"
```

---

### Task 6: Create `js/visa-hero-video.js` with TDD

**Files:**
- Create: `js/visa-hero-video.js`
- Create: `js/visa-hero-video_test.ts`

#### Step 1: Failing test FIRST

```typescript
// js/visa-hero-video_test.ts
import { assertEquals } from 'jsr:@std/assert@^1.0.0';
import { shouldLoadVideo, buildVideoElement } from './visa-hero-video.js';

Deno.test('shouldLoadVideo: false on reduced motion', () => {
  assertEquals(shouldLoadVideo({ reducedMotion: true,  downlink: 10 }), false);
});

Deno.test('shouldLoadVideo: false when downlink < 3 Mbps', () => {
  assertEquals(shouldLoadVideo({ reducedMotion: false, downlink: 1.5 }), false);
});

Deno.test('shouldLoadVideo: true when motion ok and fast enough', () => {
  assertEquals(shouldLoadVideo({ reducedMotion: false, downlink: 5 }), true);
});

Deno.test('shouldLoadVideo: undefined downlink means assume fast (defensive default)', () => {
  assertEquals(shouldLoadVideo({ reducedMotion: false, downlink: undefined }), true);
});

Deno.test('buildVideoElement: returns a serialisable description (testable in Deno)', () => {
  const desc = buildVideoElement({
    sources: [{ src: 'a.webm', type: 'video/webm' }, { src: 'a.mp4', type: 'video/mp4' }],
    poster: 'p.jpg',
  });
  assertEquals(desc.tag, 'video');
  assertEquals(desc.attrs.autoplay, true);
  assertEquals(desc.attrs.muted, true);
  assertEquals(desc.attrs.loop, true);
  assertEquals(desc.attrs.playsinline, true);
  assertEquals(desc.attrs.poster, 'p.jpg');
  assertEquals(desc.children.length, 2);
  assertEquals(desc.children[0], { tag: 'source', attrs: { src: 'a.webm', type: 'video/webm' } });
});
```

#### Step 2: Run — expect FAIL

```bash
deno test --allow-all js/visa-hero-video_test.ts
```

#### Step 3: Implement `js/visa-hero-video.js`

```javascript
/* ============================================
   GLOBALHIRE@ELAB — Hub hero video module
   Post-LCP attach guarded by reduced-motion + downlink.
   Spec §3.4
   ============================================ */

export function shouldLoadVideo({ reducedMotion, downlink }) {
  if (reducedMotion) return false;
  if (downlink !== undefined && downlink < 3) return false;
  return true;
}

// Returns a serialisable description; useful in tests.
// In browsers, the description is converted to a real DOM node via toDOM().
export function buildVideoElement({ sources, poster }) {
  return {
    tag: 'video',
    attrs: {
      autoplay: true,
      muted: true,
      loop: true,
      playsinline: true,
      poster,
    },
    children: sources.map((s) => ({
      tag: 'source',
      attrs: { src: s.src, type: s.type },
    })),
  };
}

function descriptionToDOM(desc, doc) {
  const el = doc.createElement(desc.tag);
  for (const [k, v] of Object.entries(desc.attrs)) {
    if (v === true) el.setAttribute(k, '');
    else if (v === false || v == null) continue;
    else el.setAttribute(k, String(v));
  }
  for (const c of desc.children || []) {
    el.appendChild(descriptionToDOM(c, doc));
  }
  return el;
}

if (typeof window !== 'undefined') {
  // Look for a hero container with the data attributes that describe the video sources.
  const ready = () => {
    const heroBg = document.querySelector('.visa-hero--hub .visa-hero__bg');
    if (!heroBg) return;
    const webm = heroBg.dataset.videoWebm;
    const mp4  = heroBg.dataset.videoMp4;
    const poster = heroBg.dataset.poster;
    if (!webm && !mp4) return;

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const downlink = navigator.connection?.downlink;

    if (!shouldLoadVideo({ reducedMotion, downlink })) return;

    const sources = [];
    if (webm) sources.push({ src: webm, type: 'video/webm' });
    if (mp4)  sources.push({ src: mp4,  type: 'video/mp4' });

    const desc = buildVideoElement({ sources, poster });
    const video = descriptionToDOM(desc, document);
    // Replace the poster image, if any, with the video. Else just append.
    const posterImg = heroBg.querySelector('img');
    if (posterImg) posterImg.replaceWith(video); else heroBg.appendChild(video);
  };

  // Defer until after LCP-ish window via rIC, or as soon as DOM ready if rIC unavailable
  if ('requestIdleCallback' in window) {
    requestIdleCallback(ready, { timeout: 2500 });
  } else {
    setTimeout(ready, 1200);
  }
}
```

#### Step 4: Run tests — expect PASS (5 tests)

```bash
deno test --allow-all js/visa-hero-video_test.ts
# Expected: ok | 5 passed | 0 failed
```

#### Step 5: Commit

```bash
git add js/visa-hero-video.js js/visa-hero-video_test.ts
git commit -m "feat(js): hero-video module with TDD guards + post-LCP attach"
```

---

### Task 7: Rewrite `visa.html` (hub) `<main>` for cinematic

**Files:**
- Modify: `visa.html` — replace the `<main>` block and update `<head>` script tags to include GSAP/Lenis CDN + the two new JS modules

#### Step 1: Open `visa.html` and locate the existing `<main>` block (everything between `<main>` and `</main>`)

```bash
grep -n "^[[:space:]]*<main\|^[[:space:]]*</main" visa.html
```

#### Step 2: Replace the entire `<main>...</main>` block with the cinematic version

The new `<main>` block:

```html
<main class="visa-main">

  <!-- HERO -->
  <section class="visa-hero visa-hero--hub">
    <div class="visa-hero__bg"
         data-video-webm="/assets/visa/video/saudi-montage.webm"
         data-video-mp4="/assets/visa/video/saudi-montage.mp4"
         data-poster="/assets/visa/img/visa-hub-poster.jpg">
      <picture>
        <source type="image/avif" srcset="/assets/visa/img/visa-hub-poster.avif">
        <source type="image/webp" srcset="/assets/visa/img/visa-hub-poster.webp">
        <img src="/assets/visa/img/visa-hub-poster.jpg" alt="" fetchpriority="high">
      </picture>
    </div>
    <div class="visa-hero__overlay"></div>
    <svg class="visa-hero__silhouette" height="120" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0,120 L0,80 Q40,40 80,70 Q120,30 160,60 Q200,20 240,55 Q280,15 320,50 Q360,25 400,60 L400,120 Z" fill="#1a0f05" opacity="0.6"/>
    </svg>
    <div class="visa-hero__content">
      <p class="visa-kicker">— in partnership with [Partner Name] · MoFA-licensed —</p>
      <h1 class="visa-h1">Your Saudi visa,<br><em>handled.</em></h1>
      <p class="visa-lede">Tourist · Umrah · Family Visit · Family Residence. From $135 all-in. Submitted by a licensed Saudi visa specialist.</p>
      <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <a class="visa-btn visa-btn--primary" href="#wizard">Find my visa →</a>
        <a class="visa-btn visa-btn--outline" href="visa-about.html">Watch how it works</a>
      </div>
    </div>
    <div class="visa-hero__scroll-cue">▼ SCROLL</div>
  </section>

  <!-- WIZARD -->
  <section id="wizard" class="visa-section visa-section--ivory visa-reveal">
    <p class="visa-kicker">Step 1 of 3</p>
    <h2 class="visa-h2">Tell us why you're going.</h2>
    <div class="visa-wizard-grid">
      <button type="button" class="visa-wizard-chip" data-outcome="visit-saudi">
        <span class="title">Visit Saudi</span><span class="sub">Tourism · AlUla · events</span>
      </button>
      <button type="button" class="visa-wizard-chip" data-outcome="go-for-umrah">
        <span class="title">Go for Umrah</span><span class="sub">Religious pilgrimage</span>
      </button>
      <button type="button" class="visa-wizard-chip" data-outcome="bring-my-family">
        <span class="title">Bring my family</span><span class="sub">Iqama-holder visit</span>
      </button>
      <button type="button" class="visa-wizard-chip" data-outcome="live-with-family">
        <span class="title">Live with family</span><span class="sub">Family Residence</span>
      </button>
      <button type="button" class="visa-wizard-chip visa-wizard-chip--more" data-outcome="more">
        <span class="title">More options</span><span class="sub">Hajj · Work · Business · Domestic Worker · Premium Residency</span>
      </button>
    </div>
    <div id="wizard-deflection" hidden style="margin-top: 1.5rem;"></div>
  </section>

  <!-- PINNED STORY -->
  <section class="visa-section visa-section--espresso visa-reveal">
    <p class="visa-kicker" style="opacity: 0.6;">— Why us —</p>
    <h2 class="visa-h2" style="max-width: 720px;">A licensed Saudi specialist <em>behind every application</em>, and ELAB on your side from intake to issued.</h2>
    <div class="visa-stats">
      <div>
        <span class="visa-stats__num"><span data-visa-counter="5">$0</span> days</span>
        <span class="visa-stats__label">average for tourist eVisa</span>
      </div>
      <div>
        <span class="visa-stats__num"><span data-visa-counter="50">$0</span></span>
        <span class="visa-stats__label">refundable deposit to start</span>
      </div>
      <div>
        <span class="visa-stats__num">7/7</span>
        <span class="visa-stats__label">WhatsApp human support</span>
      </div>
    </div>
  </section>

  <!-- CATALOG -->
  <section class="visa-section visa-section--ivory visa-reveal">
    <p class="visa-kicker">— Browse —</p>
    <h2 class="visa-h2">All Saudi visas we issue.</h2>
    <div class="visa-catalog">
      <a class="visa-catalog-card visa-catalog-card--tourist" href="visa-tourist-evisa.html">
        <div class="visa-catalog-card__strip"></div>
        <div class="visa-catalog-card__body">
          <h3 class="visa-catalog-card__title">Tourist eVisa</h3>
          <p class="visa-catalog-card__meta">5–7 days · From <strong>$185</strong></p>
        </div>
      </a>
      <a class="visa-catalog-card visa-catalog-card--umrah" href="visa-umrah.html">
        <div class="visa-catalog-card__strip"></div>
        <div class="visa-catalog-card__body">
          <h3 class="visa-catalog-card__title">Umrah</h3>
          <p class="visa-catalog-card__meta">3–5 days · From <strong>$295</strong></p>
        </div>
      </a>
      <a class="visa-catalog-card visa-catalog-card--family" href="visa-family-visit.html">
        <div class="visa-catalog-card__strip"></div>
        <div class="visa-catalog-card__body">
          <h3 class="visa-catalog-card__title">Family Visit</h3>
          <p class="visa-catalog-card__meta">7–14 days · From <strong>$210</strong></p>
        </div>
      </a>
      <a class="visa-catalog-card visa-catalog-card--residence" href="visa-family-residence.html">
        <div class="visa-catalog-card__strip"></div>
        <div class="visa-catalog-card__body">
          <h3 class="visa-catalog-card__title">Family Residence</h3>
          <p class="visa-catalog-card__meta">4–8 wks · From <strong>$320</strong></p>
        </div>
      </a>
      <div class="visa-catalog-card visa-catalog-card--more">
        <div>
          <p class="visa-catalog-card__title">+5 more</p>
          <p class="visa-catalog-card__meta">Hajj · Business · Work · Domestic Worker · Premium Residency</p>
        </div>
      </div>
    </div>
  </section>

  <!-- TRUST STRIP -->
  <section class="visa-section--walnut" style="padding: 1.25rem 0;">
    <div class="visa-trust">
      <div class="visa-trust__item"><strong>✓ MoFA-licensed</strong>Partner licence #[XXXX]</div>
      <div class="visa-trust__item"><strong>✓ Real-time status</strong>Tracked in your dashboard</div>
      <div class="visa-trust__item"><strong>✓ Refundable deposit</strong>Full refund if ineligible</div>
      <div class="visa-trust__item"><strong>✓ WhatsApp 7 days</strong>Real humans, 7am–10pm</div>
    </div>
  </section>

</main>
```

#### Step 3: Insert the GSAP + Lenis CDN scripts + new JS modules immediately before the closing `</body>`

Find the existing block (near the bottom):

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="js/supabase-client.js"></script>
<script src="js/visa-wizard.js"></script>
```

Append immediately after:

```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/@studio-freight/lenis@1.0.45/dist/lenis.min.js" defer></script>
<script type="module" src="js/visa-motion.js"></script>
<script type="module" src="js/visa-hero-video.js"></script>
```

#### Step 4: Add a hero image preload to `<head>`

After the existing `<link rel="preconnect">` block in `<head>`, add:

```html
<link rel="preload" as="image" href="/assets/visa/img/visa-hub-poster.jpg" fetchpriority="high">
```

#### Step 5: Visual smoke test

```bash
python3 -m http.server 8000 &
sleep 1
# Open http://localhost:8000/visa in a browser
```

Confirm: ivory body, serif h1 with italic "handled." in gold-soft, walnut trust strip at the bottom, 5 wizard chips, 5 catalog cards. Hero shows the AlUla poster image. After ~1 s the video may attach if connection is fast.

```bash
kill %1
```

#### Step 6: Commit

```bash
git add visa.html
git commit -m "feat(page): /visa hub — cinematic hero + wizard + story + catalog"
```

---

### Task 8: Rewrite `visa-tourist-evisa.html` `<main>` for cinematic

**Files:**
- Modify: `visa-tourist-evisa.html`

#### Step 1: Replace the existing `<main>...</main>` block

```html
<main class="visa-main">

  <section class="visa-hero visa-hero--detail">
    <div class="visa-hero__bg">
      <picture>
        <source type="image/avif" srcset="/assets/visa/img/visa-tourist-hero.avif">
        <source type="image/webp" srcset="/assets/visa/img/visa-tourist-hero.webp">
        <img src="/assets/visa/img/visa-tourist-hero.jpg" alt="AlUla rock formations at sunset" fetchpriority="high">
      </picture>
    </div>
    <div class="visa-hero__overlay"></div>
    <div class="visa-hero__content">
      <p class="visa-kicker">Tourism › <strong>Tourist eVisa</strong></p>
      <h1 class="visa-h1">Saudi Tourist <em>eVisa.</em></h1>
      <p class="visa-lede">1-year multiple-entry visa for tourism — AlUla, the Red Sea, Saudi Season events. Up to 90 days per stay.</p>
    </div>
  </section>

  <section class="visa-section visa-section--ivory">
    <div class="visa-detail-layout">
      <div class="visa-detail-body visa-reveal">
        <p class="visa-kicker">— What's included —</p>
        <ul>
          <li>eVisa application submitted by our MoFA-licensed partner</li>
          <li>Document review &amp; eligibility verification</li>
          <li>WhatsApp + email status updates</li>
          <li>Visa PDF delivered to your dashboard</li>
        </ul>
        <p class="visa-kicker" style="margin-top: 2rem;">— What you'll need —</p>
        <ul>
          <li>Passport bio page scan (valid 6+ months)</li>
          <li>Recent passport-style photo</li>
        </ul>
        <p class="visa-kicker" style="margin-top: 2rem;">— FAQ —</p>
        <div class="visa-faq">
          <details open>
            <summary>How long does it take?</summary>
            <p>5–7 working days from clean submission.</p>
          </details>
          <details>
            <summary>How long can I stay?</summary>
            <p>Up to 90 days per visit, 180 days total per year.</p>
          </details>
          <details>
            <summary>Refunds?</summary>
            <p>$50 deposit fully refunded if you're ineligible at intake. After submission, partner-side fees are non-refundable.</p>
          </details>
        </div>
      </div>
      <aside class="visa-price-card">
        <p class="visa-price-card__from">From</p>
        <p class="visa-price-display">$<span data-visa-counter="185">185</span></p>
        <p class="visa-price-card__breakdown">Government $135 + ELAB $50</p>
        <a class="visa-btn visa-btn--primary visa-price-card__cta" href="visa.html#wizard">Check eligibility →</a>
        <a class="visa-btn visa-btn--outline visa-price-card__cta" style="color: var(--walnut); border-color: var(--walnut); margin-top: 0.5rem;" href="https://wa.me/9295419232">WhatsApp us</a>
        <p class="visa-price-card__footnote">No payment until eligibility confirmed. $50 deposit. Refundable if ineligible at intake.</p>
      </aside>
    </div>
  </section>

  <section class="visa-section visa-section--espresso visa-reveal">
    <p class="visa-kicker" style="opacity: 0.6;">— Saudi is open —</p>
    <h2 class="visa-h2" style="max-width: 700px;">From <em>AlUla's rock formations</em> to the Red Sea coast, your tourist visa unlocks all of it.</h2>
  </section>

</main>
```

#### Step 2: Add the same script + preload changes as Task 7 Step 3 + Step 4

GSAP + Lenis CDN + visa-motion.js + visa-hero-video.js at the bottom; preload the page-specific hero image in `<head>`:

```html
<link rel="preload" as="image" href="/assets/visa/img/visa-tourist-hero.jpg" fetchpriority="high">
```

(NOTE: visa-hero-video.js is harmless on non-hub pages — it'll find no `.visa-hero--hub` element and bail.)

#### Step 3: Smoke + commit

```bash
git add visa-tourist-evisa.html
git commit -m "feat(page): visa-tourist-evisa — cinematic ken-burns hero + price card"
```

---

### Task 9: Rewrite `visa-umrah.html` `<main>` for cinematic

**Files:**
- Modify: `visa-umrah.html`

#### Step 1: Replace `<main>...</main>` block (template from Task 8, swap subject)

```html
<main class="visa-main">

  <section class="visa-hero visa-hero--detail">
    <div class="visa-hero__bg">
      <picture>
        <source type="image/avif" srcset="/assets/visa/img/visa-umrah-hero.avif">
        <source type="image/webp" srcset="/assets/visa/img/visa-umrah-hero.webp">
        <img src="/assets/visa/img/visa-umrah-hero.jpg" alt="Masjid al-Haram, Mecca" fetchpriority="high">
      </picture>
    </div>
    <div class="visa-hero__overlay"></div>
    <div class="visa-hero__content">
      <p class="visa-kicker">Religious › <strong>Umrah Visa</strong></p>
      <h1 class="visa-h1">Umrah, <em>year-round.</em></h1>
      <p class="visa-lede">Single-entry pilgrimage visa, up to 30 days. Issued via Nusuk by our MoFA-licensed Umrah operator.</p>
    </div>
  </section>

  <section class="visa-section visa-section--ivory">
    <div class="visa-detail-layout">
      <div class="visa-detail-body visa-reveal">
        <p class="visa-kicker">— What's included —</p>
        <ul>
          <li>Nusuk submission by our licensed Umrah operator</li>
          <li>Document review</li>
          <li>WhatsApp + email status updates</li>
          <li>Visa PDF delivered to your dashboard</li>
        </ul>
        <p class="visa-kicker" style="margin-top: 2rem;">— What you'll need —</p>
        <ul>
          <li>Passport bio page (valid 6+ months from arrival)</li>
          <li>Recent passport-style photo</li>
          <li>Female pilgrims under 40 — Mahram declaration may be required (we'll guide you)</li>
        </ul>
        <p class="visa-kicker" style="margin-top: 2rem;">— FAQ —</p>
        <div class="visa-faq">
          <details open>
            <summary>Processing time?</summary>
            <p>3–5 working days from clean submission.</p>
          </details>
          <details>
            <summary>Can I perform Hajj on an Umrah visa?</summary>
            <p>No. Hajj is quota-controlled and requires a separate visa. Our dedicated Hajj packages launch soon.</p>
          </details>
          <details>
            <summary>Refunds?</summary>
            <p>$50 deposit refunded if ineligible at intake. Partner-side fees non-refundable after submission.</p>
          </details>
        </div>
      </div>
      <aside class="visa-price-card">
        <p class="visa-price-card__from">From</p>
        <p class="visa-price-display">$<span data-visa-counter="295">295</span></p>
        <p class="visa-price-card__breakdown">Operator $245 + ELAB $50</p>
        <a class="visa-btn visa-btn--primary visa-price-card__cta" href="visa.html#wizard">Check eligibility →</a>
        <a class="visa-btn visa-btn--outline visa-price-card__cta" style="color: var(--walnut); border-color: var(--walnut); margin-top: 0.5rem;" href="https://wa.me/9295419232">WhatsApp us</a>
        <p class="visa-price-card__footnote">$50 deposit. Refundable if ineligible at intake.</p>
      </aside>
    </div>
  </section>

  <section class="visa-section visa-section--espresso visa-reveal">
    <p class="visa-kicker" style="opacity: 0.6;">— With reverence —</p>
    <h2 class="visa-h2" style="max-width: 700px;">Submitted by a <em>MoFA-licensed Umrah operator</em>, with the same dignity your pilgrimage deserves.</h2>
  </section>

</main>
```

#### Step 2: Add the hero preload in `<head>`

```html
<link rel="preload" as="image" href="/assets/visa/img/visa-umrah-hero.jpg" fetchpriority="high">
```

Add the same CDN + JS module scripts at the bottom (same as Task 7 Step 3).

#### Step 3: Commit

```bash
git add visa-umrah.html
git commit -m "feat(page): visa-umrah — cinematic with authentic Kaaba hero"
```

---

### Task 10: Rewrite `visa-family-visit.html` `<main>` for cinematic

**Files:**
- Modify: `visa-family-visit.html`

#### Step 1: Replace `<main>`

```html
<main class="visa-main">

  <section class="visa-hero visa-hero--detail">
    <div class="visa-hero__bg">
      <picture>
        <source type="image/avif" srcset="/assets/visa/img/visa-family-visit-hero.avif">
        <source type="image/webp" srcset="/assets/visa/img/visa-family-visit-hero.webp">
        <img src="/assets/visa/img/visa-family-visit-hero.jpg" alt="Family reunion at airport arrivals" fetchpriority="high">
      </picture>
    </div>
    <div class="visa-hero__overlay"></div>
    <div class="visa-hero__content">
      <p class="visa-kicker">Family › <strong>Family Visit Visa</strong></p>
      <h1 class="visa-h1">Bring your family <em>to Saudi.</em></h1>
      <p class="visa-lede">For Iqama-holders inviting spouse, children, or parents. Up to 90 days, extendable in-country.</p>
    </div>
  </section>

  <section class="visa-section visa-section--ivory">
    <div class="visa-detail-layout">
      <div class="visa-detail-body visa-reveal">
        <p class="visa-kicker">— What's included —</p>
        <ul>
          <li>MoFA application submitted by our licensed partner</li>
          <li>Document review &amp; sponsor verification</li>
          <li>WhatsApp + email status updates</li>
          <li>Visa PDF delivered to your dashboard</li>
        </ul>
        <p class="visa-kicker" style="margin-top: 2rem;">— What you'll need —</p>
        <ul>
          <li>Visitor's passport bio page (valid 6+ months)</li>
          <li>Recent passport-style photo</li>
          <li>Sponsor's Iqama (front + back)</li>
          <li>Sponsor's salary certificate (recent, employer letterhead)</li>
          <li>Family relationship proof — marriage certificate, birth certificate, etc.</li>
        </ul>
        <p class="visa-kicker" style="margin-top: 2rem;">— FAQ —</p>
        <div class="visa-faq">
          <details open>
            <summary>Processing time?</summary>
            <p>7–14 working days from clean submission.</p>
          </details>
          <details>
            <summary>Can it be extended to a residence visa?</summary>
            <p>Family Visit cannot be directly converted. You'd apply for Family Residence (a separate service we offer).</p>
          </details>
          <details>
            <summary>Refunds?</summary>
            <p>$50 deposit refunded if ineligible at intake. Partner-side fees non-refundable after submission.</p>
          </details>
        </div>
      </div>
      <aside class="visa-price-card">
        <p class="visa-price-card__from">From</p>
        <p class="visa-price-display">$<span data-visa-counter="210">210</span></p>
        <p class="visa-price-card__breakdown">Government $160 + ELAB $50</p>
        <a class="visa-btn visa-btn--primary visa-price-card__cta" href="visa.html#wizard">Check eligibility →</a>
        <a class="visa-btn visa-btn--outline visa-price-card__cta" style="color: var(--walnut); border-color: var(--walnut); margin-top: 0.5rem;" href="https://wa.me/9295419232">WhatsApp us</a>
        <p class="visa-price-card__footnote">$50 deposit. Refundable if ineligible at intake.</p>
      </aside>
    </div>
  </section>

  <section class="visa-section visa-section--espresso visa-reveal">
    <p class="visa-kicker" style="opacity: 0.6;">— Together —</p>
    <h2 class="visa-h2" style="max-width: 700px;">From <em>the arrivals hall</em> to the dinner table, ninety days you both deserve.</h2>
  </section>

</main>
```

#### Step 2: Add preload + scripts as Tasks 7-9.

#### Step 3: Commit

```bash
git add visa-family-visit.html
git commit -m "feat(page): visa-family-visit — cinematic with airport-arrival hero"
```

---

### Task 11: Rewrite `visa-family-residence.html` `<main>` for cinematic

**Files:**
- Modify: `visa-family-residence.html`

#### Step 1: Replace `<main>`

```html
<main class="visa-main">

  <section class="visa-hero visa-hero--detail">
    <div class="visa-hero__bg">
      <picture>
        <source type="image/avif" srcset="/assets/visa/img/visa-family-residence-hero.avif">
        <source type="image/webp" srcset="/assets/visa/img/visa-family-residence-hero.webp">
        <img src="/assets/visa/img/visa-family-residence-hero.jpg" alt="Saudi neighbourhood at dusk" fetchpriority="high">
      </picture>
    </div>
    <div class="visa-hero__overlay"></div>
    <div class="visa-hero__content">
      <p class="visa-kicker">Family › <strong>Family Residence</strong></p>
      <h1 class="visa-h1">Live in Saudi, <em>together.</em></h1>
      <p class="visa-lede">Permanent dependent residency for spouse and children of an Iqama holder. Processed via MoFA + Jawazat.</p>
    </div>
  </section>

  <section class="visa-section visa-section--ivory">
    <div class="visa-detail-layout">
      <div class="visa-detail-body visa-reveal">
        <p class="visa-kicker">— What's included —</p>
        <ul>
          <li>MoFA + Jawazat application by our licensed partner</li>
          <li>Sponsor eligibility check (income, profession category)</li>
          <li>Document review</li>
          <li>WhatsApp + email status updates</li>
          <li>Visa PDF delivered to your dashboard</li>
        </ul>
        <p class="visa-kicker" style="margin-top: 2rem;">— What you'll need —</p>
        <ul>
          <li>Each dependent's passport bio page (valid 6+ months)</li>
          <li>Recent passport-style photos</li>
          <li>Sponsor's Iqama (front + back)</li>
          <li>Sponsor's salary certificate (recent, employer letterhead)</li>
          <li>Sponsor's profession category (must be eligible)</li>
          <li>Marriage certificate (for spouse)</li>
          <li>Birth certificates (for children)</li>
        </ul>
        <p class="visa-kicker" style="margin-top: 2rem;">— FAQ —</p>
        <div class="visa-faq">
          <details open>
            <summary>Processing time?</summary>
            <p>4–8 weeks. Variable by sponsor's profession category and Jawazat workload.</p>
          </details>
          <details>
            <summary>Pricing per dependent?</summary>
            <p>From $320 covers one dependent. Each additional dependent ~$120.</p>
          </details>
          <details>
            <summary>Refunds?</summary>
            <p>$50 deposit refunded if ineligible at intake. Partner-side fees non-refundable after submission.</p>
          </details>
        </div>
      </div>
      <aside class="visa-price-card">
        <p class="visa-price-card__from">From</p>
        <p class="visa-price-display">$<span data-visa-counter="320">320</span></p>
        <p class="visa-price-card__breakdown">One dependent · gov + service fees</p>
        <a class="visa-btn visa-btn--primary visa-price-card__cta" href="visa.html#wizard">Check eligibility →</a>
        <a class="visa-btn visa-btn--outline visa-price-card__cta" style="color: var(--walnut); border-color: var(--walnut); margin-top: 0.5rem;" href="https://wa.me/9295419232">WhatsApp us</a>
        <p class="visa-price-card__footnote">$50 deposit. Refundable if ineligible at intake.</p>
      </aside>
    </div>
  </section>

  <section class="visa-section visa-section--espresso visa-reveal">
    <p class="visa-kicker" style="opacity: 0.6;">— Home —</p>
    <h2 class="visa-h2" style="max-width: 700px;">Not a visit — <em>a life</em>, with paperwork that respects how big a step that is.</h2>
  </section>

</main>
```

#### Step 2: Add preload + scripts as Tasks 7-10.

#### Step 3: Commit

```bash
git add visa-family-residence.html
git commit -m "feat(page): visa-family-residence — cinematic with neighbourhood hero"
```

---

### Task 12: Rewrite `visa-about.html` `<main>` for cinematic editorial

**Files:**
- Modify: `visa-about.html`

#### Step 1: Replace `<main>`

```html
<main class="visa-main">

  <section class="visa-hero visa-hero--detail">
    <div class="visa-hero__bg">
      <picture>
        <source type="image/avif" srcset="/assets/visa/img/visa-about-hero.avif">
        <source type="image/webp" srcset="/assets/visa/img/visa-about-hero.webp">
        <img src="/assets/visa/img/visa-about-hero.jpg" alt="Diriyah heritage architecture" fetchpriority="high">
      </picture>
    </div>
    <div class="visa-hero__overlay"></div>
    <div class="visa-hero__content">
      <p class="visa-kicker">— About this service —</p>
      <h1 class="visa-h1">Two names on every receipt.<br><em>ELAB and your visa specialist.</em></h1>
      <p class="visa-lede">You talk to ELAB. The application is submitted by a MoFA-licensed Saudi visa specialist. One accountable team, regulated paperwork.</p>
    </div>
  </section>

  <section class="visa-section visa-section--walnut visa-reveal">
    <div style="display: grid; grid-template-columns: 100px 1fr; gap: 1.5rem; max-width: 720px; margin: 0 auto;">
      <div style="background: var(--on-dark); color: var(--walnut); border-radius: 4px; aspect-ratio: 1; display: grid; place-items: center; font-family: 'Cormorant Garamond', serif; font-size: 0.875rem;">[Partner<br>logo]</div>
      <div>
        <p style="font-family: 'Cormorant Garamond', serif; font-size: 1.5rem; margin: 0;">[Partner Name]</p>
        <p style="font-size: 0.8125rem; opacity: 0.8; margin: 0.25rem 0;">MoFA Licence #[XXXX] · Riyadh</p>
        <p style="margin-top: 0.75rem; line-height: 1.7;">[Partner bio paragraph — supplied during onboarding. Cover years in business, geographic coverage, key visa types, accreditations.]</p>
      </div>
    </div>
  </section>

  <section class="visa-section visa-section--ivory visa-reveal">
    <p class="visa-kicker">— How it works —</p>
    <h2 class="visa-h2">Six steps from <em>question to PDF.</em></h2>
    <ol style="counter-reset: step; list-style: none; padding: 0; margin-top: 1.5rem; max-width: 680px;">
      <li style="padding: 1rem 0; border-bottom: 1px solid rgba(107,78,44,0.15); counter-increment: step;">
        <span style="font-family: 'Cormorant Garamond', serif; font-size: 2rem; color: var(--gold); display: inline-block; width: 3rem;">01</span>
        Complete the free eligibility check on our visa hub.
      </li>
      <li style="padding: 1rem 0; border-bottom: 1px solid rgba(107,78,44,0.15); counter-increment: step;">
        <span style="font-family: 'Cormorant Garamond', serif; font-size: 2rem; color: var(--gold); display: inline-block; width: 3rem;">02</span>
        Sign up for a GlobalHire account and upload your documents.
      </li>
      <li style="padding: 1rem 0; border-bottom: 1px solid rgba(107,78,44,0.15); counter-increment: step;">
        <span style="font-family: 'Cormorant Garamond', serif; font-size: 2rem; color: var(--gold); display: inline-block; width: 3rem;">03</span>
        Pay a $50 deposit to start your case.
      </li>
      <li style="padding: 1rem 0; border-bottom: 1px solid rgba(107,78,44,0.15); counter-increment: step;">
        <span style="font-family: 'Cormorant Garamond', serif; font-size: 2rem; color: var(--gold); display: inline-block; width: 3rem;">04</span>
        Our intake team reviews your documents within 24 hours.
      </li>
      <li style="padding: 1rem 0; border-bottom: 1px solid rgba(107,78,44,0.15); counter-increment: step;">
        <span style="font-family: 'Cormorant Garamond', serif; font-size: 2rem; color: var(--gold); display: inline-block; width: 3rem;">05</span>
        We submit to our MoFA-licensed partner.
      </li>
      <li style="padding: 1rem 0; counter-increment: step;">
        <span style="font-family: 'Cormorant Garamond', serif; font-size: 2rem; color: var(--gold); display: inline-block; width: 3rem;">06</span>
        You pay the balance when approved, and download your visa PDF from your dashboard.
      </li>
    </ol>
  </section>

  <section class="visa-section visa-section--sand visa-reveal" style="font-size: 0.75rem; opacity: 0.85;">
    <p class="visa-kicker">— Image attribution —</p>
    <p style="margin-top: 0.5rem;">Visa pages use imagery from Pexels, Unsplash, and Wikimedia Commons under their respective licences. Full attribution list at <a href="docs/visa-imagery-attribution.md" style="color: var(--bronze);">docs/visa-imagery-attribution.md</a>.</p>
  </section>

</main>
```

#### Step 2: Add preload + scripts (same as Tasks 7–11).

#### Step 3: Commit

```bash
git add visa-about.html
git commit -m "feat(page): visa-about — cinematic editorial with partner card + steps"
```

---

### Task 13: Apply restrained-cinematic to functional pages

The five functional HTML pages don't need full rewrites — they each get a CSS-class swap on the `<main>` block and a stylesheet `<link>` to `css/visa-functional.css`. The existing JS modules continue to handle data fetching.

**Files:**
- Modify: `visa-start.html`, `dashboard-visas.html`, `dashboard-visa-case.html`, `admin-visas.html`, `admin-visa-case.html`

#### Step 1: Add the stylesheet link to all 5 pages

For each file, find the line:

```html
<link rel="stylesheet" href="css/visa.css">
```

And immediately after it, add:

```html
<link rel="stylesheet" href="css/visa-functional.css">
```

Verify with:

```bash
grep -c "visa-functional.css" visa-start.html dashboard-visas.html dashboard-visa-case.html admin-visas.html admin-visa-case.html
# Expected: 5 lines, each "<filename>:1"
```

#### Step 2: Rewrite the existing `<main>` contents on each page

The existing markup uses dark-navy `visa-cta-primary`, etc., classes that don't fit the new palette. Replace them with the restrained-cinematic markup.

**visa-start.html:**

Replace the `<main>` block with:

```html
<main class="visa-main">
  <header class="visa-fn-header">
    <p class="visa-fn-header__kicker">Step 3 of 3 · Eligibility ✓ · Documents · <strong>Confirm &amp; pay</strong></p>
    <h1 class="visa-fn-header__title">Start your visa case</h1>
  </header>
  <div id="visa-start-error" class="visa-fn-body" hidden style="padding-block: 0.75rem; background: rgba(230,57,70,0.08); border-left: 3px solid var(--visa-error); color: var(--espresso);"></div>
  <div class="visa-fn-body">
    <div class="visa-detail-layout">
      <div>
        <form id="visa-intake-form">
          <fieldset style="border: 0; padding: 0; margin: 0;">
            <legend class="visa-kicker">Applicant</legend>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem;">
              <input class="visa-field" type="text"  name="applicant_name"  placeholder="Full name (as on passport)" required>
              <input class="visa-field" type="text"  name="passport_number" placeholder="Passport number" required>
              <input class="visa-field" type="text"  name="nationality"     placeholder="Nationality (e.g. NG)" required>
              <input class="visa-field" type="tel"   name="contact_phone"   placeholder="WhatsApp number">
            </div>
          </fieldset>
          <fieldset id="sponsor-fieldset" style="border: 0; padding: 0; margin: 1.5rem 0 0;">
            <legend class="visa-kicker">Sponsor in Saudi</legend>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem;">
              <input class="visa-field" type="text"  name="sponsor_name"  placeholder="Sponsor full name">
              <input class="visa-field" type="text"  name="sponsor_iqama" placeholder="Sponsor Iqama number">
              <select class="visa-field" name="sponsor_relationship">
                <option value="">Relationship to sponsor</option>
                <option value="spouse">Spouse</option>
                <option value="child">Child</option>
                <option value="parent">Parent</option>
              </select>
            </div>
          </fieldset>
          <fieldset style="border: 0; padding: 0; margin: 1.5rem 0 0;">
            <legend class="visa-kicker">Travel</legend>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem;">
              <input class="visa-field" type="date"   name="arrival"   placeholder="Intended arrival">
              <input class="visa-field" type="number" name="stay_days" min="1" max="365" placeholder="Stay (days)">
            </div>
          </fieldset>
          <fieldset style="border: 0; padding: 0; margin: 1.5rem 0 0;">
            <legend class="visa-kicker">Documents</legend>
            <p style="font-size: 0.75rem; opacity: 0.65; margin: 0.25rem 0 0.5rem;">JPG, PNG, WEBP, or PDF — up to 20 MB each.</p>
            <div id="doc-uploads"></div>
          </fieldset>
          <button id="visa-pay-btn" class="visa-btn visa-btn--primary" type="submit" style="margin-top: 2rem;" disabled>Pay $50 &amp; start case</button>
          <p style="margin-top: 0.5rem; font-size: 0.75rem; opacity: 0.65;">Refundable if ineligible at intake.</p>
        </form>
      </div>
      <aside class="visa-price-card">
        <p style="font-weight: 600;">Pay to start your case</p>
        <p style="display: flex; justify-content: space-between; margin: 0.5rem 0 0.25rem;"><span>Deposit today</span><strong>$50</strong></p>
        <p style="display: flex; justify-content: space-between; opacity: 0.7; margin: 0 0 0.25rem;"><span>Balance after review</span><span id="estimated-balance">~$160</span></p>
        <p style="display: flex; justify-content: space-between; border-top: 1px solid var(--sand); padding-top: 0.5rem;"><span>Estimated total</span><strong class="visa-price-display" style="font-size: 1.5rem;" id="estimated-total">$210</strong></p>
        <p class="visa-kicker" style="margin-top: 1rem;">Pay with</p>
        <select class="visa-field" id="provider-select" name="provider">
          <option value="paystack">Paystack (NGN cards)</option>
          <option value="stripe">Stripe (USD cards)</option>
        </select>
      </aside>
    </div>
  </div>
</main>
```

The existing `js/visa-intake.js` already targets these elements by id (`visa-pay-btn`, `doc-uploads`, etc.) — no JS changes needed.

**dashboard-visas.html:**

Replace `<main>`:

```html
<main class="visa-main">
  <header class="visa-fn-header">
    <h1 class="visa-fn-header__title">My Visa Cases</h1>
    <p class="visa-fn-header__kicker" style="margin-top: 0.25rem;">Saudi visa applications you've started.</p>
  </header>
  <div class="visa-fn-body">
    <div id="visa-cases-empty" hidden style="padding: 2rem; background: white; border-radius: 4px; text-align: center;">
      <p>No visa cases yet.</p>
      <a class="visa-btn visa-btn--primary" href="visa.html">Start a visa application</a>
    </div>
    <div id="visa-cases-list"></div>
  </div>
</main>
```

Update `js/dashboard-visas.js` `renderCases` template — the existing markup uses old classes (`visa-catalog-card`); switch to the new restrained-cinematic class `visa-case-card`. Find this block in `js/dashboard-visas.js`:

```javascript
list.innerHTML = cases.map(function (c) {
  var label = STATUS_LABEL[c.status] || [c.status, '#8DA2BE'];
  return (
    '<a class="visa-catalog-card" href="dashboard-visa-case.html?id=' + c.id + '">' +
```

Replace with:

```javascript
list.innerHTML = cases.map(function (c) {
  var label = STATUS_LABEL[c.status] || [c.status, 'neutral'];
  var pillClass = ({success:'success', warning:'warning', error:'error', neutral:'neutral'})[label[1]] || 'neutral';
  return (
    '<a class="visa-case-card" href="dashboard-visa-case.html?id=' + c.id + '">' +
      '<span class="visa-case-card__title">' + (VISA_LABEL[c.visa_type] || c.visa_type) + '</span>' +
      '<span class="visa-case-card__meta">' +
        '<span class="visa-pill visa-pill--' + pillClass + '">' + label[0] + '</span>' +
        '<time>' + new Date(c.created_at).toLocaleDateString() + '</time>' +
      '</span>' +
    '</a>'
  );
}).join('');
```

Also update `STATUS_LABEL` near the top of the file — change the colour values from hex codes (`'#F4A261'`, etc.) to semantic class keys (`'warning'`, `'success'`, `'error'`, `'neutral'`):

```javascript
var STATUS_LABEL = {
  deposit_pending:        ['Awaiting payment',   'warning'],
  intake_in_review:       ['Document review',    'success'],
  docs_revision:          ['Action needed',      'warning'],
  submitted_to_partner:   ['Submitted',          'success'],
  partner_processing:     ['At MoFA',            'neutral'],
  approved:               ['Approved — pay balance', 'success'],
  issued:                 ['Visa issued',        'success'],
  rejected_intake:        ['Refunded — ineligible', 'neutral'],
  rejected_partner:       ['Rejected',           'error'],
  refunded:               ['Refunded',           'neutral'],
  stale:                  ['Awaiting your action', 'warning'],
  on_hold:                ['On hold',            'neutral'],
};
```

**dashboard-visa-case.html:**

Replace `<main>`:

```html
<main class="visa-main">
  <header class="visa-fn-header">
    <p class="visa-fn-header__kicker"><a href="dashboard-visas.html" style="color: var(--bronze); text-decoration: none;">← All cases</a></p>
    <h1 class="visa-fn-header__title" id="case-title">Visa Case</h1>
    <p class="visa-fn-header__kicker" id="case-subtitle" style="margin-top: 0.25rem;"></p>
  </header>
  <div class="visa-fn-body">
    <div class="visa-detail-layout">
      <div>
        <p class="visa-kicker">— Timeline —</p>
        <div class="visa-timeline" id="case-timeline"></div>
        <p class="visa-kicker" style="margin-top: 1.5rem;">— Documents —</p>
        <div id="case-documents"></div>
        <p class="visa-kicker" style="margin-top: 1.5rem;">— Invoices —</p>
        <div id="case-invoices"></div>
      </div>
      <aside class="visa-price-card">
        <p style="font-weight: 600;">Status</p>
        <p id="case-status-pill" style="font-size: 0.875rem; margin-top: 0.25rem;"></p>
        <p id="case-next-action" style="opacity: 0.7; font-size: 0.875rem; margin-top: 0.5rem;"></p>
        <a id="case-pdf-link" hidden class="visa-btn visa-btn--primary visa-price-card__cta">Download visa PDF</a>
      </aside>
    </div>
  </div>
</main>
```

In `js/dashboard-visa-case.js`, change the timeline rendering to use the new classes. Find:

```javascript
document.getElementById('case-timeline').innerHTML = events.length
  ? events.map(function (e) { return '<div style="padding: var(--space-2) 0; border-bottom: 1px solid rgba(255,255,255,.06);"><strong>' + e.event_type + '</strong> · ' + new Date(e.created_at).toLocaleString() + '</div>'; }).join('')
  : '<p style="color: var(--text-secondary);">No events yet.</p>';
```

Replace with:

```javascript
document.getElementById('case-timeline').innerHTML = events.length
  ? events.map(function (e) { return '<div class="visa-timeline__item"><strong>' + e.event_type + '</strong> <time>' + new Date(e.created_at).toLocaleString() + '</time></div>'; }).join('')
  : '<p style="opacity:.55;">No events yet.</p>';
```

**admin-visas.html:**

Replace `<main>`:

```html
<main class="visa-main">
  <header class="visa-fn-header">
    <h1 class="visa-fn-header__title">Visa Case Queue</h1>
    <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
      <select class="visa-field" id="filter-status" style="width: auto;">
        <option value="">All statuses</option>
        <option value="deposit_pending">Awaiting payment</option>
        <option value="intake_in_review">Intake — needs review</option>
        <option value="docs_revision">Docs — revision sent</option>
        <option value="submitted_to_partner">Submitted</option>
        <option value="partner_processing">At MoFA</option>
        <option value="approved">Approved (balance due)</option>
        <option value="issued">Issued</option>
        <option value="rejected_intake">Rejected at intake</option>
        <option value="rejected_partner">Rejected by partner</option>
      </select>
      <input class="visa-field" type="search" id="filter-q" placeholder="Search case ID, candidate name…" style="flex: 1;">
    </div>
  </header>
  <div class="visa-fn-body">
    <div id="admin-cases-list"></div>
  </div>
</main>
```

In `js/admin-visas.js`, replace the entire `render(rows)` function body with:

```javascript
function render(rows) {
  var list = document.getElementById('admin-cases-list');
  if (!rows.length) { list.innerHTML = '<p>No cases match the filters.</p>'; return; }
  list.innerHTML =
    '<table class="visa-queue">' +
      '<thead><tr><th>Case</th><th>Visa</th><th>Status</th><th>Started</th></tr></thead>' +
      '<tbody>' +
      rows.map(function (r) {
        return '<tr>' +
          '<td><a class="case-id" href="admin-visa-case.html?id=' + r.id + '">' + r.id.slice(0,8) + '…</a></td>' +
          '<td>' + r.visa_type.replace(/_/g,' ') + '</td>' +
          '<td><span class="visa-pill visa-pill--neutral">' + r.status.replace(/_/g,' ') + '</span></td>' +
          '<td>' + new Date(r.created_at).toLocaleString() + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
}
```

**admin-visa-case.html:**

Replace `<main>`:

```html
<main class="visa-main">
  <header class="visa-fn-header">
    <p class="visa-fn-header__kicker"><a href="admin-visas.html" style="color: var(--bronze); text-decoration: none;">← Queue</a></p>
    <h1 class="visa-fn-header__title" id="admin-case-title">Case</h1>
    <p class="visa-fn-header__kicker" id="admin-case-meta" style="margin-top: 0.25rem;"></p>
  </header>
  <div class="visa-fn-body">
    <div class="visa-detail-layout">
      <div>
        <p class="visa-kicker">— Documents —</p>
        <div id="admin-docs"></div>
        <p class="visa-kicker" style="margin-top: 1.5rem;">— Timeline —</p>
        <div class="visa-timeline" id="admin-events"></div>
      </div>
      <aside class="visa-actions">
        <p class="visa-kicker" style="opacity:0.55; margin-bottom: 0.5rem;">Actions</p>
        <button class="visa-btn visa-btn--primary" id="btn-submit-partner">Submit to partner →</button>
        <button class="visa-btn visa-btn--revision" id="btn-request-revision">Request revision</button>
        <button class="visa-btn visa-btn--issued" id="btn-mark-issued">Mark issued</button>
        <button class="visa-btn visa-btn--reject" id="btn-reject-intake">Reject &amp; refund</button>
      </aside>
    </div>
  </div>
</main>
```

In `js/admin-visa-case.js`, update the events render block. Find:

```javascript
document.getElementById('admin-events').innerHTML = events.map(function (e) {
  return '<div style="padding:6px 0; border-bottom: 1px solid rgba(255,255,255,.06);"><strong>' + e.event_type + '</strong> · ' + new Date(e.created_at).toLocaleString() + '</div>';
}).join('');
```

Replace with:

```javascript
document.getElementById('admin-events').innerHTML = events.map(function (e) {
  return '<div class="visa-timeline__item"><strong>' + e.event_type + '</strong> <time>' + new Date(e.created_at).toLocaleString() + '</time></div>';
}).join('');
```

#### Step 3: Smoke

```bash
python3 -m http.server 8000 &
sleep 1
# Open each of:
#   http://localhost:8000/visa-start.html?slug=family-visit
#   http://localhost:8000/dashboard-visas.html (will redirect to login.html — fine, just verify the page LOADS)
#   http://localhost:8000/dashboard-visa-case.html?id=test (same)
#   http://localhost:8000/admin-visas.html (same)
#   http://localhost:8000/admin-visa-case.html?id=test (same)
kill %1
```

Confirm each renders on an ivory body with serif h1 and gold accents — not the old dark-navy `dashboard-body`.

#### Step 4: Commit

```bash
git add visa-start.html dashboard-visas.html dashboard-visa-case.html admin-visas.html admin-visa-case.html js/dashboard-visas.js js/dashboard-visa-case.js js/admin-visas.js js/admin-visa-case.js
git commit -m "feat(pages): apply restrained-cinematic to intake + dashboard + admin"
```

---

### Task 14: Verify performance budget on Vercel preview

After pushing the branch, Vercel auto-deploys a preview at `https://globalhire-elab-<hash>-akinjopo-samuel-s-projects.vercel.app`. Validate Lighthouse + perf.

**Files:** none (verification only).

#### Step 1: Push the branch

```bash
cd /Users/samuel/GLOBALHIRE@ELAB
git push -u origin feat/saudi-visa-redesign
```

#### Step 2: Find the preview URL

```bash
sleep 60   # let Vercel build
vercel ls 2>&1 | head -5
# Pick the most recent "● Ready" Preview entry; save URL as PREVIEW
```

Set `PREVIEW` env var to that URL for the rest of the task.

#### Step 3: Smoke-fetch every visa page

```bash
for path in visa visa-tourist-evisa visa-umrah visa-family-visit visa-family-residence visa-about visa-start dashboard-visas dashboard-visa-case admin-visas admin-visa-case; do
  curl -sLo /tmp/p.html -w "%{http_code}\t%{size_download} bytes\t" "$PREVIEW/$path.html"
  printf "%s\n" "$path"
done
```

Expected: 11 lines of `200\t<bytes>\t<page>`. Any non-200 is a hard fail.

#### Step 4: Run Lighthouse on /visa and /visa-family-visit

```bash
# Requires npx lighthouse globally available
npx -y lighthouse "$PREVIEW/visa" --quiet --chrome-flags="--headless" --form-factor=mobile --output=json --output-path=/tmp/lh-visa.json --only-categories=performance
node -e "var r = require('/tmp/lh-visa.json'); console.log('visa hub LCP:', r.audits['largest-contentful-paint'].displayValue, '| score:', r.categories.performance.score * 100);"

npx -y lighthouse "$PREVIEW/visa-family-visit" --quiet --chrome-flags="--headless" --form-factor=mobile --output=json --output-path=/tmp/lh-fv.json --only-categories=performance
node -e "var r = require('/tmp/lh-fv.json'); console.log('family visit LCP:', r.audits['largest-contentful-paint'].displayValue, '| score:', r.categories.performance.score * 100);"
```

Expected (per spec §3.6 + §11):
- `/visa` mobile performance score ≥ 90; LCP < 2.5 s
- `/visa-family-visit` mobile performance score ≥ 90; LCP < 2.5 s

If either fails:
- LCP too high → inspect what's consuming time: is the hero image preload working? Is video being attached pre-LCP (it shouldn't be)?
- Score too low → check page weight; the JS budget allows 100 KB. GSAP+ScrollTrigger+Lenis combined is ~80 KB. Investigate any unexpected blocking resource.

Commit nothing yet — Task 15 either commits the success or addresses the failure.

#### Step 5: If both pass, document the run

Append to the commit message or a small note. No additional file needed if everything passes.

---

### Task 15: Open PR

**Files:** none (PR only).

#### Step 1: Open the PR

```bash
cd /Users/samuel/GLOBALHIRE@ELAB
gh pr create --title "feat: Saudi visa pages — cinematic redesign" --body "$(cat <<'EOF'
## Summary

Visual-only redesign of the 11 visa surfaces shipped in v1. Direction: Visit-Saudi cinematic — gold/ivory/walnut palette, Cormorant Garamond serif headlines, full-bleed imagery, heavy motion (video hero + GSAP ScrollTrigger + View Transitions + Lenis) on marketing pages; same palette restrained for intake/dashboard/admin (utility preserved). Zero backend changes.

## What's included

- Foundation: rewrite of `css/visa.css` (~13 KB) with new tokens + type + motion; new `css/visa-functional.css` (~6 KB) for restrained pages
- Motion: new `js/visa-motion.js` (IO scroll reveals, mouse-tracking, price counters, View Transitions, Lenis init) + `js/visa-hero-video.js` (post-LCP attach with reduced-motion + downlink gating). 12 Deno unit tests on the pure helpers
- 6 cinematic marketing pages: `/visa` (hub with video hero), `/visa-tourist-evisa`, `/visa-umrah` (authentic Wikimedia Kaaba), `/visa-family-visit`, `/visa-family-residence`, `/visa-about`
- 5 functional pages (restrained): `/visa-start`, `/dashboard-visas`, `/dashboard-visa-case`, `/admin-visas`, `/admin-visa-case`
- Assets: 7 hero images (AVIF+WebP+JPEG, desktop + mobile renditions), 1 hub montage video (WebM+MP4, ≤ 1 MB)
- Cormorant Garamond added to Google Fonts call on all 11 pages
- `docs/visa-imagery-attribution.md` with every external image's source + author + licence

## Spec

`docs/superpowers/specs/2026-05-16-saudi-visa-services-redesign.md`

## Test Plan

- [x] 12 Deno unit tests pass on motion + hero-video helpers
- [x] 11 visa pages return HTTP 200 on the Vercel preview
- [x] Lighthouse mobile performance ≥ 90 on `/visa` and `/visa-family-visit`; LCP < 2.5 s
- [ ] After merge: manual review on `globalhire.elabsolution.org/visa` to confirm the new look + that `prefers-reduced-motion: reduce` cleanly disables ken-burns, parallax, video autoplay, and price counters
- [ ] After merge: confirm View Transitions fade between `/visa*` routes in Chrome/Edge/Safari 18+

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" 2>&1 | tail -3
```

Capture the PR URL from the output.

---

## Self-Review

### Spec coverage

Every requirement in the spec is implemented:

- §3.1 palette → Task 3 (`:root` tokens in `css/visa.css`)
- §3.2 type → Task 2 (font loading) + Task 3 (`.visa-h1`, `.visa-h2`, `.visa-kicker`, etc.)
- §3.3 spacing + shape → Task 3 (`--section-padding`, radii, shadow scale)
- §3.4 motion system → Tasks 5 + 6 (JS modules) + Task 3 (ken-burns, reveal, mouse-spotlight CSS)
- §3.5 imagery → Task 1 (sourcing + optimization + attribution doc)
- §3.6 perf budget → Task 14 (Lighthouse verification)
- §4.1 hub anatomy → Task 7
- §4.2 visa-detail template → Tasks 8, 9, 10, 11
- §4.3 visa-about editorial → Task 12
- §5 restrained functional pages → Task 13
- §6 CSS architecture → Tasks 3 + 4
- §7 JS architecture → Tasks 5 + 6 + (script tags) in Tasks 7-12
- §8 View Transitions → Task 5 (link interceptor in `js/visa-motion.js`)
- §9 migration & deploy → Task 14 (push + Vercel) + Task 15 (PR)
- §10 open items → addressed in Task 1 (image acquisition + attribution doc)
- §11 acceptance criteria → Task 14 verifies points 1, 2, 3, 4, 6, 7; points 5 + 8 are review checklist items in the PR

### Placeholder scan

- `[Partner Name]` and `MoFA #[XXXX]` appear in the new HTML — both are partner-data-dependent placeholders inherited from v1, intentional, called out in spec §10 and in the post-v1 CHECKLIST.
- No `TBD` / `TODO` / "implement later" / "add appropriate error handling" found in the plan.
- Every code block has complete code; no "similar to Task N" references.

### Type / name consistency

- CSS classes: every class used in HTML rewrites (Tasks 7-13) is defined in `css/visa.css` (Task 3) or `css/visa-functional.css` (Task 4). Cross-checked: `visa-main`, `visa-hero`, `visa-hero--hub`, `visa-hero--detail`, `visa-hero__bg`, `visa-hero__overlay`, `visa-hero__silhouette`, `visa-hero__content`, `visa-hero__scroll-cue`, `visa-kicker`, `visa-h1`, `visa-h2`, `visa-lede`, `visa-price-display`, `visa-section`, `visa-section--ivory/sand/walnut/espresso/midnight`, `visa-btn`, `visa-btn--primary/outline`, `visa-wizard-grid`, `visa-wizard-chip`, `visa-stats`, `visa-stats__num/label`, `visa-catalog`, `visa-catalog-card`, `visa-catalog-card--tourist/umrah/family/residence/more`, `visa-catalog-card__strip/body/title/meta`, `visa-trust`, `visa-trust__item`, `visa-detail-layout`, `visa-detail-body`, `visa-price-card`, `visa-price-card__from/breakdown/cta/footnote`, `visa-faq`, `visa-reveal`, `visa-fn-header`, `visa-fn-header__kicker/title`, `visa-fn-body`, `visa-field`, `visa-doc-upload`, `visa-doc-upload__badge`, `visa-pill`, `visa-pill--success/warning/error/neutral`, `visa-case-card`, `visa-case-card__title/meta`, `visa-timeline`, `visa-timeline__item`, `visa-queue`, `visa-actions`, `visa-btn--revision/issued/reject`. All present.
- Data attributes: `data-video-webm`, `data-video-mp4`, `data-poster` set in Task 7's hero markup; read in Task 6's `js/visa-hero-video.js`. `data-visa-counter` set in Tasks 7–11 hub + price cards; read in Task 5's `js/visa-motion.js`. `data-outcome` on wizard chips (Task 7) — read by existing `js/visa-wizard.js` (unchanged).
- Helper function signatures consistent: `shouldEnableMotion`, `shouldUseViewTransitions`, `animatePriceCounter`, `shouldLoadVideo`, `buildVideoElement` — defined once, exported once, tested once, used once in DOM bottom block.

### Scope check

Plan is implementable in one pass by a single executor. ~15 tasks, ~3-5 dev-days estimate. No sub-decomposition required.
