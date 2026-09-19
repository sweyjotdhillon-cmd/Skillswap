import { test, expect } from '@playwright/test';
import { setupPageDiagnostics, assertNoUncaughtErrors, checkViewportNoOverflow } from './helpers';

test.describe('2. Create Swap CUJ', () => {
  test('should handle authentication check or verify progressive 3-stage wizard stepper', async ({ page }) => {
    const diagnostics = setupPageDiagnostics(page);

    await page.goto('/create-swap');

    // Wait for auth initialization & potential redirection to resolve
    await page.waitForFunction(
      () => window.location.pathname.startsWith('/login') || document.querySelector('.cs-stepper-container') !== null,
      { timeout: 10000 }
    );

    // Check if unauthenticated redirect occurred
    if (page.url().includes('/login')) {
      await expect(page).toHaveURL(/\/login\?redirectTo=%2Fcreate-swap/);
      const loginCardTitle = page.locator('h2.auth-card-title');
      await expect(loginCardTitle).toBeVisible();
      return;
    }

    // Authenticated Flow
    await expect(page).toHaveURL(/\/create-swap/);
    await expect(page).toHaveTitle('Create Swap — Skillswap');

    // Stepper & Progressbar
    const stepperContainer = page.locator('.cs-stepper-container');
    await expect(stepperContainer).toBeVisible();

    const progressBar = page.getByRole('progressbar');
    await expect(progressBar).toBeVisible();

    const step1Tab = page.getByRole('tab', { name: /1\. Skill Request/i });
    const step2Tab = page.getByRole('tab', { name: /2\. Exchange Terms/i });
    const step3Tab = page.getByRole('tab', { name: /3\. Resources & Publish/i });

    await expect(step1Tab).toBeVisible();
    await expect(step2Tab).toBeVisible();
    await expect(step3Tab).toBeVisible();

    // Step 1 Section Heading
    await expect(page.getByText('Skill Request Overview')).toBeVisible();

    // Form inputs on Step 1
    const topicInput = page.getByPlaceholder(/e\.g\. Python Data Analysis/i);
    await expect(topicInput).toBeVisible();

    const descInput = page.getByPlaceholder(/Describe what you're offering or requesting/i);
    await expect(descInput).toBeVisible();

    // Validation check on Step 1 (try to proceed without required fields)
    const nextBtn1 = page.getByRole('button', { name: /Next: Exchange Terms/i });
    await nextBtn1.click();

    // Verify error messages appear
    await expect(page.getByText('Please add a topic.')).toBeVisible();

    // Fill valid Step 1 data
    await topicInput.fill('Test Skill Exchange');
    // Select first tag if available
    const firstTagBtn = page.locator('.tag-pill-btn').first();
    if (await firstTagBtn.isVisible()) {
      await firstTagBtn.click();
    }
    await descInput.fill('This is a test description for end-to-end verification.');

    // Proceed to Step 2
    await nextBtn1.click();
    await expect(page.getByText('Exchange Terms & Deliverables')).toBeVisible();

    // Verify Step 2 controls
    const creditsInput = page.getByPlaceholder(/e\.g\. 50/i);
    await expect(creditsInput).toBeVisible();

    const requirementsInput = page.getByPlaceholder(/Describe specific deliverables/i);
    await expect(requirementsInput).toBeVisible();

    // Test returning to Step 1
    const backBtn1 = page.getByRole('button', { name: /Back to Overview/i });
    await backBtn1.click();
    await expect(page.getByText('Skill Request Overview')).toBeVisible();

    // Verify state was preserved
    await expect(topicInput).toHaveValue('Test Skill Exchange');

    // Check viewport overflow
    await checkViewportNoOverflow(page);

    // Verify no uncaught JS errors
    assertNoUncaughtErrors(diagnostics);
  });
});
