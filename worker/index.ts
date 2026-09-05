export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    // Explicit route for /faq and /faq/ to serve static public/faq.html directly
    if ((request.method === 'GET' || request.method === 'HEAD') && (url.pathname === '/faq' || url.pathname === '/faq/')) {
      const faqUrl = new URL('/faq.html', request.url);
      const faqResponse = await env.ASSETS.fetch(faqUrl);
      if (faqResponse.ok || faqResponse.status === 200) {
        const headers = new Headers(faqResponse.headers);
        headers.set('Content-Type', 'text/html; charset=utf-8');
        headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
        return new Response(request.method === 'HEAD' ? null : faqResponse.body, {
          status: 200,
          headers,
        });
      }
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status === 404) {
      return env.ASSETS.fetch(new URL('/index.html', request.url));
    }
    return response;
  },
} satisfies ExportedHandler<{ ASSETS: Fetcher }>;
