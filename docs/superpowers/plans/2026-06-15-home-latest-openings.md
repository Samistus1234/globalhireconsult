# Latest Openings Homepage Carousel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an auto-rotating "Latest Openings" carousel below the hero on `index.html` that shows the newest open jobs pulled live from Supabase, updating automatically whenever a campaign is created.

**Architecture:** One new self-contained module (`js/home-openings.js`) split into pure helpers (unit-tested with `node --test`) and a browser runtime (verified in a real browser). The runtime fetches from the existing `gh_campaigns` feed via the already-loaded `window.ghFrom`, renders cards into a scroll-snap carousel, and reveals the section only when jobs exist. Markup goes in `index.html`; styles go in `css/landing.css`. No shared files or `jobs.js`/`jobs.html` are touched.

**Tech Stack:** Vanilla ES5-style browser JS (matches existing `js/*.js`), Supabase JS (already loaded), CSS using existing design tokens, `node --test` (built into Node 22, zero new dependencies).

---

## File Structure

- **Create** `js/home-openings.js` — carousel module. Pure helpers (`escHtml`, `isNew`, `salaryText`, `slidesPerView`, `pageCount`, `cardHtml`) + browser runtime (fetch, render, scroll-snap carousel, controls, autorotate). Exports the pure helpers via `module.exports` for Node tests; runs the runtime only in a browser.
- **Create** `test/home-openings.test.js` — Node unit tests for the pure helpers. Lives in `test/` (singular) so Playwright's `tests/` (plural) `testDir` never picks it up.
- **Modify** `index.html` — new `<section id="latest-openings" hidden>` after the hero (line 103) and one `<script src="js/home-openings.js">` tag in the Scripts block.
- **Modify** `css/landing.css` — append the `.lo-*` carousel styles.

---

### Task 1: Pure helpers + unit tests

**Files:**
- Create: `test/home-openings.test.js`
- Create: `js/home-openings.js`

- [ ] **Step 1: Write the failing test**

Create `test/home-openings.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const lo = require('../js/home-openings.js');

const DAY = 86400000;

test('escHtml escapes HTML-significant characters', () => {
  assert.strictEqual(lo.escHtml('<b>"x" & \'y\'</b>'),
    '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
  assert.strictEqual(lo.escHtml(null), '');
  assert.strictEqual(lo.escHtml(undefined), '');
});

test('isNew: true within 14 days, false outside, false for bad input', () => {
  const now = 1_000 * DAY;
  assert.strictEqual(lo.isNew(new Date(now - 5 * DAY).toISOString(), now), true);
  assert.strictEqual(lo.isNew(new Date(now - 13 * DAY).toISOString(), now), true);
  assert.strictEqual(lo.isNew(new Date(now - 20 * DAY).toISOString(), now), false);
  assert.strictEqual(lo.isNew('', now), false);
  assert.strictEqual(lo.isNew('not-a-date', now), false);
});

test('salaryText falls back to Competitive', () => {
  assert.strictEqual(lo.salaryText({ salary_display: 'Tax-Free $8k' }), 'Tax-Free $8k');
  assert.strictEqual(lo.salaryText({ salary_display: '' }), 'Competitive');
  assert.strictEqual(lo.salaryText({}), 'Competitive');
});

test('slidesPerView: 3 desktop, 2 tablet, 1 mobile', () => {
  assert.strictEqual(lo.slidesPerView(1200), 3);
  assert.strictEqual(lo.slidesPerView(992), 3);
  assert.strictEqual(lo.slidesPerView(800), 2);
  assert.strictEqual(lo.slidesPerView(640), 2);
  assert.strictEqual(lo.slidesPerView(400), 1);
});

test('pageCount rounds up and guards zero', () => {
  assert.strictEqual(lo.pageCount(9, 3), 3);
  assert.strictEqual(lo.pageCount(7, 3), 3);
  assert.strictEqual(lo.pageCount(2, 3), 1);
  assert.strictEqual(lo.pageCount(0, 3), 0);
  assert.strictEqual(lo.pageCount(5, 0), 0);
});

test('cardHtml renders fields, escapes, NEW pill, salary fallback, jobs.html link', () => {
  const now = 1_000 * DAY;
  const html = lo.cardHtml({
    title: 'Derm <ologist>',
    employer_name: 'Acme & Co',
    destination_country: 'Qatar',
    specialty: 'Dermatology',
    salary_display: '',
    created_at: new Date(now - 2 * DAY).toISOString(),
  }, now);
  assert.match(html, /Derm &lt;ologist&gt;/);
  assert.match(html, /Acme &amp; Co/);
  assert.match(html, /Qatar/);
  assert.match(html, /Dermatology/);
  assert.match(html, /Competitive/);
  assert.match(html, /lo-pill">NEW/);
  assert.match(html, /href="jobs\.html"/);

  const old = lo.cardHtml({
    title: 'Nurse', employer_name: 'X', destination_country: 'Saudi',
    specialty: '', salary_display: '$5k',
    created_at: new Date(now - 30 * DAY).toISOString(),
  }, now);
  assert.doesNotMatch(old, /lo-pill/);   // not new
  assert.doesNotMatch(old, /lo-tag/);    // no specialty tag
  assert.match(old, /\$5k/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/home-openings.test.js`
