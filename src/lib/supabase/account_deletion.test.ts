import { describe, it } from 'node:test';
import assert from 'node:assert';
import { logger } from '../logger.js';
import { deleteCurrentUserAccount, sanitizeProfileUpdatePayload } from './profile.js';

describe('Account Deletion & Data Privacy Audit Unit Tests', () => {
  it('1. Logger automatically redacts emails in string messages', () => {
    const message = 'Failed login attempt for user test@example.com with status 400';
    // Access internal logger.sanitize via type assertion
    const sanitized = (logger as unknown as { sanitize: (d: unknown) => unknown }).sanitize(message);
    assert.strictEqual(typeof sanitized, 'string');
    assert.ok(!((sanitized as string).includes('test@example.com')));
    assert.ok((sanitized as string).includes('[REDACTED_EMAIL]'));
  });

  it('2. Logger automatically redacts phone numbers in string messages', () => {
    const message = 'Contact phone number +1 555-123-4567 saved successfully';
    const sanitized = (logger as unknown as { sanitize: (d: unknown) => unknown }).sanitize(message);
    assert.strictEqual(typeof sanitized, 'string');
    assert.ok(!((sanitized as string).includes('555-123-4567')));
    assert.ok((sanitized as string).includes('[REDACTED_PHONE]'));
  });

  it('3. Logger automatically redacts sensitive object keys', () => {
    const payload = {
      user_id: '12345',
      email: 'alex@example.com',
      phone_number: '+15551234567',
      password: 'MySecretPassword123',
      access_token: 'secret_jwt_token',
      recovery_token: 'rec_12345',
      otp: '123456',
    };

    const sanitized = (logger as unknown as { sanitize: (d: unknown) => unknown }).sanitize(payload) as Record<string, unknown>;
    assert.strictEqual(sanitized.user_id, '12345');
    assert.strictEqual(sanitized.email, '[REDACTED]');
    assert.strictEqual(sanitized.phone_number, '[REDACTED]');
    assert.strictEqual(sanitized.password, '[REDACTED]');
    assert.strictEqual(sanitized.access_token, '[REDACTED]');
    assert.strictEqual(sanitized.recovery_token, '[REDACTED]');
    assert.strictEqual(sanitized.otp, '[REDACTED]');
  });

  it('4. sanitizeProfileUpdatePayload strips platform trust metrics from profile updates', () => {
    const input = {
      full_name: 'Alex Morgan',
      bio: 'New bio',
      is_verified: true,
      completed_swaps_count: 100,
      average_rating: 5.0,
      review_count: 50,
    };

    const sanitized = sanitizeProfileUpdatePayload(input);
    assert.strictEqual(sanitized.full_name, 'Alex Morgan');
    assert.strictEqual(sanitized.bio, 'New bio');
    assert.strictEqual((sanitized as Record<string, unknown>).is_verified, undefined);
    assert.strictEqual((sanitized as Record<string, unknown>).completed_swaps_count, undefined);
    assert.strictEqual((sanitized as Record<string, unknown>).average_rating, undefined);
    assert.strictEqual((sanitized as Record<string, unknown>).review_count, undefined);
  });

  it('5. deleteCurrentUserAccount handles unauthenticated/missing client gracefully', async () => {
    const res = await deleteCurrentUserAccount();
    assert.strictEqual(typeof res, 'object');
    assert.strictEqual(typeof res.success, 'boolean');
  });
});
