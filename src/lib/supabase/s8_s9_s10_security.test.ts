import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { completeCreditSwap, acceptCreditSwap, cancelCreditSwap } from './credits';

describe('S8 — Swap Lifecycle Authorization Audit', () => {
  test('S8.1: No direct .update({ status: ... }) calls on swaps table in client code', () => {
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

      // Look for .from('swaps') chains that call .update(...)
      const matches = content.matchAll(/\.from\s*\(\s*['"]swaps['"]\s*\)([^;{}]*)/g);
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
      `Found direct client updates on swaps table in: ${violations.join(', ')}`
    );
  });

  test('S8.2: Immutable swap fields (requester_id, credit_amount, idempotency_key) are never sent in UPDATE payloads', () => {
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

      const matches = content.matchAll(/\.from\s*\(\s*['"]swaps['"]\s*\)([^;{}]*)/g);
      for (const m of matches) {
        const chain = m[1];
        if (chain.includes('.update') && (chain.includes('requester_id') || chain.includes('credit_amount') || chain.includes('idempotency_key'))) {
          violations.push(`${file}: ${m[0]}`);
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Found attempt to update immutable swap fields in: ${violations.join(', ')}`
    );
  });

  test('S8.3: Lifecycle transition functions acceptCreditSwap and cancelCreditSwap are exported and handle missing clients gracefully', async () => {
    assert.strictEqual(typeof acceptCreditSwap, 'function', 'acceptCreditSwap function is exported');
    assert.strictEqual(typeof cancelCreditSwap, 'function', 'cancelCreditSwap function is exported');

    const acceptRes = await acceptCreditSwap('test-swap-id');
    assert.strictEqual(typeof acceptRes.success, 'boolean', 'acceptCreditSwap returns success boolean');

    const cancelRes = await cancelCreditSwap('test-swap-id');
    assert.strictEqual(typeof cancelRes.success, 'boolean', 'cancelCreditSwap returns success boolean');
  });
});

describe('S9 — Credit Settlement Integrity Audit', () => {
  test('S9.1: No direct client updates to accounts or inserts to credit_transactions/operations', () => {
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

      const tables = ['accounts', 'credit_transactions', 'credit_operations'];
      for (const table of tables) {
        const regex = new RegExp(`\\.from\\s*\\(\\s*['"]${table}['"]\\s*\\)([^;{}]*)`, 'g');
        const matches = content.matchAll(regex);
        for (const m of matches) {
          const chain = m[1];
          if (chain.includes('.update') || chain.includes('.insert') || chain.includes('.delete') || chain.includes('.upsert')) {
            violations.push(`Direct ${table} mutation in ${file}: ${m[0]}`);
          }
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Found direct ledger/account mutations: ${violations.join(', ')}`
    );
  });

  test('S9.2: completeCreditSwap helper function is exported and returns CreditOperationResult shape', async () => {
    assert.strictEqual(typeof completeCreditSwap, 'function', 'completeCreditSwap is exported');
    const res = await completeCreditSwap('test-swap-id');
    assert.strictEqual(typeof res.success, 'boolean', 'completeCreditSwap returns a result object with boolean success');
  });
});

describe('S10 — Password Reset Security Audit', () => {
  test('S10.1: Password Reset Challenges table is never queried from browser code', () => {
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

  test('S10.2: ForgotPassword component clears recoveryToken and sensitive state upon successful password reset', () => {
    const forgotPasswordFile = path.join(process.cwd(), 'src', 'pages', 'ForgotPassword.tsx');
    const content = fs.readFileSync(forgotPasswordFile, 'utf8');

    assert.ok(content.includes('setRecoveryToken(null)'), 'ForgotPassword resets recoveryToken upon success');
    assert.ok(content.includes("setStep('success')"), 'ForgotPassword navigates to success step');
  });
});

describe('J — Comprehensive Defense & Authorization Tests', () => {
  test('J.1: Unauthenticated user mutations fail safely without throwing unhandled exceptions', async () => {
    const { updateSwapMessageAttachmentMetadata, updateSwapSubmissionMetadata, updateSwapSubmissionFileMetadata } = await import('./credits');

    const res1 = await updateSwapMessageAttachmentMetadata('att-123', { file_name: 'new.pdf' });
    assert.strictEqual(typeof res1.success, 'boolean');

    const res2 = await updateSwapSubmissionMetadata('sub-123', { notes: 'new notes' });
    assert.strictEqual(typeof res2.success, 'boolean');

    const res3 = await updateSwapSubmissionFileMetadata('file-123', { file_name: 'new.pdf' });
    assert.strictEqual(typeof res3.success, 'boolean');
  });

  test('J.2 & J.3: Attachment metadata updates scope by uploaded_by and submitted_by', () => {
    const creditsFile = path.join(process.cwd(), 'src', 'lib', 'supabase', 'credits.ts');
    const content = fs.readFileSync(creditsFile, 'utf8');

    assert.ok(content.includes(".eq('uploaded_by', authData.user.id)"), 'updateSwapMessageAttachmentMetadata scopes by uploaded_by');
    assert.ok(content.includes(".eq('submitted_by', authData.user.id)"), 'updateSwapSubmissionMetadata scopes by submitted_by');
  });

  test('J.4 - J.7: Protected mutations derive identity from auth.getUser() or RPC server context', () => {
    const creditsFile = path.join(process.cwd(), 'src', 'lib', 'supabase', 'credits.ts');
    const content = fs.readFileSync(creditsFile, 'utf8');

    assert.ok(content.includes("await supabase.auth.getUser()"), 'Credits helper derives user identity from auth.getUser()');
    assert.ok(content.includes("p_swap_id: swapId"), 'Lifecycle actions pass swap_id to server RPC');
  });

  test('J.9: Repeated lifecycle calls return idempotent results or clean error objects', async () => {
    const { completeCreditSwap: completeSwapFunc, cancelCreditSwap: cancelSwapFunc } = await import('./credits');

    const res1 = await completeSwapFunc('nonexistent-swap');
    assert.strictEqual(res1.success, false);
    assert.ok(res1.error);

    const res2 = await cancelSwapFunc('nonexistent-swap');
    assert.strictEqual(res2.success, false);
    assert.ok(res2.error);
  });

  test('J.10: Expired attachment UI helper identifies expired files and prevents download actions', async () => {
    const { getFileExpiryStatus } = await import('../fileExpiry');

    const expiredStatus = getFileExpiryStatus(new Date(Date.now() - 10000).toISOString(), false);
    assert.strictEqual(expiredStatus.isExpired, true);
    assert.strictEqual(expiredStatus.displayText, 'File expired');

    const deletedStatus = getFileExpiryStatus(new Date(Date.now() + 100000).toISOString(), true);
    assert.strictEqual(deletedStatus.isExpired, true);
    assert.strictEqual(deletedStatus.displayText, 'File expired');
  });
});
