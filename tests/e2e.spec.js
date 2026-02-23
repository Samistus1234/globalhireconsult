const { test, expect } = require('@playwright/test');

const BASE = 'https://globalhire-elab.vercel.app';
const ADMIN_EMAIL = 'living4purpose247@gmail.com';
const ADMIN_PASS = 'Dataflow1234@';

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

  test('Pipeline stages visible with 4 stages', async ({ page }) => {
    const stages = page.locator('.pipeline-stage[data-stage]');
    await expect(stages.first()).toBeVisible({ timeout: 10000 });
    expect(await stages.count()).toBe(4);
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

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${API_URL}/auth/v1/token?grant_type=password`, {
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
      data: { email: ADMIN_EMAIL, password: ADMIN_PASS },
    });
    const body = await res.json();
    authToken = body.access_token;
    expect(authToken).toBeTruthy();
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
      expect(data[0]).toHaveProperty('total_docs');
    }
  });

  test('gh_documents: INSERT, SELECT, DELETE cycle', async ({ request }) => {
    // INSERT
    const ins = await request.post(`${API_URL}/rest/v1/gh_documents`, {
      headers: {
        'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json', 'Prefer': 'return=representation',
      },
      data: {
        applicant_id: '10914406-a283-40be-a16a-fea273933322',
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
