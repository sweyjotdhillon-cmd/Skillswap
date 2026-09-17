import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
import { handleCors } from '../_shared/cors.ts';

interface ClaimedItem {
  file_id: string;
  table_name: string;
  bucket_name: string;
  storage_path: string;
}

Deno.serve(async (req: Request) => {
  const { corsHeaders, errorResponse } = handleCors(req);
  if (errorResponse) return errorResponse;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'CONFIG_ERROR', message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    let batchSize = 500;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (typeof body?.batch_size === 'number' && body.batch_size > 0) {
          batchSize = body.batch_size;
        }
      } catch {
        // Ignore JSON parse errors for empty POST body
      }
    }

    // 1. Claim expired items from RPC claim_expired_file_cleanup
    const { data: claimedData, error: claimErr } = await supabase.rpc('claim_expired_file_cleanup', {
      p_batch_size: batchSize,
    });

    if (claimErr) {
      console.error('[file-lifecycle-worker] claim_expired_file_cleanup RPC failed:', claimErr);
      return new Response(
        JSON.stringify({ error: 'CLAIM_FAILED', message: claimErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
    const errors: Array<{ file_id: string; error: string }> = [];

    // 2. Process physical Storage deletion for each claimed item
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

      const errLower = removeErr?.message?.toLowerCase() || '';
      const isNotFound = removeErr && (
        errLower.includes('not found') ||
        errLower.includes('404') ||
        errLower.includes('does not exist') ||
        (removeErr as { status?: number }).status === 404 ||
        (removeErr as { statusCode?: string }).statusCode === '404'
      );

      if (removeErr && !isNotFound) {
        console.error(`[file-lifecycle-worker] Physical storage removal failed for ${bucket_name}/${storage_path}:`, removeErr);
        await supabase.rpc('finalize_file_cleanup', {
          p_file_id: file_id,
          p_table_name: table_name,
          p_success: false,
          p_error: removeErr.message || 'Storage API removal error',
        });
        failed++;
        errors.push({ file_id, error: removeErr.message || 'Storage API removal error' });
      } else {
        // Finalize success (either successfully deleted or object was already missing/deleted)
        await supabase.rpc('finalize_file_cleanup', {
          p_file_id: file_id,
          p_table_name: table_name,
          p_success: true,
          p_error: null,
        });
        succeeded++;
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
    console.error('[file-lifecycle-worker] Unexpected exception:', err);
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Internal worker error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
