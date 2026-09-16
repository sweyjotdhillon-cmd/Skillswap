-- Migration 038: File Lifecycle & Chat Attachment System Alignment
-- Strategy: Forward-only migration history preservation.
-- Note on Migration History:
-- Duplicate prefix issue in repository history: 023_fix_creator_attachment_registration.sql & 023_storage_bucket_mime_type_configuration.sql.
-- Live DB has 37 applied migrations. Forward-only strategy preserves all historical migration filenames as applied
-- and registers 038 as the next safe forward migration.

-- 1. Add swaps.accepted_at column for authoritative swap acceptance tracking
ALTER TABLE public.swaps
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_swaps_accepted_at ON public.swaps(accepted_at);

-- 2. Update accept_credit_swap RPC to set accepted_at and establish 48-hour creator attachment expiration
CREATE OR REPLACE FUNCTION public.accept_credit_swap(p_swap_id uuid)
RETURNS public.swaps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_swap public.swaps;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  IF v_swap.status = 'accepted' AND v_swap.participant_id = v_user THEN
    RETURN v_swap;
  END IF;

  IF v_swap.status <> 'open' OR v_swap.requester_id = v_user THEN
    RAISE EXCEPTION 'Swap cannot be accepted.';
  END IF;

  UPDATE public.swaps
  SET participant_id = v_user,
      status = 'accepted',
      accepted_at = COALESCE(accepted_at, now())
  WHERE id = p_swap_id
  RETURNING * INTO v_swap;

  -- Atomically set 48-hour creator attachment expiration timer upon acceptance (ACCEPTANCE EVENT + 48 HOURS)
  UPDATE public.swap_attachment_files
  SET storage_expires_at = COALESCE(v_swap.accepted_at, now()) + interval '48 hours'
  WHERE swap_id = p_swap_id;

  RETURN v_swap;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_credit_swap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_credit_swap(uuid) TO authenticated, service_role;

-- 3. Historical backfill for swaps.accepted_at & swap_attachment_files.storage_expires_at
-- Backfill accepted_at ONLY for non-open historical swaps where acceptance occurred and timestamp is reliable
UPDATE public.swaps
SET accepted_at = COALESCE(submitted_at, completed_at, updated_at)
WHERE status <> 'open' AND accepted_at IS NULL AND (submitted_at IS NOT NULL OR completed_at IS NOT NULL);

-- Backfill creator attachment storage_expires_at to accepted_at + 48 hours for non-open historical swaps
UPDATE public.swap_attachment_files f
SET storage_expires_at = COALESCE(s.accepted_at, COALESCE(s.submitted_at, s.completed_at, s.updated_at, s.created_at)) + interval '48 hours'
FROM public.swaps s
WHERE f.swap_id = s.id
  AND s.status <> 'open'
  AND (f.storage_expires_at IS NULL OR f.storage_expires_at = COALESCE(s.submitted_at, s.completed_at, s.updated_at, s.created_at) + interval '24 hours')
  AND f.storage_deleted_at IS NULL;

-- 4. Update submit_swap_work RPC to set submission file storage_expires_at = SUBMISSION EVENT + 24 HOURS
ALTER TABLE public.swap_submission_files
  ALTER COLUMN storage_expires_at SET DEFAULT (now() + interval '24 hours');

