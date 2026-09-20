import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getCorsHeaders, handleCors } from '../../../supabase/functions/_shared/cors.ts';

// Polyfill global Deno if not present in Node.js test environment
if (typeof (globalThis as any).Deno === 'undefined') {
  const envMap = new Map<string, string>();
  (globalThis as any).Deno = {
    env: {
      get: (key: string) => envMap.get(key) || undefined,
      set: (key: string, value: string) => envMap.set(key, value),
      delete: (key: string) => envMap.delete(key),
    },
  };
}

describe('CORS Handler Security Tests', () => {
  it('allows production origin by default', () => {
    const req = new Request('https://api.example.com', {
      headers: { origin: 'https://skillswap.sweyjotdhillon.workers.dev' },
    });
    const headers = getCorsHeaders(req);
    assert.notStrictEqual(headers, null);
    assert.strictEqual(headers?.['Access-Control-Allow-Origin'], 'https://skillswap.sweyjotdhillon.workers.dev');
  });

  it('rejects unauthorized external origins', () => {
    const req = new Request('https://api.example.com', {
      headers: { origin: 'https://malicious-website.com' },
    });
    const headers = getCorsHeaders(req);
    assert.strictEqual(headers, null);

    const { corsHeaders, errorResponse } = handleCors(req);
    assert.deepStrictEqual(corsHeaders, {});
    assert.ok(errorResponse);
    assert.strictEqual(errorResponse.status, 403);
  });

  it('rejects localhost and 127.0.0.1 by default in production (environment flag not set)', () => {
    (globalThis as any).Deno.env.delete('ALLOW_LOCAL_ORIGINS');
    (globalThis as any).Deno.env.delete('DENO_ENV');

    const reqLocalhost = new Request('https://api.example.com', {
      headers: { origin: 'http://localhost:5173' },
    });
    assert.strictEqual(getCorsHeaders(reqLocalhost), null);

    const reqIP = new Request('https://api.example.com', {
      headers: { origin: 'http://127.0.0.1:3000' },
    });
    assert.strictEqual(getCorsHeaders(reqIP), null);
  });

  it('allows localhost when ALLOW_LOCAL_ORIGINS is true', () => {
    (globalThis as any).Deno.env.set('ALLOW_LOCAL_ORIGINS', 'true');
    (globalThis as any).Deno.env.delete('DENO_ENV');

    const reqLocalhost = new Request('https://api.example.com', {
      headers: { origin: 'http://localhost:5173' },
    });
    const headers = getCorsHeaders(reqLocalhost);
    assert.notStrictEqual(headers, null);
    assert.strictEqual(headers?.['Access-Control-Allow-Origin'], 'http://localhost:5173');

    (globalThis as any).Deno.env.delete('ALLOW_LOCAL_ORIGINS');
  });

  it('allows localhost when DENO_ENV is development', () => {
    (globalThis as any).Deno.env.delete('ALLOW_LOCAL_ORIGINS');
    (globalThis as any).Deno.env.set('DENO_ENV', 'development');

    const reqIP = new Request('https://api.example.com', {
      headers: { origin: 'http://127.0.0.1:3000' },
    });
    const headers = getCorsHeaders(reqIP);
    assert.notStrictEqual(headers, null);
    assert.strictEqual(headers?.['Access-Control-Allow-Origin'], 'http://127.0.0.1:3000');

    (globalThis as any).Deno.env.delete('DENO_ENV');
  });

  it('allows custom origins configured via ALLOWED_ORIGIN env var', () => {
    (globalThis as any).Deno.env.set('ALLOWED_ORIGIN', 'https://custom.app.com, https://staging.app.com');

    const reqCustom = new Request('https://api.example.com', {
      headers: { origin: 'https://staging.app.com' },
    });
    const headers = getCorsHeaders(reqCustom);
    assert.notStrictEqual(headers, null);
    assert.strictEqual(headers?.['Access-Control-Allow-Origin'], 'https://staging.app.com');

    (globalThis as any).Deno.env.delete('ALLOWED_ORIGIN');
  });

  it('returns default restrictive headers when no Origin header is present', () => {
    const reqNoOrigin = new Request('https://api.example.com');
    const headers = getCorsHeaders(reqNoOrigin);
    assert.notStrictEqual(headers, null);
    assert.strictEqual(headers?.['Access-Control-Allow-Origin'], undefined);
    assert.ok(headers?.['Access-Control-Allow-Headers']);
  });
});
