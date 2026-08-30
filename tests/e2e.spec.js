const { test, expect } = require('@playwright/test');

const BASE = 'https://globalhire-elab.vercel.app';
const ADMIN_EMAIL = 'e2e-admin@globalhire-test.com';
const ADMIN_PASS = 'E2EAdmin1234!';

const ts = Date.now();
const TEST_USER_EMAIL = `testuser+${ts}@globalhire-test.com`;
const TEST_USER_PASS = 'TestPass123!';
const TEST_USER_NAME = 'E2E Test User';

// Helper: login as admin and wait for dashboard to fully load
async function adminLogin(page) {
  await page.goto(`${BASE}/login.html`);
  await page.fill('#login-email', ADMIN_EMAIL);
  await page.fill('#login-password', ADMIN_PASS);
  await page.click('#login-form button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  // Wait for auth-ready via JS evaluation (more reliable than CSS selector on body)
  await page.waitForFunction(
    () => document.body.classList.contains('auth-ready'),
    { timeout: 20000 }
  );
}

// Helper: clear Supabase session
async function clearSession(page) {
  await page.goto(`${BASE}/login.html`);
  await page.evaluate(() => {
    // Clear all storage
    try { localStorage.clear(); } catch(e) {}
    try { sessionStorage.clear(); } catch(e) {}
    // Clear all cookies
    document.cookie.split(';').forEach(c => {
      document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
    });
  });
  // Also try signing out if supabase client exists
  await page.evaluate(async () => {
    if (window.ghSupabase && window.ghSupabase.auth) {
      try { await window.ghSupabase.auth.signOut(); } catch(e) {}
    }
  });
  await page.waitForTimeout(500);
}

// ─────────────────────────────────────────────
// 1. LANDING PAGE
// ─────────────────────────────────────────────
test.describe('Landing Page', () => {
  test('loads and has correct title & nav links', async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/GlobalHire/i);
    await expect(page.locator('a[href="login.html"]').first()).toBeVisible();
    await expect(page.locator('a[href="signup.html"]').first()).toBeVisible();
  });

  test('Sign In link navigates to login page', async ({ page }) => {
    await page.goto(BASE);
    await Promise.all([
      page.waitForURL(/login/),
      page.locator('a[href="login.html"]').first().click(),
    ]);
    await expect(page).toHaveTitle(/Sign In/i);
  });
});

// ─────────────────────────────────────────────
// 2. LOGIN PAGE
// ─────────────────────────────────────────────
test.describe('Login Page', () => {
  test('renders login form correctly', async ({ page }) => {
    await page.goto(`${BASE}/login.html`);
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.locator('#login-form button[type="submit"]')).toBeVisible();
    await expect(page.locator('a[href="signup.html"]')).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto(`${BASE}/login.html`);
    await page.fill('#login-email', 'nonexistent@test.com');
    await page.fill('#login-password', 'wrongpass');
    await page.click('#login-form button[type="submit"]');
    const alert = page.locator('#login-alert');
    await expect(alert).toBeVisible({ timeout: 10000 });
    await expect(alert).toContainText(/invalid|credentials|error/i);
  });

  test('admin login redirects to dashboard', async ({ page }) => {
    await adminLogin(page);
    expect(page.url()).toMatch(/dashboard/);
  });

  test('forgot password modal opens and closes', async ({ page }) => {
    await page.goto(`${BASE}/login.html`);
    await page.click('#forgot-password-link');
    const modal = page.locator('#forgot-modal');
    await expect(modal).toHaveClass(/visible/);
    await expect(page.locator('#forgot-email')).toBeVisible();
    // Close it
    await page.click('#forgot-close');
    await expect(modal).not.toHaveClass(/visible/);
  });
});

