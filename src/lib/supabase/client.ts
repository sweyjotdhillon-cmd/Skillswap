import { createClient, SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

const DEFAULT_SUPABASE_URL = 'https://czpcaffwtmlxvplpanon.supabase.co';

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient) return browserClient;

  const rawUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const supabaseAnonKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!rawUrl || !supabaseAnonKey) {
    return null;
  }

  const supabaseUrl = rawUrl.trim();
  if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
    console.error('Invalid Supabase URL format:', supabaseUrl);
    return null;
  }

  try {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return browserClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    browserClient = null;
    return null;
  }
}
