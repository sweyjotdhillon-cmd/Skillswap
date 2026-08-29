export default {
  async fetch(request, env): Promise<Response> {
    const response = await env.ASSETS.fetch(request);
    if (response.status === 404) {
      return env.ASSETS.fetch(new URL('/index.html', request.url));
    }
    return response;
  },
} satisfies ExportedHandler<{ ASSETS: Fetcher }>;
