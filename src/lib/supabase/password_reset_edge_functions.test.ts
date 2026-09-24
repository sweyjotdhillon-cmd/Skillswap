import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('C3 — Password Reset Edge Functions Security & Invariants Audit', () => {
  const edgeFunctionsDir = path.join(process.cwd(), 'supabase', 'functions');

  test('C3.1: Password Reset Edge Functions no longer import std/http/server.ts or legacy @supabase/supabase-js@2.39.7', () => {
    const fnNames = ['request-password-reset', 'verify-password-reset-otp', 'complete-password-reset'];
    for (const name of fnNames) {
      const filepath = path.join(edgeFunctionsDir, name, 'index.ts');
      const content = fs.readFileSync(filepath, 'utf-8');

      assert.strictEqual(
        content.includes('deno.land/std@0.168.0/http/server.ts'),
        false,
        `${name}/index.ts still imports legacy std/http/server.ts`
      );
      assert.strictEqual(
        content.includes('@supabase/supabase-js@2.39.7'),
        false,
        `${name}/index.ts still imports legacy @supabase/supabase-js@2.39.7`
      );
      assert.strictEqual(
        content.includes('@supabase/supabase-js@2.112.4'),
        true,
        `${name}/index.ts must import canonical @supabase/supabase-js@2.112.4`
      );
      assert.strictEqual(
        content.includes('Deno.serve('),
        true,
        `${name}/index.ts must use native Deno.serve`
      );
    }
  });

  test('C3.2: Edge functions use handleCors from _shared/cors.ts and do not bypass CORS', () => {
    const fnNames = ['request-password-reset', 'verify-password-reset-otp', 'complete-password-reset'];
    for (const name of fnNames) {
      const filepath = path.join(edgeFunctionsDir, name, 'index.ts');
      const content = fs.readFileSync(filepath, 'utf-8');

      assert.strictEqual(
        content.includes("from '../_shared/cors.ts'"),
        true,
        `${name}/index.ts must import from _shared/cors.ts`
      );
      assert.strictEqual(
        content.includes('handleCors(req)'),
        true,
        `${name}/index.ts must execute handleCors(req)`
      );
    }
  });

  test('C3.3: Password Reset Edge Functions maintain atomic RPC calls and security hashing', () => {
    const requestContent = fs.readFileSync(path.join(edgeFunctionsDir, 'request-password-reset', 'index.ts'), 'utf-8');
    assert.strictEqual(requestContent.includes('request_password_reset_challenge_atomic'), true);
    assert.strictEqual(requestContent.includes('crypto.subtle.digest'), true);

    const verifyContent = fs.readFileSync(path.join(edgeFunctionsDir, 'verify-password-reset-otp', 'index.ts'), 'utf-8');
    assert.strictEqual(verifyContent.includes('verify_password_reset_otp_atomic'), true);
    assert.strictEqual(verifyContent.includes('crypto.randomUUID()'), true);

    const completeContent = fs.readFileSync(path.join(edgeFunctionsDir, 'complete-password-reset', 'index.ts'), 'utf-8');
    assert.strictEqual(completeContent.includes('claim_password_reset_recovery_token'), true);
    assert.strictEqual(completeContent.includes('supabase.auth.admin.updateUserById'), true);
  });

  test('C3.4: Edge functions never log secrets, OTPs, recovery tokens, or passwords', () => {
    const fnNames = ['request-password-reset', 'verify-password-reset-otp', 'complete-password-reset'];
    for (const name of fnNames) {
      const filepath = path.join(edgeFunctionsDir, name, 'index.ts');
      const content = fs.readFileSync(filepath, 'utf-8');

      const logLines = content.split('\n').filter((line) => line.includes('console.log') || line.includes('console.error'));
      for (const logLine of logLines) {
        const lower = logLine.toLowerCase();
        assert.strictEqual(lower.includes('cleanotp') || lower.includes('otp_hash') || lower.includes('generated otp') || lower.includes('`${otp}`'), false, `Forbidden OTP logging found in ${name}: ${logLine}`);
        assert.strictEqual(lower.includes('recoverytoken') && !lower.includes('recovery_token_atomic') && !lower.includes('recovery_token error'), false, `Forbidden recoveryToken logging found in ${name}: ${logLine}`);
        assert.strictEqual(lower.includes('newpassword'), false, `Forbidden password logging found in ${name}: ${logLine}`);
        assert.strictEqual(lower.includes('supabaseservicekey'), false, `Forbidden service key logging found in ${name}: ${logLine}`);
        assert.strictEqual(lower.includes('brevoapikey'), false, `Forbidden brevo key logging found in ${name}: ${logLine}`);
      }
    }
  });
});

describe('Password Reset Security Requirements (Requirement 8)', () => {
  const edgeFunctionsDir = path.join(process.cwd(), 'supabase', 'functions');

  test('Req 8.1: verify-password-reset-otp passes supplied OTP hash and token parameters to verify_password_reset_otp_atomic', () => {
    const verifyContent = fs.readFileSync(path.join(edgeFunctionsDir, 'verify-password-reset-otp', 'index.ts'), 'utf-8');
    assert.strictEqual(verifyContent.includes('verify_password_reset_otp_atomic'), true);
    assert.strictEqual(verifyContent.includes('p_supplied_otp_hash'), true);
    assert.strictEqual(verifyContent.includes('p_recovery_token_hash'), true);
    assert.strictEqual(verifyContent.includes('p_token_expires_at'), true);
  });

  test('Req 8.2: complete-password-reset claims token via claim_password_reset_recovery_token before updateUserById', () => {
    const completeContent = fs.readFileSync(path.join(edgeFunctionsDir, 'complete-password-reset', 'index.ts'), 'utf-8');
    assert.strictEqual(completeContent.includes('claim_password_reset_recovery_token'), true);

    const claimIdx = completeContent.indexOf('claim_password_reset_recovery_token');
    const updatePasswordIdx = completeContent.indexOf('updateUserById');

    assert.notStrictEqual(claimIdx, -1, 'claim_password_reset_recovery_token must exist');
    assert.notStrictEqual(updatePasswordIdx, -1, 'updateUserById must exist');
    assert.strictEqual(claimIdx < updatePasswordIdx, true, 'Token claim must occur before password update');
  });

  test('Req 8.3: request-password-reset uses request_password_reset_challenge_atomic and preserves anti-enumeration response', () => {
    const requestContent = fs.readFileSync(path.join(edgeFunctionsDir, 'request-password-reset', 'index.ts'), 'utf-8');
    assert.strictEqual(requestContent.includes('request_password_reset_challenge_atomic'), true);
    assert.strictEqual(requestContent.includes('A 6-digit verification code has been sent to your email address if an account exists.'), true);
  });
});
