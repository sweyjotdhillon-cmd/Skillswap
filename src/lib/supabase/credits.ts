import { getSupabaseBrowserClient } from './client';
import { formatFriendlyErrorMessage } from './profile';

export interface Account {
  user_id: string;
  credits_balance: number;
  credits_reserved: number;
  credits_earned: number;
  credits_spent: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreditTransaction {
  id: string;
  amount: number;
  balance_after: number;
  transaction_type: string;
  reason: string;
  related_swap_id?: string | null;
  created_at: string;
}

export interface CreditOperationResult {
  success: boolean;
  transaction_id?: string;
  idempotent_retry?: boolean;
  credits_balance?: number;
  credits_reserved?: number;
  credits_earned?: number;
  credits_spent?: number;
  payer_credits_balance?: number;
  payer_credits_reserved?: number;
  recipient_credits_balance?: number;
  error?: string;
}

export interface SwapRecord {
  id: string;
  requester_id: string;
  participant_id: string | null;
  topic: string;
  description: string;
  requirements: string;
  additional_message: string | null;
  chat_permission: 'requester' | 'participant' | 'anyone';
  credit_amount: number;
  status: 'open' | 'accepted' | 'submitted' | 'completed' | 'cancelled' | 'declined' | 'withdrawn' | 'expired';
  submitted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  requester_profile?: {
    full_name: string;
    username: string;
    avatar_url?: string;
  } | null;
  participant_profile?: {
    full_name: string;
    username: string;
    avatar_url?: string;
  } | null;
}

export interface CreateCreditSwapInput {
  topic: string;
  description: string;
  requirements: string;
  chatPermission: 'requester' | 'participant' | 'anyone';
  creditAmount: number;
  additionalMessage?: string;
  idempotencyKey?: string;
}

/** Creates the swap and its reservation in one database transaction using a stable idempotency key. */
export async function createCreditSwap(input: CreateCreditSwapInput): Promise<{ success: boolean; swapId?: string; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { success: false, error: 'Supabase client is unavailable.' };

  const idempotencyKey = input.idempotencyKey || `swap_create:${crypto.randomUUID()}`;

  const { data, error } = await supabase.rpc('create_credit_swap', {
    p_topic: input.topic,
    p_description: input.description,
    p_requirements: input.requirements,
    p_chat_permission: input.chatPermission,
    p_credit_amount: input.creditAmount,
    p_additional_message: input.additionalMessage || null,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data) return { success: false, error: formatFriendlyErrorMessage(error ?? new Error('Swap creation returned no ID.')) };
  return { success: true, swapId: data as string };
}

/** Accepts an open swap, setting participant_id to the current authenticated user. */
export async function acceptCreditSwap(swapId: string): Promise<{ success: boolean; swap?: SwapRecord; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { success: false, error: 'Supabase client is unavailable.' };
  const { data, error } = await supabase.rpc('accept_credit_swap', {
    p_swap_id: swapId,
  });
  if (error || !data) return { success: false, error: formatFriendlyErrorMessage(error ?? new Error('Failed to accept swap.')) };
  return { success: true, swap: data as SwapRecord };
}

/** Submits work for an accepted swap. */
export async function submitCreditSwap(swapId: string): Promise<{ success: boolean; swap?: SwapRecord; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { success: false, error: 'Supabase client is unavailable.' };
  const { data, error } = await supabase.rpc('submit_credit_swap', {
    p_swap_id: swapId,
  });
  if (error || !data) return { success: false, error: formatFriendlyErrorMessage(error ?? new Error('Failed to submit swap work.')) };
  return { success: true, swap: data as SwapRecord };
}

/** Completes a submitted swap and settles reserved credits atomically. */
export async function completeCreditSwap(swapId: string): Promise<CreditOperationResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { success: false, error: 'Supabase client is unavailable.' };
  const { data, error } = await supabase.rpc('complete_credit_swap', {
    p_swap_id: swapId,
  });
  if (error || !data) return { success: false, error: formatFriendlyErrorMessage(error ?? new Error('Failed to complete swap.')) };
  const result = data as Record<string, unknown>;
  return {
    success: Boolean(result.success),
    idempotent_retry: Boolean(result.idempotent_retry),
    payer_credits_balance: typeof result.payer_credits_balance === 'number' ? result.payer_credits_balance : undefined,
    payer_credits_reserved: typeof result.payer_credits_reserved === 'number' ? result.payer_credits_reserved : undefined,
    recipient_credits_balance: typeof result.recipient_credits_balance === 'number' ? result.recipient_credits_balance : undefined,
    error: typeof result.error === 'string' ? result.error : undefined,
  };
}

/** Cancels a swap and releases any reserved credits back to the requester's available balance. */
export async function cancelCreditSwap(swapId: string): Promise<CreditOperationResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { success: false, error: 'Supabase client is unavailable.' };
  const { data, error } = await supabase.rpc('cancel_credit_swap', {
    p_swap_id: swapId,
  });
  if (error || !data) return { success: false, error: formatFriendlyErrorMessage(error ?? new Error('Failed to cancel swap.')) };
  const result = data as Record<string, unknown>;
  return {
    success: Boolean(result.success),
    idempotent_retry: Boolean(result.idempotent_retry),
    credits_balance: typeof result.credits_balance === 'number' ? result.credits_balance : undefined,
    credits_reserved: typeof result.credits_reserved === 'number' ? result.credits_reserved : undefined,
    error: typeof result.error === 'string' ? result.error : undefined,
  };
}

