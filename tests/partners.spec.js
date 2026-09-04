/* ============================================
   Partner Marketplace — partner-facing pages smoke tests.
   Static multi-page HTML; run against a LOCAL static server:
     python3 -m http.server 8080   (from repo root)
   then point Playwright's baseURL at http://localhost:8080
   (the committed playwright.config.js baseURL is the Vercel deploy,
    which will NOT carry unpushed pages).
   ============================================ */

const { test, expect } = require('@playwright/test');

test.describe('partners-signup', () => {
  test('renders #mp-signup-form with the four required inputs, no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto('/partners-signup.html');

    await expect(page.locator('#mp-signup-form')).toBeVisible();

    for (const name of ['full_name', 'email', 'password', 'agency_name']) {
      const input = page.locator(`#mp-signup-form input[name="${name}"]`);
      await expect(input).toBeVisible();
      expect(await input.evaluate((el) => el.required)).toBe(true);
    }

    expect(errors).toEqual([]);
  });
});

test.describe('partners-onboarding', () => {
  // MP.init() resolves the (unauthenticated) session locally with no network hop,
  // so the page guard's redirect to login.html fires within a microtask of load —
  // there's no reliable window to assert the live DOM after a normal page.goto().
  // This test verifies the STATIC markup shape (the form + its checkbox groups,
  // as authored in partners-onboarding.html) with JS disabled, sidestepping the
  // race entirely. The guard/redirect behavior itself is covered by the
  // partners-dashboard test below (same mp-core.js contract, same code path).
  test.use({ javaScriptEnabled: false });

  test('renders #mp-profile-form with services (7) and cooperation_areas (12) checkbox groups, no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto('/partners-onboarding.html');

    await expect(page.locator('#mp-profile-form')).toBeVisible();

    const services = page.locator('#mp-profile-form input[name="services"]');
    await expect(services).toHaveCount(7);

    const coopAreas = page.locator('#mp-profile-form input[name="cooperation_areas"]');
    await expect(coopAreas).toHaveCount(12);

    expect(errors).toEqual([]);
  });
});

test.describe('partners-dashboard', () => {
  test('unauthenticated visit redirects to login.html', async ({ page }) => {
    await page.goto('/partners-dashboard.html');
    await page.waitForURL(/login\.html/);
    expect(page.url()).toContain('login.html');
  });
});

test.describe('partners-onboarding — invite failure regression', () => {
  // Regression for: an invite failure (400 expired / 403 wrong email / 409 already belongs
  // elsewhere) used to be silently swallowed by the requireAgency() guard for the most common
  // case — a signed-in visitor with NO existing agency membership (a first-time invitee) — who
  // was bounced straight to partners-signup.html with no explanation. That surface is invisible
  // to the javaScriptEnabled:false smoke test above, so this exercises the real runtime path:
  // js/supabase-client.js and js/mp-core.js are replaced with deterministic stubs (served in
  // place of the real files via page.route) that produce exactly that state — signed in, no
  // membership, ?invite=<bad-token> — before js/mp-onboarding.js itself (unmodified, real) runs.
  test('signed in, no membership, bad invite token: stays put, shows the reason, never calls requireAgency', async ({ page }) => {
    await page.route('**/js/supabase-client.js', (route) => route.fulfill({
      contentType: 'application/javascript',
      body: `
        window.ghSupabase = {
          auth: {
            getSession: async function () {
              return { data: { session: { access_token: 'test-token' } }, error: null };
            }
          }
        };
      `
    }));

    await page.route('**/js/mp-core.js', (route) => route.fulfill({
      contentType: 'application/javascript',
      body: `
        window.MP = {
          status: 'no_agency',
          agency: null,
          membership: null,
          user: null,
          lastError: null,
          esc: function (s) {
            var d = document.createElement('div');
            d.appendChild(document.createTextNode(String(s || '')));
            return d.innerHTML;
          },
          init: async function () {
            window.MP.user = { id: 'test-user', email: 'invited@example.com' };
            window.MP.membership = null;
            window.MP.agency = null;
            window.MP.status = 'no_agency';
            return window.MP;
          },
          // Spy: the fix under test must never reach this when an invite failure occurred.
          requireAgency: function (opts) {
            window.__requireAgencyCalled = true;
            window.location.href = (opts && opts.to) || 'partners-signup.html';
            return false;
          },
          callFn: async function (name) {
            if (name === 'mp-agency-invite-accept') {
              return { ok: false, status: 400, data: { error: 'invite expired' } };
            }
            return { ok: false, status: 404, data: { error: 'not stubbed' } };
          }
        };
      `
    }));

    await page.goto('/partners-onboarding.html?invite=bad-token');

    // Give the page's async IIFE (getSession → callFn → init → render) time to settle.
    await expect(page.locator('#mp-error')).toBeVisible();
    await expect(page.locator('#mp-error')).toContainText('invite expired');
    await expect(page.locator('#mp-error a[href="login.html"]')).toBeVisible();
    await expect(page.locator('#mp-error a[href="partners-signup.html"]')).toBeVisible();

    // The bug: requireAgency() used to run regardless and navigate away before this render.
    expect(page.url()).not.toContain('partners-signup.html');
    expect(page.url()).toContain('partners-onboarding.html');
    expect(await page.evaluate(() => window.__requireAgencyCalled)).not.toBe(true);
  });
});
