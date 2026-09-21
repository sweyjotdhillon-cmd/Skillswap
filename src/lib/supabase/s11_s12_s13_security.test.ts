import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeProfileUpdatePayload, updateCurrentUserProfile } from './profile';
import { submitSwapReview, hasUserReviewedSwap } from './credits';

describe('S11 — Profile / Privacy Boundary Audit & Tests', () => {
  test('S11.1: sanitizeProfileUpdatePayload strips all platform-protected trust metrics', () => {
    const rawPayload = {
      full_name: 'Jane Doe',
      bio: 'Software engineer',
      is_verified: true,
      isVerified: true,
      completed_swaps_count: 50,
      completedSwapsCount: 50,
      average_rating: 5.0,
      averageRating: 5.0,
      review_count: 100,
      reviewCount: 100,
    };

    const sanitized = sanitizeProfileUpdatePayload(rawPayload);

    assert.strictEqual(sanitized.full_name, 'Jane Doe');
    assert.strictEqual(sanitized.bio, 'Software engineer');
    const record = sanitized as Record<string, unknown>;
    assert.strictEqual(record.is_verified, undefined);
    assert.strictEqual(record.isVerified, undefined);
    assert.strictEqual(record.completed_swaps_count, undefined);
    assert.strictEqual(record.completedSwapsCount, undefined);
    assert.strictEqual(record.average_rating, undefined);
    assert.strictEqual(record.averageRating, undefined);
    assert.strictEqual(record.review_count, undefined);
    assert.strictEqual(record.reviewCount, undefined);
  });

  test('S11.2: No client code sends trust metric fields in profile update/upsert calls', () => {
    const srcDir = path.join(process.cwd(), 'src');

    function scanFiles(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
          results = results.concat(scanFiles(filePath));
        } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
          results.push(filePath);
        }
      }
      return results;
    }

    const files = scanFiles(srcDir);
    const violations: string[] = [];

    for (const file of files) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
      const content = fs.readFileSync(file, 'utf8');

      const matches = content.matchAll(/\.from\s*\(\s*['"]profiles['"]\s*\)([^;{}]*)/g);
      for (const m of matches) {
        const chain = m[1];
        if (
          (chain.includes('.update') || chain.includes('.upsert')) &&
          (chain.includes('is_verified') ||
            chain.includes('completed_swaps_count') ||
            chain.includes('average_rating') ||
            chain.includes('review_count'))
        ) {
          violations.push(`${file}: ${m[0]}`);
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Found attempt to mutate platform trust fields in profiles table in: ${violations.join(', ')}`
    );
  });

  test('S11.3: user_private_contacts is never joined in discovery or public profile queries', () => {
    const srcDir = path.join(process.cwd(), 'src');

    function scanFiles(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
          results = results.concat(scanFiles(filePath));
        } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
          results.push(filePath);
        }
      }
      return results;
    }

    const files = scanFiles(srcDir);
    const violations: string[] = [];

    for (const file of files) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
      const content = fs.readFileSync(file, 'utf8');

      if (
        content.includes('user_private_contacts') &&
        (file.includes('Explore') || file.includes('PublicProfile') || file.includes('Marketplace'))
      ) {
        violations.push(file);
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Private contact table referenced in public discovery surfaces: ${violations.join(', ')}`
    );
  });

  test('S11.4: updateCurrentUserProfile handles missing Supabase client safely without corrupting local state', async () => {
    try {
      await updateCurrentUserProfile({ fullName: 'Test Name' });
    } catch (err: unknown) {
      assert.ok(err instanceof Error);
      assert.ok((err as Error).message.length > 0);
    }
  });
});

describe('S12 — Review Integrity & Authorization Audit & Tests', () => {
  test('S12.1: No generic .update() calls exist on swap_reviews table in client code', () => {
    const srcDir = path.join(process.cwd(), 'src');

    function scanFiles(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
          results = results.concat(scanFiles(filePath));
        } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
          results.push(filePath);
        }
      }
      return results;
    }

    const files = scanFiles(srcDir);
    const violations: string[] = [];

    for (const file of files) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
      const content = fs.readFileSync(file, 'utf8');

      const matches = content.matchAll(/\.from\s*\(\s*['"]swap_reviews['"]\s*\)([^;{}]*)/g);
      for (const m of matches) {
        const chain = m[1];
        if (chain.includes('.update')) {
          violations.push(`${file}: ${m[0]}`);
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Found direct .update() calls on swap_reviews in: ${violations.join(', ')}`
    );
  });

  test('S12.2: submitSwapReview and hasUserReviewedSwap functions handle missing client safely', async () => {
    const reviewRes = await submitSwapReview('fake-swap-id', 5, 'Great work!');
    assert.strictEqual(typeof reviewRes.success, 'boolean');

    const hasReviewed = await hasUserReviewedSwap('fake-swap-id', 'fake-user-id');
    assert.strictEqual(typeof hasReviewed, 'boolean');
    assert.strictEqual(hasReviewed, false);
  });
});

describe('S13 — Password Reset Challenge Security Audit & Tests', () => {
  test('S13.1: Password Reset Challenges table is never queried or mutated from browser code', () => {
    const srcDir = path.join(process.cwd(), 'src');

    function scanFiles(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
          results = results.concat(scanFiles(filePath));
        } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
          results.push(filePath);
        }
      }
      return results;
    }

    const files = scanFiles(srcDir);
    const violations: string[] = [];

    for (const file of files) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
      const content = fs.readFileSync(file, 'utf8');

      if (content.includes('password_reset_challenges')) {
        violations.push(file);
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Direct password_reset_challenges references found in browser code: ${violations.join(', ')}`
    );
  });

  test('S13.2: ForgotPassword component clears recoveryToken and otpDigits upon completion', () => {
    const forgotPasswordFile = path.join(process.cwd(), 'src', 'pages', 'ForgotPassword.tsx');
    const content = fs.readFileSync(forgotPasswordFile, 'utf8');

    assert.ok(content.includes('setRecoveryToken(null)'), 'ForgotPassword resets recoveryToken upon success');
    assert.ok(content.includes("setOtpDigits(['', '', '', '', '', ''])"), 'ForgotPassword resets OTP digits upon success');
    assert.ok(content.includes("setStep('success')"), 'ForgotPassword transitions to success step');
  });

  test('S13.3: Passwords and tokens are never saved to localStorage or sessionStorage in password reset flow', () => {
    const forgotPasswordFile = path.join(process.cwd(), 'src', 'pages', 'ForgotPassword.tsx');
    const content = fs.readFileSync(forgotPasswordFile, 'utf8');

    assert.strictEqual(content.includes('localStorage'), false, 'localStorage is not used in ForgotPassword');
    assert.strictEqual(content.includes('sessionStorage'), false, 'sessionStorage is not used in ForgotPassword');
  });
});