/** Fetches open swaps for the explore catalog. */
export async function getOpenSwaps(): Promise<SwapRecord[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('swaps')
      .select(`
        *,
        requester_profile:profiles!swaps_requester_id_fkey(full_name, username, avatar_url)
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching open swaps:', error);
      return [];
    }
    return (data || []) as SwapRecord[];
  } catch (err) {
    console.error('Unexpected error fetching open swaps:', err);
    return [];
  }
}

/** Fetches all swaps where the current user is requester or participant. */
export async function getUserSwaps(userId: string): Promise<SwapRecord[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !userId) return [];
  try {
    const { data, error } = await supabase
      .from('swaps')
      .select(`
        *,
        requester_profile:profiles!swaps_requester_id_fkey(full_name, username, avatar_url),
        participant_profile:profiles!swaps_participant_id_fkey(full_name, username, avatar_url)
      `)
      .or(`requester_id.eq.${userId},participant_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user swaps:', error);
      return [];
    }
    return (data || []) as SwapRecord[];
  } catch (err) {
    console.error('Unexpected error fetching user swaps:', err);
    return [];
  }
}

/**
 * Fetches or initializes the authenticated user's credit account record.
 * Executes the SECURITY DEFINER RPC `get_user_account` which performs
 * the exactly-once 100-credit initial grant.
 */
export async function getUserAccount(): Promise<Account | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.rpc('get_user_account');

    if (error) {
      console.error('Error in get_user_account RPC:', error);
      // Fallback: Direct SELECT from public.accounts table under RLS
      const { data: selectData, error: selectError } = await supabase
        .from('accounts')
        .select('*')
        .single();

      if (selectError) {
        console.error('Error fetching accounts table directly:', selectError);
        return null;
      }
      return selectData as Account;
    }

    return data as Account;
  } catch (err) {
    console.error('Unexpected error fetching user account:', err);
    return null;
  }
}

/**
 * Fetches the user's permanent credit transaction history ledger.
 */
export async function getCreditTransactions(
  limit: number = 50,
  offset: number = 0
): Promise<CreditTransaction[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase.rpc('get_user_credit_transactions', {
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      console.error('Error fetching credit transactions via RPC:', error);
      // Fallback direct SELECT under RLS
      const { data: selectData, error: selectError } = await supabase
        .from('credit_transactions')
        .select('id, amount, balance_after, transaction_type, reason, related_swap_id, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (selectError) {
        console.error('Error fetching credit transactions directly:', selectError);
        return [];
      }
      return (selectData || []) as CreditTransaction[];
    }

    return (data || []) as CreditTransaction[];
  } catch (err) {
    console.error('Unexpected error fetching transaction history:', err);
    return [];
  }
}
