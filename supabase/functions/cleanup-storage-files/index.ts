import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
import { handleCors } from '../_shared/cors.ts';

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

    // Fail-closed authentication check
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    const expectedToken = `Bearer ${supabaseServiceKey}`;

    if (!authHeader || authHeader !== expectedToken) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      console.error('[cleanup-storage-files] claim_expired_file_cleanup RPC failed:', claimErr.message);
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
    const errors: Array<{ source: string; file_id: string; error: string }> = [];

    // 2. Process physical Storage deletion for each claimed item
    for (const item of items) {
      const { source, file_id, storage_path } = item;
      const bucketName = SOURCE_TO_BUCKET[source];

      if (!bucketName || !storage_path) {
        await supabase.rpc('mark_file_storage_failed', {
          p_source: source || 'unknown',
          p_file_id: file_id,
          p_error: `Invalid or unmapped source/path: source=${source}, path=${storage_path}`,
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

      if (removeErr && !isNotFound) {
        console.error(`[cleanup-storage-files] Storage removal failed for ${source}/${file_id} (${bucketName}/${storage_path}):`, removeErr.message);
        await supabase.rpc('mark_file_storage_failed', {
          p_source: source,
          p_file_id: file_id,
          p_error: removeErr.message || 'Storage API removal error',
        });
        failed++;
        errors.push({ source, file_id, error: removeErr.message || 'Storage API removal error' });
      } else {
        // Finalize success via mark_file_storage_deleted (either deleted or object was already absent)
        await supabase.rpc('mark_file_storage_deleted', {
          p_source: source,
          p_file_id: file_id,
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
    console.error('[cleanup-storage-files] Unexpected exception:', err instanceof Error ? err.message : 'Internal worker error');
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Internal worker error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
