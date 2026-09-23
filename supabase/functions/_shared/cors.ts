declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const PRODUCTION_ORIGIN = 'https://skillswap.sweyjotdhillon.workers.dev';

export function getCorrelationId(req: Request): string {
  const incomingId = req.headers.get('x-request-id') || req.headers.get('x-correlation-id');
  if (incomingId && /^[a-zA-Z0-9_-]{8,64}$/.test(incomingId.trim())) {
    return incomingId.trim();
  }
  return `req_${crypto.randomUUID()}`;
}

export function getCorsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get('origin');
  const correlationId = getCorrelationId(req);
  const allowedOriginEnv = typeof Deno !== 'undefined' ? Deno.env.get('ALLOWED_ORIGIN') : undefined;
  const configuredOrigins = allowedOriginEnv
    ? allowedOriginEnv.split(',').map((o: string) => o.trim())
    : [];

  const allowedOrigins = [PRODUCTION_ORIGIN, ...configuredOrigins];

  const baseHeaders: Record<string, string> = {
    'X-Request-Id': correlationId,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id, x-correlation-id',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (!origin) {
    // If request has no Origin header (e.g. server-to-server or direct call),
    // return standard restrictive headers without Access-Control-Allow-Origin wildcard.
    return baseHeaders;
  }

  const cleanOrigin = origin.trim();
  let isAllowed = allowedOrigins.includes(cleanOrigin);

  if (!isAllowed) {
    // Allow localhost / 127.0.0.1 origins only when explicitly enabled via environment variable
    const allowLocal =
      typeof Deno !== 'undefined' &&
      (Deno.env.get('ALLOW_LOCAL_ORIGINS') === 'true' ||
        Deno.env.get('DENO_ENV') === 'development');
    if (allowLocal && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanOrigin)) {
      isAllowed = true;
    }
  }

  if (!isAllowed) {
    return null;
  }

  return {
    ...baseHeaders,
    'Access-Control-Allow-Origin': cleanOrigin,
    'Vary': 'Origin',
  };
}

export function createErrorResponse(
  error: string,
  message: string,
  status: number,
  corsHeaders: Record<string, string>,
  correlationId?: string
): Response {
  const reqId = correlationId || corsHeaders['X-Request-Id'] || `req_${crypto.randomUUID()}`;
  return new Response(
    JSON.stringify({
      error,
      message,
      correlationId: reqId,
    }),
    {
      status,
      headers: {
        ...corsHeaders,
        'X-Request-Id': reqId,
        'Content-Type': 'application/json',
      },
    }
  );
}

export function handleCors(req: Request): {
  corsHeaders: Record<string, string>;
  correlationId: string;
  errorResponse?: Response;
} {
  const correlationId = getCorrelationId(req);
  const corsHeaders = getCorsHeaders(req);

  if (!corsHeaders) {
    const errorResponse = createErrorResponse(
      'CORS_DISALLOWED',
      'Origin not allowed.',
      403,
      { 'X-Request-Id': correlationId },
      correlationId
    );
    return { corsHeaders: {}, correlationId, errorResponse };
  }

  if (req.method === 'OPTIONS') {
    const errorResponse = new Response('ok', { headers: corsHeaders });
    return { corsHeaders, correlationId, errorResponse };
  }

  return { corsHeaders, correlationId };
}
