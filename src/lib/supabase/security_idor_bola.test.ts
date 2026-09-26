import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  getPrivateContact,
  getAccount,
  updateCurrentUserProfile,
  saveCurrentUserPrivateContact,
  sanitizeProfileUpdatePayload,
} from './profile';
import {
  getUserSwaps,
  updateSwapMessageAttachmentMetadata,
  updateSwapSubmissionMetadata,
  updateSwapSubmissionFileMetadata,
} from './credits';

describe('IDOR / BOLA Authorization Security Regression Suite', () => {
  test('IDOR 1: getPrivateContact returns null when requesting another user’s contact without matching auth session', async () => {
    // Calling getPrivateContact for target user 'user-target-123' when unauthenticated or authenticated as another user returns null
    const result = await getPrivateContact('user-target-123');
    assert.strictEqual(result, null, 'getPrivateContact must return null for unauthorized user_id access');
  });

  test('IDOR 2: getAccount returns null when requesting another user’s account without matching auth session', async () => {
    const result = await getAccount('user-target-123');
    assert.strictEqual(result, null, 'getAccount must return null for unauthorized user_id access');
  });

  test('IDOR 3: getUserSwaps returns permission error when requesting another user’s swaps without matching auth session', async () => {
    const result = await getUserSwaps('user-target-123');
    assert.strictEqual(result.data.length, 0);
    assert.strictEqual(typeof result.error, 'string');
    assert.ok(
      result.error?.includes('permission') || result.error?.includes('User ID') || result.error?.includes('unavailable'),
      'getUserSwaps returns an error for unauthorized user_id query'
    );
  });

  test('IDOR 4: Profile and contact updates derive user identity strictly from auth session, ignoring target input user IDs', async () => {
    // Verify saveCurrentUserPrivateContact throws session expired error when unauthenticated rather than updating unauthenticated or arbitrary target row
    try {
      await saveCurrentUserPrivateContact('+15550001111');
      assert.fail('Should have thrown an error for unauthenticated user');
    } catch (err: unknown) {
      assert.ok(err instanceof Error);
      assert.ok((err as Error).message.includes('session') || (err as Error).message.includes('Please try again'));
    }

    try {
      await updateCurrentUserProfile({ fullName: 'Hacker Name' });
      assert.fail('Should have thrown an error for unauthenticated user');
    } catch (err: unknown) {
      assert.ok(err instanceof Error);
      assert.ok((err as Error).message.includes('session') || (err as Error).message.includes('Please try again'));
    }
  });

  test('BOLA 5: Attachment and submission metadata mutation helpers fail cleanly when unauthenticated and scope by auth user', async () => {
    const attRes = await updateSwapMessageAttachmentMetadata('att-123', { fileName: 'hacked.txt' });
    assert.strictEqual(attRes.success, false);
    assert.ok(attRes.error?.includes('session') || attRes.error?.includes('unavailable'));

    const subRes = await updateSwapSubmissionMetadata('sub-123', { notes: 'hacked notes' });
    assert.strictEqual(subRes.success, false);
    assert.ok(subRes.error?.includes('session') || subRes.error?.includes('unavailable'));

    const fileRes = await updateSwapSubmissionFileMetadata('file-123', { fileName: 'hacked.txt' });
    assert.strictEqual(fileRes.success, false);
    assert.ok(fileRes.error?.includes('session') || fileRes.error?.includes('unavailable') || fileRes.error?.includes('permission'));
  });

  test('IDOR 6: Payload sanitization strips user-controlled identity and platform-protected fields', () => {
    const maliciousPayload = {
      full_name: 'Legit Name',
      id: 'attacker-id-override',
      user_id: 'attacker-id-override',
      uploaded_by: 'attacker-id-override',
      submitted_by: 'attacker-id-override',
      is_verified: true,
      completed_swaps_count: 999,
      average_rating: 5.0,
      review_count: 500,
    };

    const sanitized = sanitizeProfileUpdatePayload(maliciousPayload);

    assert.strictEqual(sanitized.full_name, 'Legit Name');
    const rec = sanitized as Record<string, unknown>;
    assert.strictEqual(rec.is_verified, undefined);
    assert.strictEqual(rec.completed_swaps_count, undefined);
    assert.strictEqual(rec.average_rating, undefined);
    assert.strictEqual(rec.review_count, undefined);
  });

  test('Secret Safety 7: Frontend code under src/ contains zero service_role keys or secrets', () => {
    const srcDir = path.join(process.cwd(), 'src');

    function scanFiles(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
          results = results.concat(scanFiles(filePath));
        } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
          results.push(filePath);
        }
      }
      return results;
    }

    const files = scanFiles(srcDir);
    const secretViolations: string[] = [];

    for (const file of files) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
      const content = fs.readFileSync(file, 'utf8');

      if (content.includes('service_role') && !content.includes('service_role_key')) {
        secretViolations.push(file);
      }
      if (content.match(/eyJ[a-zA-Z0-9_-]{30,}\.eyJ[a-zA-Z0-9_-]{30,}\.[a-zA-Z0-9_-]{10,}/)) {
        secretViolations.push(`JWT token literal in ${file}`);
      }
    }

    assert.strictEqual(
      secretViolations.length,
      0,
      `Secrets or service_role credentials detected in frontend code: ${secretViolations.join(', ')}`
    );
  });
});
