import { test, expect } from '@playwright/test';
import { setupPageDiagnostics, assertNoUncaughtErrors, checkViewportNoOverflow } from './helpers';
import fs from 'node:fs';
import path from 'node:path';

test.describe('FAQ Route Architecture & Visual Consistency E2E', () => {
  test('1. /faq loads through React SPA with shared header/footer, structured data, and accordion controls', async ({ page }) => {
    const diagnostics = setupPageDiagnostics(page);

    // Navigate directly to /faq
    await page.goto('/faq');
    await expect(page).toHaveURL(/\/faq/);
    await expect(page).toHaveTitle('Frequently Asked Questions — SkillSwap');

    // 2. Shared Header & Footer must be present
    const header = page.locator('header.main-header, header');
    await expect(header).toBeVisible();

    const footer = page.locator('footer.site-footer, footer');
    await expect(footer).toBeVisible();

    // 3. Main H1 Heading
    const h1 = page.getByRole('heading', { level: 1, name: /Frequently Asked Questions/i });
    await expect(h1).toBeVisible();

    // 4. Category Tabs
    const allTab = page.getByRole('tab', { name: /All Questions/i });
    await expect(allTab).toBeVisible();

    const trustTab = page.getByRole('tab', { name: /How It Works & Trust/i });
    await expect(trustTab).toBeVisible();

    const useCasesTab = page.getByRole('tab', { name: /Popular Skill Swaps & Use Cases/i });
    await expect(useCasesTab).toBeVisible();

    // 5. Test Category Filtering
    await trustTab.click();
    const trustAccordionBtn = page.getByRole('button', { name: /How do SkillCredits work/i });
    await expect(trustAccordionBtn).toBeVisible();

    // 6. Test Accordion Toggle for a closed item (e.g. item 4)
    const closedAccordionBtn = page.getByRole('button', { name: /Can I trade different types of skills/i });
    await expect(closedAccordionBtn).toBeVisible();
    await closedAccordionBtn.click();

    const accordionContent = page.getByRole('region', { name: /Can I trade different types of skills/i });
    await expect(accordionContent).toBeVisible();
    await expect(accordionContent).toContainText('SkillCredits remove the need for direct 1:1 barter');

    // 7. Contact Support Cards
    const emailCard = page.getByRole('link', { name: /Email Us at skillswap165@gmail.com/i });
    await expect(emailCard).toBeVisible();

    const whatsappCard = page.getByRole('link', { name: /WhatsApp at 6284387420/i });
    await expect(whatsappCard).toBeVisible();

    // 8. CTA Banner Action Buttons
    const ctaJoinBtn = page.getByRole('button', { name: /Join SkillSwap Free/i });
    await expect(ctaJoinBtn).toBeVisible();

    const ctaBrowseBtn = page.getByRole('button', { name: /Browse Marketplace/i });
    await expect(ctaBrowseBtn).toBeVisible();

    // 9. Viewport Overflow Check
    await checkViewportNoOverflow(page);

    // 10. Verify no uncaught runtime errors
    assertNoUncaughtErrors(diagnostics);
  });

  test('2. Mobile layout (390px) enforces 3-column grid alignment and no badge escape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/faq');

    const header = page.locator('header.site-header, header').first();
    const headerBox = await header.boundingBox();

    const cards = page.locator('article.faq-accordion-card');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);

    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      await expect(card).toBeVisible();

      const button = card.locator('button.faq-accordion-btn');
      const badge = button.locator('.faq-badge');
      const heading = button.locator('.faq-question-heading');
      const chevron = button.locator('.faq-chevron-icon');

      await expect(badge).toBeVisible();
      await expect(heading).toBeVisible();
      await expect(chevron).toBeVisible();

      // Per-card Category tags must be removed
      const categoryTag = button.locator('.faq-card-tag');
      await expect(categoryTag).toHaveCount(0);

      const cardBox = await card.boundingBox();
      const badgeBox = await badge.boundingBox();
      const headingBox = await heading.boundingBox();
      const chevronBox = await chevron.boundingBox();

      expect(cardBox).not.toBeNull();
      expect(badgeBox).not.toBeNull();
      expect(headingBox).not.toBeNull();
      expect(chevronBox).not.toBeNull();

      if (cardBox && badgeBox && headingBox && chevronBox) {
        // Badge must remain within card bounds
        expect(badgeBox.x).toBeGreaterThanOrEqual(cardBox.x);
        expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);

        // Badge must never overlap header
        if (headerBox) {
          expect(badgeBox.y).toBeGreaterThan(headerBox.y + headerBox.height);
        }

        // Horizontal Grid Order: Badge < Heading < Chevron
        expect(headingBox.x).toBeGreaterThan(badgeBox.x);
        expect(chevronBox.x).toBeGreaterThan(headingBox.x);
      }
    }

    // Verify no horizontal page overflow on small mobile screen
    await checkViewportNoOverflow(page);
  });

  test('3. Desktop layout (1024px) maintains clean 3-column grid alignment', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/faq');

    const firstCard = page.locator('article.faq-accordion-card').first();
    await expect(firstCard).toBeVisible();

    const button = firstCard.locator('button.faq-accordion-btn');
    const badge = button.locator('.faq-badge');
    const heading = button.locator('.faq-question-heading');
    const chevron = button.locator('.faq-chevron-icon');

    await expect(badge).toBeVisible();
    await expect(heading).toBeVisible();
    await expect(chevron).toBeVisible();

    // Per-card Category tags must be removed
    const categoryTag = button.locator('.faq-card-tag');
    await expect(categoryTag).toHaveCount(0);

    const cardBox = await firstCard.boundingBox();
    const badgeBox = await badge.boundingBox();
    const headingBox = await heading.boundingBox();
    const chevronBox = await chevron.boundingBox();

    expect(cardBox).not.toBeNull();
    expect(badgeBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    expect(chevronBox).not.toBeNull();

    if (cardBox && badgeBox && headingBox && chevronBox) {
      // Horizontal 3-column alignment
      expect(badgeBox.x).toBeGreaterThanOrEqual(cardBox.x);
      expect(headingBox.x).toBeGreaterThan(badgeBox.x + badgeBox.width);
      expect(chevronBox.x).toBeGreaterThan(headingBox.x + headingBox.width);
      expect(chevronBox.x + chevronBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
    }
  });

  test('4. Verify static standalone faq.html does NOT exist in public or dist build output', async () => {
    const publicFaqPath = path.join(process.cwd(), 'public', 'faq.html');
    expect(fs.existsSync(publicFaqPath)).toBe(false);

    const distFaqPath = path.join(process.cwd(), 'dist', 'client', 'faq.html');
    expect(fs.existsSync(distFaqPath)).toBe(false);
  });
});