CREATE OR REPLACE FUNCTION public.submit_swap_work(
  p_swap_id uuid,
  p_notes text DEFAULT '',
  p_files jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_swap public.swaps;
  v_submission_id uuid;
  v_file record;
  v_submitted_at timestamptz := now();
  v_auto_release_at timestamptz := v_submitted_at + interval '7 days';
  v_clean_notes text;
  v_file_count integer := 0;
  v_file_path text;
  v_file_name text;
  v_stored_filename text;
  v_mime_type text;
  v_file_size bigint;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  IF v_swap.participant_id IS NULL OR v_swap.participant_id <> v_user THEN
    RAISE EXCEPTION 'Only the designated participant can submit work.';
  END IF;

  IF v_swap.status NOT IN ('accepted', 'submitted') THEN
    RAISE EXCEPTION 'Swap is not eligible for submission (current status: %).', v_swap.status;
  END IF;

  v_clean_notes := trim(COALESCE(p_notes, ''));
  IF p_files IS NOT NULL AND jsonb_typeof(p_files) = 'array' THEN
    v_file_count := jsonb_array_length(p_files);
  END IF;

  IF v_clean_notes = '' AND v_file_count = 0 THEN
    RAISE EXCEPTION 'Submission must contain notes or at least one attachment.';
  END IF;

  IF v_file_count > 5 THEN
    RAISE EXCEPTION 'Exceeded maximum limit of 5 files per submission.';
  END IF;

  UPDATE public.swaps
  SET status = 'submitted',
      submitted_at = COALESCE(submitted_at, v_submitted_at),
      auto_release_at = COALESCE(auto_release_at, v_auto_release_at),
      updated_at = v_submitted_at
  WHERE id = p_swap_id
  RETURNING * INTO v_swap;

  SELECT id INTO v_submission_id
  FROM public.swap_submissions
  WHERE swap_id = p_swap_id;

  IF v_submission_id IS NOT NULL THEN
    UPDATE public.swap_submissions
    SET notes = v_clean_notes,
        updated_at = v_submitted_at
    WHERE id = v_submission_id;

    DELETE FROM public.swap_submission_files
    WHERE submission_id = v_submission_id;
  ELSE
    INSERT INTO public.swap_submissions (
      swap_id,
      submitted_by,
      notes,
      created_at,
      updated_at
    ) VALUES (
      p_swap_id,
      v_user,
      v_clean_notes,
      v_submitted_at,
      v_submitted_at
    )
    RETURNING id INTO v_submission_id;
  END IF;

  IF v_file_count > 0 THEN
    FOR v_file IN SELECT * FROM jsonb_to_recordset(p_files) AS x(
      storage_path text,
      file_name text,
      mime_type text,
      file_size bigint
    )
    LOOP
      v_file_path := trim(COALESCE(v_file.storage_path, ''));
      v_file_name := trim(COALESCE(v_file.file_name, 'unnamed_file'));
      v_mime_type := trim(COALESCE(v_file.mime_type, 'application/octet-stream'));
      v_file_size := COALESCE(v_file.file_size, 0);

      IF v_file_path NOT LIKE 'submissions/' || p_swap_id::text || '/' || v_user::text || '/%' THEN
        RAISE EXCEPTION 'Invalid storage path structure for submission file.';
      END IF;

      v_stored_filename := regexp_replace(v_file_name, '[\0\r\n\t/]', '_', 'g');

      INSERT INTO public.swap_submission_files (
        submission_id,
        storage_path,
        file_name,
        mime_type,
        file_size,
        created_at,
        storage_expires_at
      ) VALUES (
        v_submission_id,
        v_file_path,
        v_stored_filename,
        v_mime_type,
        v_file_size,
        v_submitted_at,
        v_submitted_at + interval '24 hours' -- SUBMISSION EVENT + 24 HOURS
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', v_submission_id,
    'swap_id', p_swap_id,
    'status', v_swap.status,
    'submitted_at', v_swap.submitted_at,
    'auto_release_at', v_swap.auto_release_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_swap_work(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_swap_work(uuid, text, jsonb) TO authenticated, service_role;

-- 5. Add swap_messages.expires_at DEFAULT now() + interval '6 hours'
ALTER TABLE public.swap_messages
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '6 hours');

CREATE INDEX IF NOT EXISTS idx_swap_messages_expires_at ON public.swap_messages(expires_at);

-- Backfill existing swap_messages expires_at = created_at + interval '6 hours' if needed
UPDATE public.swap_messages
SET expires_at = created_at + interval '6 hours'
WHERE expires_at IS NULL;

-- 6. Configure swap-chat-attachments bucket in storage.buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('swap-chat-attachments', 'swap-chat-attachments', false, 26214400, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = NULL;

-- 7. Add lease recovery columns (storage_delete_claimed_at / delete_claimed_at) to lifecycle tables
ALTER TABLE public.swap_submission_files
  ADD COLUMN IF NOT EXISTS storage_delete_claimed_at timestamptz;

ALTER TABLE public.swap_attachment_files
  ADD COLUMN IF NOT EXISTS storage_delete_claimed_at timestamptz;

ALTER TABLE public.swap_message_attachments
  ADD COLUMN IF NOT EXISTS delete_claimed_at timestamptz;

-- 8. RPC: register_swap_message_attachment
CREATE OR REPLACE FUNCTION public.register_swap_message_attachment(
  p_message_id uuid,
  p_swap_id uuid,
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
  v_expires_at timestamptz;
  v_att_id uuid;
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

  SELECT * INTO v_msg FROM public.swap_messages WHERE id = p_message_id AND swap_id = p_swap_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found for this swap.';
  END IF;

  IF v_msg.sender_id <> v_user THEN
    RAISE EXCEPTION 'Unauthorized: Only message sender can attach files.';
  END IF;

  IF p_storage_path IS NULL OR p_storage_path NOT LIKE 'chat-attachments/' || p_swap_id::text || '/' || p_message_id::text || '/%' THEN
    RAISE EXCEPTION 'Invalid storage path structure for chat attachment.';
  END IF;

  IF p_file_size IS NOT NULL AND p_file_size > 26214400 THEN
    RAISE EXCEPTION 'File size exceeds maximum allowed limit of 25MB.';
  END IF;

  v_stored_filename := regexp_replace(COALESCE(p_file_name, 'unnamed_file'), '[\0\r\n\t/]', '_', 'g');
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
    p_swap_id,
    v_user,
    p_storage_path,
    v_stored_filename,
    p_mime_type,
    p_file_size,
    v_expires_at
  )
  RETURNING id INTO v_att_id;

  RETURN jsonb_build_object(
    'success', true,
    'attachment_id', v_att_id,
    'storage_path', p_storage_path,
    'delete_after', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_swap_message_attachment(uuid, uuid, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_swap_message_attachment(uuid, uuid, text, text, text, bigint) TO authenticated, service_role;

-- 9. Update claim_expired_file_cleanup RPC with 15-minute lease recovery & strict bucket mapping
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

REVOKE ALL ON FUNCTION public.claim_expired_file_cleanup(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_expired_file_cleanup(integer) TO service_role;

-- 10. Storage RLS policies for swap-chat-attachments bucket
DROP POLICY IF EXISTS "Chat participants can upload chat attachments" ON storage.objects;
CREATE POLICY "Chat participants can upload chat attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'swap-chat-attachments' AND
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id::text = (storage.foldername(name))[2]
        AND (s.requester_id = auth.uid() OR s.participant_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Chat participants can view chat attachments storage" ON storage.objects;
CREATE POLICY "Chat participants can view chat attachments storage" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'swap-chat-attachments' AND
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id::text = (storage.foldername(name))[2]
        AND (s.requester_id = auth.uid() OR s.participant_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Uploader can delete chat attachments storage" ON storage.objects;
CREATE POLICY "Uploader can delete chat attachments storage" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'swap-chat-attachments' AND
    owner = auth.uid()
  );