// ─────────────────────────────────────────────
// 3. SIGNUP PAGE
// ─────────────────────────────────────────────
test.describe('Signup Page', () => {
  test('renders step 1 (Account) by default', async ({ page }) => {
    await page.goto(`${BASE}/signup.html`);
    await expect(page.locator('#signup-name')).toBeVisible();
    await expect(page.locator('#signup-email')).toBeVisible();
    await expect(page.locator('#signup-password')).toBeVisible();
    await expect(page.locator('.step-content[data-step="0"]')).toHaveClass(/active/);
  });

  test('validates required fields before advancing', async ({ page }) => {
    await page.goto(`${BASE}/signup.html`);
    await page.click('.btn-next');
    await expect(page.locator('.step-content[data-step="0"]')).toHaveClass(/active/);
    await expect(page.locator('#signup-alert')).toBeVisible();
  });

  test('stepper navigates through all 3 steps with Gulf countries', async ({ page }) => {
    await page.goto(`${BASE}/signup.html`);

    // Step 1
    await page.fill('#signup-name', 'Step Test');
    await page.fill('#signup-email', 'steptest@example.com');
    await page.fill('#signup-password', 'password123');
    await page.click('.btn-next');
    await expect(page.locator('.step-content[data-step="1"]')).toHaveClass(/active/);

    // Step 2
    await page.selectOption('#signup-specialty', 'General Nursing');
    await page.selectOption('#signup-country', 'Nigeria');
    await page.click('.step-content[data-step="1"] .btn-next');
    await expect(page.locator('.step-content[data-step="2"]')).toHaveClass(/active/);

    // Step 3 — verify Gulf countries + other destinations
    for (const country of ['Saudi Arabia', 'Qatar', 'Kuwait', 'UAE', 'Oman', 'Bahrain', 'United Kingdom', 'USA']) {
      await expect(page.locator(`.dest-checkbox[value="${country}"]`)).toBeVisible();
    }
  });

  test('back button works in stepper', async ({ page }) => {
    await page.goto(`${BASE}/signup.html`);
    await page.fill('#signup-name', 'Back Test');
    await page.fill('#signup-email', 'backtest@example.com');
    await page.fill('#signup-password', 'password123');
    await page.click('.btn-next');
    await expect(page.locator('.step-content[data-step="1"]')).toHaveClass(/active/);
    await page.click('.step-content[data-step="1"] .btn-back');
    await expect(page.locator('.step-content[data-step="0"]')).toHaveClass(/active/);
  });
});

// ─────────────────────────────────────────────
// 4. ADMIN DASHBOARD (authenticated)
// ─────────────────────────────────────────────
test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page);
  });

  test('shows admin name in sidebar', async ({ page }) => {
    await expect(page.locator('#admin-user-name')).toContainText(/Samuel|Admin/i, { timeout: 10000 });
    await expect(page.locator('#admin-user-role')).toContainText(/Admin/i);
  });

  test('KPI cards show live data', async ({ page }) => {
    const kpiPipeline = page.locator('#kpi-pipeline');
    const kpiPending = page.locator('#kpi-pending');
    await expect(kpiPipeline).toBeVisible({ timeout: 10000 });
    await expect(kpiPending).toBeVisible();
    // Pipeline should show at least the count of test applicants
    const text = await kpiPipeline.textContent();
    expect(text).toMatch(/\d/);
  });

  test('Recent Applicants table loads', async ({ page }) => {
    const tbody = page.locator('#applicant-tbody');
    await expect(tbody).toBeVisible({ timeout: 10000 });
    // Wait for rows or empty message
    await page.waitForFunction(
      () => {
        const el = document.getElementById('applicant-tbody');
        return el && el.innerHTML.trim().length > 0;
      },
      { timeout: 10000 }
    );
    const html = await tbody.innerHTML();
    expect(html.length).toBeGreaterThan(0);
  });

  test('Pipeline phases visible with 6 phases', async ({ page }) => {
    const stages = page.locator('.pipeline-stage[data-stage]');
    await expect(stages.first()).toBeVisible({ timeout: 10000 });
    expect(await stages.count()).toBe(6);
  });

  test('Verification Queue section present', async ({ page }) => {
    const queue = page.locator('#verif-queue');
    await expect(queue).toBeVisible({ timeout: 10000 });
  });

  test('sign out redirects to login', async ({ page }) => {
    await page.click('#admin-signout');
    await page.waitForURL(/login/, { timeout: 10000 });
  });
});