Expected: FAIL — `Cannot find module '../js/home-openings.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `js/home-openings.js`:

```js
/* ============================================================
   home-openings.js — "Latest Openings" homepage carousel
   Pure helpers (unit-tested) + browser runtime (Task 2).
   ============================================================ */
(function (root) {
  'use strict';

  var NEW_WINDOW_DAYS = 14;

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isNew(createdAt, nowMs) {
    if (!createdAt) return false;
    var t = new Date(createdAt).getTime();
    if (isNaN(t)) return false;
    return (nowMs - t) <= NEW_WINDOW_DAYS * 86400000;
  }

  function salaryText(campaign) {
    return (campaign && campaign.salary_display) ? campaign.salary_display : 'Competitive';
  }

  function slidesPerView(width) {
    if (width >= 992) return 3;
    if (width >= 640) return 2;
    return 1;
  }

  function pageCount(total, perView) {
    if (!total || perView < 1) return 0;
    return Math.ceil(total / perView);
  }

  function cardHtml(c, nowMs) {
    var newPill = isNew(c.created_at, nowMs) ? '<span class="lo-pill">NEW</span>' : '';
    var tag = c.specialty ? '<span class="lo-tag">' + escHtml(c.specialty) + '</span>' : '';
    return '' +
      '<article class="lo-card">' +
        '<div class="lo-card-top">' +
          newPill +
          '<h3 class="lo-card-title">' + escHtml(c.title) + '</h3>' +
          '<p class="lo-card-employer">' + escHtml(c.employer_name) + '</p>' +
        '</div>' +
        '<div class="lo-card-meta">' +
          '<span class="lo-country">' + escHtml(c.destination_country) + '</span>' +
          tag +
        '</div>' +
        '<div class="lo-card-salary">' + escHtml(salaryText(c)) + '</div>' +
        '<a class="lo-card-cta" href="jobs.html">View role &rarr;</a>' +
      '</article>';
  }

  var api = {
    escHtml: escHtml,
    isNew: isNew,
    salaryText: salaryText,
    slidesPerView: slidesPerView,
    pageCount: pageCount,
    cardHtml: cardHtml,
    NEW_WINDOW_DAYS: NEW_WINDOW_DAYS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof window !== 'undefined') {
    window.HomeOpenings = api;
  }
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/home-openings.test.js`
Expected: PASS — all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add js/home-openings.js test/home-openings.test.js
git commit -m "feat(home): pure helpers + tests for Latest Openings carousel"
```

---

### Task 2: Browser runtime (fetch + scroll-snap carousel)

**Files:**
- Modify: `js/home-openings.js`

This adds the browser-only runtime. It is verified in a real browser in Task 5 (DOM/Supabase code is not unit-testable here without a heavy harness).

- [ ] **Step 1: Add the runtime to the module**

In `js/home-openings.js`, find this block near the end:

```js
  if (typeof window !== 'undefined') {
    window.HomeOpenings = api;
  }
})(typeof window !== 'undefined' ? window : this);
```

Replace it with:

```js
  /* ---------- Browser runtime ---------- */
  if (typeof document === 'undefined') return; // Node test context: stop here
  root.HomeOpenings = api;

  var ROTATE_MS = 5000;
  var FETCH_LIMIT = 9;
  var state = { jobs: [], page: 0, perView: 3, timer: null };
  var els = {};

  function fetchOpenings() {
    if (!root.ghFrom) {
      console.error('home-openings: window.ghFrom unavailable');
      return Promise.resolve([]);
    }
    return root.ghFrom('campaigns')
      .select('*')
      .not('status', 'in', '("draft","closed")')
      .order('created_at', { ascending: false })
      .limit(FETCH_LIMIT)
      .then(function (res) {
        if (res.error) { console.error('home-openings: fetch failed', res.error); return []; }
        return res.data || [];
      })
      .catch(function (err) { console.error('home-openings: fetch threw', err); return []; });
  }

  function renderCards() {
    var now = Date.now();
    els.track.innerHTML = state.jobs.map(function (c) { return cardHtml(c, now); }).join('');
  }

  function renderDots() {
    var pages = pageCount(state.jobs.length, state.perView);
    var html = '';
    for (var i = 0; i < pages; i++) {
      html += '<button class="lo-dot" data-page="' + i + '" aria-label="Go to slide ' + (i + 1) + '"></button>';
    }
    els.dots.innerHTML = html;
    syncDots();
  }

  function syncDots() {
    var dots = els.dots.querySelectorAll('.lo-dot');
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('is-active', i === state.page);
    }
  }

  function go(page, smooth) {
    var pages = pageCount(state.jobs.length, state.perView);
    if (pages === 0) return;
    state.page = ((page % pages) + pages) % pages;
    els.viewport.scrollTo({
      left: state.page * els.viewport.clientWidth,
      behavior: smooth === false ? 'auto' : 'smooth'
    });
    syncDots();
  }

  function startAuto() {
    if (state.timer) return;
    var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    if (pageCount(state.jobs.length, state.perView) < 2) return;
    state.timer = setInterval(function () { go(state.page + 1); }, ROTATE_MS);
  }

  function stopAuto() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  function onScroll() {
    var p = Math.round(els.viewport.scrollLeft / els.viewport.clientWidth);
    if (p !== state.page) { state.page = p; syncDots(); }
  }

  function onResize() {
    state.perView = slidesPerView(root.innerWidth);
    renderDots();
    go(state.page, false);
  }

  function bindEvents() {
    els.next.addEventListener('click', function () { go(state.page + 1); });
    els.prev.addEventListener('click', function () { go(state.page - 1); });
    els.dots.addEventListener('click', function (e) {
      var btn = e.target.closest('.lo-dot');
      if (btn) go(parseInt(btn.getAttribute('data-page'), 10));
    });
    els.section.addEventListener('mouseenter', stopAuto);
    els.section.addEventListener('mouseleave', startAuto);
    els.section.addEventListener('focusin', stopAuto);
    els.section.addEventListener('focusout', startAuto);
    els.viewport.addEventListener('scroll', onScroll, { passive: true });
    root.addEventListener('resize', onResize);
  }

  function init() {
    els.section = document.getElementById('latest-openings');
    if (!els.section) return;
    els.viewport = els.section.querySelector('.lo-viewport');
    els.track = els.section.querySelector('.lo-track');
    els.dots = els.section.querySelector('.lo-dots');
    els.next = els.section.querySelector('.lo-next');
    els.prev = els.section.querySelector('.lo-prev');

    fetchOpenings().then(function (jobs) {
      if (!jobs.length) return; // stay hidden — no empty/broken block
      state.jobs = jobs;
      state.perView = slidesPerView(root.innerWidth);
      renderCards();
      renderDots();
      bindEvents();
      els.section.hidden = false;
      startAuto();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 2: Verify Node tests still pass (runtime must not break the export)**

Run: `node --test test/home-openings.test.js`
Expected: PASS — the `if (typeof document === 'undefined') return;` guard makes Node skip the runtime; all 6 tests still pass.

- [ ] **Step 3: Commit**

```bash
git add js/home-openings.js
git commit -m "feat(home): browser runtime for Latest Openings carousel"
```

---

### Task 3: Add the section markup to index.html

**Files:**
- Modify: `index.html` (insert after hero close at line 103; add script tag in Scripts block)

- [ ] **Step 1: Insert the section after the hero**

In `index.html`, find:

```html
  </section>

  <!-- ===================== STATS BAR ===================== -->
  <section class="stats-bar" id="stats">
```

Replace with:

```html
  </section>

  <!-- ===================== LATEST OPENINGS ===================== -->
  <section class="latest-openings" id="latest-openings" aria-label="Latest job openings" hidden>
    <div class="container">
      <div class="lo-header">
        <h2 class="lo-title">🔥 Latest Openings</h2>
        <a class="lo-viewall" href="jobs.html">View all openings &rarr;</a>
      </div>
      <div class="lo-carousel">
        <button class="lo-arrow lo-prev" type="button" aria-label="Previous openings">&#8249;</button>
        <div class="lo-viewport">
          <div class="lo-track"></div>
        </div>
        <button class="lo-arrow lo-next" type="button" aria-label="Next openings">&#8250;</button>
      </div>
      <div class="lo-dots" role="tablist" aria-label="Slide navigation"></div>
    </div>
  </section>

  <!-- ===================== STATS BAR ===================== -->
  <section class="stats-bar" id="stats">
```

- [ ] **Step 2: Add the script tag**

In `index.html`, find:

```html
  <script src="js/supabase-client.js"></script>
  <script src="js/nav-global.js"></script>
```

Replace with:

```html
  <script src="js/supabase-client.js"></script>
  <script src="js/home-openings.js"></script>
  <script src="js/nav-global.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(home): add Latest Openings section markup to homepage"
```

---

### Task 4: Add carousel styles to css/landing.css

**Files:**
- Modify: `css/landing.css` (append at end of file)

- [ ] **Step 1: Append the styles**

Add to the end of `css/landing.css`:

```css
/* ============================================================
   Latest Openings — homepage carousel
   ============================================================ */
.latest-openings {
  padding: var(--space-16) 0;
  position: relative;
}
.latest-openings[hidden] { display: none; }

.lo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-8);
}
.lo-title {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  color: var(--text-primary);
  margin: 0;
}
.lo-viewall {
  color: var(--primary);
  font-weight: 600;
  font-size: var(--text-sm);
  text-decoration: none;
  white-space: nowrap;
}
.lo-viewall:hover { text-decoration: underline; }

