# Design: "Latest Openings" Homepage Carousel

**Date:** 2026-06-15
**Status:** Approved (design), pending implementation plan
**Repo:** GLOBALHIRE@ELAB (globalhire.elabsolution.org)

## Problem

When a new job opportunity is created, nothing on the homepage (`index.html`)
surfaces it. The homepage is a static marketing page (hero, stats, services,
etc.) and shows no live jobs at all. Jobs only appear on `jobs.html`, so new
openings get no homepage visibility and visitors who never reach the board never
see them.

## Goal

Surface the newest open job opportunities on the homepage in a moving,
attention-grabbing way that updates automatically whenever a job is created —
with zero per-job code changes.

## Solution Overview

A new **"Latest Openings"** section placed directly below the hero on
`index.html`. It is a **rotating featured carousel** that pulls the newest open
jobs **live** from the same Supabase `campaigns` feed `jobs.html` already uses.
Create a campaign in admin → it appears on the homepage automatically.

The carousel sits in the normal page flow (it never blocks or covers content),
auto-rotates, and degrades gracefully: if there are no jobs or the fetch fails,
the section stays hidden so the page never shows an empty or broken block.

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Format | Rotating featured carousel (in page flow, non-blocking) |
| Data source | Live from Supabase `campaigns` (auto-updating) |
| Placement | Directly below the hero, above the stats bar |
| Detail pages | None — cards link to the full board (`jobs.html`) |

## Architecture

Three small, isolated pieces. Nothing in shared component files is modified.

### 1. `index.html`
- Add one new `<section id="latest-openings">` immediately after the hero
  section's closing tag and before the stats bar (`<section class="stats-bar">`).
- The section contains a header (title + "View all openings →" link), a
  carousel track container the JS fills, dot indicators, and prev/next arrows.
- The section starts **hidden** (e.g. `hidden` attribute / `display:none`);
  the JS reveals it only after confirming there is at least one job to show.
- Add one new `<script src="js/home-openings.js">` line in the Scripts block,
  after `js/supabase-client.js` (which is already loaded and provides
  `window.ghFrom` / `window.ghSupabase`).

### 2. `js/home-openings.js` (new file)
Self-contained IIFE module, mirroring the established pattern in `js/jobs.js`.

Responsibilities:
- On `DOMContentLoaded`, query:
  ```js
  ghFrom('campaigns')
    .select('*')
    .not('status', 'in', '("draft","closed")')
    .order('created_at', { ascending: false })
    .limit(9)
  ```
- Render up to 9 jobs as cards grouped into slides.
- Drive the carousel (auto-rotate, manual controls, dots).
- Reveal the section only when `data.length > 0`. On zero results or error,
  leave the section hidden and log the error to the console (consistent with
  `jobs.js`, which logs fetch failures).

No global state shared with other modules; no changes to `jobs.js`.

### 3. CSS (appended to `css/landing.css`)
- All carousel + card styling lives in `css/landing.css` (the homepage's own
  stylesheet), using the existing design tokens so it matches the page.
- No edits to `components.css`, `tokens.css`, or other shared files.

## Card Content (per job)

Each card displays, mapped from a `campaigns` record:

- **Title** — `title`
- **Employer** — `employer_name`
- **Destination country** — `destination_country`
- **Specialty tag** — `specialty`
- **Salary** — `salary_display`, falling back to `"Competitive"` when empty
- **"NEW" pill** — shown when `created_at` is within the last 14 days
- **"View role →" button**

Both the card and its button link to **`jobs.html`** (the full board). Live
campaigns have no individual detail page, so linking to the board is always
valid and never produces a broken link. All user-supplied strings are escaped
before insertion into HTML (same `escHtml` approach as `jobs.js`).

## Carousel Behaviour

- **Cards per slide:** 3 on desktop, 2 on tablet, 1 on mobile (responsive).
- **Auto-rotate:** every 5 seconds.
- **Pause on hover/focus:** rotation pauses while the user is interacting.
- **Manual controls:** dot indicators (one per slide) plus prev/next arrows.
- **Reduced motion:** when `prefers-reduced-motion: reduce` is set, auto-rotation
  is disabled (manual controls still work). Accessibility requirement.
- **Section header link:** "View all openings →" navigates to `jobs.html`.

## Accessibility

- Section has an `aria-label` (e.g. "Latest job openings").
- Prev/next/dot controls are real, keyboard-focusable buttons with labels.
- Honours `prefers-reduced-motion`.

## Error & Empty States

- **No jobs:** section remains hidden; no empty block rendered.
- **Fetch error:** section remains hidden; error logged to console.
- **Missing fields:** salary falls back to "Competitive"; other absent fields
  render empty rather than breaking the card.

## Out of Scope (YAGNI)

- Deep-linking to individual jobs (no per-job detail pages exist for live
  campaigns).
- Save / Apply buttons on the homepage (those remain on the board).
- Any admin UI changes — the existing campaign-creation flow is the only input.
- Changes to `jobs.html` / `js/jobs.js`.

## Affected Files

- `index.html` — new section + one script tag (edit)
- `js/home-openings.js` — carousel module (new)
- `css/landing.css` — carousel styles appended (edit)
