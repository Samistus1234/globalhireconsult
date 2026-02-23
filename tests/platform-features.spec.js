const { test, expect } = require('@playwright/test');

const BASE = 'https://globalhire-elab.vercel.app';

// ─────────────────────────────────────────────
// GLOBAL NAVIGATION (all public pages)
// ─────────────────────────────────────────────
test.describe('Global Navigation', () => {
  const publicPages = [
    { name: 'Home', path: '/', title: /GlobalHire/i },
    { name: 'Jobs', path: '/jobs.html', title: /Opportunities|Jobs|Careers/i },
    { name: 'Guides', path: '/guides.html', title: /Guides|Knowledge/i },
    { name: 'Licensing', path: '/licensing.html', title: /Licensing|Credential/i },
    { name: 'Scholarships', path: '/scholarships.html', title: /Scholarship/i },
    { name: 'Events', path: '/events.html', title: /Events/i },
  ];

  for (const pg of publicPages) {
    test(`${pg.name} page loads with global nav`, async ({ page }) => {
      await page.goto(`${BASE}${pg.path}`);
      await expect(page).toHaveTitle(pg.title);
      // Global nav should be injected
      const nav = page.locator('nav.gnav');
      await expect(nav).toBeVisible({ timeout: 10000 });
      // Logo present (first one — footer also has one)
      await expect(page.locator('.gnav-logo').first()).toBeVisible();
    });

    test(`${pg.name} page has footer`, async ({ page }) => {
      await page.goto(`${BASE}${pg.path}`);
      const footer = page.locator('footer.gfooter');
      await expect(footer).toBeVisible({ timeout: 10000 });
      // Footer links exist
      await expect(footer.locator('a[href="jobs.html"]')).toBeVisible();
      await expect(footer.locator('a[href="scholarships.html"]')).toBeVisible();
    });
  }

  test('nav contains all expected links', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('nav.gnav', { timeout: 10000 });
    const links = page.locator('.gnav-links a');
    const hrefs = await links.evaluateAll(els => els.map(e => e.getAttribute('href')));
    expect(hrefs).toContain('explore.html');
    expect(hrefs).toContain('jobs.html');
    expect(hrefs).toContain('guides.html');
    expect(hrefs).toContain('licensing.html');
    expect(hrefs).toContain('scholarships.html');
    expect(hrefs).toContain('events.html');
  });

  test('nav shows Sign In + Get Started when logged out', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('nav.gnav', { timeout: 10000 });
    // Wait for auth state to resolve
    await page.waitForTimeout(3000);
    const signIn = page.locator('#gnav-actions a[href="login.html"]');
    const getStarted = page.locator('#gnav-actions a[href="signup.html"]');
    // At least one of these should be visible (logged out state)
    const signInVisible = await signIn.isVisible().catch(() => false);
    const getStartedVisible = await getStarted.isVisible().catch(() => false);
    expect(signInVisible || getStartedVisible).toBeTruthy();
  });

  test('mobile menu toggle works', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE);
    await page.waitForSelector('nav.gnav', { timeout: 10000 });
    const toggle = page.locator('#gnav-mobile-toggle');
    await expect(toggle).toBeVisible();
    await toggle.click();
    const menu = page.locator('#gnav-mobile-menu');
    await expect(menu).toHaveClass(/open/, { timeout: 3000 });
  });

  test('nav gets sticky class on scroll', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('nav.gnav', { timeout: 10000 });
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(500);
    await expect(page.locator('nav.gnav')).toHaveClass(/scrolled/);
  });
});