// ─────────────────────────────────────────────
// 5. AUTH GUARD
// ─────────────────────────────────────────────
test.describe('Auth Guard', () => {
  test('unauthenticated user on dashboard gets redirected', async ({ page }) => {
    await clearSession(page);
    // Go to dashboard with a fresh context
    await page.goto(`${BASE}/dashboard.html`);
    // Should redirect to login within a reasonable time
    await page.waitForURL(/login/, { timeout: 20000 });
  });

  test('unauthenticated user on portal gets redirected', async ({ page }) => {
    await clearSession(page);
    await page.goto(`${BASE}/portal.html`);
    await page.waitForURL(/login/, { timeout: 20000 });
  });

  test('admin accessing portal gets redirected to dashboard', async ({ page }) => {
    await adminLogin(page);
    await page.goto(`${BASE}/portal.html`);
    // Admin should be redirected back to dashboard (role mismatch)
    await page.waitForURL(/dashboard/, { timeout: 15000 });
  });
});

// ─────────────────────────────────────────────
// 6. JOBS PAGE
// ─────────────────────────────────────────────
test.describe('Jobs Page', () => {
  test('loads and displays job listings', async ({ page }) => {
    await page.goto(`${BASE}/jobs.html`);
    await expect(page).toHaveTitle(/Opportunities|Jobs|Careers/i);
    const jobElements = page.locator('.job-card, .posting-card, [class*="job"], [class*="posting"]');
    expect(await jobElements.count()).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// 7. ASSETS & RESOURCES
// ─────────────────────────────────────────────
test.describe('Assets & Resources', () => {
  test('all CSS files load without errors', async ({ page }) => {
    const failedRequests = [];
    page.on('response', r => {
      if (r.url().includes('.css') && r.status() >= 400) failedRequests.push(r.url());
    });
    await page.goto(`${BASE}/login.html`);
    await page.waitForLoadState('networkidle');
    expect(failedRequests).toEqual([]);
  });

  test('all JS files load without errors', async ({ page }) => {
    const failedRequests = [];
    page.on('response', r => {
      if (r.url().includes('.js') && r.status() >= 400) failedRequests.push(r.url());
    });
    await page.goto(`${BASE}/login.html`);
    await page.waitForLoadState('networkidle');
    expect(failedRequests).toEqual([]);
  });

  test('no critical JS errors on login page', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text());
    });
    await page.goto(`${BASE}/login.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    const critical = errors.filter(e => !e.includes('net::') && !e.includes('ERR_BLOCKED'));
    expect(critical).toEqual([]);
  });

  test('no critical JS errors on dashboard after login', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await adminLogin(page);
    await page.waitForTimeout(5000);
    const critical = errors.filter(e =>
      !e.includes('net::') && !e.includes('ERR_BLOCKED') && !e.includes('favicon')
    );
    expect(critical).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// 8. SUPABASE API (direct REST)
// ─────────────────────────────────────────────
test.describe('Supabase API Integration', () => {
  const API_URL = 'https://evzhnsugmvtqgmvzwyix.supabase.co';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2emhuc3VnbXZ0cWdtdnp3eWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTcyNzcsImV4cCI6MjA4NzEzMzI3N30.JSjwHLHudUWlgXkaAam8xxXQbpCmbOLcBGenkFW3qNk';
  let authToken = null;
  let ADMIN_ID = null;

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${API_URL}/auth/v1/token?grant_type=password`, {
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
      data: { email: ADMIN_EMAIL, password: ADMIN_PASS },
    });
    const body = await res.json();
    authToken = body.access_token;
    expect(authToken).toBeTruthy();

    // The admin's auth.users id (for asserting the trigger's auth.uid() attribution).
    const me = await request.get(`${API_URL}/auth/v1/user`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}` },
    });
    ADMIN_ID = (await me.json()).id;
    expect(ADMIN_ID).toBeTruthy();
  });

  test('gh_profiles: SELECT returns profiles', async ({ request }) => {
    const res = await request.get(`${API_URL}/rest/v1/gh_profiles?select=id,full_name,role`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}` },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('full_name');
    expect(data[0]).toHaveProperty('role');
  });

  test('gh_profiles: UPDATE works', async ({ request }) => {
    const res = await request.patch(
      `${API_URL}/rest/v1/gh_profiles?id=eq.10914406-a283-40be-a16a-fea273933322`,
      {
        headers: {
          'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json', 'Prefer': 'return=representation',
        },
        data: { phone: '+233000000002' },
      }
    );
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data[0].phone).toBe('+233000000002');
  });

  test('gh_admin_applicant_overview: returns applicant data', async ({ request }) => {
    const res = await request.get(`${API_URL}/rest/v1/gh_admin_applicant_overview?select=*`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}` },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('pipeline_status');
      expect(data[0]).toHaveProperty('pipeline_exit_status');
      expect(data[0]).toHaveProperty('placement_fee');
      expect(data[0]).toHaveProperty('total_docs');
    }
  });

  test('pipeline: new stage keys + revenue + exit columns round-trip (schema-v25)', async ({ request }) => {
    const pid = '10914406-a283-40be-a16a-fea273933322';
    const H = {
      'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json', 'Prefer': 'return=representation',
    };

    // Read current values so we can restore the shared test profile afterwards.
    const cur = await request.get(`${API_URL}/rest/v1/gh_profiles?select=pipeline_stage,pipeline_exit_status,placement_fee,invoice_number&id=eq.${pid}`, { headers: H });
    const curRow = cur.ok ? (await cur.json())[0] : {};

    try {
      // 1. A revenue stage key + revenue columns are accepted (v25 CHECK + columns)
      const r1 = await request.patch(`${API_URL}/rest/v1/gh_profiles?id=eq.${pid}`, {
        headers: H,
        data: { pipeline_stage: 'invoiced', placement_fee: 7500, fee_currency: 'USD', invoice_number: 'GH-TEST-0001', invoiced_at: new Date().toISOString() },
      });
      expect(r1.status()).toBe(200);
      const d1 = (await r1.json())[0];
      expect(d1.pipeline_stage).toBe('invoiced');
      expect(Number(d1.placement_fee)).toBe(7500);
      expect(d1.invoice_number).toBe('GH-TEST-0001');

      // 2. Exit columns round-trip
      const r2 = await request.patch(`${API_URL}/rest/v1/gh_profiles?id=eq.${pid}`, {
        headers: H,
        data: { pipeline_exit_status: 'withdrawn', pipeline_exit_reason: 'e2e round-trip', pipeline_exited_at: new Date().toISOString() },
      });
      expect(r2.status()).toBe(200);
      const d2 = (await r2.json())[0];
      expect(d2.pipeline_exit_status).toBe('withdrawn');
      expect(d2.pipeline_exit_reason).toBe('e2e round-trip');
    } finally {
      // Restore the shared test profile to its prior state.
      await request.patch(`${API_URL}/rest/v1/gh_profiles?id=eq.${pid}`, {
        headers: H,
        data: {
          pipeline_stage: curRow.pipeline_stage || 'application_received',
          pipeline_exit_status: curRow.pipeline_exit_status || null,
          pipeline_exit_reason: null,
          pipeline_exited_at: null,
          placement_fee: curRow.placement_fee != null ? curRow.placement_fee : null,
          invoice_number: curRow.invoice_number || null,
          invoiced_at: null,
          paid_at: null,
        },
      });
    }
  });

  test('gh_documents: INSERT, SELECT, DELETE cycle', async ({ request }) => {
    // Use the logged-in user's own id as applicant_id: the "own docs" RLS
    // policy (WITH CHECK applicant_id = auth.uid()) is what permits this.
    const me = await request.get(`${API_URL}/auth/v1/user`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}` },
    });
    const myId = (await me.json()).id;
    // INSERT
    const ins = await request.post(`${API_URL}/rest/v1/gh_documents`, {
      headers: {
        'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json', 'Prefer': 'return=representation',
      },
      data: {
        applicant_id: myId,
        doc_type: 'cv', file_name: 'e2e-test.pdf',
        file_path: 'e2e/test.pdf', file_size_bytes: 512, mime_type: 'application/pdf',
      },
    });
    expect(ins.status()).toBe(201);
    const insData = await ins.json();
    const docId = insData[0].id;

    // SELECT
    const sel = await request.get(`${API_URL}/rest/v1/gh_documents?id=eq.${docId}`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}` },
    });
    expect(sel.status()).toBe(200);
    expect((await sel.json())[0].file_name).toBe('e2e-test.pdf');

    // DELETE
    const del = await request.delete(`${API_URL}/rest/v1/gh_documents?id=eq.${docId}`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}` },
    });
    expect(del.status()).toBeLessThan(300);
  });

  test('stage change: trigger → stage-change-notify emails + audits (schema-v26)', async ({ request }) => {
    const ts = Date.now();
    const email = `stagechange+${ts}@globalhire-test.com`;

    // Fresh test applicant. GoTrue auto-confirm is ON, so /auth/v1/signup
    // returns a session (and user.id) immediately — no admin create needed.
    const signup = await request.post(`${API_URL}/auth/v1/signup`, {
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
      data: { email, password: 'StageChange1234!', data: { full_name: 'Stage Change Test' } },
    });
    expect(signup.status()).toBe(200);
    const signupBody = await signup.json();
    const applicantId = signupBody.user.id;
    expect(applicantId).toBeTruthy();

    const H = {
      'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json', 'Prefer': 'return=representation',
    };

    // ── Mapped stage: moving to 'shortlisted' must email + audit ──
    const patch = await request.patch(`${API_URL}/rest/v1/gh_profiles?id=eq.${applicantId}`, {
      headers: H,
      data: { pipeline_stage: 'shortlisted' },
    });
    expect(patch.status()).toBe(200);
    expect((await patch.json())[0].pipeline_stage).toBe('shortlisted');

    // Trigger → pg_net → edge fn is async; poll gh_messages for the audit row.
    let found = null;
    for (let i = 0; i < 30; i++) {
      const sel = await request.get(
        `${API_URL}/rest/v1/gh_messages?applicant_id=eq.${applicantId}&direction=eq.outbound&select=subject,sent_by_admin`,
        { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}` } }
      );
      if (sel.ok) {
        found = (await sel.json()).find((r) => r.subject === "Congratulations — You've Been Shortlisted");
        if (found) break;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    expect(found).toBeTruthy();
    expect(found.subject).toBe("Congratulations — You've Been Shortlisted");
    // The audit row should be attributed to the triggering admin.
    expect(found.sent_by_admin).toBe(ADMIN_ID);

    // ── Silent stage: a revenue stage must NOT email/audit (no new row) ──
    const before = (await (
      await request.get(`${API_URL}/rest/v1/gh_messages?applicant_id=eq.${applicantId}&select=id`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}` },
      })
    ).json()).length;

    const patch2 = await request.patch(`${API_URL}/rest/v1/gh_profiles?id=eq.${applicantId}`, {
      headers: H,
      data: { pipeline_stage: 'invoiced' },
    });
    expect(patch2.status()).toBe(200);

    // Give the (skipped) edge-fn call a quiet window; assert nothing new landed.
    await new Promise((r) => setTimeout(r, 12000));
    const after = (await (
      await request.get(`${API_URL}/rest/v1/gh_messages?applicant_id=eq.${applicantId}&select=id`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}` },
      })
    ).json()).length;
    expect(after).toBe(before);

    // Cleanup: reset the throwaway applicant to a silent stage (no further email).
    await request.patch(`${API_URL}/rest/v1/gh_profiles?id=eq.${applicantId}`, {
      headers: H,
      data: { pipeline_stage: 'application_received' },
    });
  });

  test('offer review: accept from portal advances + emails (schema-v28)', async ({ page, request }) => {
    const ts = Date.now();
    const email = `offeraccept+${ts}@globalhire-test.com`;
    const pass = 'OfferTest1234!';

    // A real, live campaign (my_opportunities only surfaces status active/review/sending)
    const campRes = await request.get(`${API_URL}/rest/v1/gh_campaigns?select=id,title,salary_display,employer_name,destination_country&status=eq.active&limit=1`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}` },
    });
    const campaign = (await campRes.json())[0];
    expect(campaign).toBeTruthy();

    const H = {
      'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json', 'Prefer': 'return=representation',
    };

    // Fresh applicant
    const signup = await request.post(`${API_URL}/auth/v1/signup`, {
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
      data: { email, password: pass, data: { full_name: 'Offer Accept Test' } },
    });
    expect(signup.status()).toBe(200);
    const applicantId = (await signup.json()).user.id;
    expect(applicantId).toBeTruthy();

    // Admin: match → interested (auto-updatable write view)
    const m = await request.post(`${API_URL}/rest/v1/gh_campaign_matches_write`, {
      headers: H,
      data: { campaign_id: campaign.id, applicant_id: applicantId, response: 'interested', match_score: 80 },
    });
    expect(m.status()).toBe(201);
    const matchId = (await m.json())[0].id;
    expect(matchId).toBeTruthy();

    // Admin: profile → offer_extended
    const patchP = await request.patch(`${API_URL}/rest/v1/gh_profiles?id=eq.${applicantId}`, {
      headers: H, data: { pipeline_stage: 'offer_extended' },
    });
    expect(patchP.status()).toBe(200);

    // Admin: placement INSERT via gh_placements (INSTEAD OF trigger — was 0A000 pre-v28)
    const ins = await request.post(`${API_URL}/rest/v1/gh_placements`, {
      headers: H,
      data: {
        match_id: matchId, applicant_id: applicantId, campaign_id: campaign.id,
        stage: 'offer_extended', offer_summary: 'E2E offer terms',
        position_title: campaign.title, employer_name: campaign.employer_name,
        destination_country: campaign.destination_country, salary_display: campaign.salary_display,
      },
    });
    expect(ins.status()).toBe(201);
    const placementId = (await ins.json())[0].id;
    expect(placementId).toBeTruthy();

    // Portal: log in as the applicant, open Opportunities, Review Offer, Accept
    await page.goto(`${BASE}/login.html`);
    await page.fill('#login-email', email);
    await page.fill('#login-password', pass);
    await page.click('#login-form button[type="submit"]');
    await page.waitForURL(/portal/, { timeout: 20000 });
    await page.waitForFunction(() => document.body.classList.contains('auth-ready'), { timeout: 20000 });

    await page.click('.portal-nav-item[data-tab="tab-opportunities"]');
    const offerBtn = page.locator('.btn-opp-offer').first();
    await offerBtn.waitFor({ state: 'visible', timeout: 20000 });
    await offerBtn.click();

    // Offer panel renders campaign details + recruiter offer summary
    await expect(page.locator('#offer-panel')).toBeVisible();
    await expect(page.locator('#offer-panel-content')).toContainText(campaign.title);
    await expect(page.locator('#offer-panel-content')).toContainText('E2E offer terms');

    // Accept
    await page.click('#offer-accept-btn');
    await page.click('#offer-accept-confirm');
    // Back on the list after a successful accept
    await expect(page.locator('#opportunities-list-panel')).toBeVisible({ timeout: 15000 });

    // API asserts
    const prof = await request.get(`${API_URL}/rest/v1/gh_profiles?select=pipeline_stage&id=eq.${applicantId}`, { headers: H });
    expect((await prof.json())[0].pipeline_stage).toBe('offer_accepted');
    const pl = await request.get(`${API_URL}/rest/v1/gh_placements?select=stage&id=eq.${placementId}`, { headers: H });
    expect((await pl.json())[0].stage).toBe('offer_accepted');

    // v26 stage-change email — poll for the row; subject ONLY (triggered_by = the
    // applicant's own auth.uid(), so sent_by_admin must NOT be asserted).
    let found = null;
    for (let i = 0; i < 30; i++) {
      const sel = await request.get(`${API_URL}/rest/v1/gh_messages?applicant_id=eq.${applicantId}&direction=eq.outbound&select=subject`, { headers: H });
      found = (await sel.json()).find((r) => r.subject === 'Offer Accepted — Next Steps');
      if (found) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    expect(found).toBeTruthy();
    expect(found.subject).toBe('Offer Accepted — Next Steps');

    // Cleanup (gh_campaign_matches is a JOINed view — DELETE goes through the write proxy)
    await request.delete(`${API_URL}/rest/v1/gh_placements?id=eq.${placementId}`, { headers: H });
    await request.delete(`${API_URL}/rest/v1/gh_campaign_matches_write?id=eq.${matchId}`, { headers: H });
  });

  test('offer review: decline via RPC exits pipeline + notifies team (schema-v28)', async ({ request }) => {
    const ts = Date.now();
    const email = `offerdecline+${ts}@globalhire-test.com`;
    const pass = 'OfferTest1234!';

    const campRes = await request.get(`${API_URL}/rest/v1/gh_campaigns?select=id,title,employer_name,destination_country&status=eq.active&limit=1`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}` },
    });
    const campaign = (await campRes.json())[0];
    expect(campaign).toBeTruthy();

    const H = {
      'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json', 'Prefer': 'return=representation',
    };

    const signup = await request.post(`${API_URL}/auth/v1/signup`, {
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
      data: { email, password: pass, data: { full_name: 'Offer Decline Test' } },
    });
    const signupBody = await signup.json();
    const applicantId = signupBody.user.id;
    const applicantToken = signupBody.access_token;
    expect(applicantId && applicantToken).toBeTruthy();

    const m = await request.post(`${API_URL}/rest/v1/gh_campaign_matches_write`, {
      headers: H,
      data: { campaign_id: campaign.id, applicant_id: applicantId, response: 'interested', match_score: 70 },
    });
    expect(m.status()).toBe(201);
    const matchId = (await m.json())[0].id;

    await request.patch(`${API_URL}/rest/v1/gh_profiles?id=eq.${applicantId}`, {
      headers: H, data: { pipeline_stage: 'offer_extended' },
    });

    // Applicant calls the RPC directly (public wrapper → globalhire.respond_offer)
    const dec = await request.post(`${API_URL}/rest/v1/rpc/respond_offer`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${applicantToken}`, 'Content-Type': 'application/json' },
      data: { p_match_id: matchId, p_decision: 'decline', p_reason: 'E2E decline' },
    });
    const decBody = await dec.json();
    expect(decBody.success).toBe(true);
    expect(decBody.stage).toBe('terminated');

    const prof = await request.get(`${API_URL}/rest/v1/gh_profiles?select=pipeline_exit_status,pipeline_exit_reason&id=eq.${applicantId}`, { headers: H });
    const profRow = (await prof.json())[0];
    expect(profRow.pipeline_exit_status).toBe('declined');
    expect(profRow.pipeline_exit_reason).toContain('E2E decline');

    const pl = await request.get(`${API_URL}/rest/v1/gh_placements?select=stage,termination_reason&match_id=eq.${matchId}`, { headers: H });
    const plRow = (await pl.json())[0];
    expect(plRow.stage).toBe('terminated');
    expect(plRow.termination_reason).toContain('E2E decline');

    // Inbound message lands in the team inbox
    const inMsgs = await request.get(`${API_URL}/rest/v1/gh_messages?applicant_id=eq.${applicantId}&direction=eq.inbound&select=subject,body`, { headers: H });
    const inRow = (await inMsgs.json()).find((r) => r.subject === 'Offer Declined');
    expect(inRow).toBeTruthy();
    expect(inRow.body).toContain('Offer Decline Test');

    // Cleanup (gh_campaign_matches is a JOINed view — DELETE goes through the write proxy)
    const delPl = await request.get(`${API_URL}/rest/v1/gh_placements?select=id&match_id=eq.${matchId}`, { headers: H });
    const plId = (await delPl.json())[0].id;
    await request.delete(`${API_URL}/rest/v1/gh_placements?id=eq.${plId}`, { headers: H });
    await request.delete(`${API_URL}/rest/v1/gh_campaign_matches_write?id=eq.${matchId}`, { headers: H });
  });

  test('offer review: non-owner accept is rejected (schema-v28)', async ({ request }) => {
    const ts = Date.now();

    const campRes = await request.get(`${API_URL}/rest/v1/gh_campaigns?select=id&status=eq.active&limit=1`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}` },
    });
    const campaign = (await campRes.json())[0];
    expect(campaign).toBeTruthy();

    const H = {
      'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json', 'Prefer': 'return=representation',
    };

    // Attacker: applicant A with a valid session but no match on C's offer
    const suA = await request.post(`${API_URL}/auth/v1/signup`, {
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
      data: { email: `offernonowner+${ts}@globalhire-test.com`, password: 'OfferTest1234!', data: { full_name: 'Non Owner A' } },
    });
    const attackerToken = (await suA.json()).access_token;
    expect(attackerToken).toBeTruthy();

    // Victim: applicant C owns the match
    const suC = await request.post(`${API_URL}/auth/v1/signup`, {
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
      data: { email: `offervictim+${ts}@globalhire-test.com`, password: 'OfferTest1234!', data: { full_name: 'Non Owner C' } },
    });
    const victimId = (await suC.json()).user.id;
    expect(victimId).toBeTruthy();

    const m = await request.post(`${API_URL}/rest/v1/gh_campaign_matches_write`, {
      headers: H,
      data: { campaign_id: campaign.id, applicant_id: victimId, response: 'interested', match_score: 60 },
    });
    expect(m.status()).toBe(201);
    const matchId = (await m.json())[0].id;

    await request.patch(`${API_URL}/rest/v1/gh_profiles?id=eq.${victimId}`, {
      headers: H, data: { pipeline_stage: 'offer_extended' },
    });

    // Attacker calls respond_offer on the victim's match
    const res = await request.post(`${API_URL}/rest/v1/rpc/respond_offer`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${attackerToken}`, 'Content-Type': 'application/json' },
      data: { p_match_id: matchId, p_decision: 'accept' },
    });
    const body = await res.json();
    expect(body.success).toBe(false);

    // Victim unchanged
    const prof = await request.get(`${API_URL}/rest/v1/gh_profiles?select=pipeline_stage&id=eq.${victimId}`, { headers: H });
    expect((await prof.json())[0].pipeline_stage).toBe('offer_extended');

    // Cleanup (gh_campaign_matches is a JOINed view — DELETE goes through the write proxy)
    await request.delete(`${API_URL}/rest/v1/gh_campaign_matches_write?id=eq.${matchId}`, { headers: H });
  });
});

