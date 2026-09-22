import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getSafeRedirect, cleanSensitiveAuthParamsFromUrl } from './safeRedirect';

describe('C8 — Auth Edge Cases & Safe Redirect Unit Tests', () => {
  test('getSafeRedirect preserves valid internal relative paths', () => {
    assert.equal(getSafeRedirect('/explore'), '/explore');
    assert.equal(getSafeRedirect('/create-swap'), '/create-swap');
    assert.equal(getSafeRedirect('/active-swaps?tab=my_listings'), '/active-swaps?tab=my_listings');
    assert.equal(getSafeRedirect('/profile#settings'), '/profile#settings');
  });

  test('getSafeRedirect rejects absolute external URLs and defaults to /explore', () => {
    assert.equal(getSafeRedirect('https://attacker.com'), '/explore');
    assert.equal(getSafeRedirect('http://phishing-site.org/login'), '/explore');
    assert.equal(getSafeRedirect('https://skillswap.sweyjotdhillon.workers.dev.attacker.com'), '/explore');
  });

  test('getSafeRedirect rejects protocol-relative and backslash escape candidates', () => {
    assert.equal(getSafeRedirect('//attacker.com'), '/explore');
    assert.equal(getSafeRedirect('\\\\attacker.com'), '/explore');
    assert.equal(getSafeRedirect('/\\attacker.com'), '/explore');
    assert.equal(getSafeRedirect('/%2f%2fattacker.com'), '/explore');
    assert.equal(getSafeRedirect('/%5c%5cattacker.com'), '/explore');
  });

  test('getSafeRedirect rejects javascript and data URIs', () => {
    assert.equal(getSafeRedirect('javascript:alert(1)'), '/explore');
    assert.equal(getSafeRedirect('data:text/html,<script>alert(1)</script>'), '/explore');
    assert.equal(getSafeRedirect('vbscript:msgbox("test")'), '/explore');
  });

  test('getSafeRedirect respects custom fallback default path when valid', () => {
    assert.equal(getSafeRedirect('https://evil.com', '/create-swap'), '/create-swap');
    assert.equal(getSafeRedirect(null, '/profile'), '/profile');
    assert.equal(getSafeRedirect(undefined, '/active-swaps'), '/active-swaps');
  });

  test('cleanSensitiveAuthParamsFromUrl strips tokens and codes while preserving safe params', () => {
    // Mock browser window location & history environment
    const originalWindow = globalThis.window;
    try {
      let currentHref = 'http://localhost:5173/explore?redirectTo=%2Fcreate-swap&code=123456&access_token=secret_jwt#refresh_token=secret_refresh';
      let replacedUrl = '';

      const mockWindow = {
        location: {
          get href() {
            return currentHref;
          },
          set href(val: string) {
            currentHref = val;
          },
        },
        history: {
          replaceState: (_data: unknown, _title: string, url: string) => {
            replacedUrl = url;
            currentHref = `http://localhost:5173${url}`;
          },
        },
      };

      (globalThis as unknown as { window: typeof mockWindow }).window = mockWindow;

      cleanSensitiveAuthParamsFromUrl();

      assert.ok(replacedUrl.length > 0, 'replaceState should have been called');
      assert.equal(replacedUrl, '/explore?redirectTo=%2Fcreate-swap');
      assert.ok(!replacedUrl.includes('code='), 'code param should be stripped');
      assert.ok(!replacedUrl.includes('access_token='), 'access_token param should be stripped');
      assert.ok(!replacedUrl.includes('refresh_token='), 'refresh_token fragment should be stripped');
    } finally {
      (globalThis as unknown as { window: typeof originalWindow }).window = originalWindow;
    }
  });
});
