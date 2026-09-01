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

export interface CreateCreditSwapInput {
  topic: string;
  description: string;
  requirements: string;
  chatPermission: 'requester' | 'participant' | 'anyone';
  creditAmount: number;
  additionalMessage?: string;
}

/** Creates the swap and its reservation in one database transaction. */
export async function createCreditSwap(input: CreateCreditSwapInput): Promise<{ success: boolean; swapId?: string; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { success: false, error: 'Supabase client is unavailable.' };
  const { data, error } = await supabase.rpc('create_credit_swap', {
    p_topic: input.topic,
    p_description: input.description,
    p_requirements: input.requirements,
    p_chat_permission: input.chatPermission,
    p_credit_amount: input.creditAmount,
    p_additional_message: input.additionalMessage || null,
  });
  if (error || !data) return { success: false, error: formatFriendlyErrorMessage(error ?? new Error('Swap creation returned no ID.')) };
  return { success: true, swapId: data as string };
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
