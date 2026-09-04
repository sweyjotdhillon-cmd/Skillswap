import { getSupabaseBrowserClient } from './client';
import { formatFriendlyErrorMessage } from './profile';
import { generateUUID } from '../uuid';
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

export interface SwapAttachment {
  id: string;
  swapId: string;
  uploadedBy: string;
  storagePath: string;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
  createdAt: string;
}

/** Creates the swap and its reservation in one database transaction using a stable idempotency key. */
export async function createCreditSwap(input: CreateCreditSwapInput): Promise<{ success: boolean; swapId?: string; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { success: false, error: 'Supabase client is unavailable.' };

  const idempotencyKey = input.idempotencyKey || `swap_create:${generateUUID()}`;

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
  notes?: string;
  files?: File[];
}

export const ALLOWED_FILE_EXTENSIONS = new Set([
  // Images
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg',
  // Documents
  'pdf', 'doc', 'docx', 'txt', 'md', 'rtf',
  // Spreadsheets
  'csv', 'xls', 'xlsx',
  // Presentations
  'ppt', 'pptx',
  // Archives
  'zip', 'tar', 'gz', '7z',
  // Code/development
  'py', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'scss', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'php', 'rb', 'swift', 'kt', 'sql', 'sh', 'bat', 'ps1', 'json', 'xml', 'yaml', 'yml',
  // Media
  'mp3', 'wav', 'mp4', 'webm', 'mov',
  // Design
  'fig', 'psd', 'ai'
]);

/**
 * Extension-aware MIME normalization strategy.
 * Maps file extensions to canonical MIME types when the browser's File.type is empty or generic.
 */
export function getNormalizedMimeType(fileName: string, browserType?: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  const EXTENSION_MIME_MAP: Record<string, string> = {
    // Images
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',

    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    md: 'text/markdown',
    rtf: 'application/rtf',

    // Spreadsheets
    csv: 'text/csv',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

    // Presentations
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

    // Archives
    zip: 'application/zip',
    tar: 'application/x-tar',
    gz: 'application/gzip',
    '7z': 'application/x-7z-compressed',

    // Code/development
    py: 'text/x-python',
    js: 'text/javascript',
    jsx: 'text/javascript',
    ts: 'text/typescript',
    tsx: 'text/typescript',
    html: 'text/html',
    css: 'text/css',
    scss: 'text/x-scss',
    java: 'text/x-java-source',
    c: 'text/x-c',
    cpp: 'text/x-c++',
    h: 'text/x-h',
    hpp: 'text/x-h++',
    cs: 'text/plain',
    go: 'text/plain',
    rs: 'text/plain',
    php: 'application/x-httpd-php',
    rb: 'text/x-ruby',
    swift: 'text/plain',
    kt: 'text/plain',
    sql: 'application/sql',
    sh: 'application/x-sh',
    bat: 'text/plain',
    ps1: 'text/plain',
    json: 'application/json',
    xml: 'application/xml',
    yaml: 'text/yaml',
    yml: 'text/yaml',

    // Media
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',

    // Design
    fig: 'application/octet-stream',
    psd: 'image/vnd.adobe.photoshop',
    ai: 'application/postscript',
  };

  const extensionMime = EXTENSION_MIME_MAP[ext];
  const cleanBrowserType = browserType?.trim().toLowerCase() || '';
  const isGeneric = !cleanBrowserType || cleanBrowserType === 'application/octet-stream' || cleanBrowserType === 'text/plain';

  if (!isGeneric) {
    if (ext === 'zip') {
      return 'application/zip';
    }
    return cleanBrowserType;
  }

  if (extensionMime) {
    return extensionMime;
  }

  return cleanBrowserType || 'application/octet-stream';
}

/**
 * Formats submission-specific error messages without returning misleading profile error copy.
 */
export function formatSubmissionErrorMessage(error: unknown, fileName?: string): string {
  if (!error) {
    return fileName ? `Failed to upload "${fileName}". Please try again.` : 'Submission could not be saved. Please try again.';
  }

  const errObj = error as { message?: string; details?: string; status?: number; statusCode?: number; error?: string; name?: string };
  const rawMsg = typeof error === 'string' ? error : errObj.message || errObj.details || errObj.error || '';
  const lower = rawMsg.toLowerCase();
  const status = errObj.status || errObj.statusCode;

  if (status === 400 || lower.includes('400') || lower.includes('bad request') || lower.includes('mime') || lower.includes('not allowed')) {
    return fileName
      ? `Supabase rejected "${fileName}". Please try a different supported file type or try again.`
      : 'Supabase rejected this file upload. Please try a different supported file type or try again.';
  }

  if (lower.includes('jwt') || lower.includes('unauthorized') || lower.includes('not authenticated')) {
    return 'Your session has expired. Please sign in again and retry.';
  }

  if (lower.includes('duplicate') || lower.includes('already submitted')) {
    return 'Work has already been submitted for this swap.';
  }

  if (rawMsg) {
    return fileName ? `Failed to upload "${fileName}": ${rawMsg}` : `Submission error: ${rawMsg}`;
  }

  return fileName ? `Failed to upload "${fileName}". Please try again.` : 'Submission could not be saved. Please try again.';
}

