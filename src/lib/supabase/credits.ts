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
 * Atomically reserves credits from the authenticated user's balance.
 */
export async function reserveUserCredits(
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
    const { data, error } = await supabase.rpc('reserve_my_credits', {
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
 * Atomically releases reserved credits back to the user's available balance.
 */
export async function releaseReservedCredits(
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
    const { data, error } = await supabase.rpc('release_reserved_credits', {
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
 * Atomically transfers reserved credits from payer to recipient upon swap completion.
 */
export async function settleReservedCreditTransfer(
  payerId: string,
  recipientId: string,
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
    const { data, error } = await supabase.rpc('settle_reserved_credit_transfer', {
      p_payer_id: payerId,
      p_recipient_id: recipientId,
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
 * Legacy / Direct deduction helper (calls reserve_my_credits or deduct_credits).
 */
export async function deductUserCredits(
  amount: number,
  reason: string,
  idempotencyKey?: string,
  relatedSwapId?: string,
  metadata?: Record<string, unknown>
): Promise<CreditOperationResult> {
  return reserveUserCredits(amount, reason, idempotencyKey, relatedSwapId, metadata);
}

/**
 * Legacy refund helper alias.
 */
export async function releaseSwapCredits(
  userId: string,
  amount: number,
  reason: string,
  idempotencyKey?: string,
  relatedSwapId?: string
): Promise<CreditOperationResult> {
  return releaseReservedCredits(userId, amount, reason, idempotencyKey, relatedSwapId);
}

/**
 * Atomically adds credits to a user account (privileged / backend operation).
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
