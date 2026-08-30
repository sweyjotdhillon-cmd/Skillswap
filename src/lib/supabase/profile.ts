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
 * Validates whether a username matches the required format:
 * 3 to 30 characters, lowercase letters a-z, digits 0-9, underscores, and periods.
 */
export function validateUsernameFormat(username: string): boolean {
  return /^[a-z0-9._]{3,30}$/.test(username);
}

/**
 * Checks if a username is available (case-insensitive search).
 */
export async function checkUsernameAvailability(username: string): Promise<{ available: boolean; error?: string }> {
  const cleanUsername = username.trim().toLowerCase();
  if (!validateUsernameFormat(cleanUsername)) {
    return { available: false, error: 'Invalid username format.' };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { available: false, error: 'Supabase client not initialized.' };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', cleanUsername)
    .maybeSingle();

  if (error) {
    console.error('Error checking username availability:', error);
    return { available: false, error: error.message };
  }

  return { available: data === null };
}

/**
 * Fetch public profile for a specific user ID.
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

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
    .single();

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
    .single();

  if (error || !data) {
    return null;
  }
  return data as UserPrivateContact;
}

/**
 * Fetch predefined catalog skills.
 */
export async function getSkillsCatalog(): Promise<Skill[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .order('name', { ascending: true });

  if (error || !data) {
    return [];
  }
  return data as Skill[];
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
    return { success: false, error: error.message };
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
    return { success: false, error: error.message };
  }

  return data;
}
