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

  test('2. Mobile layout (390px) enforces 2-row structure and full question width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/faq');

    const firstCard = page.locator('article.faq-accordion-card').first();
    await expect(firstCard).toBeVisible();

    const button = firstCard.locator('button.faq-accordion-btn');
    await expect(button).toBeVisible();

    const badge = button.locator('.faq-badge');
    const heading = button.locator('.faq-question-heading');
    const chevron = button.locator('.home-faq-icon');
    const categoryTag = firstCard.locator('.faq-card-tag');

    await expect(badge).toBeVisible();
    await expect(heading).toBeVisible();
    await expect(chevron).toBeVisible();
    await expect(categoryTag).toHaveCount(0);

    // Measure bounding boxes at 390px viewport width
    const cardBox = await firstCard.boundingBox();
    const buttonBox = await button.boundingBox();
    const badgeBox = await badge.boundingBox();
    const headingBox = await heading.boundingBox();
    const chevronBox = await chevron.boundingBox();

    expect(cardBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();
    expect(badgeBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    expect(chevronBox).not.toBeNull();

    if (cardBox && buttonBox && badgeBox && headingBox && chevronBox) {
      // Badge and Chevron must remain inside the card bounds
      expect(badgeBox.x).toBeGreaterThanOrEqual(cardBox.x - 1);
      expect(badgeBox.y).toBeGreaterThanOrEqual(cardBox.y - 1);
      expect(badgeBox.y + badgeBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);

      expect(chevronBox.x + chevronBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
      expect(chevronBox.y).toBeGreaterThanOrEqual(cardBox.y - 1);

      // On mobile 2-row structure, badge and chevron share row 1 baseline
      expect(Math.abs(badgeBox.y - chevronBox.y)).toBeLessThan(10);

      // Question heading occupies row 2 positioned below the top metadata row
      expect(headingBox.y).toBeGreaterThanOrEqual(badgeBox.y + badgeBox.height - 2);

      // Question heading must occupy full available card width (>= 80% of button width)
      expect(headingBox.width).toBeGreaterThan(buttonBox.width * 0.8);

      // No element positioned above or outside card bounds
      expect(badgeBox.y).toBeGreaterThanOrEqual(cardBox.y);
      expect(headingBox.y).toBeGreaterThanOrEqual(cardBox.y);
    }

    // Verify no horizontal page overflow on small mobile screen
    await checkViewportNoOverflow(page);
  });

  test('3. Desktop layout (1024px) maintains controlled 3-part layout', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/faq');

    const firstCard = page.locator('article.faq-accordion-card').first();
    await expect(firstCard).toBeVisible();

    const button = firstCard.locator('button.faq-accordion-btn');
    const badge = button.locator('.faq-badge');
    const heading = button.locator('.faq-question-heading');
    const chevron = button.locator('.home-faq-icon');
    const categoryTag = firstCard.locator('.faq-card-tag');

    await expect(badge).toBeVisible();
    await expect(heading).toBeVisible();
    await expect(chevron).toBeVisible();
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
      // Badge, heading, and chevron remain strictly within card bounds
      expect(badgeBox.x).toBeGreaterThanOrEqual(cardBox.x);
      expect(badgeBox.y).toBeGreaterThanOrEqual(cardBox.y);
      expect(chevronBox.x + chevronBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);

      // Heading occupies flexible middle region between badge and chevron
      expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(headingBox.x + 2);
      expect(headingBox.x + headingBox.width).toBeLessThanOrEqual(chevronBox.x + 2);

      // Vertically aligned row in 3-part layout
      expect(Math.abs(badgeBox.y - headingBox.y)).toBeLessThan(15);
    }

    await checkViewportNoOverflow(page);
  });

  test('4. Verify static standalone faq.html does NOT exist in public or dist build output', async () => {
    const publicFaqPath = path.join(process.cwd(), 'public', 'faq.html');
    expect(fs.existsSync(publicFaqPath)).toBe(false);

    const distFaqPath = path.join(process.cwd(), 'dist', 'client', 'faq.html');
    expect(fs.existsSync(distFaqPath)).toBe(false);
  });
});
