/// <reference types="@cloudflare/workers-types" />

const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

export function getCorrelationId(request: Request): string {
  const incomingId = request.headers.get('x-request-id') || request.headers.get('x-correlation-id');
  if (incomingId && /^[a-zA-Z0-9_-]{8,64}$/.test(incomingId.trim())) {
    return incomingId.trim();
  }
  return `req_${crypto.randomUUID()}`;
}

export function applySecurityHeaders(request: Request, response: Response, correlationId?: string): Response {
  const headers = new Headers(response.headers);
  const reqId = correlationId || getCorrelationId(request);

  headers.set('X-Request-Id', reqId);
  headers.set('Content-Security-Policy', CSP_POLICY);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('X-Frame-Options', 'DENY');

  const url = new URL(request.url);
  if (url.protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const correlationId = getCorrelationId(request);
    try {
      let response = await env.ASSETS.fetch(request);
      if (response.status === 404) {
        response = await env.ASSETS.fetch(new URL('/index.html', request.url));
      }
      return applySecurityHeaders(request, response, correlationId);
    } catch (err: unknown) {
      console.error(`[${correlationId}] Cloudflare worker asset fetch error:`, err instanceof Error ? err.message : 'Unknown asset error');
      const safeErrorResponse = new Response(
        JSON.stringify({
          error: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected server error occurred.',
          correlationId,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      return applySecurityHeaders(request, safeErrorResponse, correlationId);
    }
  },
} satisfies ExportedHandler<{ ASSETS: Fetcher }>;
