import { getSupabaseBrowserClient } from './client';

export interface Profile {
  id: string;
  username: string | null;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  profile_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Account {
  user_id: string;
  credits_balance: number;
  credits_earned: number;
  credits_spent: number;
  updated_at: string;
}

export interface UserPrivateContact {
  user_id: string;
  phone_number: string | null;
  updated_at: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  created_at: string;
}

export interface UserSkill {
  id: string;
  user_id: string;
  skill_id: string;
  created_at: string;
  skills?: Skill;
}

export interface UserCustomSkill {
  id: string;
  user_id: string;
  skill_name: string;
  created_at: string;
}

/**
 * Sanitizes technical database/PostgREST/PostgreSQL error messages into user-friendly messages.
 */
export function formatFriendlyErrorMessage(error: any): string {
  if (!error) return 'An unexpected error occurred. Please try again.';
  const msg = typeof error === 'string' ? error : error.message || '';
  const lower = msg.toLowerCase();

  if (lower.includes('unique constraint') || lower.includes('duplicate key') || lower.includes('already taken') || lower.includes('idx_profiles_username_lower')) {
    return 'This username is already taken. Please choose another.';
  }
  if (lower.includes('maximum skill limit reached') || lower.includes('10 total skills') || lower.includes('10 skills')) {
    return 'You can select up to 10 skills.';
  }
  if (lower.includes('already exists in predefined skills catalog') || lower.includes('exists in predefined')) {
    return 'This skill exists in the predefined catalog. Please select it from the catalog.';
  }
  if (lower.includes('duplicate') || lower.includes('already exists')) {
    return 'This skill has already been added.';
  }
  if (lower.includes('not authenticated') || lower.includes('jwt expired') || lower.includes('session expired')) {
    return 'Your session has expired. Please sign in again.';
  }
  if (lower.includes('pgrst') || lower.includes('postgresql') || lower.includes('sqlstate') || lower.includes('schema')) {
    return 'Something went wrong while processing your request. Please try again.';
  }

  return msg || 'Something went wrong. Please try again.';
}

/**
 * Validates whether a username matches the required format:
 * 3 to 30 characters, lowercase letters a-z, digits 0-9, underscores, and periods.
 */
export function validateUsernameFormat(username: string): boolean {
  return /^[a-z0-9._]{3,30}$/.test(username);
}

export type UsernameCheckResult =
  | { status: 'available' }
  | { status: 'unavailable' }
  | { status: 'invalid'; message: string }
  | { status: 'error'; message: string };

/**
 * Checks if a username is available using RPC check_username_available.
 * Normalizes by trimming whitespace and lowercasing.
 * Distinguishes invalid format, unavailable, available, and database/network errors.
 * Never reports a database error as unavailable/taken.
 */
export async function checkUsernameAvailability(username: string): Promise<UsernameCheckResult> {
  const cleanUsername = username.trim().toLowerCase();
  if (!validateUsernameFormat(cleanUsername)) {
    return { status: 'invalid', message: 'Use 3–30 lowercase letters, numbers, dots, or underscores.' };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    console.error('Error checking username availability: Supabase browser client unavailable');
    return { status: 'error', message: 'Unable to check username right now. Please try again.' };
  }

  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('check_username_available', {
      p_username: cleanUsername,
    });

    if (rpcError) {
      console.error('[checkUsernameAvailability] RPC check_username_available error:', {
        rpc: 'check_username_available',
        params: { p_username: cleanUsername },
        message: rpcError.message,
        code: rpcError.code,
        details: rpcError.details,
      });
      return { status: 'error', message: 'Unable to check username right now. Please try again.' };
    }

    if (typeof rpcData === 'boolean') {
      return rpcData ? { status: 'available' } : { status: 'unavailable' };
    }

    return { status: 'error', message: 'Unable to check username right now. Please try again.' };
  } catch (err: any) {
    console.error('[checkUsernameAvailability] Unexpected error:', err);
    return { status: 'error', message: err?.message || 'Unable to check username right now. Please try again.' };
  }
}

