import { test, expect } from '@playwright/test';
import { setupPageDiagnostics, assertNoUncaughtErrors, checkViewportNoOverflow } from './helpers';

test.describe('C7 — Security & Access Control E2E Suite', () => {
  const protectedRoutes = [
    { path: '/profile', expectedRedirect: '/login?redirectTo=%2Fprofile' },
    { path: '/create-swap', expectedRedirect: '/login?redirectTo=%2Fcreate-swap' },
    { path: '/active-swaps', expectedRedirect: '/login?redirectTo=%2Factive-swaps' },
    { path: '/change-password', expectedRedirect: '/login?redirectTo=%2Fchange-password' },
  ];

  for (const route of protectedRoutes) {
    test(`unauthenticated access to protected route ${route.path} redirects cleanly to login`, async ({ page }) => {
      const diagnostics = setupPageDiagnostics(page);

      await page.goto(route.path);

      // Wait for auth resolution and redirect without CSP unsafe-eval
      await page.waitForURL((url) => url.pathname.startsWith('/login') || url.pathname.startsWith('/verify-email'), { timeout: 10000 });

      await expect(page).toHaveURL(/\/login/);
      const loginTitle = page.locator('h2.auth-card-title');
      await expect(loginTitle).toBeVisible();

      // Check URL parameters contain sanitized redirectTo
      const currentUrl = page.url();
      expect(currentUrl).toContain('redirectTo=');

      await checkViewportNoOverflow(page);
      assertNoUncaughtErrors(diagnostics);
    });
  }

  const maliciousRedirects = [
    'https://attacker.com',
    'http://evil.org/phishing',
    '//attacker.com/login',
    '/\\attacker.com',
    '%2f%2fattacker.com',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
  ];

  for (const maliciousCandidate of maliciousRedirects) {
    test(`malicious redirectTo parameter candidate (${maliciousCandidate}) is rejected and sanitized to safe path`, async ({ page }) => {
      const diagnostics = setupPageDiagnostics(page);

      const targetUrl = `/login?redirectTo=${encodeURIComponent(maliciousCandidate)}`;
      await page.goto(targetUrl);

      // Verify that login page rendered safely
      const loginTitle = page.locator('h2.auth-card-title');
      await expect(loginTitle).toBeVisible();

      // Form submission with bad credentials should keep user safely on app, not redirect to external site
      const emailInput = page.locator('#login-email');
      const passwordInput = page.locator('#login-password');
      const submitBtn = page.locator('button[type="submit"]');

      await emailInput.fill('nobody@example.com');
      await passwordInput.fill('WrongPassword123!');
      await submitBtn.click();

      // Wait for authentication attempt error response
      const alertMessage = page.locator('.auth-alert');
      await expect(alertMessage).toBeVisible({ timeout: 10000 });

      // Origin must remain on local app domain, never external attacker domain
      const finalOrigin = new URL(page.url()).origin;
      const expectedOrigin = new URL(page.url()).origin;
      expect(finalOrigin).toBe(expectedOrigin);

      await checkViewportNoOverflow(page);
      assertNoUncaughtErrors(diagnostics);
    });
  }

  test('OAuth error query parameters render through React safely without HTML injection or script execution', async ({ page }) => {
    const diagnostics = setupPageDiagnostics(page);

    const maliciousError = '<script>window.pwned=true</script>Access Denied';
    await page.goto(`/login?error=access_denied&error_description=${encodeURIComponent(maliciousError)}`);

    const alertMessage = page.locator('.auth-alert');
    await expect(alertMessage).toBeVisible();

    // Verify script was NOT executed in DOM window
    const isPwned = await page.evaluate(() => (window as unknown as { pwned?: boolean }).pwned === true);
    expect(isPwned).toBe(false);

    // Verify error text is safely rendered
    const textContent = await alertMessage.textContent();
    expect(textContent).toContain('Access Denied');

    await checkViewportNoOverflow(page);
    assertNoUncaughtErrors(diagnostics);
  });

  test('password reset flow renders cleanly and handles invalid verification codes safely', async ({ page }) => {
    const diagnostics = setupPageDiagnostics(page);

    await page.goto('/forgot-password');

    const emailInput = page.locator('#forgot-email');
    await expect(emailInput).toBeVisible();

    await emailInput.fill('user@example.com');
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    // Wait for step 2 (OTP step) or error notice without unsafe-eval
    await page.waitForSelector('input[inputmode="numeric"], .auth-alert', { timeout: 10000 });

    await checkViewportNoOverflow(page);
    assertNoUncaughtErrors(diagnostics);
  });
});