.lo-carousel {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.lo-viewport {
  flex: 1 1 auto;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  scrollbar-width: none;          /* Firefox */
  -ms-overflow-style: none;       /* IE/Edge */
}
.lo-viewport::-webkit-scrollbar { display: none; } /* Chrome/Safari */

.lo-track {
  display: flex;
  gap: var(--space-5);
}

.lo-card {
  scroll-snap-align: start;
  flex: 0 0 calc((100% - 2 * var(--space-5)) / 3); /* 3 per view on desktop */
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-6);
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  transition: transform var(--duration-base) var(--ease-out),
              border-color var(--duration-base) var(--ease-out);
}
.lo-card:hover {
  transform: translateY(-4px);
  border-color: var(--primary);
}

.lo-card-top { position: relative; }
.lo-pill {
  display: inline-block;
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text-inverse);
  background: var(--primary);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  margin-bottom: var(--space-2);
}
.lo-card-title {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  color: var(--text-primary);
  margin: 0 0 var(--space-1);
}
.lo-card-employer {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin: 0;
}
.lo-card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.lo-country {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}
.lo-tag {
  font-size: var(--text-xs);
  color: var(--primary);
  background: var(--primary-muted);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}
.lo-card-salary {
  font-weight: 700;
  color: var(--text-primary);
  margin-top: auto;
}
.lo-card-cta {
  align-self: flex-start;
  color: var(--primary);
  font-weight: 600;
  font-size: var(--text-sm);
  text-decoration: none;
}
.lo-card-cta:hover { text-decoration: underline; }

