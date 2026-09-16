import { getSupabaseBrowserClient } from './client';

export interface FileLifecycleWorkerResult {
  success: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  errors?: Array<{ file_id: string; error: string }>;
  error?: string;
}

/**
 * Programmatically invokes the claim_expired_file_cleanup RPC and processes physical Storage API object deletions.
 * Works both via Supabase client and service role connection.
 */
export async function processFileLifecycleCleanup(batchSize: number = 500): Promise<FileLifecycleWorkerResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { success: false, processed: 0, succeeded: 0, failed: 0, error: 'Supabase client is unavailable.' };
  }

  try {
    const { data: claimedData, error: claimErr } = await supabase.rpc('claim_expired_file_cleanup', {
      p_batch_size: batchSize,
    });

    if (claimErr) {
      console.error('[processFileLifecycleCleanup] claim_expired_file_cleanup RPC error:', claimErr);
      return { success: false, processed: 0, succeeded: 0, failed: 0, error: claimErr.message };
    }

    const items = (claimedData || []) as Array<{
      file_id: string;
      table_name: string;
      bucket_name: string;
      storage_path: string;
    }>;

    if (items.length === 0) {
      return { success: true, processed: 0, succeeded: 0, failed: 0 };
    }

    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ file_id: string; error: string }> = [];

    for (const item of items) {
      const { file_id, table_name, bucket_name, storage_path } = item;

      if (!bucket_name || !storage_path) {
        await supabase.rpc('finalize_file_cleanup', {
          p_file_id: file_id,
          p_table_name: table_name,
          p_success: false,
          p_error: 'Missing bucket_name or storage_path for claimed item.',
        });
        failed++;
        errors.push({ file_id, error: 'Missing bucket or storage path' });
        continue;
      }

      const { error: removeErr } = await supabase.storage
        .from(bucket_name)
        .remove([storage_path]);

      if (removeErr) {
        console.error(`[processFileLifecycleCleanup] Physical removal failed for ${bucket_name}/${storage_path}:`, removeErr);
        await supabase.rpc('finalize_file_cleanup', {
          p_file_id: file_id,
          p_table_name: table_name,
          p_success: false,
          p_error: removeErr.message || 'Storage API removal error',
        });
        failed++;
        errors.push({ file_id, error: removeErr.message || 'Storage API removal error' });
      } else {
        await supabase.rpc('finalize_file_cleanup', {
          p_file_id: file_id,
          p_table_name: table_name,
          p_success: true,
          p_error: null,
        });
        succeeded++;
      }
    }

    return {
      success: true,
      processed: items.length,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (err) {
    console.error('[processFileLifecycleCleanup] Unexpected exception:', err);
    return {
      success: false,
      processed: 0,
      succeeded: 0,
      failed: 0,
      error: err instanceof Error ? err.message : 'Unexpected cleanup error',
    };
  }
}
