import { test, describe } from 'node:test';
import assert from 'node:assert';
import worker, { applySecurityHeaders } from '../worker/index';

describe('C1 — Cloudflare Worker Security Headers Unit Tests', () => {
  const createMockEnv = (assetsMap: Record<string, Response>) => ({
    ASSETS: {
      fetch: (async (input: RequestInfo | URL) => {
        const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(urlStr);
        const path = url.pathname;
        if (assetsMap[path]) {
          return assetsMap[path].clone();
        }
        return new Response('Not Found', { status: 404 });
      }) as Fetcher['fetch'],
    },
  });

  test('C1.1: Security headers applied to standard asset GET request over HTTPS', async () => {
    const mockEnv = createMockEnv({
      '/main.js': new Response('console.log("ok");', {
        status: 200,
        headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=3600' },
      }),
    });

    const req = new Request('https://skillswap.sweyjotdhillon.workers.dev/main.js', { method: 'GET' });
    const res = await worker.fetch(req as unknown as Request<unknown, IncomingRequestCfProperties<unknown>>, mockEnv);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('Content-Type'), 'application/javascript');
    assert.strictEqual(res.headers.get('Cache-Control'), 'public, max-age=3600');
    assert.strictEqual(
      res.headers.get('Content-Security-Policy'),
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    );
    assert.strictEqual(res.headers.get('Strict-Transport-Security'), 'max-age=31536000; includeSubDomains');
    assert.strictEqual(res.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.strictEqual(res.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
    assert.strictEqual(res.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    assert.strictEqual(res.headers.get('X-Frame-Options'), 'DENY');
  });

  test('C1.2: HSTS header is omitted for HTTP requests (localhost / dev)', async () => {
    const mockEnv = createMockEnv({
      '/main.js': new Response('console.log("ok");', { status: 200 }),
    });

    const req = new Request('http://localhost:8787/main.js', { method: 'GET' });
    const res = await worker.fetch(req as unknown as Request<unknown, IncomingRequestCfProperties<unknown>>, mockEnv);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('Strict-Transport-Security'), null);
    assert.strictEqual(res.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.strictEqual(res.headers.get('X-Frame-Options'), 'DENY');
  });

  test('C1.3: Security headers applied to 404 SPA fallback response (/index.html)', async () => {
    const mockEnv = createMockEnv({
      '/index.html': new Response('<!DOCTYPE html><html><body>SPA</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    });

    const req = new Request('https://skillswap.sweyjotdhillon.workers.dev/unknown-route', { method: 'GET' });
    const res = await worker.fetch(req as unknown as Request<unknown, IncomingRequestCfProperties<unknown>>, mockEnv);

    assert.strictEqual(res.status, 200);
    const body = await res.text();
    assert.strictEqual(body, '<!DOCTYPE html><html><body>SPA</body></html>');
    assert.strictEqual(
      res.headers.get('Content-Security-Policy'),
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    );
    assert.strictEqual(res.headers.get('X-Frame-Options'), 'DENY');
    assert.strictEqual(res.headers.get('Strict-Transport-Security'), 'max-age=31536000; includeSubDomains');
  });

  test('C1.4: applySecurityHeaders helper preserves upstream headers and handles HEAD requests', () => {
    const req = new Request('https://example.com/asset.png', { method: 'HEAD' });
    const originalRes = new Response(null, {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'X-Custom-Header': 'preserve-me' },
    });

    const securedRes = applySecurityHeaders(req, originalRes);

    assert.strictEqual(securedRes.status, 200);
    assert.strictEqual(securedRes.headers.get('Content-Type'), 'image/png');
    assert.strictEqual(securedRes.headers.get('X-Custom-Header'), 'preserve-me');
    assert.strictEqual(securedRes.headers.get('X-Content-Type-Options'), 'nosniff');
  });
});
