import { expect, type Page } from '@playwright/test';

export interface PageDiagnostics {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: { url: string; method: string; status?: number; failureReason?: string }[];
}

export function setupPageDiagnostics(page: Page): PageDiagnostics {
  const diagnostics: PageDiagnostics = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filter out harmless browser noise if any
      diagnostics.consoleErrors.push(text);
    }
  });

  page.on('pageerror', (err) => {
    diagnostics.pageErrors.push(err.message || String(err));
  });

  page.on('response', (response) => {
    if (response.status() >= 400) {
      // Exclude expected status codes like 401 when testing unauthenticated/public endpoints if appropriate
      const url = response.url();
      // Redact tokens/secrets from URL if present
      const cleanUrl = url.replace(/access_token=[^&]+/g, 'access_token=[REDACTED]');
      diagnostics.failedRequests.push({
        url: cleanUrl,
        method: response.request().method(),
        status: response.status(),
      });
    }
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure();
    const url = request.url().replace(/access_token=[^&]+/g, 'access_token=[REDACTED]');
    diagnostics.failedRequests.push({
      url,
      method: request.method(),
      failureReason: failure ? failure.errorText : 'Unknown request failure',
    });
  });

  return diagnostics;
}

export function assertNoUncaughtErrors(diagnostics: PageDiagnostics) {
  expect(diagnostics.pageErrors, 'Uncaught page errors found').toEqual([]);
}

export async function checkViewportNoOverflow(page: Page) {
  const isOverflowing = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth + 1;
  });
  expect(isOverflowing, 'Page horizontal scroll overflow detected').toBe(false);
}
