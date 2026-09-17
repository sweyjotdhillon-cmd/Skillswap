-- Migration 043: Phase A File Lifecycle Architecture Fix & Consolidation
-- Strategy: Forward-only migration history preservation.

-- ============================================================================
-- 1. CANONICAL RPC CONTRACTS
-- ============================================================================

-- Function 1: mark_file_storage_deleted
CREATE OR REPLACE FUNCTION public.mark_file_storage_deleted(
  p_file_id uuid,
  p_table_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_table_name = 'swap_submission_files' THEN
    UPDATE public.swap_submission_files
    SET storage_deleted_at = COALESCE(storage_deleted_at, now()),
        storage_delete_status = 'deleted',
        storage_delete_error = NULL
    WHERE id = p_file_id;

  ELSIF p_table_name = 'swap_attachment_files' THEN
    UPDATE public.swap_attachment_files
    SET storage_deleted_at = COALESCE(storage_deleted_at, now()),
        storage_delete_status = 'deleted',
        storage_delete_error = NULL
    WHERE id = p_file_id;

  ELSIF p_table_name = 'swap_message_attachments' THEN
    UPDATE public.swap_message_attachments
    SET deleted_at = COALESCE(deleted_at, now()),
        delete_status = 'deleted',
        delete_error = NULL
    WHERE id = p_file_id;
  END IF;
END;
$$;

-- Function 2: mark_file_storage_failed
CREATE OR REPLACE FUNCTION public.mark_file_storage_failed(
  p_file_id uuid,
  p_table_name text,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_table_name = 'swap_submission_files' THEN
    UPDATE public.swap_submission_files
    SET storage_delete_status = 'failed',
        storage_delete_error = p_error,
        storage_delete_claimed_at = NULL
    WHERE id = p_file_id;

  ELSIF p_table_name = 'swap_attachment_files' THEN
    UPDATE public.swap_attachment_files
    SET storage_delete_status = 'failed',
        storage_delete_error = p_error,
        storage_delete_claimed_at = NULL
    WHERE id = p_file_id;

  ELSIF p_table_name = 'swap_message_attachments' THEN
    UPDATE public.swap_message_attachments
    SET delete_status = 'failed',
        delete_error = p_error,
        delete_claimed_at = NULL
    WHERE id = p_file_id;
  END IF;
END;
$$;

-- Function 3: finalize_file_cleanup (Wrapper mapping to mark_file_storage_deleted / mark_file_storage_failed)
CREATE OR REPLACE FUNCTION public.finalize_file_cleanup(
  p_file_id uuid,
  p_table_name text,
  p_success boolean,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_success THEN
    PERFORM public.mark_file_storage_deleted(p_file_id, p_table_name);
  ELSE
    PERFORM public.mark_file_storage_failed(p_file_id, p_table_name, p_error);
  END IF;
END;
$$;

-- Function 4: claim_expired_file_cleanup (Primary contract with p_batch_size)
DROP FUNCTION IF EXISTS public.claim_expired_file_cleanup(integer);

CREATE OR REPLACE FUNCTION public.claim_expired_file_cleanup(p_batch_size integer DEFAULT 500)
RETURNS TABLE (
  file_id uuid,
  table_name text,
  bucket_name text,
  storage_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Claim expired, manually pending, or stuck (>15m) submission files
  RETURN QUERY
  WITH claimed_sub AS (
    SELECT f.id
    FROM public.swap_submission_files f
    WHERE (f.storage_expires_at <= now() OR f.storage_delete_status = 'pending_deletion')
      AND f.storage_deleted_at IS NULL
      AND f.storage_delete_status <> 'deleted'
      AND (
        f.storage_delete_status <> 'in_progress'
        OR f.storage_delete_claimed_at IS NULL
        OR f.storage_delete_claimed_at < now() - interval '15 minutes'
      )
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  upd_sub AS (
    UPDATE public.swap_submission_files f
    SET storage_delete_status = 'in_progress',
        storage_delete_claimed_at = now()
    FROM claimed_sub
    WHERE f.id = claimed_sub.id
    RETURNING f.id, 'swap_submission_files'::text AS tbl, 'swap-submissions'::text AS bucket, f.storage_path
  )
  SELECT * FROM upd_sub;

  -- 2. Claim expired, manually pending, or stuck (>15m) creator attachments
  RETURN QUERY
  WITH claimed_att AS (
    SELECT f.id
    FROM public.swap_attachment_files f
    WHERE ((f.storage_expires_at IS NOT NULL AND f.storage_expires_at <= now()) OR f.storage_delete_status = 'pending_deletion')
      AND f.storage_deleted_at IS NULL
      AND f.storage_delete_status <> 'deleted'
      AND (
        f.storage_delete_status <> 'in_progress'
        OR f.storage_delete_claimed_at IS NULL
        OR f.storage_delete_claimed_at < now() - interval '15 minutes'
      )
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  upd_att AS (
    UPDATE public.swap_attachment_files f
    SET storage_delete_status = 'in_progress',
        storage_delete_claimed_at = now()
    FROM claimed_att
    WHERE f.id = claimed_att.id
    RETURNING f.id, 'swap_attachment_files'::text AS tbl, 'swap-attachments'::text AS bucket, f.storage_path
  )
  SELECT * FROM upd_att;

  -- 3. Claim expired, manually pending, or stuck (>15m) chat attachments mapped strictly to 'swap-chat-attachments'
  RETURN QUERY
  WITH claimed_msg AS (
    SELECT f.id
    FROM public.swap_message_attachments f
    WHERE (f.delete_after <= now() OR f.delete_status = 'pending_deletion')
      AND f.deleted_at IS NULL
      AND f.delete_status IN ('active', 'failed', 'pending_deletion', 'in_progress')
      AND (
        f.delete_status <> 'in_progress'
        OR f.delete_claimed_at IS NULL
        OR f.delete_claimed_at < now() - interval '15 minutes'
      )
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  upd_msg AS (
    UPDATE public.swap_message_attachments f
    SET delete_status = 'in_progress',
        delete_claimed_at = now()
    FROM claimed_msg
    WHERE f.id = claimed_msg.id
    RETURNING f.id, 'swap_message_attachments'::text AS tbl, 'swap-chat-attachments'::text AS bucket, f.storage_path
  )
  SELECT * FROM upd_msg;

END;
$$;

-- Security Grants
REVOKE ALL ON FUNCTION public.mark_file_storage_deleted(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_file_storage_deleted(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.mark_file_storage_failed(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_file_storage_failed(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_file_cleanup(uuid, text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_file_cleanup(uuid, text, boolean, text) TO service_role;

REVOKE ALL ON FUNCTION public.claim_expired_file_cleanup(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_expired_file_cleanup(integer) TO service_role;

-- ============================================================================
-- 2. CANONICAL FILE LIFECYCLE CRON SCHEDULING
-- ============================================================================
-- Ensures exactly ONE canonical cron job named process-file-lifecycle-hourly exists.
DO $$
DECLARE
  v_has_cron boolean;
  v_has_net boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO v_has_cron;
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') INTO v_has_net;

  IF v_has_cron AND v_has_net THEN
    -- Unschedule all duplicate, legacy, or alternate file cleanup cron jobs
    EXECUTE 'SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN (''old_file_cleanup'', ''legacy_timeout_checker'', ''file_lifecycle_cleanup_job'', ''process-file-lifecycle-hourly'')';

    -- Schedule canonical single file lifecycle cleanup cron job process-file-lifecycle-hourly
    -- Invokes cleanup-storage-files Edge Function via pg_net
    EXECUTE 'SELECT cron.schedule('
      || quote_literal('process-file-lifecycle-hourly') || ', '
      || quote_literal('0 * * * *') || ', '
      || quote_literal('SELECT net.http_post(url := COALESCE(NULLIF(current_setting(''app.settings.edge_function_base_url'', true), ''''), ''http://127.0.0.1:54321/functions/v1'') || ''/cleanup-storage-files'', headers := jsonb_build_object(''Content-Type'', ''application/json'', ''Authorization'', ''Bearer '' || COALESCE(NULLIF(current_setting(''app.settings.service_role_key'', true), ''''), '''')), body := jsonb_build_object(''batch_size'', 500));')
      || ')';
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

NOTIFY pgrst, 'reload schema';