// ─────────────────────────────────────────────
// 9. FULL SIGNUP FLOW
// ─────────────────────────────────────────────
test.describe('Full Signup Flow', () => {
  test('3-step signup creates account', async ({ page }) => {
    await page.goto(`${BASE}/signup.html`);

    // Step 1
    await page.fill('#signup-name', TEST_USER_NAME);
    await page.fill('#signup-email', TEST_USER_EMAIL);
    await page.fill('#signup-password', TEST_USER_PASS);
    await page.click('.btn-next');

    // Step 2
    await expect(page.locator('.step-content[data-step="1"]')).toHaveClass(/active/);
    await page.selectOption('#signup-specialty', 'Emergency Nursing');
    await page.selectOption('#signup-country', 'Ghana');
    await page.fill('#signup-experience', '3');
    await page.fill('#signup-license', 'GH-TEST-001');
    await page.fill('#signup-phone', '+233500000000');
    await page.click('.step-content[data-step="1"] .btn-next');

    // Step 3
    await expect(page.locator('.step-content[data-step="2"]')).toHaveClass(/active/);
    await page.check('.dest-checkbox[value="Saudi Arabia"]');
    await page.check('.dest-checkbox[value="Qatar"]');
    await page.check('.dest-checkbox[value="United Kingdom"]');
    await page.click('button[type="submit"]');

    // Wait for result
    await page.waitForTimeout(10000);
    const url = page.url();

    if (url.includes('portal')) {
      // Success — redirected to portal
      await page.waitForTimeout(3000);
      // Check we're still on portal (no crash/redirect loop)
      expect(page.url()).toMatch(/portal/);
    } else {
      // Still on signup — check for success or error message
      const alert = page.locator('#signup-alert');
      if (await alert.isVisible()) {
        const text = await alert.textContent();
        // Accept: success message OR "already exists" OR email confirmation
        expect(text).toMatch(/created|confirm|email|exist|wrong/i);
      }
    }
  });
});
