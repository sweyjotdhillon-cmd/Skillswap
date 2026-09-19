import { test, expect } from '@playwright/test';
import { setupPageDiagnostics, assertNoUncaughtErrors, checkViewportNoOverflow } from './helpers';

test.describe('1. Public Explore Marketplace CUJ', () => {
  test('should render marketplace, perform search and filter interactions without errors', async ({ page }) => {
    const diagnostics = setupPageDiagnostics(page);

    // Navigate to Explore Swaps
    const response = await page.goto('/explore');
    expect(response?.status()).toBeLessThan(400);

    // Verify URL & Title
    await expect(page).toHaveURL(/\/explore/);
    await expect(page).toHaveTitle('Explore Swaps — SkillSwap');

    // Primary page heading
    const mainHeading = page.getByRole('heading', { name: /Explore/i, level: 1 });
    await expect(mainHeading).toBeVisible();

    // Navigation header
    const header = page.locator('header.site-header');
    await expect(header).toBeVisible();

    // Search input
    const searchInput = page.getByPlaceholder('Search skills, topics, or swaps...');
    await expect(searchInput).toBeVisible();

    // Skill-domain filter region
    const categoryTablist = page.getByRole('tablist', { name: 'Skill Category Filter Chips' });
    await expect(categoryTablist).toBeVisible();

    // "Available Swaps" section heading
    const availableSwapsHeading = page.getByRole('heading', { name: 'Available Swaps' });
    await expect(availableSwapsHeading).toBeVisible();

    // Search interaction test
    await searchInput.fill('Python');
    await expect(searchInput).toHaveValue('Python');

    // Clear search control
    const clearBtn = page.getByRole('button', { name: 'Clear search' });
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await expect(searchInput).toHaveValue('');
    } else {
      await searchInput.clear();
      await expect(searchInput).toHaveValue('');
    }

    // Category tab selection test
    const allTab = categoryTablist.getByRole('tab', { name: 'All Skill Domains' });
    await expect(allTab).toHaveAttribute('aria-selected', 'true');

    const codingTab = categoryTablist.getByRole('tab', { name: 'Programming' });
    const targetTab = (await codingTab.isVisible()) ? codingTab : categoryTablist.getByRole('tab', { name: 'Coding' });
    if (await targetTab.isVisible()) {
      await targetTab.click();
      await expect(targetTab).toHaveAttribute('aria-selected', 'true');

      // Return to All Skill Domains
      await allTab.click();
      await expect(allTab).toHaveAttribute('aria-selected', 'true');
    }

    // Verify results region (either populated cards or valid empty state)
    const resultsGrid = page.locator('#swaps-results-grid');
    const emptyState = page.locator('.swaps-empty-state');
    const isGridVisible = await resultsGrid.isVisible();
    const isEmptyStateVisible = await emptyState.isVisible();
    expect(isGridVisible || isEmptyStateVisible).toBe(true);

    // Check viewport overflow
    await checkViewportNoOverflow(page);

    // Verify no uncaught JS errors
    assertNoUncaughtErrors(diagnostics);
  });
});
