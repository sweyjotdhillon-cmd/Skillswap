import { test, expect } from '@playwright/test';
import { setupPageDiagnostics, assertNoUncaughtErrors, checkViewportNoOverflow } from './helpers';

test.describe('4. Profile CUJ', () => {
  test('should handle authentication check or verify user profile sections and edit modals', async ({ page }) => {
    const diagnostics = setupPageDiagnostics(page);

    await page.goto('/profile');

    // Wait for auth initialization & potential redirection to resolve
    await page.waitForFunction(
      () => window.location.pathname.startsWith('/login') || document.querySelector('.profile-hero-card') !== null,
      { timeout: 10000 }
    );

    // Check if unauthenticated redirect occurred
    if (page.url().includes('/login')) {
      await expect(page).toHaveURL(/\/login\?redirectTo=%2Fprofile/);
      const loginCardTitle = page.locator('h2.auth-card-title');
      await expect(loginCardTitle).toBeVisible();
      return;
    }

    // Authenticated Flow
    await expect(page).toHaveURL(/\/profile/);
    await expect(page).toHaveTitle('My Profile — SkillSwap');

    // Profile Hero Card
    const heroCard = page.locator('.profile-hero-card');
    await expect(heroCard).toBeVisible();

    // Key Profile Sections
    const skillJourneySection = page.getByRole('region', { name: 'Skill Journey Overview' });
    await expect(skillJourneySection).toBeVisible();

    const reviewsSection = page.getByRole('region', { name: 'Reputation & Reviews' });
    await expect(reviewsSection).toBeVisible();

    const skillsSection = page.getByRole('region', { name: 'Skills & Expertise' });
    await expect(skillsSection).toBeVisible();

    const connectedAccountsSection = page.getByRole('region', { name: 'Connected Accounts' });
    await expect(connectedAccountsSection).toBeVisible();

    const aboutMeSection = page.getByRole('region', { name: 'About Me' });
    await expect(aboutMeSection).toBeVisible();

    // Edit Profile Modal interaction test
    const editProfileBtn = page.getByRole('button', { name: /Edit Profile/i });
    if (await editProfileBtn.isVisible()) {
      await editProfileBtn.click();

      const modalDialog = page.getByRole('dialog', { name: 'Edit Profile' });
      await expect(modalDialog).toBeVisible();

      const cancelBtn = modalDialog.getByRole('button', { name: 'Cancel' });
      await cancelBtn.click();
      await expect(modalDialog).not.toBeVisible();
    }

    // Manage Skills Modal interaction test
    const manageSkillsBtn = page.getByRole('button', { name: /Manage Skills/i });
    if (await manageSkillsBtn.isVisible()) {
      await manageSkillsBtn.click();

      const skillsDialog = page.getByRole('dialog', { name: 'Manage Skills' });
      await expect(skillsDialog).toBeVisible();

      const doneBtn = skillsDialog.getByRole('button', { name: 'Done' });
      await doneBtn.click();
      await expect(skillsDialog).not.toBeVisible();
    }

    // Check viewport overflow
    await checkViewportNoOverflow(page);

    // Verify no uncaught JS errors
    assertNoUncaughtErrors(diagnostics);
  });
});
