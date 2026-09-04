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