/** Uploads attached files to Supabase Storage and executes the atomic submit_swap_work RPC with rollback cleanup on failure. */
export async function submitSwapWorkWithFiles(input: SubmitSwapWorkInput): Promise<{ success: boolean; submissionId?: string; error?: string }> {
  console.log('[SUBMISSION] submit started', { swapId: input.swapId, fileCount: input.files?.length || 0 });

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    console.error('[SUBMISSION] failure: Supabase client unavailable');
    return { success: false, error: 'Supabase client is unavailable.' };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('[SUBMISSION] failure: user not logged in');
    return { success: false, error: 'You must be logged in to submit work.' };
  }

  if (!input.swapId) {
    console.error('[SUBMISSION] failure: missing swap ID');
    return { success: false, error: 'Swap ID is required.' };
  }

  const cleanNotes = input.notes?.trim() || '';
  const fileCount = input.files ? input.files.length : 0;

  if (cleanNotes.length === 0 && fileCount === 0) {
    console.warn('[SUBMISSION] validation failed: empty notes and no files');
    return { success: false, error: 'Submission must contain notes or at least one attachment.' };
  }

  if (input.files && input.files.length > 5) {
    console.warn('[SUBMISSION] validation failed: exceeded max 5 files', { fileCount: input.files.length });
    return { success: false, error: 'Maximum 5 files allowed per submission.' };
  }

  console.log('[SUBMISSION] validation passed', { cleanNotesLength: cleanNotes.length, fileCount });

  const uploadedPaths: string[] = [];
  const uploadedFileMetadata: Array<{ storage_path: string; file_name: string; mime_type: string; file_size: number }> = [];

  if (input.files && input.files.length > 0) {
    for (const file of input.files) {
      if (file.size > 25 * 1024 * 1024) {
        console.error('[SUBMISSION] file validation failed: size exceeds 25MB', { fileName: file.name, fileSize: file.size });
        return { success: false, error: `File "${file.name}" exceeds maximum allowed size of 25MB.` };
      }

      const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
      if (!ALLOWED_FILE_EXTENSIONS.has(fileExt)) {
        console.error('[SUBMISSION] file validation failed: unsupported extension', { fileName: file.name, fileExt });
        return { success: false, error: `File "${file.name}" has unsupported extension .${fileExt}.` };
      }

      const normalizedMimeType = getNormalizedMimeType(file.name, file.type);
      const safeFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const storagePath = `submissions/${input.swapId}/${user.id}/${generateUUID()}-${safeFileName}`;

      console.log(`[SUBMISSION] upload started: ${file.name}`, {
        filename: file.name,
        'file.size': file.size,
        'file.type': file.type,
        extension: fileExt,
        normalizedMimeType,
        'storage path': storagePath,
        'bucket name': 'swap-submissions',
      });

      const { error: uploadError } = await supabase.storage
        .from('swap-submissions')
        .upload(storagePath, file, {
          contentType: normalizedMimeType,
          upsert: false,
        });

      if (uploadError) {
        const errObj = uploadError as {
          message?: string;
          name?: string;
          status?: number;
          statusCode?: number;
          error?: string;
          details?: string;
        };

        console.error(`[SUBMISSION] upload failed: ${file.name}`, {
          filename: file.name,
          'file.size': file.size,
          'file.type': file.type,
          extension: fileExt,
          'storage path': storagePath,
          'bucket name': 'swap-submissions',
          'Supabase error.message': errObj.message,
          'Supabase error.name': errObj.name,
          'Supabase error.status': errObj.status,
          'Supabase error.statusCode': errObj.statusCode,
          'Supabase error.error': errObj.error,
          'Supabase error.details': errObj.details,
        });

        // Clean up any files uploaded so far before returning error
        if (uploadedPaths.length > 0) {
          try {
            await supabase.storage.from('swap-submissions').remove(uploadedPaths);
            console.log('[SUBMISSION] cleanup completed after upload failure', { uploadedPaths });
          } catch (cleanupErr) {
            console.error('[SUBMISSION] cleanup failed after upload failure', { uploadedPaths, cleanupErr });
          }
        }
        return { success: false, error: formatSubmissionErrorMessage(uploadError, file.name) };
      }

      console.log(`[SUBMISSION] upload completed: ${storagePath}`);
      uploadedPaths.push(storagePath);
      uploadedFileMetadata.push({
        storage_path: storagePath,
        file_name: file.name,
        mime_type: normalizedMimeType,
        file_size: file.size,
      });
    }
  }

  console.log('[SUBMISSION] submission RPC started', { swapId: input.swapId, cleanNotesLength: cleanNotes.length, filesCount: uploadedFileMetadata.length });

  const { data, error } = await supabase.rpc('submit_swap_work', {
    p_swap_id: input.swapId,
    p_notes: cleanNotes,
    p_files: uploadedFileMetadata,
  });

  if (error || !data) {
    console.error('[SUBMISSION] submission RPC failed', {
      operationName: 'rpc.submit_swap_work',
      errorMessage: error?.message,
      errorCode: error?.code,
      errorDetails: error?.details,
      errorHint: error?.hint,
      swapId: input.swapId,
      notesLength: cleanNotes.length,
      fileMetadataCount: uploadedFileMetadata.length,
    });

    // Rollback uploaded files on database transaction error
    if (uploadedPaths.length > 0) {
      try {
        const { error: removeErr } = await supabase.storage.from('swap-submissions').remove(uploadedPaths);
        if (removeErr) {
          console.error('[SUBMISSION] CRITICAL: Storage cleanup failed for orphaned files after RPC error:', {
            uploadedPaths,
            removeError: removeErr,
          });
        } else {
          console.log('[SUBMISSION] Storage cleanup completed after RPC error:', { uploadedPaths });
        }
      } catch (cleanupErr) {
        console.error('[SUBMISSION] CRITICAL: Storage cleanup exception for orphaned files after RPC error:', {
          uploadedPaths,
          cleanupErr,
        });
      }
    }
    return { success: false, error: formatSubmissionErrorMessage(error ?? new Error('Failed to submit swap work.')) };
  }

  const result = data as { success?: boolean; submission_id?: string; error?: string };
  if (!result.success) {
    console.error('[SUBMISSION] submission RPC returned unsuccessful status', {
      operationName: 'rpc.submit_swap_work',
      swapId: input.swapId,
      resultError: result.error,
      returnedData: data,
    });

    if (uploadedPaths.length > 0) {
      try {
        const { error: removeErr } = await supabase.storage.from('swap-submissions').remove(uploadedPaths);
        if (removeErr) {
          console.error('[SUBMISSION] CRITICAL: Storage cleanup failed for orphaned files after unsuccessful RPC result:', {
            uploadedPaths,
            removeError: removeErr,
          });
        } else {
          console.log('[SUBMISSION] Storage cleanup completed after unsuccessful RPC result:', { uploadedPaths });
        }
      } catch (cleanupErr) {
        console.error('[SUBMISSION] CRITICAL: Storage cleanup exception for orphaned files after unsuccessful RPC result:', {
          uploadedPaths,
          cleanupErr,
        });
      }
    }
    return { success: false, error: result.error || 'Failed to record submission.' };
  }

  console.log('[SUBMISSION] submission RPC completed', { submissionId: result.submission_id });
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