/**
 * Fetch public profile for a specific user ID using maybeSingle().
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data as Profile;
}

/**
 * Fetch account balance & statistics for the current user.
 */
export async function getAccount(userId: string): Promise<Account | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data as Account;
}

/**
 * Fetch private contact info (phone number) for the current user.
 */
export async function getPrivateContact(userId: string): Promise<UserPrivateContact | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('user_private_contacts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data as UserPrivateContact;
}

/**
 * Fetch predefined catalog skills.
 * Sanitizes technical Supabase/PostgREST errors into clean UI exceptions or fallbacks.
 */
export async function getSkillsCatalog(): Promise<Skill[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error('We couldn\'t load the skill catalog. Check your connection and try again.');

  const { data, error } = await supabase
    .from('skills')
    .select('id,name,category')
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to fetch skills catalog:', error);
    throw new Error('We couldn\'t load the skill catalog. Check your connection and try again.');
  }

  return (data || []) as Skill[];
}

/**
 * Perform server-side search against public.skills using case-insensitive partial match (`ilike`).
 * Supports searching catalogs with 1000+ skills without fetching all rows on client.
 */
export async function searchSkillsCatalog(query: string, category?: string): Promise<Skill[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  let req = supabase
    .from('skills')
    .select('id,name,category')
    .order('name', { ascending: true })
    .limit(50);

  const cleanQuery = query.trim();
  if (cleanQuery) {
    req = req.ilike('name', `%${cleanQuery}%`);
  }

  if (category && category !== 'All') {
    req = req.eq('category', category);
  }

  const { data, error } = await req;

  if (error) {
    console.error('Error searching skills catalog:', error);
    return [];
  }

  return (data || []) as Skill[];
}

/**
 * Fetch all skills (predefined & custom) associated with a user.
 */
export async function getUserSkills(userId: string): Promise<{ predefined: UserSkill[]; custom: UserCustomSkill[] }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { predefined: [], custom: [] };

  const [predefinedRes, customRes] = await Promise.all([
    supabase.from('user_skills').select('*, skills(*)').eq('user_id', userId),
    supabase.from('user_custom_skills').select('*').eq('user_id', userId),
  ]);

  return {
    predefined: (predefinedRes.data || []) as UserSkill[],
    custom: (customRes.data || []) as UserCustomSkill[],
  };
}

/**
 * Invoke atomic RPC `add_user_skill` to add either a predefined skill or custom skill.
 * Enforces maximum 10 skills combined limit server-side with concurrency advisory locks.
 */
export async function addUserSkill(
  params: { skillId?: string; customSkillName?: string }
): Promise<{ success: boolean; type?: string; id?: string; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { success: false, error: 'Supabase client not initialized.' };

  const { data, error } = await supabase.rpc('add_user_skill', {
    p_skill_id: params.skillId || null,
    p_custom_skill_name: params.customSkillName || null,
  });

  if (error) {
    console.error('[addUserSkill] RPC error:', error);
    return { success: false, error: formatFriendlyErrorMessage(error) };
  }

  return data;
}

/**
 * Delete a user skill by ID (either predefined or custom).
 */
export async function removeUserSkill(skillType: 'predefined' | 'custom', skillId: string): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;

  const table = skillType === 'predefined' ? 'user_skills' : 'user_custom_skills';
  const { error } = await supabase.from(table).delete().eq('id', skillId);

  return !error;
}

/**
 * Invoke atomic RPC `complete_profile` to safely set profile_completed = TRUE.
 */
export async function completeProfile(): Promise<{ success: boolean; profile_completed?: boolean; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { success: false, error: 'Supabase client not initialized.' };

  const { data, error } = await supabase.rpc('complete_profile');

  if (error) {
    return { success: false, error: formatFriendlyErrorMessage(error) };
  }

  return data;
}
