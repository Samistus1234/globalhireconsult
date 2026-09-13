/* ============================================
   Partner Marketplace — partner-facing pages smoke tests.
   Static multi-page HTML; run against a LOCAL static server:
     python3 -m http.server 8080   (from repo root)
   then point Playwright's baseURL at http://localhost:8080
   (the committed playwright.config.js baseURL is the Vercel deploy,
    which will NOT carry unpushed pages).
   ============================================ */

const { test, expect } = require('@playwright/test');

/* ============================================
   signInAs — shared login helper for the admin/agency round-trip test below.
   Fills /login.html (#login-email/#login-password, js/auth.js), submits, and
   waits for the post-login redirect to leave login.html. js/auth.js redirects
   by gh_profiles.role (admin -> dashboard.html, recruiter -> recruiter.html,
   everyone else -> ?redirect= or portal.html) — this helper does not care
   which page it lands on; callers immediately page.goto() the real target.
   On a bad credential it surfaces #login-alert's text instead of timing out
   silently, so a broken E2E_* credential fails loud in this test rather than
   fifteen seconds of confusion.
   ============================================ */
async function signInAs(page, email, password) {
  if (!email || !password) {
    throw new Error('signInAs called with a missing email/password (env var not set?)');
  }
  await page.goto('/login.html');
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('#login-form button[type="submit"]');
  await Promise.race([
    page.waitForURL((url) => !url.pathname.endsWith('login.html'), { timeout: 15000 }),
    (async () => {
      const alertBox = page.locator('#login-alert');
      await alertBox.waitFor({ state: 'visible', timeout: 15000 });
      const msg = await alertBox.textContent();
      throw new Error('signInAs(' + email + ') failed to sign in: ' + msg);
    })(),
  ]);
}

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

test.describe('partners-onboarding — signed-out invite: token survives the login redirect', () => {
  // Regression for: an invite link opened while SIGNED OUT — the normal state for a
  // first-time invitee — used to fall straight through to the requireAgency() guard,
  // whose bare `window.location.href = 'login.html'` (no ?next=) silently destroyed the
  // token. After logging in the visitor had no membership, got bounced to
  // partners-signup.html, and registered a DUPLICATE agency — the exact outcome the invite
  // flow exists to prevent. The fix stashes the token in sessionStorage and redirects to
  // login.html?next=... BEFORE requireAgency (or callFn) ever runs.
  test('stashes the token in sessionStorage and redirects to login.html?next=... carrying it, without ever calling requireAgency or accept', async ({ page }) => {
    await page.route('**/js/supabase-client.js', (route) => route.fulfill({
      contentType: 'application/javascript',
      body: `
        window.ghSupabase = {
          auth: {
            getSession: async function () {
              return { data: { session: null }, error: null };
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
          init: async function () { return window.MP; },
          // Spy: must never be reached — the signed-out redirect must fire first.
          requireAgency: function (opts) {
            window.__requireAgencyCalled = true;
            window.location.href = (opts && opts.to) || 'partners-signup.html';
            return false;
          },
          // Spy: mp-agency-invite-accept must never be POSTed while signed out.
          callFn: async function () {
            window.__callFnCalled = true;
            return { ok: false, status: 404, data: { error: 'should not be called signed-out' } };
          }
        };
      `
    }));

    const token = 'signed-out-test-token';
    await page.goto('/partners-onboarding.html?invite=' + token);

    await page.waitForURL(/login\.html/);
    expect(page.url()).toContain('login.html');
    expect(decodeURIComponent(page.url())).toContain('next=partners-onboarding.html?invite=' + token);

    // sessionStorage is per-origin and survives a same-tab navigation to login.html
    // (same origin, localhost:8080), so the stash made on partners-onboarding.html before
    // the redirect is still readable here — proving the token was not simply lost.
    const pending = await page.evaluate(() => sessionStorage.getItem('mp_pending_invite'));
    expect(pending).toBe(token);
  });
});

