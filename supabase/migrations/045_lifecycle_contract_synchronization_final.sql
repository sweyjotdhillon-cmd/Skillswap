-- Migration 045: Final Lifecycle Synchronization Correction
-- Strategy: Forward-only migration reproducing current canonical live contracts exactly.

-- ============================================================================
-- 1. CANONICAL RPC CONTRACTS
-- ============================================================================

-- Function 1: mark_file_storage_deleted(p_source text, p_file_id uuid) RETURNS boolean
DROP FUNCTION IF EXISTS public.mark_file_storage_deleted(uuid, text);
DROP FUNCTION IF EXISTS public.mark_file_storage_deleted(text, uuid);

CREATE OR REPLACE FUNCTION public.mark_file_storage_deleted(
  p_source text,
  p_file_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated boolean := false;
BEGIN
  IF p_source = 'submission' THEN
    UPDATE public.swap_submission_files
    SET storage_deleted_at = COALESCE(storage_deleted_at, now()),
        storage_delete_status = 'deleted',
        storage_delete_error = NULL
    WHERE id = p_file_id
      AND (storage_delete_status IS DISTINCT FROM 'deleted' OR storage_deleted_at IS NULL);
    v_updated := FOUND;

  ELSIF p_source = 'creator_attachment' THEN
    UPDATE public.swap_attachment_files
    SET storage_deleted_at = COALESCE(storage_deleted_at, now()),
        storage_delete_status = 'deleted',
        storage_delete_error = NULL
    WHERE id = p_file_id
      AND (storage_delete_status IS DISTINCT FROM 'deleted' OR storage_deleted_at IS NULL);
    v_updated := FOUND;

  ELSIF p_source = 'chat_attachment' THEN
    UPDATE public.swap_message_attachments
    SET deleted_at = COALESCE(deleted_at, now()),
        delete_status = 'deleted',
        delete_error = NULL
    WHERE id = p_file_id
      AND (delete_status IS DISTINCT FROM 'deleted' OR deleted_at IS NULL);
    v_updated := FOUND;

  ELSE
    RAISE EXCEPTION 'Invalid source: %. Must be one of submission, creator_attachment, chat_attachment.', p_source;
  END IF;

  RETURN v_updated;
END;
$$;

-- Function 2: mark_file_storage_failed(p_source text, p_file_id uuid, p_error text DEFAULT NULL) RETURNS boolean
DROP FUNCTION IF EXISTS public.mark_file_storage_failed(uuid, text, text);
DROP FUNCTION IF EXISTS public.mark_file_storage_failed(text, uuid, text);

CREATE OR REPLACE FUNCTION public.mark_file_storage_failed(
  p_source text,
  p_file_id uuid,
  p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated boolean := false;
BEGIN
  IF p_source = 'submission' THEN
    UPDATE public.swap_submission_files
    SET storage_delete_status = 'failed',
        storage_delete_error = p_error,
        storage_delete_claimed_at = NULL
    WHERE id = p_file_id
      AND storage_delete_status <> 'deleted';
    v_updated := FOUND;

  ELSIF p_source = 'creator_attachment' THEN
    UPDATE public.swap_attachment_files
    SET storage_delete_status = 'failed',
        storage_delete_error = p_error,
        storage_delete_claimed_at = NULL
    WHERE id = p_file_id
      AND storage_delete_status <> 'deleted';
    v_updated := FOUND;

  ELSIF p_source = 'chat_attachment' THEN
    UPDATE public.swap_message_attachments
    SET delete_status = 'failed',
        delete_error = p_error,
        delete_claimed_at = NULL
    WHERE id = p_file_id
      AND delete_status <> 'deleted';
    v_updated := FOUND;

  ELSE
    RAISE EXCEPTION 'Invalid source: %. Must be one of submission, creator_attachment, chat_attachment.', p_source;
  END IF;

  RETURN v_updated;
END;
$$;

-- Function 3: claim_expired_file_cleanup(p_limit integer DEFAULT 100)
-- Bounded limit, ONE shared total batch limit across source types, recovers stale claims (>15m)
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
DECLARE
  v_limit integer;
  v_remaining integer;
  v_claimed_count integer;
BEGIN
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 100), 1000));
  v_remaining := v_limit;

  -- 1. Claim expired, manually pending, or stuck (>15m) submission files
  IF v_remaining > 0 THEN
    RETURN QUERY
    WITH claimed_sub AS (
      SELECT f.id
      FROM public.swap_submission_files f
      WHERE (f.storage_expires_at <= now() OR f.storage_delete_status = 'pending_deletion')
        AND f.storage_deleted_at IS NULL
        AND f.storage_delete_status <> 'deleted'
        AND (
          f.storage_delete_status <> 'pending'
          OR f.storage_delete_claimed_at IS NULL
          OR f.storage_delete_claimed_at < now() - interval '15 minutes'
        )
      LIMIT v_remaining
      FOR UPDATE SKIP LOCKED
    ),
    upd_sub AS (
      UPDATE public.swap_submission_files f
      SET storage_delete_status = 'pending',
          storage_delete_claimed_at = now()
      FROM claimed_sub
      WHERE f.id = claimed_sub.id
      RETURNING 'submission'::text AS source, f.id AS file_id, f.storage_path
    )
    SELECT * FROM upd_sub;

    GET DIAGNOSTICS v_claimed_count = ROW_COUNT;
    v_remaining := v_remaining - v_claimed_count;
  END IF;

  -- 2. Claim expired, manually pending, or stuck (>15m) creator attachments
  IF v_remaining > 0 THEN
    RETURN QUERY
    WITH claimed_att AS (
      SELECT f.id
      FROM public.swap_attachment_files f
      WHERE ((f.storage_expires_at IS NOT NULL AND f.storage_expires_at <= now()) OR f.storage_delete_status = 'pending_deletion')
        AND f.storage_deleted_at IS NULL
        AND f.storage_delete_status <> 'deleted'
        AND (
          f.storage_delete_status <> 'pending'
          OR f.storage_delete_claimed_at IS NULL
          OR f.storage_delete_claimed_at < now() - interval '15 minutes'
        )
      LIMIT v_remaining
      FOR UPDATE SKIP LOCKED
    ),
    upd_att AS (
      UPDATE public.swap_attachment_files f
      SET storage_delete_status = 'pending',
          storage_delete_claimed_at = now()
      FROM claimed_att
      WHERE f.id = claimed_att.id
      RETURNING 'creator_attachment'::text AS source, f.id AS file_id, f.storage_path
    )
    SELECT * FROM upd_att;

    GET DIAGNOSTICS v_claimed_count = ROW_COUNT;
    v_remaining := v_remaining - v_claimed_count;
  END IF;

  -- 3. Claim expired, manually pending, or stuck (>15m) chat attachments
  IF v_remaining > 0 THEN
    RETURN QUERY
    WITH claimed_msg AS (
      SELECT f.id
      FROM public.swap_message_attachments f
      WHERE (f.delete_after <= now() OR f.delete_status = 'pending_deletion')
        AND f.deleted_at IS NULL
        AND f.delete_status IN ('active', 'failed', 'pending_deletion', 'pending')
        AND (
          f.delete_status <> 'pending'
          OR f.delete_claimed_at IS NULL
          OR f.delete_claimed_at < now() - interval '15 minutes'
        )
      LIMIT v_remaining
      FOR UPDATE SKIP LOCKED
    ),
    upd_msg AS (
      UPDATE public.swap_message_attachments f
      SET delete_status = 'pending',
          delete_claimed_at = now()
      FROM claimed_msg
      WHERE f.id = claimed_msg.id
      RETURNING 'chat_attachment'::text AS source, f.id AS file_id, f.storage_path
    )
    SELECT * FROM upd_msg;
  END IF;

