import { test, expect } from '@playwright/test';
import { setupPageDiagnostics, assertNoUncaughtErrors, checkViewportNoOverflow } from './helpers';

test.describe('5. Navigation Integrity & Responsive Smoke CUJ', () => {
  test('should navigate cleanly via header links and drawer without broken routes or layout overflow', async ({ page, isMobile }) => {
    const diagnostics = setupPageDiagnostics(page);

    // 1. Start at Home
    await page.goto('/');
    await expect(page).toHaveTitle(/Skillswap/i);

    if (isMobile) {
      // Mobile Viewport Navigation via Drawer
      const hamburgerBtn = page.locator('.mobile-hamburger');
      await expect(hamburgerBtn).toBeVisible();
      await hamburgerBtn.click();

      const mobileDrawer = page.getByRole('dialog', { name: 'Mobile menu' });
      await expect(mobileDrawer).toBeVisible();

      const exploreLink = mobileDrawer.getByRole('link', { name: 'Explore Swaps' });
      await exploreLink.click();
      await expect(page).toHaveURL(/\/explore/);
      await expect(page).toHaveTitle('Explore Swaps — SkillSwap');

      // Open drawer again to test another link
      await hamburgerBtn.click();
      await expect(mobileDrawer).toBeVisible();

      const howItWorksLink = mobileDrawer.getByRole('link', { name: 'How It Works' });
      await howItWorksLink.click();
      await expect(page).toHaveURL(/\/how-it-works/);
      await expect(page).toHaveTitle('How It Works — SkillSwap');
    } else {
      // Desktop Viewport Navigation via Main Nav
      const primaryNav = page.getByRole('navigation', { name: 'Primary navigation' });

      const exploreLink = primaryNav.getByRole('link', { name: 'Explore Swaps' });
      await expect(exploreLink).toBeVisible();
      await exploreLink.click();
      await expect(page).toHaveURL(/\/explore/);
      await expect(page).toHaveTitle('Explore Swaps — SkillSwap');

      const howItWorksLink = primaryNav.getByRole('link', { name: 'How It Works' });
      await expect(howItWorksLink).toBeVisible();
      await howItWorksLink.click();
      await expect(page).toHaveURL(/\/how-it-works/);
      await expect(page).toHaveTitle('How It Works — SkillSwap');

      const aboutLink = primaryNav.getByRole('link', { name: 'About' });
      await expect(aboutLink).toBeVisible();
      await aboutLink.click();
      await expect(page).toHaveURL(/\/about/);
      await expect(page).toHaveTitle('About — SkillSwap');

      const faqLink = primaryNav.getByRole('link', { name: 'FAQ' });
      await expect(faqLink).toBeVisible();
      await faqLink.click();
      await expect(page).toHaveURL(/\/faq/);
      await expect(page).toHaveTitle('Frequently Asked Questions — SkillSwap');

      // Test Logo Link back Home
      const logoLink = page.locator('a.logo-brand, a.logo-mark, header a[href="/"]').first();
      if (await logoLink.isVisible()) {
        await logoLink.click();
        await expect(page).toHaveURL(/\/$/);
      }
    }

    // Check viewport overflow
    await checkViewportNoOverflow(page);

    // Verify no uncaught JS errors
    assertNoUncaughtErrors(diagnostics);
  });
});
