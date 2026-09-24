import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { logger } from './logger';

describe('Logger Utility Unit Tests', () => {
  let origInfo: typeof console.info;
  let origWarn: typeof console.warn;
  let origError: typeof console.error;
  let origDebug: typeof console.debug;

  let infoCalls: Array<[string, ...unknown[]]> = [];
  let warnCalls: Array<[string, ...unknown[]]> = [];
  let errorCalls: Array<[string, ...unknown[]]> = [];
  let debugCalls: Array<[string, ...unknown[]]> = [];

  beforeEach(() => {
    origInfo = console.info;
    origWarn = console.warn;
    origError = console.error;
    origDebug = console.debug;

    infoCalls = [];
    warnCalls = [];
    errorCalls = [];
    debugCalls = [];

    console.info = (msg: string, ...args: unknown[]) => {
      infoCalls.push([msg, ...args]);
    };
    console.warn = (msg: string, ...args: unknown[]) => {
      warnCalls.push([msg, ...args]);
    };
    console.error = (msg: string, ...args: unknown[]) => {
      errorCalls.push([msg, ...args]);
    };
    console.debug = (msg: string, ...args: unknown[]) => {
      debugCalls.push([msg, ...args]);
    };
  });

  afterEach(() => {
    console.info = origInfo;
    console.warn = origWarn;
    console.error = origError;
    console.debug = origDebug;
  });

  describe('Sanitization Logic (Direct & Indirect)', () => {
    test('1. Sanitizes raw strings with Bearer tokens, emails, and phone numbers', () => {
      logger.info('User request', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sample');
      assert.strictEqual(infoCalls.length, 1);
      assert.strictEqual(infoCalls[0][0], '[INFO] User request');
      assert.strictEqual(infoCalls[0][1], 'Bearer [REDACTED]');

      logger.info('Contact details', 'Reach out at user@domain.com or admin.test@sub.co.uk');
      assert.strictEqual(infoCalls[1][1], 'Reach out at [REDACTED_EMAIL] or [REDACTED_EMAIL]');

      logger.info('Phone details', 'Call 555-123-4567 or +1-555-123-4567 now');
      // Notice phone regex replacement in logger.ts replaces digit patterns matched by \b
      assert.strictEqual(infoCalls[2][1], 'Call [REDACTED_PHONE] or +[REDACTED_PHONE] now');
    });

    test('2. Preserves clean strings without sensitive patterns', () => {
      logger.info('System status', 'All services operational');
      assert.strictEqual(infoCalls[0][1], 'All services operational');
    });

    test('3. Redacts sensitive keys in flat objects regardless of key casing', () => {
      const input = {
        id: 'user_123',
        password: 'mySecretPassword',
        OTP: '123456',
        access_token: 'secret_token_val',
        EMAIL: 'test@example.com',
        Full_Name: 'Jane Doe',
        phone_number: '555-123-4567',
        address: '123 Main St',
        dob: '1990-01-01',
        credit_card: '4111222233334444',
      };

      logger.info('Payload', input);
      assert.strictEqual(infoCalls.length, 1);
      assert.deepStrictEqual(infoCalls[0][1], {
        id: 'user_123',
        password: '[REDACTED]',
        OTP: '[REDACTED]',
        access_token: '[REDACTED]',
        EMAIL: '[REDACTED]',
        Full_Name: '[REDACTED]',
        phone_number: '[REDACTED]',
        address: '[REDACTED]',
        dob: '[REDACTED]',
        credit_card: '[REDACTED]',
      });
    });

    test('4. Recursively sanitizes nested objects and arrays', () => {
      const nestedInput = {
        meta: {
          requestId: 'req-100',
          auth: {
            authorization: 'Bearer secret_jwt',
            service_role_key: 'eyServiceRoleKey',
          },
        },
        users: [
          { name: 'Alice', email: 'alice@example.com' },
          { name: 'Bob', phone: '+15550001111', new_password: 'pass' },
        ],
      };

      logger.warn('Nested log', nestedInput);
      assert.strictEqual(warnCalls.length, 1);
      assert.deepStrictEqual(warnCalls[0][1], {
        meta: {
          requestId: 'req-100',
          auth: {
            authorization: '[REDACTED]',
            service_role_key: '[REDACTED]',
          },
        },
        users: [
          { name: 'Alice', email: '[REDACTED]' },
          { name: 'Bob', phone: '[REDACTED]', new_password: '[REDACTED]' },
        ],
      });
    });

    test('5. Correctly handles primitives, null, and undefined values', () => {
      logger.error('Error event', null, undefined, 404, true);
      assert.strictEqual(errorCalls.length, 1);
      assert.strictEqual(errorCalls[0][0], '[ERROR] Error event');
      assert.strictEqual(errorCalls[0][1], null);
      assert.strictEqual(errorCalls[0][2], undefined);
      assert.strictEqual(errorCalls[0][3], 404);
      assert.strictEqual(errorCalls[0][4], true);
    });

    test('6. Redacts sensitive credentials embedded inside string properties of an object', () => {
      const input = {
        description: 'Failed to verify OTP for user admin@skillswap.com with Bearer eyJhbGci.token',
        status: 400,
      };

      logger.error('Auth failure', input);
      assert.strictEqual(errorCalls.length, 1);
      assert.deepStrictEqual(errorCalls[0][1], {
        description: 'Failed to verify OTP for user [REDACTED_EMAIL] with Bearer [REDACTED]',
        status: 400,
      });
    });

    test('7. Tests all sensitivity key variants explicitly', () => {
      const allKeysObj = {
        password: 'v',
        otp: 'v',
        token: 'v',
        access_token: 'v',
        refresh_token: 'v',
        recoverytoken: 'v',
        recovery_token: 'v',
        otphash: 'v',
        otp_hash: 'v',
        tokenhash: 'v',
        token_hash: 'v',
        newpassword: 'v',
        new_password: 'v',
        oldpassword: 'v',
        old_password: 'v',
        service_role_key: 'v',
        servicekey: 'v',
        authorization: 'v',
        auth_header: 'v',
        secret: 'v',
        email: 'v',
        phone: 'v',
        phone_number: 'v',
        phonenumber: 'v',
        full_name: 'v',
        fullname: 'v',
        address: 'v',
        dob: 'v',
        date_of_birth: 'v',
        credit_card: 'v',
        card_number: 'v',
      };

      logger.info('All sensitive keys check', allKeysObj);
      const output = infoCalls[0][1] as Record<string, unknown>;
      for (const key of Object.keys(allKeysObj)) {
        assert.strictEqual(output[key], '[REDACTED]', `Key ${key} should be redacted`);
      }
    });
  });

  describe('Logger Methods & Dev Mode Behavior', () => {
    test('8. logger.info formats message with [INFO]', () => {
      logger.info('Test info message', 'extra arg');
      assert.strictEqual(infoCalls.length, 1);
      assert.strictEqual(infoCalls[0][0], '[INFO] Test info message');
      assert.strictEqual(infoCalls[0][1], 'extra arg');
    });

    test('9. logger.warn formats message with [WARN]', () => {
      logger.warn('Test warn message');
      assert.strictEqual(warnCalls.length, 1);
      assert.strictEqual(warnCalls[0][0], '[WARN] Test warn message');
    });

    test('10. logger.error formats message with [ERROR]', () => {
      logger.error('Test error message');
      assert.strictEqual(errorCalls.length, 1);
      assert.strictEqual(errorCalls[0][0], '[ERROR] Test error message');
    });

    test('11. logger.debug respects isDev flag', () => {
      const origIsDev = (logger as unknown as { isDev: boolean }).isDev;

      try {
        // Test when isDev is false
        (logger as unknown as { isDev: boolean }).isDev = false;
        logger.debug('Debug message when isDev is false');
        assert.strictEqual(debugCalls.length, 0);

        // Test when isDev is true
        (logger as unknown as { isDev: boolean }).isDev = true;
        logger.debug('Debug message when isDev is true', { token: 'secret' });
        assert.strictEqual(debugCalls.length, 1);
        assert.strictEqual(debugCalls[0][0], '[DEBUG] Debug message when isDev is true');
        assert.deepStrictEqual(debugCalls[0][1], { token: '[REDACTED]' });
      } finally {
        (logger as unknown as { isDev: boolean }).isDev = origIsDev;
      }
    });
  });
});
