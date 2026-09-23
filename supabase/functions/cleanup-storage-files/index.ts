import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
import { handleCors, createErrorResponse } from '../_shared/cors.ts';

interface ClaimedItem {
  source: string;
  file_id: string;
  storage_path: string;
}

const SOURCE_TO_BUCKET: Record<string, string> = {
  submission: 'swap-submissions',
  creator_attachment: 'swap-attachments',
  chat_attachment: 'swap-chat-attachments',
};

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

Deno.serve(async (req: Request) => {
  const { corsHeaders, correlationId, errorResponse } = handleCors(req);
  if (errorResponse) return errorResponse;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return createErrorResponse('CONFIG_ERROR', 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.', 500, corsHeaders, correlationId);
    }

    // Fail-closed authentication check with constant-time comparison
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    const expectedToken = `Bearer ${supabaseServiceKey}`;

    if (!authHeader || !constantTimeEqual(authHeader, expectedToken)) {
      return createErrorResponse('UNAUTHORIZED', 'Missing or invalid Authorization header.', 401, corsHeaders, correlationId);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    let limit = 100;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (typeof body?.limit === 'number' && body.limit > 0) {
          limit = body.limit;
        } else if (typeof body?.batch_size === 'number' && body.batch_size > 0) {
          limit = body.batch_size;
        }
      } catch {
        // Ignore JSON parse errors for empty POST body
      }
    }

    // 1. Claim expired items using canonical RPC claim_expired_file_cleanup
    const { data: claimedData, error: claimErr } = await supabase.rpc('claim_expired_file_cleanup', {
      p_limit: limit,
    });

    if (claimErr) {
      console.error(`[${correlationId}] [cleanup-storage-files] claim_expired_file_cleanup RPC failed:`, claimErr.message);
      return createErrorResponse('CLAIM_FAILED', 'Claim operation failed.', 500, corsHeaders, correlationId);
    }

    const items: ClaimedItem[] = (claimedData || []) as ClaimedItem[];
    if (items.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, succeeded: 0, failed: 0, message: 'No items eligible for physical storage cleanup.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ source: string; file_id: string; error: string }> = [];

    // 2. Process physical Storage deletion for each claimed item
    for (const item of items) {
      const { source, file_id, storage_path } = item;
      const bucketName = SOURCE_TO_BUCKET[source];

      if (!bucketName || !storage_path) {
        await supabase.rpc('mark_file_storage_failed', {
          p_source: source || 'unknown',
          p_file_id: file_id,
          p_error: `Invalid or unmapped source: ${source}`,
        });
        failed++;
        errors.push({ source, file_id, error: 'Invalid bucket or storage path' });
        continue;
      }

      const { error: removeErr } = await supabase.storage
        .from(bucketName)
        .remove([storage_path]);

      const errLower = removeErr?.message?.toLowerCase() || '';
      const isNotFound = removeErr && (
        errLower.includes('not found') ||
        errLower.includes('404') ||
        errLower.includes('does not exist') ||
        (removeErr as { status?: number }).status === 404 ||
        (removeErr as { statusCode?: string }).statusCode === '404'
      );

      let isConfirmedAbsent = false;

      if (!removeErr) {
        // Confirm remove returned deleted object metadata or empty array for already deleted object
        isConfirmedAbsent = true;
      } else if (isNotFound) {
        isConfirmedAbsent = true;
      } else {
        // Object removal returned unexpected error - check whether object is physically absent
        try {
          const pathParts = storage_path.split('/');
          const fileName = pathParts.pop() || '';
          const folderPath = pathParts.join('/');
          const { data: listData } = await supabase.storage
            .from(bucketName)
            .list(folderPath, { search: fileName });

          if (listData && !listData.some((f) => f.name === fileName)) {
            isConfirmedAbsent = true;
          }
        } catch {
          isConfirmedAbsent = false;
        }
      }

      if (!isConfirmedAbsent) {
        console.error(`[${correlationId}] [cleanup-storage-files] Storage removal failed for source=${source} file_id=${file_id}:`, removeErr?.message || 'Removal unconfirmed');
        const { error: markFailedErr } = await supabase.rpc('mark_file_storage_failed', {
          p_source: source,
          p_file_id: file_id,
          p_error: removeErr?.message || 'Physical storage removal unconfirmed',
        });
        if (markFailedErr) {
          console.error(`[${correlationId}] [cleanup-storage-files] mark_file_storage_failed RPC failed for source=${source} file_id=${file_id}:`, markFailedErr.message);
        }
        failed++;
        errors.push({ source, file_id, error: 'Physical storage removal failed' });
      } else {
        // Finalize success via mark_file_storage_deleted after physical absence confirmed
        const { error: markDeletedErr } = await supabase.rpc('mark_file_storage_deleted', {
          p_source: source,
          p_file_id: file_id,
        });

        if (markDeletedErr) {
          console.error(`[${correlationId}] [cleanup-storage-files] mark_file_storage_deleted RPC error for source=${source} file_id=${file_id}:`, markDeletedErr.message);
          await supabase.rpc('mark_file_storage_failed', {
            p_source: source,
            p_file_id: file_id,
            p_error: markDeletedErr.message,
          });
          failed++;
          errors.push({ source, file_id, error: 'Database finalization failed' });
        } else {
          succeeded++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: items.length,
        succeeded,
        failed,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error(`[${correlationId}] [cleanup-storage-files] Unexpected exception:`, err instanceof Error ? err.message : 'Internal worker error');
    return createErrorResponse('INTERNAL_ERROR', 'Internal worker error.', 500, corsHeaders, correlationId);
  }
});