.lo-arrow {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: var(--text-2xl);
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color var(--duration-base) var(--ease-out),
              color var(--duration-base) var(--ease-out);
}
.lo-arrow:hover { border-color: var(--primary); color: var(--primary); }

.lo-dots {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
  margin-top: var(--space-6);
}
.lo-dot {
  width: 8px;
  height: 8px;
  padding: 0;
  border: none;
  border-radius: var(--radius-full);
  background: var(--border-strong);
  cursor: pointer;
  transition: background var(--duration-base) var(--ease-out),
              width var(--duration-base) var(--ease-out);
}
.lo-dot.is-active { width: 24px; background: var(--primary); }

/* Tablet: 2 per view */
@media (max-width: 991px) {
  .lo-card { flex-basis: calc((100% - var(--space-5)) / 2); }
}
/* Mobile: 1 per view */
@media (max-width: 639px) {
  .lo-card { flex-basis: 100%; }
  .lo-arrow { display: none; }
  .lo-title { font-size: var(--text-2xl); }
}

@media (prefers-reduced-motion: reduce) {
  .lo-viewport { scroll-behavior: auto; }
  .lo-card { transition: none; }
}
```

- [ ] **Step 2: Commit**

```bash
git add css/landing.css
git commit -m "feat(home): styles for Latest Openings carousel"
```

---

### Task 5: Browser verification

**Files:** none (verification only)

- [ ] **Step 1: Serve the site locally**

Run: `python3 -m http.server 8765`
(from the repo root, in the background or a separate shell)

- [ ] **Step 2: Open and observe**

Open `http://localhost:8765/index.html` in a browser. Verify:
- The "Latest Openings" section appears below the hero **only if** there are open campaigns. If the live `gh_campaigns` feed returns rows, cards render; if it returns none, the section stays hidden (no empty block). Confirm via DevTools console that there are no `home-openings:` errors.
- Cards show title, employer, country, specialty tag, salary (or "Competitive"), and a "NEW" pill on jobs created within 14 days.
- Auto-rotation advances every 5s; hovering the section pauses it; moving away resumes.
- Prev/next arrows and dots change slides; the active dot updates.
- Resize the window across the 640px and 992px breakpoints: cards-per-view become 1 / 2 / 3 and dot count updates.
- "View all openings →" and each card's "View role →" navigate to `jobs.html`.
- With OS "Reduce motion" enabled, the carousel does not auto-rotate (manual controls still work).

