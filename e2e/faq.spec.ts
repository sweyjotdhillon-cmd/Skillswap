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
    const categoryTag = button.locator('.faq-card-tag');
    const heading = button.locator('.faq-question-heading');

    await expect(badge).toBeVisible();
    await expect(categoryTag).toBeVisible();
    await expect(heading).toBeVisible();

    // Measure bounding boxes at 390px viewport width
    const buttonBox = await button.boundingBox();
    const headingBox = await heading.boundingBox();
    const categoryBox = await categoryTag.boundingBox();

    expect(buttonBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    expect(categoryBox).not.toBeNull();

    if (buttonBox && headingBox && categoryBox) {
      // Heading must occupy nearly full available card width (>= 80% of button width)
      expect(headingBox.width).toBeGreaterThan(buttonBox.width * 0.8);

      // On mobile 2-row layout, question heading is positioned below the top metadata row (category tag)
      expect(headingBox.y).toBeGreaterThanOrEqual(categoryBox.y + categoryBox.height - 4);
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
    const categoryTag = button.locator('.faq-card-tag');
    const heading = button.locator('.faq-question-heading');

    await expect(badge).toBeVisible();
    await expect(categoryTag).toBeVisible();
    await expect(heading).toBeVisible();

    const headingBox = await heading.boundingBox();
    const categoryBox = await categoryTag.boundingBox();

    expect(headingBox).not.toBeNull();
    expect(categoryBox).not.toBeNull();

    if (headingBox && categoryBox) {
      // On desktop, category tag is aligned to the right of the question heading
      expect(categoryBox.x).toBeGreaterThan(headingBox.x);
    }
  });

  test('4. Verify static standalone faq.html does NOT exist in public or dist build output', async () => {
    const publicFaqPath = path.join(process.cwd(), 'public', 'faq.html');
    expect(fs.existsSync(publicFaqPath)).toBe(false);

    const distFaqPath = path.join(process.cwd(), 'dist', 'client', 'faq.html');
    expect(fs.existsSync(distFaqPath)).toBe(false);
  });
});
