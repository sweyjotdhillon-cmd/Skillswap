import { test, expect } from '@playwright/test';
import { setupPageDiagnostics, assertNoUncaughtErrors, checkViewportNoOverflow } from './helpers';

test.describe('C6 — Responsive Layout Regression Suite', () => {
  const routesToTest = [
    { path: '/', name: 'Landing / Home Page', selector: 'h1' },
    { path: '/explore', name: 'Explore Swaps Page', selector: '#swaps-results-grid, .swaps-empty-state' },
    { path: '/login', name: 'Login Page', selector: 'h2.auth-card-title' },
    { path: '/signup', name: 'Signup Page', selector: 'h2.auth-card-title' },
    { path: '/forgot-password', name: 'Forgot Password Page', selector: 'h2.auth-card-title' },
    { path: '/reset-password', name: 'Reset Password Page', selector: 'h2.auth-card-title' },
    { path: '/verify-email?email=test%40example.com', name: 'Verify Email Page', selector: 'h2.auth-card-title' },
    { path: '/about', name: 'About Page', selector: 'h1' },
    { path: '/how-it-works', name: 'How It Works Page', selector: 'h1' },
    { path: '/faq', name: 'FAQ Page', selector: 'h1' },
    { path: '/learn/what-is-skill-exchange', name: 'What Is Skill Exchange Page', selector: 'h1' },
  ];

  for (const route of routesToTest) {
    test(`responsive layout check for ${route.name} (${route.path})`, async ({ page }) => {
      const diagnostics = setupPageDiagnostics(page);

      await page.goto(route.path);
      await page.waitForLoadState('domcontentloaded');

      // Verify core landmark or heading is visible
      const landmark = page.locator(route.selector).first();
      await expect(landmark).toBeVisible({ timeout: 10000 });

      // Verify header is present and usable
      const header = page.locator('header.site-header');
      await expect(header).toBeVisible();

      // Verify footer is present (on pages that have footer)
      const footer = page.locator('footer');
      if (await footer.count() > 0) {
        await expect(footer).toBeVisible();
      }

      // Assert no horizontal scroll overflow
      await checkViewportNoOverflow(page);

      // Assert no uncaught JS errors
      assertNoUncaughtErrors(diagnostics);
    });
  }

  test('navigation drawer vs header controls responsiveness across viewports', async ({ page, viewport }) => {
    const diagnostics = setupPageDiagnostics(page);

    await page.goto('/');
    const width = viewport?.width || 1024;

    if (width < 860) {
      // Viewports < 860px use Mobile Hamburger Drawer
      const hamburgerBtn = page.locator('.mobile-hamburger');
      await expect(hamburgerBtn).toBeVisible();
      await hamburgerBtn.click();

      const mobileDrawer = page.getByRole('dialog', { name: 'Mobile menu' });
      await expect(mobileDrawer).toBeVisible();

      // Check drawer links are reachable
      const exploreLink = mobileDrawer.getByRole('link', { name: 'Explore Swaps' });
      await expect(exploreLink).toBeVisible();

      // Close drawer via overlay or close button
      const closeBtn = mobileDrawer.getByRole('button', { name: /close menu/i });
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      } else {
        await hamburgerBtn.click();
      }
      await expect(mobileDrawer).not.toBeVisible();
    } else {
      // Desktop / Wide Viewports (>= 860px): Main Navigation Bar
      const primaryNav = page.getByRole('navigation', { name: 'Primary navigation' });
      await expect(primaryNav).toBeVisible();

      const exploreLink = primaryNav.getByRole('link', { name: 'Explore Swaps' });
      await expect(exploreLink).toBeVisible();
    }

    await checkViewportNoOverflow(page);
    assertNoUncaughtErrors(diagnostics);
  });

  test('form controls and dialogs remain within viewport without clipping on auth screens', async ({ page }) => {
    const diagnostics = setupPageDiagnostics(page);

    await page.goto('/login');

    const emailInput = page.locator('#login-email');
    const passwordInput = page.locator('#login-password');
    const submitBtn = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();

    // Fill sample inputs to ensure focus and text bounds work
    await emailInput.fill('user@example.com');
    await passwordInput.fill('Password123!');

    // Check submit button is inside viewport
    const btnBox = await submitBtn.boundingBox();
    const viewportSize = page.viewportSize();

    if (btnBox && viewportSize) {
      expect(btnBox.x).toBeGreaterThanOrEqual(0);
      expect(btnBox.x + btnBox.width).toBeLessThanOrEqual(viewportSize.width + 1);
    }

    await checkViewportNoOverflow(page);
    assertNoUncaughtErrors(diagnostics);
  });

  test('modal body scroll-lock acquires on open and releases on close allowing normal page scrolling', async ({ page }) => {
    const diagnostics = setupPageDiagnostics(page);

    await page.goto('/explore');
    await page.waitForLoadState('domcontentloaded');

    // Initial body overflow should not be 'hidden'
    const initialOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(initialOverflow).not.toBe('hidden');

    // If chat buttons or credit modal button exist, test open and close scroll lock cycle
    const chatBtn = page.locator('button:has-text("Workspace & Chat"), button:has-text("Chat"), button:has-text("Chat with creator")').first();
    const creditBtn = page.locator('.mobile-credit-btn, .nav-credit-indicator-btn').first();

    if (await chatBtn.isVisible()) {
      // Scroll page down
      await page.evaluate(() => window.scrollTo(0, 200));
      const scrollPosBefore = await page.evaluate(() => window.scrollY);

      // Open Chat Modal
      await chatBtn.click();
      const chatModal = page.locator('.chat-workspace-content');
      await expect(chatModal).toBeVisible();

      // Body overflow MUST be 'hidden' when modal is open
      const overflowDuringChat = await page.evaluate(() => document.body.style.overflow);
      expect(overflowDuringChat).toBe('hidden');

      // Close Chat Modal
      const closeBtn = page.locator('.chat-close-btn').first();
      await closeBtn.click();
      await expect(chatModal).not.toBeVisible();

      // Body overflow MUST be restored (not 'hidden')
      const overflowAfterChat = await page.evaluate(() => document.body.style.overflow);
      expect(overflowAfterChat).not.toBe('hidden');

      // Scroll position preserved and page remains scrollable in both directions
      const scrollPosAfter = await page.evaluate(() => window.scrollY);
      expect(scrollPosAfter).toBe(scrollPosBefore);

      await page.evaluate(() => window.scrollBy(0, 100));
      const scrolledDown = await page.evaluate(() => window.scrollY);
      expect(scrolledDown).toBeGreaterThan(scrollPosBefore);

      await page.evaluate(() => window.scrollBy(0, -100));
      const scrolledUp = await page.evaluate(() => window.scrollY);
      expect(scrolledUp).toBeLessThan(scrolledDown);
    } else if (await creditBtn.isVisible()) {
      // Test using Credit Modal
      await page.evaluate(() => window.scrollTo(0, 200));
      const scrollPosBefore = await page.evaluate(() => window.scrollY);

      await creditBtn.click();
      const creditModal = page.locator('.credit-history-modal');
      await expect(creditModal).toBeVisible();

      const modalActiveOverflow = await page.evaluate(() => document.body.style.overflow);
      expect(modalActiveOverflow).toBe('hidden');

      const closeBtn = page.locator('.credit-modal-close-btn');
      await closeBtn.click();
      await expect(creditModal).not.toBeVisible();

      const modalClosedOverflow = await page.evaluate(() => document.body.style.overflow);
      expect(modalClosedOverflow).not.toBe('hidden');

      const scrollPosAfter = await page.evaluate(() => window.scrollY);
      expect(scrollPosAfter).toBe(scrollPosBefore);
    }

    assertNoUncaughtErrors(diagnostics);
  });
});
