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
  const rawMsg = typeof error === 'string' ? error : error.message || error.details || '';
  const lower = rawMsg.toLowerCase();

  const safeUiMessage = [
    'we couldn’t save the skill',
    'we couldn’t save your profile',
    'we couldn’t complete your profile',
    'your profile was saved, but we could not confirm completion',
    'this username is already taken',
    'your session has expired',
    'account doesn\'t exist or invalid credentials',
    'please verify your email address before logging in',
  ].some((message) => lower.startsWith(message));
  if (safeUiMessage) return rawMsg;

  // 1. Authentication Credentials & Login Errors
  if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials') || lower.includes('user not found')) {
    return "Account doesn't exist or invalid credentials.";
  }
  if (lower.includes('email not confirmed') || lower.includes('unconfirmed')) {
    return 'Please verify your email address before logging in.';
  }
  if (lower.includes('user already registered') || lower.includes('user already exists') || lower.includes('account already exists')) {
    return 'Account already exists';
  }

  // 2. OTP Verification & Password Reset
  if (lower.includes('token has expired') || lower.includes('code has expired') || lower.includes('otp_expired')) {
    return 'The verification code has expired. Please request a new code.';
  }
  if (lower.includes('token is invalid') || lower.includes('invalid otp') || lower.includes('incorrect_otp')) {
    return 'Invalid verification code. Please check your code and try again.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('rate_limit_exceeded')) {
    return 'Too many requests. Please wait a few minutes before trying again.';
  }
  if (lower.includes('at least 8 characters') || lower.includes('weak_password')) {
    return 'Password must be at least 8 characters long.';
  }

  // 3. Immutable Username
  if (lower.includes('immutable once set') || lower.includes('username is permanently immutable')) {
    return 'Username cannot be changed once set.';
  }

  // 2. Specific Profile Completion Checks
  if (lower.includes('username must be assigned first')) {
    return 'Please set a username before completing your profile.';
  }
  if (lower.includes('full name is required')) {
    return 'Full name is required.';
  }

  // 3. Username Uniqueness Errors
  if (
    lower.includes('idx_profiles_username_lower') ||
    lower.includes('profiles_username_key') ||
    lower.includes('profiles_username_lower') ||
    (lower.includes('username') && (lower.includes('already taken') || lower.includes('unique constraint') || lower.includes('duplicate key') || lower.includes('violates unique')))
  ) {
    return 'This username was just taken. Please choose another username.';
  }

  // 4. Google / Identity Errors
  if (
    lower.includes('already linked') ||
    lower.includes('identity_already_exists') ||
    lower.includes('already registered')
  ) {
    return 'An account with this Google email already exists. Please log in instead.';
  }

  // 5. Skill Limits & Predefined/Custom Skill Errors
  if (
    lower.includes('maximum skill limit reached') ||
    lower.includes('10 total skills') ||
    lower.includes('10 skills')
  ) {
    return 'You can select up to 10 skills.';
  }
  if (
    lower.includes('already exists in predefined skills catalog') ||
    lower.includes('exists in predefined')
  ) {
    return 'This skill exists in the predefined catalog. Please select it from the catalog.';
  }
  if (
    lower.includes('uq_user_skill') ||
    lower.includes('idx_user_custom_skills_unique') ||
    (lower.includes('skill') && (lower.includes('duplicate') || lower.includes('already exists') || lower.includes('already added')))
  ) {
    return 'This skill has already been added.';
  }

  // 6. Authentication / Session Expiry
  if (
    lower.includes('not authenticated') ||
    lower.includes('jwt expired') ||
    lower.includes('session expired')
  ) {
    return 'Your session has expired. Please sign in again.';
  }

  // 7. Network / Connection Errors
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed')
  ) {
    return 'Unable to connect to the server. Please check your connection and try again.';
  }

  // 8. Driver/Syntax/Database errors fallback
  if (
    lower.includes('pgrst') ||
    lower.includes('postgresql') ||
    lower.includes('sqlstate') ||
    lower.includes('schema') ||
    lower.includes('relation') ||
    lower.includes('column') ||
    lower.includes('syntax error') ||
    lower.includes('23505') ||
    lower.includes('23503') ||
    lower.includes('42p01') ||
    lower.includes('28000') ||
    lower.includes('28p01')
  ) {
    return 'Something went wrong while processing your request. Please try again.';
  }

  // Do not expose unclassified backend details to users.
  return 'We couldn’t save your profile right now. Please try again.';
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
    return { status: 'error', message: formatFriendlyErrorMessage(err) };
  }
}


export interface OnboardingProfileInput {
  fullName: string;
  bio: string;
  username: string;
  avatarUrl: string | null;
}

/**
 * Saves onboarding data for the currently authenticated user only. The user id is
 * derived from Supabase Auth rather than accepted from UI state.
 */
