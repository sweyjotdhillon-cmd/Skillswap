import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';

let browserClient: SupabaseClient<Database> | null = null;

const DEFAULT_SUPABASE_URL = 'https://czpcaffwtmlxvplpanon.supabase.co';

export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  if (browserClient) return browserClient;

  const env = (import.meta as unknown as { env?: Record<string, string> })?.env || {};
  const rawUrl = (env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL)?.trim();
  const rawKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY)?.trim();

  if (!rawUrl) {
    console.error('Supabase initialization failed: Supabase URL is missing.');
    return null;
  }

  if (!rawKey) {
    console.error(
      'Supabase initialization failed: Missing Supabase key. Please configure VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY.'
    );
    return null;
  }

  if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
    console.error('Supabase initialization failed: Invalid Supabase URL format.');
    return null;
  }

  try {

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
