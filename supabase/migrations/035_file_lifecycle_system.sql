-- Migration 035: File Lifecycle System (Retention, Storage Cleanup, Chat Attachments, Tombstones)

-- 1. Add lifecycle columns to public.swap_submission_files if missing
ALTER TABLE public.swap_submission_files
  ADD COLUMN IF NOT EXISTS storage_expires_at timestamptz DEFAULT (now() + interval '48 hours'),
  ADD COLUMN IF NOT EXISTS storage_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS storage_delete_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS storage_delete_error text;

-- 2. Add lifecycle columns to public.swap_attachment_files if missing
ALTER TABLE public.swap_attachment_files
  ADD COLUMN IF NOT EXISTS available_from timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS storage_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS storage_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS storage_delete_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS storage_delete_error text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.swap_submission_files TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.swap_attachment_files TO authenticated, service_role;

-- 3. Create public.swap_message_attachments for chat attachments
CREATE TABLE IF NOT EXISTS public.swap_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.swap_messages(id) ON DELETE CASCADE,
  swap_id uuid NOT NULL REFERENCES public.swaps(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint CHECK (file_size >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  delete_after timestamptz NOT NULL DEFAULT (now() + interval '6 hours'),
  deleted_at timestamptz,
  delete_status text NOT NULL DEFAULT 'active',
  delete_error text
);

CREATE INDEX IF NOT EXISTS idx_swap_message_attachments_swap_id ON public.swap_message_attachments(swap_id);
CREATE INDEX IF NOT EXISTS idx_swap_message_attachments_message_id ON public.swap_message_attachments(message_id);

ALTER TABLE public.swap_message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swap_message_attachments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Swap participants can view chat attachments" ON public.swap_message_attachments;
CREATE POLICY "Swap participants can view chat attachments" ON public.swap_message_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id = swap_message_attachments.swap_id
        AND (s.requester_id = auth.uid() OR s.participant_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Sender can insert chat attachments" ON public.swap_message_attachments;
CREATE POLICY "Sender can insert chat attachments" ON public.swap_message_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id = swap_message_attachments.swap_id
        AND (s.requester_id = auth.uid() OR s.participant_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Sender can update chat attachments" ON public.swap_message_attachments;
CREATE POLICY "Sender can update chat attachments" ON public.swap_message_attachments
  FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.swap_message_attachments TO authenticated, service_role;

-- 4. Update accept_credit_swap to set storage_expires_at = accepted_at + 24h atomically
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
  SET participant_id = v_user, status = 'accepted'
  WHERE id = p_swap_id
  RETURNING * INTO v_swap;

  -- Atomically set 24-hour creator attachment expiration timer upon acceptance
  UPDATE public.swap_attachment_files
  SET storage_expires_at = COALESCE(storage_expires_at, now() + interval '24 hours')
  WHERE swap_id = p_swap_id;

  RETURN v_swap;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_credit_swap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_credit_swap(uuid) TO authenticated, service_role;

-- 5. Backfill storage_expires_at for legacy non-open creator attachments
UPDATE public.swap_attachment_files f
SET storage_expires_at = COALESCE(f.storage_expires_at, s.created_at + interval '24 hours')
FROM public.swaps s
WHERE f.swap_id = s.id AND s.status <> 'open' AND f.storage_expires_at IS NULL;

-- 6. RPC: claim_expired_file_cleanup
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
  -- 1. Claim expired or manually pending submission files
  RETURN QUERY
  WITH claimed_sub AS (
    SELECT f.id
    FROM public.swap_submission_files f
    WHERE (f.storage_expires_at <= now() OR f.storage_delete_status = 'pending_deletion')
      AND (f.storage_deleted_at IS NULL AND f.storage_delete_status <> 'deleted')
      AND f.storage_delete_status <> 'in_progress'
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  upd_sub AS (
    UPDATE public.swap_submission_files f
    SET storage_delete_status = 'in_progress'
    FROM claimed_sub
    WHERE f.id = claimed_sub.id
    RETURNING f.id, 'swap_submission_files'::text AS tbl, 'swap-submissions'::text AS bucket, f.storage_path
  )
  SELECT * FROM upd_sub;

  -- 2. Claim expired or manually pending creator attachments
  RETURN QUERY
  WITH claimed_att AS (
    SELECT f.id
    FROM public.swap_attachment_files f
    WHERE ((f.storage_expires_at IS NOT NULL AND f.storage_expires_at <= now()) OR f.storage_delete_status = 'pending_deletion')
      AND (f.storage_deleted_at IS NULL AND f.storage_delete_status <> 'deleted')
      AND f.storage_delete_status <> 'in_progress'
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  upd_att AS (
    UPDATE public.swap_attachment_files f
    SET storage_delete_status = 'in_progress'
    FROM claimed_att
    WHERE f.id = claimed_att.id
    RETURNING f.id, 'swap_attachment_files'::text AS tbl, 'swap-attachments'::text AS bucket, f.storage_path
  )
  SELECT * FROM upd_att;

  -- 3. Claim expired or manually pending chat attachments
  RETURN QUERY
  WITH claimed_msg AS (
    SELECT f.id
    FROM public.swap_message_attachments f
    WHERE (f.delete_after <= now() OR f.delete_status = 'pending_deletion')
      AND (f.deleted_at IS NULL AND f.delete_status <> 'deleted')
      AND f.delete_status <> 'in_progress'
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  upd_msg AS (
    UPDATE public.swap_message_attachments f
    SET delete_status = 'in_progress'
    FROM claimed_msg
    WHERE f.id = claimed_msg.id
    RETURNING f.id, 'swap_message_attachments'::text AS tbl, 'swap-attachments'::text AS bucket, f.storage_path
  )
  SELECT * FROM upd_msg;

END;
$$;

REVOKE ALL ON FUNCTION public.claim_expired_file_cleanup(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_expired_file_cleanup(integer) TO service_role;

-- 7. RPC: finalize_file_cleanup
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
  IF p_table_name = 'swap_submission_files' THEN
    IF p_success THEN
      UPDATE public.swap_submission_files
      SET storage_deleted_at = COALESCE(storage_deleted_at, now()),
          storage_delete_status = 'deleted',
          storage_delete_error = NULL
      WHERE id = p_file_id;
    ELSE
      UPDATE public.swap_submission_files
      SET storage_delete_status = 'failed',
          storage_delete_error = p_error
      WHERE id = p_file_id;
    END IF;

  ELSIF p_table_name = 'swap_attachment_files' THEN
    IF p_success THEN
      UPDATE public.swap_attachment_files
      SET storage_deleted_at = COALESCE(storage_deleted_at, now()),
          storage_delete_status = 'deleted',
          storage_delete_error = NULL
      WHERE id = p_file_id;
    ELSE
      UPDATE public.swap_attachment_files
      SET storage_delete_status = 'failed',
          storage_delete_error = p_error
      WHERE id = p_file_id;
    END IF;

  ELSIF p_table_name = 'swap_message_attachments' THEN
    IF p_success THEN
      UPDATE public.swap_message_attachments
      SET deleted_at = COALESCE(deleted_at, now()),
          delete_status = 'deleted',
          delete_error = NULL
      WHERE id = p_file_id;
    ELSE
      UPDATE public.swap_message_attachments
      SET delete_status = 'failed',
          delete_error = p_error
      WHERE id = p_file_id;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_file_cleanup(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_file_cleanup(uuid, text, boolean, text) TO service_role;

-- 8. RPC: delete_chat_attachment_manual
CREATE OR REPLACE FUNCTION public.delete_chat_attachment_manual(p_attachment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_attachment public.swap_message_attachments;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_attachment
  FROM public.swap_message_attachments
  WHERE id = p_attachment_id AND uploaded_by = v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attachment not found or access denied.';
  END IF;

  IF now() >= v_attachment.delete_after THEN
    RAISE EXCEPTION 'Manual deletion period (6 hours) has expired.';
  END IF;

  UPDATE public.swap_message_attachments
  SET delete_status = 'pending_deletion'
  WHERE id = p_attachment_id;

  RETURN jsonb_build_object(
    'success', true,
    'attachment_id', v_attachment.id,
    'storage_path', v_attachment.storage_path,
    'swap_id', v_attachment.swap_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_chat_attachment_manual(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_chat_attachment_manual(uuid) TO authenticated, service_role;
