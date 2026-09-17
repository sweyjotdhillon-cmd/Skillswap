-- Migration 044: Phase A Lifecycle Contract Synchronization & Repository Realignment
-- Strategy: Forward-only migration history preservation.

-- ============================================================================
-- 1. CANONICAL RPC CONTRACTS
-- ============================================================================

-- Function 1: mark_file_storage_deleted(p_source text, p_file_id uuid)
DROP FUNCTION IF EXISTS public.mark_file_storage_deleted(uuid, text);
DROP FUNCTION IF EXISTS public.mark_file_storage_deleted(text, uuid);

CREATE OR REPLACE FUNCTION public.mark_file_storage_deleted(
  p_source text,
  p_file_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_source IN ('submission', 'swap_submission_files') THEN
    UPDATE public.swap_submission_files
    SET storage_deleted_at = COALESCE(storage_deleted_at, now()),
        storage_delete_status = 'deleted',
        storage_delete_error = NULL
    WHERE id = p_file_id;

  ELSIF p_source IN ('creator_attachment', 'swap_attachment_files') THEN
    UPDATE public.swap_attachment_files
    SET storage_deleted_at = COALESCE(storage_deleted_at, now()),
        storage_delete_status = 'deleted',
        storage_delete_error = NULL
    WHERE id = p_file_id;

  ELSIF p_source IN ('chat_attachment', 'swap_message_attachments') THEN
    UPDATE public.swap_message_attachments
    SET deleted_at = COALESCE(deleted_at, now()),
        delete_status = 'deleted',
        delete_error = NULL
    WHERE id = p_file_id;
  END IF;
END;
$$;

-- Function 2: mark_file_storage_failed(p_source text, p_file_id uuid, p_error text DEFAULT NULL)
DROP FUNCTION IF EXISTS public.mark_file_storage_failed(uuid, text, text);
DROP FUNCTION IF EXISTS public.mark_file_storage_failed(text, uuid, text);

CREATE OR REPLACE FUNCTION public.mark_file_storage_failed(
  p_source text,
  p_file_id uuid,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_source IN ('submission', 'swap_submission_files') THEN
    UPDATE public.swap_submission_files
    SET storage_delete_status = 'failed',
        storage_delete_error = p_error,
        storage_delete_claimed_at = NULL
    WHERE id = p_file_id;

  ELSIF p_source IN ('creator_attachment', 'swap_attachment_files') THEN
    UPDATE public.swap_attachment_files
    SET storage_delete_status = 'failed',
        storage_delete_error = p_error,
        storage_delete_claimed_at = NULL
    WHERE id = p_file_id;

  ELSIF p_source IN ('chat_attachment', 'swap_message_attachments') THEN
    UPDATE public.swap_message_attachments
    SET delete_status = 'failed',
        delete_error = p_error,
        delete_claimed_at = NULL
    WHERE id = p_file_id;
  END IF;
END;
$$;

-- Function 3: claim_expired_file_cleanup(p_limit integer DEFAULT 100)
DROP FUNCTION IF EXISTS public.claim_expired_file_cleanup(integer);

CREATE OR REPLACE FUNCTION public.claim_expired_file_cleanup(p_limit integer DEFAULT 100)
RETURNS TABLE (
  source text,
  file_id uuid,
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
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  upd_sub AS (
    UPDATE public.swap_submission_files f
    SET storage_delete_status = 'in_progress',
        storage_delete_claimed_at = now()
    FROM claimed_sub
    WHERE f.id = claimed_sub.id
    RETURNING 'submission'::text AS source, f.id AS file_id, f.storage_path
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
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  upd_att AS (
    UPDATE public.swap_attachment_files f
    SET storage_delete_status = 'in_progress',
        storage_delete_claimed_at = now()
    FROM claimed_att
    WHERE f.id = claimed_att.id
    RETURNING 'creator_attachment'::text AS source, f.id AS file_id, f.storage_path
  )
  SELECT * FROM upd_att;

  -- 3. Claim expired, manually pending, or stuck (>15m) chat attachments
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
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  upd_msg AS (
    UPDATE public.swap_message_attachments f
    SET delete_status = 'in_progress',
        delete_claimed_at = now()
    FROM claimed_msg
    WHERE f.id = claimed_msg.id
    RETURNING 'chat_attachment'::text AS source, f.id AS file_id, f.storage_path
  )
  SELECT * FROM upd_msg;

END;
$$;

-- Function 4: register_swap_message_attachment (5-argument canonical signature)
DROP FUNCTION IF EXISTS public.register_swap_message_attachment(uuid, uuid, text, text, text, bigint);
DROP FUNCTION IF EXISTS public.register_swap_message_attachment(uuid, text, text, text, bigint);

CREATE OR REPLACE FUNCTION public.register_swap_message_attachment(
  p_message_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text DEFAULT NULL,
  p_file_size bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_msg public.swap_messages;
  v_swap public.swaps;
  v_stored_filename text;
  v_canonical_mime text;
  v_expires_at timestamptz;
  v_att_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_msg FROM public.swap_messages WHERE id = p_message_id;
  IF v_msg.id IS NULL THEN
    RAISE EXCEPTION 'Message not found.';
  END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = v_msg.swap_id;
  IF v_swap.id IS NULL THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  IF v_swap.requester_id <> v_user AND v_swap.participant_id <> v_user THEN
    RAISE EXCEPTION 'User is not a participant in this swap.';
  END IF;

  IF p_file_size IS NOT NULL AND p_file_size > 26214400 THEN
    RAISE EXCEPTION 'Chat attachment size exceeds maximum allowed 25MB limit.';
  END IF;

  v_stored_filename := COALESCE(NULLIF(p_file_name, ''), 'attachment');
  v_canonical_mime := public.get_canonical_mime_type(v_stored_filename);
  IF v_canonical_mime IS NULL THEN
    RAISE EXCEPTION 'Unsupported or restricted file extension for "%".', v_stored_filename;
  END IF;

  IF p_storage_path NOT LIKE 'chat-attachments/' || v_msg.swap_id::text || '/%' THEN
    RAISE EXCEPTION 'Invalid storage path structure for chat attachment.';
  END IF;

  v_expires_at := COALESCE(v_msg.expires_at, v_msg.created_at + interval '6 hours');

  INSERT INTO public.swap_message_attachments (
    message_id,
    swap_id,
    uploaded_by,
    storage_path,
    file_name,
    mime_type,
    file_size,
    delete_after
  ) VALUES (
    p_message_id,
    v_msg.swap_id,
    v_user,
    p_storage_path,
    v_stored_filename,
    v_canonical_mime,
    p_file_size,
    v_expires_at
  )
  RETURNING id INTO v_att_id;

  RETURN jsonb_build_object(
    'success', true,
    'attachment_id', v_att_id,
    'expires_at', v_expires_at
  );
END;
$$;

-- Security Grants
REVOKE ALL ON FUNCTION public.mark_file_storage_deleted(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_file_storage_deleted(text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.mark_file_storage_failed(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_file_storage_failed(text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.claim_expired_file_cleanup(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_expired_file_cleanup(integer) TO service_role;

REVOKE ALL ON FUNCTION public.register_swap_message_attachment(uuid, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_swap_message_attachment(uuid, text, text, text, bigint) TO authenticated, service_role;

-- ============================================================================
-- 2. CANONICAL FILE LIFECYCLE CRON SCHEDULING
-- ============================================================================
-- Single canonical cron job named process-file-lifecycle-hourly invoking cleanup-storage-files Edge Function.
-- Secure credential resolution via app settings or Supabase Vault without unsafe localhost or empty key fallbacks.
DO $$
DECLARE
  v_has_cron boolean;
  v_has_net boolean;
  v_edge_url text;
  v_service_key text;
  v_has_vault boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO v_has_cron;
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') INTO v_has_net;

  IF v_has_cron AND v_has_net THEN
    -- Unschedules all legacy, duplicate, or alternate file cleanup cron jobs
    EXECUTE 'SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN (''old_file_cleanup'', ''legacy_timeout_checker'', ''file_lifecycle_cleanup_job'', ''process-file-lifecycle-hourly'')';

    -- Resolve credentials securely from settings or Supabase Vault
    v_edge_url := NULLIF(current_setting('app.settings.edge_function_base_url', true), '');
    v_service_key := NULLIF(current_setting('app.settings.service_role_key', true), '');

    SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') INTO v_has_vault;
    IF v_has_vault THEN
      IF v_edge_url IS NULL THEN
        BEGIN
          EXECUTE 'SELECT secret FROM vault.decrypted_secrets WHERE name = ''edge_function_base_url'' LIMIT 1' INTO v_edge_url;
        EXCEPTION WHEN OTHERS THEN
          v_edge_url := NULL;
        END;
      END IF;
      IF v_service_key IS NULL THEN
        BEGIN
          EXECUTE 'SELECT secret FROM vault.decrypted_secrets WHERE name = ''service_role_key'' LIMIT 1' INTO v_service_key;
        EXCEPTION WHEN OTHERS THEN
          v_service_key := NULL;
        END;
      END IF;
    END IF;

    IF v_edge_url IS NOT NULL AND v_service_key IS NOT NULL THEN
      EXECUTE 'SELECT cron.schedule('
        || quote_literal('process-file-lifecycle-hourly') || ', '
        || quote_literal('0 * * * *') || ', '
        || quote_literal('SELECT net.http_post(url := ' || quote_literal(v_edge_url || '/cleanup-storage-files') || ', headers := jsonb_build_object(''Content-Type'', ''application/json'', ''Authorization'', ''Bearer ' || v_service_key || '''), body := jsonb_build_object(''limit'', 100));')
        || ')';
      RAISE NOTICE 'process-file-lifecycle-hourly cron job successfully scheduled in pg_cron.';
    ELSE
      RAISE NOTICE 'Skipping process-file-lifecycle-hourly cron scheduling: edge_function_base_url or service_role_key is not configured in app.settings or Vault.';
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Unable to configure pg_cron job process-file-lifecycle-hourly: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
