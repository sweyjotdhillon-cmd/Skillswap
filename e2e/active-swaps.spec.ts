import { test, expect } from '@playwright/test';
import { setupPageDiagnostics, assertNoUncaughtErrors, checkViewportNoOverflow } from './helpers';

test.describe('3. Active Swaps CUJ', () => {
  test('should handle authentication check or verify active swaps workspace tabs and layout', async ({ page }) => {
    const diagnostics = setupPageDiagnostics(page);

    await page.goto('/active-swaps');

    // Wait for auth initialization & potential redirection without CSP unsafe-eval
    await page.waitForSelector('h2.auth-card-title, .active-swaps-workspace', { timeout: 10000 });

    // Check if unauthenticated redirect occurred
    if (page.url().includes('/login')) {
      await expect(page).toHaveURL(/\/login\?redirectTo=%2Factive-swaps/);
      const loginCardTitle = page.locator('h2.auth-card-title');
      await expect(loginCardTitle).toBeVisible();
      return;
    }

    // Authenticated Flow
    await expect(page).toHaveURL(/\/active-swaps/);
    await expect(page).toHaveTitle('Active Swaps — SkillSwap');

    // Primary page heading
    const mainHeading = page.getByRole('heading', { name: 'Active Swaps', level: 1 });
    await expect(mainHeading).toBeVisible();

    // Tablist navigation
    const tabList = page.getByRole('tablist', { name: 'Active Swap Categories' });
    await expect(tabList).toBeVisible();

    const acceptedTab = page.getByRole('tab', { name: /Accepted Swaps/i });
    const givenTab = page.getByRole('tab', { name: /Given Swaps/i });
    const openTab = page.getByRole('tab', { name: /My Open Swaps/i });

    await expect(acceptedTab).toBeVisible();
    await expect(givenTab).toBeVisible();
    await expect(openTab).toBeVisible();

    // Tab switching interaction
    await givenTab.click();
    await expect(givenTab).toHaveAttribute('aria-selected', 'true');

    await openTab.click();
    await expect(openTab).toHaveAttribute('aria-selected', 'true');

    await acceptedTab.click();
    await expect(acceptedTab).toHaveAttribute('aria-selected', 'true');

    // Details panel region check
    const detailsPanel = page.locator('.as-right-panel');
    await expect(detailsPanel).toBeVisible();

    // Check viewport overflow
    await checkViewportNoOverflow(page);

    // Verify no uncaught JS errors
    assertNoUncaughtErrors(diagnostics);
  });
});
