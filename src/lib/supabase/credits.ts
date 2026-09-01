import { getSupabaseBrowserClient } from './client';
import { formatFriendlyErrorMessage } from './profile';

export interface Account {
  user_id: string;
  credits_balance: number;
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
  credits_earned?: number;
  credits_spent?: number;
  error?: string;
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

/**
 * Atomically deducts credits from the authenticated user's account with row locking.
 */
export async function deductUserCredits(
  amount: number,
  reason: string,
  idempotencyKey?: string,
  relatedSwapId?: string,
  metadata?: Record<string, unknown>
): Promise<CreditOperationResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { success: false, error: 'Supabase client is unavailable.' };
  }

  try {
    const { data, error } = await supabase.rpc('deduct_credits', {
      p_amount: amount,
      p_reason: reason,
      p_idempotency_key: idempotencyKey || null,
      p_related_swap_id: relatedSwapId || null,
      p_metadata: metadata || null,
    });

    if (error) {
      return {
        success: false,
        error: formatFriendlyErrorMessage(error),
      };
    }

    return data as CreditOperationResult;
  } catch (err) {
    return {
      success: false,
      error: formatFriendlyErrorMessage(err),
    };
  }
}

/**
 * Atomically adds credits to a user account.
 */
export async function addUserCredits(
  userId: string,
  amount: number,
  reason: string,
  idempotencyKey?: string,
  relatedSwapId?: string,
  metadata?: Record<string, unknown>
): Promise<CreditOperationResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { success: false, error: 'Supabase client is unavailable.' };
  }

  try {
    const { data, error } = await supabase.rpc('add_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason,
      p_idempotency_key: idempotencyKey || null,
      p_related_swap_id: relatedSwapId || null,
      p_metadata: metadata || null,
    });

    if (error) {
      return {
        success: false,
        error: formatFriendlyErrorMessage(error),
      };
    }

    return data as CreditOperationResult;
  } catch (err) {
    return {
      success: false,
      error: formatFriendlyErrorMessage(err),
    };
  }
}

/**
 * Atomically refunds / releases reserved credits to a user's account.
 */
export async function releaseSwapCredits(
  userId: string,
  amount: number,
  reason: string,
  idempotencyKey?: string,
  relatedSwapId?: string
): Promise<CreditOperationResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { success: false, error: 'Supabase client is unavailable.' };
  }

  try {
    const { data, error } = await supabase.rpc('release_swap_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason,
      p_idempotency_key: idempotencyKey || null,
      p_related_swap_id: relatedSwapId || null,
    });

    if (error) {
      return {
        success: false,
        error: formatFriendlyErrorMessage(error),
      };
    }

    return data as CreditOperationResult;
  } catch (err) {
    return {
      success: false,
      error: formatFriendlyErrorMessage(err),
    };
  }
}

/**
 * Atomically transfers credits from authenticated user to recipient with deadlock protection.
 */
export async function transferUserCredits(
  toUserId: string,
  amount: number,
  reason: string,
  idempotencyKey?: string,
  relatedSwapId?: string
): Promise<CreditOperationResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { success: false, error: 'Supabase client is unavailable.' };
  }

  try {
    const { data, error } = await supabase.rpc('transfer_credits', {
      p_to_user_id: toUserId,
      p_amount: amount,
      p_reason: reason,
      p_idempotency_key: idempotencyKey || null,
      p_related_swap_id: relatedSwapId || null,
    });

    if (error) {
      return {
        success: false,
        error: formatFriendlyErrorMessage(error),
      };
    }

    return data as CreditOperationResult;
  } catch (err) {
    return {
      success: false,
      error: formatFriendlyErrorMessage(err),
    };
  }
}