END;
$$;

-- Function 4: register_swap_message_attachment
-- RETURNS swap_message_attachments row
DROP FUNCTION IF EXISTS public.register_swap_message_attachment(uuid, uuid, text, text, text, bigint);
DROP FUNCTION IF EXISTS public.register_swap_message_attachment(uuid, text, text, text, bigint);

CREATE OR REPLACE FUNCTION public.register_swap_message_attachment(
  p_message_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text DEFAULT NULL,
  p_file_size bigint DEFAULT NULL
)
RETURNS public.swap_message_attachments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_msg public.swap_messages;
  v_swap public.swaps;
  v_canonical_mime text;
  v_expires_at timestamptz;
  v_expected_prefix text;
  v_path_filename text;
  v_inserted_row public.swap_message_attachments;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_file_name IS NULL OR trim(p_file_name) = '' THEN
    RAISE EXCEPTION 'File name cannot be empty.';
  END IF;

  IF position('/' in p_file_name) > 0 THEN
    RAISE EXCEPTION 'File name cannot contain slashes.';
  END IF;

  SELECT * INTO v_msg FROM public.swap_messages WHERE id = p_message_id;
  IF v_msg.id IS NULL THEN
    RAISE EXCEPTION 'Message not found.';
  END IF;

  IF v_msg.sender_id <> v_user THEN
    RAISE EXCEPTION 'Unauthorized: Only the message sender can attach files.';
  END IF;

  IF v_msg.expires_at IS NOT NULL AND v_msg.expires_at <= now() THEN
    RAISE EXCEPTION 'Message has expired.';
  END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = v_msg.swap_id;
  IF v_swap.id IS NULL THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  IF v_swap.requester_id <> v_user AND COALESCE(v_swap.participant_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_user THEN
    RAISE EXCEPTION 'Unauthorized: User is not a participant in this swap.';
  END IF;

  IF p_file_size IS NOT NULL AND p_file_size > 26214400 THEN
    RAISE EXCEPTION 'Chat attachment size exceeds maximum allowed 25MB limit.';
  END IF;

  v_canonical_mime := public.get_canonical_mime_type(p_file_name);
  IF v_canonical_mime IS NULL THEN
    RAISE EXCEPTION 'Unsupported or restricted file extension for "%".', p_file_name;
  END IF;

  v_expected_prefix := 'swap-chat-attachments/' || v_msg.swap_id::text || '/' || v_user::text || '/';
  IF p_storage_path IS NULL OR p_storage_path NOT LIKE v_expected_prefix || '%' THEN
    RAISE EXCEPTION 'Invalid storage path structure for chat attachment.';
  END IF;

  v_path_filename := substring(p_storage_path from length(v_expected_prefix) + 1);

  IF v_path_filename NOT SIMILAR TO '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-%'
     OR substring(v_path_filename from 38) <> p_file_name THEN
    RAISE EXCEPTION 'Storage path filename structure must be <uuid>-<file_name>.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.swap_message_attachments WHERE storage_path = p_storage_path) THEN
    RAISE EXCEPTION 'Duplicate storage path detected.';
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
    p_file_name,
    v_canonical_mime,
    p_file_size,
    v_expires_at
  )
  RETURNING * INTO v_inserted_row;

  RETURN v_inserted_row;
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