// ==========================================
// SWAP CREATOR ATTACHMENTS API METHODS
// ==========================================

export async function getSwapAttachments(swapId: string): Promise<{ data: SwapAttachment[]; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !swapId) return { data: [], error: !swapId ? 'Swap ID is missing.' : 'Supabase client is unavailable.' };

  try {
    const { data, error } = await supabase
      .from('swap_attachment_files')
      .select('*')
      .eq('swap_id', swapId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching swap attachments:', error);
      return { data: [], error: formatFriendlyErrorMessage(error) };
    }

    const attachments: SwapAttachment[] = (data || []).map((a) => ({
      id: a.id,
      swapId: a.swap_id,
      uploadedBy: a.uploaded_by,
      storagePath: a.storage_path,
      fileName: a.file_name,
      mimeType: a.mime_type,
      fileSize: a.file_size,
      createdAt: a.created_at,
    }));

    return { data: attachments };
  } catch (err) {
    console.error('Unexpected error fetching swap attachments:', err);
    return { data: [], error: formatFriendlyErrorMessage(err) };
  }
}

export async function uploadSwapAttachments(
  swapId: string,
  files: File[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { success: false, error: 'Supabase client is unavailable.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'You must be logged in to upload attachments.' };

  if (!files || files.length === 0) return { success: true };

  if (files.length > 5) {
    return { success: false, error: 'Maximum 5 attachments allowed per swap.' };
  }

  const uploadedPaths: string[] = [];
  const registeredIds: string[] = [];

  const cleanupRollback = async () => {
    // Unregister any metadata already registered
    for (const attId of registeredIds) {
      try {
        await supabase.rpc('unregister_swap_attachment', { p_attachment_id: attId });
      } catch {
        // Fallback table deletion if RPC is unavailable
        await supabase.from('swap_attachment_files').delete().eq('id', attId).eq('uploaded_by', user.id);
      }
    }
    // Delete files from swap-attachments bucket
    if (uploadedPaths.length > 0) {
      try {
        await supabase.storage.from('swap-attachments').remove(uploadedPaths);
      } catch (cleanupErr) {
        console.error('Cleanup failed after creator attachment upload/registration error:', cleanupErr);
      }
    }
  };

  try {
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) {
        await cleanupRollback();
        return { success: false, error: `File "${file.name}" exceeds maximum allowed size of 25MB.` };
      }

      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!ALLOWED_FILE_EXTENSIONS.has(ext)) {
        await cleanupRollback();
        return { success: false, error: `File "${file.name}" has unsupported extension .${ext}.` };
      }

      const normalizedMime = getNormalizedMimeType(file.name, file.type);
      const safeFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const storagePath = `swap-attachments/${swapId}/${user.id}/${generateUUID()}-${safeFileName}`;

      const { error: uploadErr } = await supabase.storage
        .from('swap-attachments')
        .upload(storagePath, file, {
          contentType: normalizedMime,
          upsert: false,
        });

      if (uploadErr) {
        console.error('Creator attachment upload failed:', uploadErr);
        await cleanupRollback();
        return { success: false, error: formatSubmissionErrorMessage(uploadErr, file.name) };
      }

      uploadedPaths.push(storagePath);

      // Register metadata via RPC register_swap_attachment with table fallback
      let attachmentId: string | null = null;
      const { data: rpcData, error: rpcErr } = await supabase.rpc('register_swap_attachment', {
        p_swap_id: swapId,
        p_storage_path: storagePath,
        p_file_name: file.name,
        p_mime_type: normalizedMime,
        p_file_size: file.size,
      });

      if (!rpcErr && rpcData) {
        const res = rpcData as { success?: boolean; attachment_id?: string; id?: string; error?: string };
        if (res.attachment_id) {
          attachmentId = res.attachment_id;
        } else if (res.id) {
          attachmentId = res.id;
        } else if (res.success === false) {
          console.error('register_swap_attachment RPC returned failure:', res.error);
          await cleanupRollback();
          return { success: false, error: res.error || 'Failed to register creator attachment.' };
        }
      }

      if (!attachmentId) {
        // Fallback direct table insert if RPC is unavailable or returned unexpected shape without explicit error
        const { data: dbData, error: dbErr } = await supabase
          .from('swap_attachment_files')
          .insert({
            swap_id: swapId,
            uploaded_by: user.id,
            storage_path: storagePath,
            file_name: file.name,
            mime_type: normalizedMime,
            file_size: file.size,
          })
          .select('id')
          .single();

        if (dbErr || !dbData) {
          console.error('Failed to register creator attachment metadata:', rpcErr || dbErr);
          await cleanupRollback();
          return { success: false, error: formatSubmissionErrorMessage(rpcErr || dbErr || new Error('Registration failed.')) };
        }
        attachmentId = dbData.id;
      }

      if (attachmentId) {
        registeredIds.push(attachmentId);
      } else {
        await cleanupRollback();
        return { success: false, error: `Failed to record attachment "${file.name}".` };
      }
    }

    return { success: true };
  } catch (err) {
    console.error('Unexpected exception during creator attachment upload:', err);
    await cleanupRollback();
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected attachment upload error.' };
  }
}

export async function getSwapAttachmentSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !storagePath) return null;

  try {
    const { data, error } = await supabase.storage
      .from('swap-attachments')
      .createSignedUrl(storagePath, 3600);

    if (error || !data) {
      console.error('Error generating creator attachment signed URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error('Unexpected error generating creator attachment signed URL:', err);
    return null;
  }
}

/**
 * Downloads a file from a signed URL in the browser without navigating away or opening inline.
 */
export async function downloadFileFromSignedUrl(signedUrl: string, fileName: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(signedUrl);
    if (!response.ok) {
      return { success: false, error: `Failed to download file (HTTP ${response.status})` };
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

    return { success: true };
  } catch (err) {
    console.error('Error in downloadFileFromSignedUrl:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Download failed.' };
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
