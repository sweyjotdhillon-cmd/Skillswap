const PRODUCTION_ORIGIN = 'https://skillswap.sweyjotdhillon.workers.dev';

export function getCorsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get('origin');
  const allowedOriginEnv = Deno.env.get('ALLOWED_ORIGIN');
  const configuredOrigins = allowedOriginEnv
    ? allowedOriginEnv.split(',').map((o) => o.trim())
    : [];

  const allowedOrigins = [PRODUCTION_ORIGIN, ...configuredOrigins];

  if (!origin) {
    // If request has no Origin header (e.g. server-to-server or direct call),
    // return standard restrictive headers without Access-Control-Allow-Origin wildcard.
    return {
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
  }

  const cleanOrigin = origin.trim();
  let isAllowed = allowedOrigins.includes(cleanOrigin);

  if (!isAllowed) {
    // Allow localhost / 127.0.0.1 origins for local development
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanOrigin)) {
      isAllowed = true;
    }
  }

  if (!isAllowed) {
    return null;
  }

  return {
    'Access-Control-Allow-Origin': cleanOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function handleCors(req: Request): { corsHeaders: Record<string, string>; errorResponse?: Response } {
  const corsHeaders = getCorsHeaders(req);
  if (!corsHeaders) {
    const errorResponse = new Response(
      JSON.stringify({ error: 'CORS_DISALLOWED', message: 'Origin not allowed.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
    return { corsHeaders: {}, errorResponse };
  }

  if (req.method === 'OPTIONS') {
    const errorResponse = new Response('ok', { headers: corsHeaders });
    return { corsHeaders, errorResponse };
  }

  return { corsHeaders };
}