-- Function 5: send_chat_message_with_attachments
-- Synchronized with canonical path swap-chat-attachments/<swap_id>/<user_id>/<uuid>-<file_name>
DROP FUNCTION IF EXISTS public.send_chat_message_with_attachments(uuid, uuid, text, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.send_chat_message_with_attachments(
  p_swap_id uuid,
  p_recipient_id uuid,
  p_body text DEFAULT '',
  p_attachments jsonb DEFAULT '[]'::jsonb,
  p_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_swap public.swaps;
  v_msg_id uuid;
  v_clean_body text;
  v_att_count integer := 0;
  v_now timestamptz := now();
  v_expires_at timestamptz := v_now + interval '6 hours';
  v_att record;
  v_storage_path text;
  v_file_name text;
  v_stored_filename text;
  v_canonical_mime text;
  v_file_size bigint;
  v_att_id uuid;
  v_expected_prefix text;
  v_created_attachments jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  IF v_swap.requester_id <> v_user AND COALESCE(v_swap.participant_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_user THEN
    RAISE EXCEPTION 'Unauthorized: User is not a participant in this swap.';
  END IF;

  IF p_recipient_id IS NULL OR (p_recipient_id <> v_swap.requester_id AND p_recipient_id <> COALESCE(v_swap.participant_id, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
    RAISE EXCEPTION 'Invalid recipient for this swap.';
  END IF;

  IF p_attachments IS NOT NULL AND jsonb_typeof(p_attachments) = 'array' THEN
    v_att_count := jsonb_array_length(p_attachments);
  END IF;

  IF v_att_count > 5 THEN
    RAISE EXCEPTION 'Exceeded maximum limit of 5 attachments per message.';
  END IF;

  v_clean_body := trim(COALESCE(p_body, ''));
  IF v_clean_body = '' AND v_att_count = 0 THEN
    RAISE EXCEPTION 'Message must contain text or at least one file attachment.';
  END IF;

  IF v_clean_body = '' AND v_att_count > 0 THEN
    v_clean_body := '📎 [File Attachment]';
  END IF;

  v_msg_id := COALESCE(p_message_id, gen_random_uuid());

  INSERT INTO public.swap_messages (
    id,
    swap_id,
    sender_id,
    recipient_id,
    body,
    created_at,
    expires_at
  ) VALUES (
    v_msg_id,
    p_swap_id,
    v_user,
    p_recipient_id,
    v_clean_body,
    v_now,
    v_expires_at
  );

  v_expected_prefix := 'swap-chat-attachments/' || p_swap_id::text || '/' || v_user::text || '/';

  IF v_att_count > 0 THEN
    FOR v_att IN SELECT * FROM jsonb_to_recordset(p_attachments) AS x(
      storage_path text,
      file_name text,
      file_size bigint
    )
    LOOP
      v_storage_path := trim(COALESCE(v_att.storage_path, ''));
      v_file_name := trim(COALESCE(v_att.file_name, 'unnamed_file'));
      v_file_size := COALESCE(v_att.file_size, 0);

      IF v_file_size > 26214400 THEN
        RAISE EXCEPTION 'File size exceeds maximum allowed limit of 25MB.';
      END IF;

      IF v_storage_path IS NULL OR v_storage_path NOT LIKE v_expected_prefix || '%' THEN
        RAISE EXCEPTION 'Invalid storage path structure for chat attachment.';
      END IF;

      -- Server-side MIME validation: do NOT trust client p_mime_type
      v_canonical_mime := public.get_canonical_mime_type(v_file_name);
      IF v_canonical_mime IS NULL THEN
        RAISE EXCEPTION 'Invalid file format or upload rejected: unsupported file extension for "%".', v_file_name;
      END IF;

      v_stored_filename := regexp_replace(v_file_name, '[\0\r\n\t/]', '_', 'g');

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
        v_msg_id,
        p_swap_id,
        v_user,
        v_storage_path,
        v_stored_filename,
        v_canonical_mime,
        v_file_size,
        v_expires_at
      )
      RETURNING id INTO v_att_id;

      v_created_attachments := v_created_attachments || jsonb_build_object(
        'id', v_att_id,
        'message_id', v_msg_id,
        'swap_id', p_swap_id,
        'uploaded_by', v_user,
        'storage_path', v_storage_path,
        'file_name', v_stored_filename,
        'mime_type', v_canonical_mime,
        'file_size', v_file_size,
        'created_at', v_now,
        'delete_after', v_expires_at,
        'delete_status', 'active'
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', jsonb_build_object(
      'id', v_msg_id,
      'swap_id', p_swap_id,
      'sender_id', v_user,
      'recipient_id', p_recipient_id,
      'body', v_clean_body,
      'created_at', v_now,
      'expires_at', v_expires_at,
      'attachments', v_created_attachments
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_chat_message_with_attachments(uuid, uuid, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_chat_message_with_attachments(uuid, uuid, text, jsonb, uuid) TO authenticated, service_role;

-- ============================================================================
-- 2. CANONICAL FILE LIFECYCLE CRON SCHEDULING
-- ============================================================================
-- Single canonical cron job process-file-lifecycle-hourly at schedule 5 * * * *
-- Calls https://czpcaffwtmlxvplpanon.supabase.co/functions/v1/cleanup-storage-files with {"batch_size":100}
-- Authorization bearer token resolved dynamically at runtime from Vault (cleanup_worker_key)
DO $$
DECLARE
  v_has_cron boolean;
  v_has_net boolean;
  v_has_vault boolean;
  v_cmd text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO v_has_cron;
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') INTO v_has_net;

  IF v_has_cron AND v_has_net THEN
    -- Unschedules all legacy, duplicate, or alternate file cleanup cron jobs
    EXECUTE 'SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN (''old_file_cleanup'', ''legacy_timeout_checker'', ''file_lifecycle_cleanup_job'', ''process-file-lifecycle-hourly'')';

    SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') INTO v_has_vault;

    IF v_has_vault THEN
      v_cmd := $cmd$
        SELECT net.http_post(
          url := 'https://czpcaffwtmlxvplpanon.supabase.co/functions/v1/cleanup-storage-files',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name = 'cleanup_worker_key'
              LIMIT 1
            )
          ),
          body := jsonb_build_object('limit', 100)
        );
      $cmd$;

      EXECUTE 'SELECT cron.schedule(''process-file-lifecycle-hourly'', ''5 * * * *'', ' || quote_literal(v_cmd) || ')';
      RAISE NOTICE 'process-file-lifecycle-hourly cron job successfully scheduled.';
    ELSE
      RAISE NOTICE 'Skipping cron scheduling: vault schema not found.';
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Unable to configure pg_cron job process-file-lifecycle-hourly: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