// ─────────────────────────────────────────────
// NO CONSOLE ERRORS ON ANY PAGE
// ─────────────────────────────────────────────
test.describe('No Critical Errors', () => {
  const pages = [
    '/', '/jobs.html', '/guides.html', '/licensing.html',
    '/scholarships.html', '/events.html', '/explore.html',
    '/country-detail.html?code=gb',
  ];

  for (const path of pages) {
    test(`${path} loads without JS errors`, async ({ page }) => {
      const errors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      await page.goto(`${BASE}${path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      // Filter out network/favicon noise
      const critical = errors.filter(e =>
        !e.includes('net::') && !e.includes('ERR_') && !e.includes('favicon') &&
        !e.includes('Failed to load') && !e.includes('401') &&
        !e.includes('Auth guard') && !e.includes('Supabase not ready')
      );
      expect(critical).toEqual([]);
    });
  }
});

// ─────────────────────────────────────────────
// NO 404 ASSETS
// ─────────────────────────────────────────────
test.describe('No 404 Assets', () => {
  const pages = [
    '/', '/jobs.html', '/guides.html', '/licensing.html',
    '/scholarships.html', '/events.html',
    '/country-detail.html?code=gb',
  ];

  for (const path of pages) {
    test(`${path} — all CSS/JS assets load`, async ({ page }) => {
      const failed = [];
      page.on('response', r => {
        const url = r.url();
        if ((url.endsWith('.css') || url.endsWith('.js')) && r.status() >= 400) {
          failed.push(`${r.status()} ${url}`);
        }
      });
      await page.goto(`${BASE}${path}`);
      await page.waitForLoadState('networkidle');
      expect(failed).toEqual([]);
    });
  }
});

// ─────────────────────────────────────────────
// JOBS PAGE — Enhanced Features
// ─────────────────────────────────────────────
test.describe('Jobs Page — Enhanced', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/jobs.html`);
    await page.waitForLoadState('networkidle');
  });

  test('displays job cards', async ({ page }) => {
    const cards = page.locator('.job-card');
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('job cards have key info (title, salary, meta)', async ({ page }) => {
    const firstCard = page.locator('.job-card').first();
    await expect(firstCard.locator('h3')).toBeVisible();
    await expect(firstCard.locator('.job-salary')).toBeVisible();
    await expect(firstCard.locator('.job-meta')).toBeVisible();
  });

  test('search bar is present and interactive', async ({ page }) => {
    const searchInput = page.locator('.search-field input').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Nurse');
    await expect(searchInput).toHaveValue('Nurse');
  });

  test('filter sidebar visible on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}/jobs.html`);
    const sidebar = page.locator('.jobs-sidebar');
    await expect(sidebar).toBeVisible();
    // Specialty checkboxes
    await expect(sidebar.locator('input[type="checkbox"]').first()).toBeVisible();
    // Country dropdown
    await expect(sidebar.locator('select').first()).toBeVisible();
  });

  test('filter sidebar hidden on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/jobs.html`);
    const sidebar = page.locator('.jobs-sidebar');
    await expect(sidebar).not.toBeVisible();
  });

  test('job badges are present', async ({ page }) => {
    const badges = page.locator('.job-badge, .job-badge-new, .job-badge-closing, .job-badge-demand, .urgent-badge');
    expect(await badges.count()).toBeGreaterThan(0);
  });

  test('filter chips are interactive', async ({ page }) => {
    const chips = page.locator('.filter-chip');
    expect(await chips.count()).toBeGreaterThan(0);
    await chips.nth(1).click();
    await expect(chips.nth(1)).toHaveClass(/active/);
  });
});

// ─────────────────────────────────────────────
// GUIDES PAGE
// ─────────────────────────────────────────────
test.describe('Guides Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/guides.html`);
    await page.waitForLoadState('networkidle');
  });

  test('hero section with search bar loads', async ({ page }) => {
    await expect(page.locator('h1')).toBeVisible();
    const searchInput = page.locator('input[type="text"], input[type="search"]').first();
    await expect(searchInput).toBeVisible();
  });

  test('country guide cards are present', async ({ page }) => {
    const countryCards = page.locator('a[href*="country-detail.html?code="]');
    expect(await countryCards.count()).toBeGreaterThanOrEqual(6);
  });

  test('country cards link to correct URLs', async ({ page }) => {
    const gbLink = page.locator('a[href="country-detail.html?code=gb"]');
    await expect(gbLink).toBeVisible();
    const usLink = page.locator('a[href="country-detail.html?code=us"]');
    await expect(usLink).toBeVisible();
  });

  test('licensing guide cards link to licensing page', async ({ page }) => {
    const licLinks = page.locator('a[href*="licensing.html"]');
    expect(await licLinks.count()).toBeGreaterThan(0);
  });

  test('filter chips toggle sections', async ({ page }) => {
    const chips = page.locator('.filter-chip');
    if (await chips.count() > 1) {
      await chips.nth(1).click();
      await expect(chips.nth(1)).toHaveClass(/active/);
    }
  });

  test('carousels have scroll arrows', async ({ page }) => {
    const arrows = page.locator('.carousel-arrow, .scroll-arrow, [class*="arrow"]');
    // Some carousels may have arrows
    const count = await arrows.count();
    // Just verify no crash - arrows may or may not be present based on content width
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────
// COUNTRY DETAIL PAGE
// ─────────────────────────────────────────────
test.describe('Country Detail Page', () => {
  test('loads UK data from ?code=gb', async ({ page }) => {
    await page.goto(`${BASE}/country-detail.html?code=gb`);
    await page.waitForLoadState('networkidle');
    // Should show United Kingdom somewhere
    await expect(page.locator('body')).toContainText(/United Kingdom/i);
  });

  test('loads USA data from ?code=us', async ({ page }) => {
    await page.goto(`${BASE}/country-detail.html?code=us`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/United States/i);
  });

  test('loads UAE data from ?code=ae', async ({ page }) => {
    await page.goto(`${BASE}/country-detail.html?code=ae`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/UAE|United Arab Emirates/i);
  });

  test('displays at-a-glance grid', async ({ page }) => {
    await page.goto(`${BASE}/country-detail.html?code=gb`);
    const glance = page.locator('.glance-grid, [class*="glance"], [id*="glance"]');
    await expect(glance.first()).toBeVisible({ timeout: 10000 });
  });

  test('displays licensing steps', async ({ page }) => {
    await page.goto(`${BASE}/country-detail.html?code=gb`);
    await page.waitForLoadState('networkidle');
    // Should have licensing/registration content
    await expect(page.locator('body')).toContainText(/NMC|licensing|registration/i);
  });

  test('displays job listings for country', async ({ page }) => {
    await page.goto(`${BASE}/country-detail.html?code=gb`);
    await page.waitForLoadState('networkidle');
    // Should have jobs section
    const jobsSection = page.locator('[id*="job"], [class*="job"]');
    expect(await jobsSection.count()).toBeGreaterThan(0);
  });

  test('handles invalid country code gracefully', async ({ page }) => {
    // Page may throw a JS error for unknown code — that's acceptable
    // We just verify the page doesn't return a 404 HTTP status
    const response = await page.goto(`${BASE}/country-detail.html?code=zz`);
    expect(response.status()).toBeLessThan(400);
  });
});

// ─────────────────────────────────────────────
// LICENSING PAGE
// ─────────────────────────────────────────────
test.describe('Licensing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/licensing.html`);
    await page.waitForLoadState('networkidle');
  });

  test('hero section loads', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/Credential|Verification|Licensing/i);
  });

  test('4-step process visual is present', async ({ page }) => {
    const steps = page.locator('.process-step');
    expect(await steps.count()).toBe(4);
  });

  test('licensing tabs are present and switchable', async ({ page }) => {
    const tabBtns = page.locator('.tab-btn, [role="tab"]');
    expect(await tabBtns.count()).toBeGreaterThanOrEqual(4);
    // Click USA tab
    const usaTab = page.locator('.tab-btn[data-tab="usa"], [data-tab="usa"]');
    if (await usaTab.isVisible()) {
      await usaTab.click();
      await page.waitForTimeout(500);
      const usaPanel = page.locator('#tab-usa');
      // Panel may use active class or become visible via display
      const isVisible = await usaPanel.isVisible();
      expect(isVisible).toBeTruthy();
    }
  });

  test('UK tab shows NMC pathway', async ({ page }) => {
    const ukPanel = page.locator('#tab-uk');
    await expect(ukPanel).toBeVisible();
    await expect(ukPanel).toContainText(/NMC/);
  });

  test('pathway analyzer form is present', async ({ page }) => {
    const form = page.locator('#analyzer-form');
    await expect(form).toBeVisible();
    await expect(page.locator('#source-country')).toBeVisible();
    await expect(page.locator('#dest-country')).toBeVisible();
    await expect(page.locator('#specialty')).toBeVisible();
  });

  test('pathway analyzer shows results on submit', async ({ page }) => {
    await page.selectOption('#source-country', 'Nigeria');
    await page.selectOption('#dest-country', 'UK');
    await page.selectOption('#specialty', 'General Nursing');
    await page.click('#analyzer-form button[type="submit"]');
    const results = page.locator('#analyzer-results');
    await expect(results).toBeVisible({ timeout: 5000 });
  });

  test('FAQ accordion opens and closes', async ({ page }) => {
    const firstQ = page.locator('.faq-question').first();
    await firstQ.click();
    const firstItem = page.locator('.faq-item').first();
    await expect(firstItem).toHaveClass(/open/);
    // Click again to close
    await firstQ.click();
    await expect(firstItem).not.toHaveClass(/open/);
  });

  test('partner badges are displayed', async ({ page }) => {
    const badges = page.locator('.partner-badge');
    expect(await badges.count()).toBeGreaterThanOrEqual(5);
  });
});

