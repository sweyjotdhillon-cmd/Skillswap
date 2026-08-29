import { createServerClient as createServerClientSSR, type CookieOptions } from '@supabase/ssr';

export function createServerClient(cookieAdapter?: {
  getAll: () => Array<{ name: string; value: string }>;
  setAll: (cookies: Array<{ name: string; value: string; options: CookieOptions }>) => void;
}) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

  return createServerClientSSR(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieAdapter?.getAll() ?? [];
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        if (cookieAdapter) {
          cookieAdapter.setAll(cookiesToSet);
        }
      },
    },
  });
}
