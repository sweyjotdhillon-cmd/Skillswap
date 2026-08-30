import { getSupabaseBrowserClient } from './client';

export interface PredefinedSkill {
  id: number;
  name: string;
  category?: string | null;
}

export interface UserProfile {
  user_id: number;
  auth_id: string;
  name: string;
  username: string;
  contact?: string | null;
  bio?: string | null;
  avatar?: string | null;
  profile_completed: boolean;
  created_at: string;
  updated_at?: string;
  credits: number;
  skills: PredefinedSkill[];
  custom_skills: string[];
}

export interface PublicUserProfile {
  user_id: number;
  name: string;
  username: string;
  bio?: string | null;
  avatar?: string | null;
  created_at: string;
  skills: PredefinedSkill[];
  custom_skills: string[];
}

export interface UsernameValidationResult {
  valid: boolean;
  reason: string;
}

export interface CreateProfileInput {
  auth_id: string;
  name: string;
  username: string;
  contact?: string;
  bio?: string;
  avatar?: string;
  skill_ids?: number[];
  custom_skills?: string[];
}

export interface UpdateProfileInput {
  auth_id: string;
  name: string;
  contact?: string;
  bio?: string;
  avatar?: string;
  skill_ids?: number[];
  custom_skills?: string[];
}

const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'support',
  'help',
  'system',
  'moderator',
  'official',
  'skillswap',
  'api',
  'root',
  'null',
  'undefined',
  'settings',
  'profile',
  'auth',
  'login',
  'signup',
  'explore',
  'about',
  'terms',
  'privacy',
  'contact',
  'dashboard',
]);

/**
 * Validates a candidate username client-side and via database RPC.
 */
export async function validateUsername(username: string): Promise<UsernameValidationResult> {
  const clean = username.trim().toLowerCase();

  if (!clean) {
    return { valid: false, reason: 'Username cannot be empty.' };
  }

  if (clean.length < 3 || clean.length > 20) {
    return { valid: false, reason: 'Username must be between 3 and 20 characters.' };
  }

  if (!/^[a-z0-9._]+$/.test(clean)) {
    return { valid: false, reason: 'Username can only contain letters, numbers, underscores, and periods.' };
  }

  if (RESERVED_USERNAMES.has(clean)) {
    return { valid: false, reason: 'This username is reserved by the system.' };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { valid: true, reason: 'Username format valid.' };
  }

  try {
    const { data, error } = await supabase.rpc('validate_username', { p_username: clean });
    if (error) {
      console.warn('Backend username validation fallback:', error.message);
      return { valid: true, reason: 'Username format valid.' };
    }
    return data as UsernameValidationResult;
  } catch (err: any) {
    return { valid: true, reason: 'Username format valid.' };
  }
}

/**
 * Fetches the global predefined skills library.
 */
export async function fetchPredefinedSkills(): Promise<PredefinedSkill[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('skills')
      .select('id, name, category')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching predefined skills:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Failed to fetch predefined skills:', err);
    return [];
  }
}

/**
 * Executes first-time profile creation. Permanent username is set here.
 */
export async function createFirstTimeProfile(
  input: CreateProfileInput
): Promise<{ profile: UserProfile | null; error: Error | null }> {
  const totalSkills = (input.skill_ids?.length || 0) + (input.custom_skills?.length || 0);
  if (totalSkills > 10) {
    return { profile: null, error: new Error('Maximum limit of 10 skills exceeded.') };
  }

  const validation = await validateUsername(input.username);
  if (!validation.valid) {
    return { profile: null, error: new Error(validation.reason) };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { profile: null, error: new Error('Supabase client is not available.') };
  }

  try {
    const { data, error } = await supabase.rpc('create_first_time_profile', {
      p_auth_id: input.auth_id,
      p_name: input.name,
      p_username: input.username,
      p_contact: input.contact || null,
      p_bio: input.bio || null,
      p_avatar: input.avatar || null,
      p_skill_ids: input.skill_ids || [],
      p_custom_skills: input.custom_skills || [],
    });

    if (error) {
      return { profile: null, error: new Error(error.message) };
    }

    return { profile: data as UserProfile, error: null };
  } catch (err: any) {
    return { profile: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Updates an existing user profile (forbids updating username).
 */
export async function updateUserProfile(
  input: UpdateProfileInput
): Promise<{ profile: UserProfile | null; error: Error | null }> {
  const totalSkills = (input.skill_ids?.length || 0) + (input.custom_skills?.length || 0);
  if (totalSkills > 10) {
    return { profile: null, error: new Error('Maximum limit of 10 skills exceeded.') };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { profile: null, error: new Error('Supabase client is not available.') };
  }

  try {
    const { data, error } = await supabase.rpc('update_profile', {
      p_auth_id: input.auth_id,
      p_name: input.name,
      p_contact: input.contact || null,
      p_bio: input.bio || null,
      p_avatar: input.avatar || null,
      p_skill_ids: input.skill_ids || [],
      p_custom_skills: input.custom_skills || [],
    });

    if (error) {
      return { profile: null, error: new Error(error.message) };
    }

    return { profile: data as UserProfile, error: null };
  } catch (err: any) {
    return { profile: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Fetches private profile details for the logged-in user (includes contact details).
 */
export async function getProfileByAuthId(
  authId: string
): Promise<{ profile: UserProfile | null; error: Error | null }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { profile: null, error: new Error('Supabase client is not available.') };
  }

  try {
    const { data, error } = await supabase.rpc('get_my_profile', { p_auth_id: authId });
    if (error) {
      return { profile: null, error: new Error(error.message) };
    }
    return { profile: data as UserProfile | null, error: null };
  } catch (err: any) {
    return { profile: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Fetches public profile details for another user by username (excludes contact number).
 */
export async function getPublicProfileByUsername(
  username: string
): Promise<{ profile: PublicUserProfile | null; error: Error | null }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { profile: null, error: new Error('Supabase client is not available.') };
  }

  try {
    const { data, error } = await supabase.rpc('get_public_profile', { p_username: username });
    if (error) {
      return { profile: null, error: new Error(error.message) };
    }
    return { profile: data as PublicUserProfile | null, error: null };
  } catch (err: any) {
    return { profile: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}
