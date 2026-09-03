import { getSupabaseBrowserClient } from './client';
import { formatFriendlyErrorMessage } from './profile';
import type { SwapMessage, SwapSubmission, SwapSubmissionFile } from '../../types/swap';

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
  idempotency_key?: string | null;
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

export interface SubmitSwapWorkInput {
  swapId: string;
  notes: string;
  files?: File[];
}

const ALLOWED_FILE_EXTENSIONS = new Set([
  'pdf', 'zip', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'doc', 'docx', 'csv', 'xlsx', 'mp4', 'json', 'fig', 'psd'
]);

/** Uploads attached files to Supabase Storage and executes the atomic submit_swap_work RPC with rollback cleanup on failure. */
export async function submitSwapWorkWithFiles(input: SubmitSwapWorkInput): Promise<{ success: boolean; submissionId?: string; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { success: false, error: 'Supabase client is unavailable.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'You must be logged in to submit work.' };

  const cleanNotes = input.notes?.trim();
  if (!cleanNotes) {
    return { success: false, error: 'Submission notes are required.' };
  }

  if (input.files && input.files.length > 5) {
    return { success: false, error: 'Maximum 5 files allowed per submission.' };
  }

  const uploadedPaths: string[] = [];
  const uploadedFileMetadata: Array<{ storage_path: string; file_name: string; mime_type: string; file_size: number }> = [];

  if (input.files && input.files.length > 0) {
    for (const file of input.files) {
      if (file.size > 25 * 1024 * 1024) {
        return { success: false, error: `File "${file.name}" exceeds maximum allowed size of 25MB.` };
      }

      const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
      if (!ALLOWED_FILE_EXTENSIONS.has(fileExt)) {
        return { success: false, error: `File "${file.name}" has unsupported extension .${fileExt}. Allowed extensions: PDF, ZIP, PNG, JPG, WEBP, TXT, DOC, DOCX, CSV, XLSX, MP4, JSON.` };
      }

      const safeFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const storagePath = `${input.swapId}/${user.id}/${crypto.randomUUID()}-${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('swap-submissions')
        .upload(storagePath, file, { upsert: false });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        // Clean up any files uploaded so far before returning error
        if (uploadedPaths.length > 0) {
          try {
            await supabase.storage.from('swap-submissions').remove(uploadedPaths);
          } catch (cleanupErr) {
            console.error('Failed to clean up uploaded files on error:', cleanupErr);
          }
        }
        return { success: false, error: `Failed to upload file "${file.name}": ${formatFriendlyErrorMessage(uploadError)}` };
      }

      uploadedPaths.push(storagePath);
      uploadedFileMetadata.push({
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        file_size: file.size,
      });
    }
  }

  const { data, error } = await supabase.rpc('submit_swap_work', {
    p_swap_id: input.swapId,
    p_notes: cleanNotes,
    p_files: uploadedFileMetadata,
  });

  if (error || !data) {
    // Rollback uploaded files on database transaction error
    if (uploadedPaths.length > 0) {
      try {
        await supabase.storage.from('swap-submissions').remove(uploadedPaths);
      } catch (cleanupErr) {
        console.error('Failed to clean up uploaded files on RPC error:', cleanupErr);
      }
    }
    return { success: false, error: formatFriendlyErrorMessage(error ?? new Error('Failed to submit swap work.')) };
  }

  const result = data as { success?: boolean; submission_id?: string; error?: string };
  if (!result.success) {
    if (uploadedPaths.length > 0) {
      try {
        await supabase.storage.from('swap-submissions').remove(uploadedPaths);
      } catch (cleanupErr) {
        console.error('Failed to clean up uploaded files on submission failure:', cleanupErr);
      }
    }
    return { success: false, error: result.error || 'Failed to record submission.' };
  }

  return { success: true, submissionId: result.submission_id };
}

/**
 * @deprecated Use submitSwapWorkWithFiles instead, which provides notes, file validation, and transactional cleanup.
 */
export async function submitCreditSwap(swapId: string): Promise<{ success: boolean; swap?: SwapRecord; error?: string }> {
  console.warn('submitCreditSwap is deprecated. Using submitSwapWorkWithFiles instead.');
  return submitSwapWorkWithFiles({
    swapId,
    notes: 'Work submitted for review.',
  });
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

export interface GetOpenSwapsResult {
  data: SwapRecord[];
  error?: string;
}

export interface GetUserSwapsResult {
  data: SwapRecord[];
  error?: string;
}

/** Fetches open swaps for the explore catalog. */
export async function getOpenSwaps(): Promise<GetOpenSwapsResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: [], error: 'Supabase client is unavailable.' };
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
      return { data: [], error: formatFriendlyErrorMessage(error) };
    }
    return { data: (data || []) as SwapRecord[] };
  } catch (err) {
    console.error('Unexpected error fetching open swaps:', err);
    return { data: [], error: formatFriendlyErrorMessage(err) };
  }
}

/** Fetches all swaps where the current user is requester or participant. */
export async function getUserSwaps(userId: string): Promise<GetUserSwapsResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !userId) return { data: [], error: !userId ? 'User ID is missing.' : 'Supabase client is unavailable.' };
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
      return { data: [], error: formatFriendlyErrorMessage(error) };
    }
    return { data: (data || []) as SwapRecord[] };
  } catch (err) {
    console.error('Unexpected error fetching user swaps:', err);
    return { data: [], error: formatFriendlyErrorMessage(err) };
  }
}

// ==========================================
// CHAT API METHODS
// ==========================================

export async function getSwapMessages(swapId: string): Promise<{ data: SwapMessage[]; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: [], error: 'Supabase client is unavailable.' };

  try {
    const { data, error } = await supabase
      .from('swap_messages')
      .select('*')
      .eq('swap_id', swapId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching swap messages:', error);
      return { data: [], error: formatFriendlyErrorMessage(error) };
    }

    const messages: SwapMessage[] = (data || []).map((m) => ({
      id: m.id,
      swapId: m.swap_id,
      senderId: m.sender_id,
      recipientId: m.recipient_id,
      body: m.body,
      readAt: m.read_at,
      createdAt: m.created_at,
    }));

    return { data: messages };
  } catch (err) {
    console.error('Unexpected error fetching messages:', err);
    return { data: [], error: formatFriendlyErrorMessage(err) };
  }
}

export async function sendSwapMessage(
  swapId: string,
  recipientId: string,
  body: string
): Promise<{ success: boolean; message?: SwapMessage; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { success: false, error: 'Supabase client is unavailable.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'You must be logged in to send messages.' };

  const cleanBody = body.trim();
  if (!cleanBody) return { success: false, error: 'Message cannot be empty.' };

  try {
    const { data, error } = await supabase
      .from('swap_messages')
      .insert({
        swap_id: swapId,
        sender_id: user.id,
        recipient_id: recipientId,
        body: cleanBody,
      })
      .select()
      .single();

    if (error || !data) {
      console.error('Error sending message:', error);
      return { success: false, error: formatFriendlyErrorMessage(error ?? new Error('Failed to send message.')) };
    }

    const message: SwapMessage = {
      id: data.id,
      swapId: data.swap_id,
      senderId: data.sender_id,
      recipientId: data.recipient_id,
      body: data.body,
      readAt: data.read_at,
      createdAt: data.created_at,
    };

    return { success: true, message };
  } catch (err) {
    console.error('Unexpected error sending message:', err);
    return { success: false, error: formatFriendlyErrorMessage(err) };
  }
}

// ==========================================
// SUBMISSION API METHODS
// ==========================================

export async function getSwapSubmission(swapId: string): Promise<{ data: SwapSubmission | null; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: 'Supabase client is unavailable.' };

  try {
    const { data: subData, error: subError } = await supabase
      .from('swap_submissions')
      .select('*')
      .eq('swap_id', swapId)
      .maybeSingle();

    if (subError) {
      console.error('Error fetching submission:', subError);
      return { data: null, error: formatFriendlyErrorMessage(subError) };
    }

    if (!subData) {
      return { data: null };
    }

    const { data: fileData, error: fileError } = await supabase
      .from('swap_submission_files')
      .select('*')
      .eq('submission_id', subData.id)
      .order('created_at', { ascending: true });

    if (fileError) {
      console.error('Error fetching submission files:', fileError);
    }

    const files: SwapSubmissionFile[] = (fileData || []).map((f) => ({
      id: f.id,
      submissionId: f.submission_id,
      storagePath: f.storage_path,
      fileName: f.file_name,
      mimeType: f.mime_type,
      fileSize: f.file_size,
      createdAt: f.created_at,
    }));

    const submission: SwapSubmission = {
      id: subData.id,
      swapId: subData.swap_id,
      submittedBy: subData.submitted_by,
      notes: subData.notes,
      reviewedAt: subData.reviewed_at,
      reviewedBy: subData.reviewed_by,
      createdAt: subData.created_at,
      updatedAt: subData.updated_at,
      files,
    };

    return { data: submission };
  } catch (err) {
    console.error('Unexpected error fetching submission:', err);
    return { data: null, error: formatFriendlyErrorMessage(err) };
  }
}

export async function getSubmissionFileSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !storagePath) return null;

  try {
    const { data, error } = await supabase.storage
      .from('swap-submissions')
      .createSignedUrl(storagePath, 3600);

    if (error || !data) {
      console.error('Error generating signed URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error('Unexpected error generating signed URL:', err);
    return null;
  }
}

/**
 * Fetches or initializes the authenticated user's credit account record.
 */
export async function getUserAccount(): Promise<Account | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.rpc('get_user_account');

    if (error) {
      console.error('Error in get_user_account RPC:', error);
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
