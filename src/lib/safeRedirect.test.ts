import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getSafeRedirect } from './safeRedirect';

describe('C2 — Safe Internal redirectTo Handling Unit Tests', () => {
  test('C2.1: Valid internal paths are preserved', () => {
    assert.strictEqual(getSafeRedirect('/explore'), '/explore');
    assert.strictEqual(getSafeRedirect('/onboarding'), '/onboarding');
    assert.strictEqual(getSafeRedirect('/profile'), '/profile');
    assert.strictEqual(getSafeRedirect('/active-swaps'), '/active-swaps');
    assert.strictEqual(getSafeRedirect('/explore?tag=react'), '/explore?tag=react');
    assert.strictEqual(getSafeRedirect('/explore#section'), '/explore#section');
    assert.strictEqual(getSafeRedirect('/some/path?query=value#hash'), '/some/path?query=value#hash');
  });

  test('C2.2: External HTTP/HTTPS URLs are rejected and fallback returned', () => {
    assert.strictEqual(getSafeRedirect('https://evil.example'), '/explore');
    assert.strictEqual(getSafeRedirect('http://evil.example'), '/explore');
    assert.strictEqual(getSafeRedirect('https://evil.example/explore'), '/explore');
    assert.strictEqual(getSafeRedirect('https://evil.example', '/profile'), '/profile');
  });

  test('C2.3: Protocol-relative URLs are rejected', () => {
    assert.strictEqual(getSafeRedirect('//evil.example'), '/explore');
    assert.strictEqual(getSafeRedirect('//evil.example/path'), '/explore');
    assert.strictEqual(getSafeRedirect('///evil.example'), '/explore');
  });

  test('C2.4: Malicious non-HTTP URI schemes are rejected', () => {
    assert.strictEqual(getSafeRedirect('javascript:alert(1)'), '/explore');
    assert.strictEqual(getSafeRedirect('javascript:void(0)'), '/explore');
    assert.strictEqual(getSafeRedirect('data:text/html,<script>alert(1)</script>'), '/explore');
    assert.strictEqual(getSafeRedirect('vbscript:msgbox("hello")'), '/explore');
  });

  test('C2.5: Windows path & backslash escape attempts are rejected', () => {
    assert.strictEqual(getSafeRedirect('\\\\evil.example'), '/explore');
    assert.strictEqual(getSafeRedirect('/\\evil.example'), '/explore');
    assert.strictEqual(getSafeRedirect('/\\/evil.example'), '/explore');
  });

  test('C2.6: URL-encoded breakout attempts are rejected', () => {
    assert.strictEqual(getSafeRedirect('/%2f%2fevil.example'), '/explore');
    assert.strictEqual(getSafeRedirect('/%5cevil.example'), '/explore');
    assert.strictEqual(getSafeRedirect('/explore%0d%0aHeader:Injection'), '/explore');
  });

  test('C2.7: Null, undefined, empty, and non-string inputs return safe default', () => {
    assert.strictEqual(getSafeRedirect(null), '/explore');
    assert.strictEqual(getSafeRedirect(undefined), '/explore');
    assert.strictEqual(getSafeRedirect(''), '/explore');
    assert.strictEqual(getSafeRedirect('   '), '/explore');
    assert.strictEqual(getSafeRedirect(null, '/onboarding'), '/onboarding');
  });
});