- [ ] **Step 3: Stop the server**

Stop the `python3 -m http.server` process.

- [ ] **Step 4: Final confirmation**

No commit needed (verification only). If any issue was found, fix it in the relevant file, re-run `node --test test/home-openings.test.js`, re-verify in the browser, and commit the fix.

---

## Self-Review Notes

- **Spec coverage:** live Supabase feed (Task 2 `fetchOpenings`), below-hero placement (Task 3), rotating carousel 3/2/1 responsive (Tasks 2+4), 5s autorotate + pause on hover/focus (Task 2), prefers-reduced-motion (Tasks 2+4), NEW pill ≤14d (Task 1 `isNew`/`cardHtml`), salary fallback (Task 1 `salaryText`), card+header link to `jobs.html` (Tasks 1+3), hidden empty/error state (Task 2 `init`/`fetchOpenings`), HTML escaping (Task 1 `escHtml`), no changes to jobs.js/jobs.html/shared CSS (all tasks scoped). All covered.
- **Type consistency:** helper names (`escHtml`, `isNew`, `salaryText`, `slidesPerView`, `pageCount`, `cardHtml`) and CSS class names (`lo-viewport`, `lo-track`, `lo-dots`, `lo-prev`, `lo-next`, `lo-card`, `lo-pill`, `lo-tag`) are identical across the JS, markup, and CSS tasks.
- **No placeholders:** every code step contains complete, runnable content.