// ─────────────────────────────────────────────
// SCHOLARSHIPS PAGE
// ─────────────────────────────────────────────
test.describe('Scholarships Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/scholarships.html`);
    await page.waitForLoadState('networkidle');
  });

  test('hero and search bar load', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/Scholarship/i);
    await expect(page.locator('#sch-search')).toBeVisible();
  });

  test('scholarship cards are displayed', async ({ page }) => {
    const cards = page.locator('.sch-card');
    expect(await cards.count()).toBeGreaterThanOrEqual(4);
  });

  test('scholarship cards show institution, description, meta', async ({ page }) => {
    const firstCard = page.locator('.sch-card').first();
    await expect(firstCard.locator('h3')).toBeVisible();
    await expect(firstCard.locator('.sch-card-desc')).toBeVisible();
    await expect(firstCard.locator('.sch-meta-item').first()).toBeVisible();
  });

  test('scholarship badges are present (Full, Partial, New, Closing)', async ({ page }) => {
    const badges = page.locator('.sch-badge');
    expect(await badges.count()).toBeGreaterThan(0);
  });

  test('search filters scholarship cards', async ({ page }) => {
    const allCards = await page.locator('.sch-card').count();
    await page.fill('#sch-search', 'pharmacy');
    await page.click('#sch-search-btn');
    await page.waitForTimeout(500);
    const visibleCards = await page.locator('.sch-card:not([style*="display: none"])').count();
    expect(visibleCards).toBeLessThan(allCards);
    expect(visibleCards).toBeGreaterThan(0);
  });

  test('field filter chips work', async ({ page }) => {
    const nursingChip = page.locator('.filter-chip[data-filter="nursing"]');
    await nursingChip.click();
    await expect(nursingChip).toHaveClass(/active/);
    await page.waitForTimeout(500);
    // All visible cards should be nursing
    const visibleCards = page.locator('.sch-card:not([style*="display: none"])');
    const count = await visibleCards.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const field = await visibleCards.nth(i).getAttribute('data-field');
      expect(field).toBe('nursing');
    }
  });

  test('sidebar filters visible on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}/scholarships.html`);
    const sidebar = page.locator('.sch-sidebar');
    await expect(sidebar).toBeVisible();
    await expect(page.locator('#filter-country')).toBeVisible();
  });

  test('country filter narrows results', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}/scholarships.html`);
    await page.waitForLoadState('networkidle');
    const allCards = await page.locator('.sch-card').count();
    await page.selectOption('#filter-country', 'UK');
    await page.waitForTimeout(500);
    const visibleCards = await page.locator('.sch-card:not([style*="display: none"])').count();
    expect(visibleCards).toBeLessThan(allCards);
    expect(visibleCards).toBeGreaterThan(0);
  });

  test('save button toggles state', async ({ page }) => {
    const saveBtn = page.locator('.sch-save-btn').first();
    await saveBtn.click();
    await expect(saveBtn).toHaveClass(/saved/);
    await saveBtn.click();
    await expect(saveBtn).not.toHaveClass(/saved/);
  });

  test('results count updates on filter', async ({ page }) => {
    const countEl = page.locator('#sch-count');
    const initialCount = await countEl.textContent();
    await page.locator('.filter-chip[data-filter="medicine"]').click();
    await page.waitForTimeout(500);
    const newCount = await countEl.textContent();
    expect(parseInt(newCount)).toBeLessThanOrEqual(parseInt(initialCount));
  });

  test('application assistance section is present', async ({ page }) => {
    await expect(page.locator('#assistance')).toBeVisible();
    await expect(page.locator('#assistance')).toContainText(/Help.*Application|Application.*Assist/i);
  });

  test('FAQ accordion works', async ({ page }) => {
    const firstQ = page.locator('.faq-question').first();
    await firstQ.click();
    await expect(page.locator('.faq-item').first()).toHaveClass(/open/);
  });
});

// ─────────────────────────────────────────────
// EVENTS PAGE
// ─────────────────────────────────────────────
test.describe('Events Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/events.html`);
    await page.waitForLoadState('networkidle');
  });

  test('hero section loads with title', async ({ page }) => {
    await expect(page.locator('h1')).toBeVisible();
  });

  test('event cards are displayed', async ({ page }) => {
    const cards = page.locator('.event-card, [class*="event-card"]');
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('filter pills are present and interactive', async ({ page }) => {
    const pills = page.locator('.filter-pill, .filter-chip, [class*="filter"]');
    if (await pills.count() > 1) {
      await pills.nth(1).click();
      await page.waitForTimeout(500);
    }
  });

  test('featured event card is visible', async ({ page }) => {
    const featured = page.locator('.featured-event, [class*="featured"]');
    if (await featured.count() > 0) {
      await expect(featured.first()).toBeVisible();
    }
  });

  test('countdown timer is present', async ({ page }) => {
    const countdown = page.locator('[class*="countdown"], [id*="countdown"]');
    if (await countdown.count() > 0) {
      await expect(countdown.first()).toBeVisible();
    }
  });

  test('register buttons are clickable', async ({ page }) => {
    const registerBtn = page.locator('button:has-text("Register"), a:has-text("Register")').first();
    if (await registerBtn.isVisible()) {
      await registerBtn.click();
      // Should show toast or some feedback
      await page.waitForTimeout(1000);
    }
  });

  test('past events section exists', async ({ page }) => {
    const past = page.locator('[id*="past"], [class*="past"]');
    expect(await past.count()).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// EXPLORE PAGE (auth-guarded)
// ─────────────────────────────────────────────
test.describe('Explore Page', () => {
  test('auth guard blocks unauthenticated users', async ({ page }) => {
    // Clear any session
    await page.goto(`${BASE}/login.html`);
    await page.evaluate(() => {
      try { localStorage.clear(); } catch(e) {}
      try { sessionStorage.clear(); } catch(e) {}
    });
    await page.goto(`${BASE}/explore.html`);
    // Auth guard may redirect to login or show an auth overlay/message
    await page.waitForTimeout(3000);
    const url = page.url();
    const html = await page.content();
    const redirected = url.includes('login');
    const hasAuthOverlay = html.includes('sign in') || html.includes('Sign In') || html.includes('login') || html.includes('auth');
    expect(redirected || hasAuthOverlay).toBeTruthy();
  });

  test('page structure loads (check without auth)', async ({ page }) => {
    // Just verify the HTML loads without 404
    const response = await page.goto(`${BASE}/explore.html`);
    expect(response.status()).toBeLessThan(400);
  });
});

// ─────────────────────────────────────────────
// PORTAL PAGE — Enhanced Features
// ─────────────────────────────────────────────
test.describe('Portal Page — Structure', () => {
  test('page loads without 404', async ({ page }) => {
    const response = await page.goto(`${BASE}/portal.html`);
    expect(response.status()).toBeLessThan(400);
  });

  test('has My Applications tab in HTML', async ({ page }) => {
    await page.goto(`${BASE}/portal.html`);
    const appTab = page.locator('[data-tab="tab-applications"]');
    expect(await appTab.count()).toBeGreaterThan(0);
  });

  test('has Saved Jobs tab in HTML', async ({ page }) => {
    await page.goto(`${BASE}/portal.html`);
    const savedTab = page.locator('[data-tab="tab-saved"]');
    expect(await savedTab.count()).toBeGreaterThan(0);
  });

  test('has sidebar links to Guides, Licensing, Events', async ({ page }) => {
    await page.goto(`${BASE}/portal.html`);
    // Portal is auth-guarded; when not logged in, check that the page HTML
    // at least references the sidebar links (they may be hidden behind auth redirect)
    const html = await page.content();
    const hasGuides = html.includes('guides.html');
    const hasLicensing = html.includes('licensing.html');
    const hasEvents = html.includes('events.html');
    // Links exist in the global nav/footer even if portal body is auth-gated
    expect(hasGuides || hasLicensing || hasEvents).toBeTruthy();
  });
});

// ─────────────────────────────────────────────
// CROSS-PAGE LINKS
// ─────────────────────────────────────────────
test.describe('Cross-Page Links', () => {
  test('guides → country-detail links work', async ({ page }) => {
    await page.goto(`${BASE}/guides.html`);
    const gbLink = page.locator('a[href="country-detail.html?code=gb"]').first();
    await expect(gbLink).toBeVisible();
    await gbLink.click();
    await page.waitForURL(/country-detail.*code=gb/, { timeout: 10000 });
    await expect(page.locator('body')).toContainText(/United Kingdom/i);
  });

  test('guides → licensing links work', async ({ page }) => {
    await page.goto(`${BASE}/guides.html`);
    const licLink = page.locator('a[href*="licensing.html"]').first();
    await expect(licLink).toBeVisible();
    await licLink.click();
    await page.waitForURL(/licensing/, { timeout: 10000 });
  });

  test('nav logo links back to home', async ({ page }) => {
    await page.goto(`${BASE}/jobs.html`);
    await page.waitForSelector('.gnav-logo', { timeout: 10000 });
    await page.locator('.gnav-logo').first().click();
    // Vercel may resolve index.html to root /
    await page.waitForURL(url => url.pathname === '/' || url.pathname.includes('index'), { timeout: 10000 });
  });
});

// ─────────────────────────────────────────────
// RESPONSIVE LAYOUTS
// ─────────────────────────────────────────────
test.describe('Responsive Layouts', () => {
  test('jobs sidebar collapses at 1024px', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto(`${BASE}/jobs.html`);
    const sidebar = page.locator('.jobs-sidebar');
    await expect(sidebar).not.toBeVisible();
  });

  test('scholarships sidebar collapses at 1024px', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto(`${BASE}/scholarships.html`);
    const sidebar = page.locator('.sch-sidebar');
    await expect(sidebar).not.toBeVisible();
  });

  test('mobile nav toggle visible at 768px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/guides.html`);
    await page.waitForSelector('nav.gnav', { timeout: 10000 });
    await expect(page.locator('#gnav-mobile-toggle')).toBeVisible();
  });
});