test.describe('partner messaging — admin/agency document-request round trip (Task 15)', () => {
  // Requires a REAL, already-verified agency + a REAL admin account against
  // whatever backend `baseURL` points at (this repo's committed
  // pw.partners.local.config.js points at a local static server with NO
  // Supabase backend behind it at all, so this spec is meaningless there —
  // it only makes sense pointed at a config whose baseURL is a deployed
  // GlobalHire origin backed by the real evzhnsugmvtqgmvzwyix project).
  // None of E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD / E2E_AGENCY_EMAIL /
  // E2E_AGENCY_PASSWORD exist in this environment as of Task 15 (2026-09-13),
  // and this repo does not fabricate them — that would either hammer a real
  // admin/agency account or require minting one and is not something a test
  // file should do on every run. So: skip cleanly with a clear reason when
  // they're absent, rather than failing (wrong signal — nothing is broken)
  // or silently passing (worse — it would prove nothing).
  //
  // The equivalent backend coverage — real live edge functions
  // (mp-agency-register, mp-thread-create, mp-thread-post, mp-thread-attachment),
  // a real storage upload + signed-URL fetch as both agency and admin, the
  // gh_unread assertion, and full cleanup with a zero-leftover proof — was run
  // directly against the API for this task and is recorded verbatim in
  // .superpowers/sdd/2026-09-12-partner-messaging/task-15-report.md. That is
  // NOT a substitute for this UI spec (it never exercises admin-mp-agencies.html,
  // partners-messages.html, or admin-mp-messages.html) — it demonstrates the
  // functions and RLS underneath them work; this spec is what proves the pages
  // wire up to them correctly, once someone supplies credentials.
  //
  // Note the two selector corrections vs. the plan's illustrative snippet,
  // verified against the actual rendered DOM (js/mp-agencies-admin.js,
  // js/mp-messages-partner.js, js/mp-messages-admin.js) rather than copied
  // blind: the agency-row click target is `.mp-ag-open` (a per-row "Review"
  // button), not `.mp-ag-row:first-child` — no `.mp-ag-row` class exists
  // anywhere in this codebase. Task 8 (the pg_net notification trigger) is
  // deferred and unapplied, so this spec does not assert any notification or
  // email arrives — it structurally cannot yet.
  const creds = {
    E2E_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL,
    E2E_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD,
    E2E_AGENCY_EMAIL: process.env.E2E_AGENCY_EMAIL,
    E2E_AGENCY_PASSWORD: process.env.E2E_AGENCY_PASSWORD,
  };
  const missing = Object.keys(creds).filter((k) => !creds[k]);

  test('admin asks for a document, agency replies with one', async ({ browser }) => {
    test.skip(missing.length > 0,
      'Skipped: missing ' + missing.join(', ') + '. This round trip needs a real, ' +
      'already-verified agency account and a real admin account on the target ' +
      'backend — set all four E2E_* env vars to run it. See the comment above ' +
      'this test and task-15-report.md for why this is a clean skip, not a failure.');

    const admin = await browser.newPage();
    await signInAs(admin, creds.E2E_ADMIN_EMAIL, creds.E2E_ADMIN_PASSWORD);
    await admin.goto('/admin-mp-agencies.html');
    await admin.click('table tbody tr:first-child .mp-ag-open');
    await admin.fill('#mp-drawer-subject', 'Trade licence needed');
    await admin.fill('#mp-drawer-body', 'Please upload your current trade licence.');
    await admin.click('#mp-drawer-compose button[type=submit]');
    await expect(admin.locator('#mp-drawer-msg')).toContainText('Sent');

    const agency = await browser.newPage();
    await signInAs(agency, creds.E2E_AGENCY_EMAIL, creds.E2E_AGENCY_PASSWORD);
    await agency.goto('/partners-messages.html');
    await expect(agency.locator('.mp-thread-item').first()).toContainText('Trade licence needed');
    await agency.locator('.mp-thread-item').first().click();
    await agency.fill('#mp-reply-body', 'Attached.');
    await agency.setInputFiles('#mp-reply-files', 'tests/fixtures/licence.pdf');
    await agency.click('#mp-reply-form button[type=submit]');
    await expect(agency.locator('#mp-reply-msg')).toHaveText('Sent.');

    await admin.goto('/admin-mp-messages.html');
    await expect(admin.locator('.mp-thread-item').first()).toContainText('Trade licence needed');
    await admin.locator('.mp-thread-item').first().click();
    await expect(admin.locator('.mp-att')).toContainText('licence.pdf');

    await admin.close();
    await agency.close();
  });
});