export async function saveCurrentUserOnboardingProfile(input: OnboardingProfileInput): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error('We couldn’t save your profile right now. Please try again.');

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Your session has expired. Please sign in again.');

  const { error } = await supabase.from('profiles').upsert(
    {
      id: authData.user.id,
      full_name: input.fullName.trim(),
      bio: input.bio.trim() || null,
      username: input.username.trim().toLowerCase(),
      avatar_url: input.avatarUrl,
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(formatFriendlyErrorMessage(error));
}

/** Saves an optional phone number in the owner's private-contact row only. */
export async function saveCurrentUserPrivateContact(phoneNumber: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error('We couldn’t save your profile right now. Please try again.');

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Your session has expired. Please sign in again.');

  const { error } = await supabase.from('user_private_contacts').upsert(
    { user_id: authData.user.id, phone_number: phoneNumber.trim() },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(formatFriendlyErrorMessage(error));
}

/**
 * Fetch public profile for a specific user ID using maybeSingle().
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !userId) return null;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }
    return data as Profile;
  } catch (err) {
    console.error('Error fetching profile:', err);
    return null;
  }
}

/**
 * Fetch account balance & statistics for the current user.
 */
export async function getAccount(userId: string): Promise<Account | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !userId) return null;

  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }
    return data as Account;
  } catch (err) {
    console.error('Error fetching account:', err);
    return null;
  }
}

/**
 * Fetch private contact info (phone number) for the current user.
 */
export async function getPrivateContact(userId: string): Promise<UserPrivateContact | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !userId) return null;

  try {
    const { data, error } = await supabase
      .from('user_private_contacts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }
    return data as UserPrivateContact;
  } catch (err) {
    console.error('Error fetching private contact:', err);
    return null;
  }
}

/**
 * Fetch predefined catalog skills.
 * Sanitizes technical Supabase/PostgREST errors into clean UI exceptions or fallbacks.
 */
export async function getSkillsCatalog(): Promise<Skill[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error('We couldn\'t load the skill catalog. Check your connection and try again.');

  try {
    const { data, error } = await supabase
      .from('skills')
      .select('id,name,category')
      .order('name', { ascending: true });

    if (error) {
      console.error('Failed to fetch skills catalog:', error);
      throw new Error(formatFriendlyErrorMessage(error));
    }

    return (data || []) as Skill[];
  } catch (err: any) {
    console.error('Failed to fetch skills catalog exception:', err);
    throw new Error(formatFriendlyErrorMessage(err));
  }
}

/**
 * Perform server-side search against public.skills using case-insensitive partial match (`ilike`).
 * Supports searching catalogs with 1000+ skills without fetching all rows on client.
 */
export async function searchSkillsCatalog(query: string, category?: string): Promise<Skill[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  try {
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
  } catch (err) {
    console.error('Unexpected error searching skills catalog:', err);
    return [];
  }
}

/**
 * Fetch all skills (predefined & custom) associated with a user.
 */
export async function getUserSkills(userId: string): Promise<{ predefined: UserSkill[]; custom: UserCustomSkill[] }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !userId) return { predefined: [], custom: [] };

  try {
    const [predefinedRes, customRes] = await Promise.all([
      supabase.from('user_skills').select('*, skills(*)').eq('user_id', userId),
      supabase.from('user_custom_skills').select('*').eq('user_id', userId),
    ]);

    return {
      predefined: (predefinedRes.data || []) as UserSkill[],
      custom: (customRes.data || []) as UserCustomSkill[],
    };
  } catch (err) {
    console.error('Error fetching user skills:', err);
    return { predefined: [], custom: [] };
  }
}

/**
 * Invoke atomic RPC `add_user_skill` to add either a predefined skill or custom skill.
 * Enforces maximum 10 skills combined limit server-side with concurrency advisory locks.
 */
export async function addUserSkill(
  params: { skillId?: string; customSkillName?: string }
): Promise<{ success: boolean; type?: string; id?: string; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { success: false, error: 'We couldn’t save your profile right now. Please try again.' };

  try {
    const { data, error } = await supabase.rpc('add_user_skill', {
      p_skill_id: params.skillId || null,
      p_custom_skill_name: params.customSkillName || null,
    });

    if (error) {
      console.error('[addUserSkill] RPC error:', error);
      return { success: false, error: formatFriendlyErrorMessage(error) };
    }

    if (!data || data.success !== true) {
      return { success: false, error: 'We couldn’t save your profile right now. Please try again.' };
    }
    return data;
  } catch (err: any) {
    console.error('[addUserSkill] Exception:', err);
    return { success: false, error: formatFriendlyErrorMessage(err) };
  }
}

/**
 * Delete a user skill by ID (either predefined or custom).
 */
export async function removeUserSkill(skillType: 'predefined' | 'custom', skillId: string): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !skillId) return false;

  try {
    const table = skillType === 'predefined' ? 'user_skills' : 'user_custom_skills';
    const { error } = await supabase.from(table).delete().eq('id', skillId);

    return !error;
  } catch (err) {
    console.error('Error removing user skill:', err);
    return false;
  }
}

/**
 * Invoke atomic RPC `complete_profile` to safely set profile_completed = TRUE.
 */
export async function completeProfile(): Promise<{ success: boolean; profile_completed?: boolean; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { success: false, error: 'We couldn’t complete your profile right now. Please try again.' };

  try {
    const { data, error } = await supabase.rpc('complete_profile');

    if (error) {
      return { success: false, error: formatFriendlyErrorMessage(error) };
    }

    if (!data || data.success !== true || data.profile_completed !== true) {
      return { success: false, error: 'We couldn’t complete your profile right now. Please try again.' };
    }
    return data;
  } catch (err: any) {
    return { success: false, error: formatFriendlyErrorMessage(err) };
  }
}
