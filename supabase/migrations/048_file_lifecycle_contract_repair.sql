-- Migration 048: Final File Lifecycle Contract Repair
-- Authoritative Database Contract & Lifecycle Expiry Policy Enforcement
-- Ref: project_ref czpcaffwtmlxvplpanon

-- 1. Ensure accept_credit_swap RPC explicitly sets accepted_at and creator attachment storage_expires_at = accepted_at + 48 hours
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
    RAISE EXCEPTION 'Authentication required to accept swap';
  END IF;

  -- Lock swap row for update
  SELECT * INTO v_swap
  FROM public.swaps
  WHERE id = p_swap_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap % not found', p_swap_id;
  END IF;

  IF v_swap.requester_id = v_user THEN
    RAISE EXCEPTION 'Cannot accept your own swap request';
  END IF;

  IF v_swap.status <> 'open' THEN
    RAISE EXCEPTION 'Swap is no longer open for acceptance (status: %)', v_swap.status;
  END IF;

  -- Update swap status and set accepted_at timestamp
  UPDATE public.swaps
  SET status = 'accepted',
      participant_id = v_user,
      accepted_at = COALESCE(accepted_at, now()),
      updated_at = now()
  WHERE id = p_swap_id
  RETURNING * INTO v_swap;

  -- Set 48-hour creator attachment expiration timer strictly from acceptance event (accepted_at + 48h)
  UPDATE public.swap_attachment_files
  SET storage_expires_at = COALESCE(v_swap.accepted_at, now()) + interval '48 hours'
  WHERE swap_id = p_swap_id;

  RETURN v_swap;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_credit_swap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_credit_swap(uuid) TO authenticated, service_role;


-- 2. Verify and enforce submit_swap_work RPC establishes submission expiry from actual submission event (now() + 24 hours)
CREATE OR REPLACE FUNCTION public.submit_swap_work(
  p_swap_id uuid,
  p_notes text DEFAULT NULL,
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
  v_submission public.swap_submissions;
  v_file_rec jsonb;
  v_notes text := NULLIF(trim(p_notes), '');
  v_file_count integer := 0;
  v_storage_path text;
  v_file_name text;
  v_mime_type text;
  v_file_size bigint;
  v_submitted_files jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_swap
  FROM public.swaps
  WHERE id = p_swap_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found';
  END IF;

  IF v_swap.participant_id IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'Only the assigned swap participant can submit work';
  END IF;

  IF v_swap.status <> 'accepted' THEN
    RAISE EXCEPTION 'Swap must be in accepted status to submit work (current: %)', v_swap.status;
  END IF;

  IF p_files IS NOT NULL AND jsonb_typeof(p_files) = 'array' THEN
    v_file_count := jsonb_array_length(p_files);
  END IF;

  IF v_notes IS NULL AND v_file_count = 0 THEN
    RAISE EXCEPTION 'Submission must contain notes or at least one file attachment';
  END IF;

  IF v_file_count > 5 THEN
    RAISE EXCEPTION 'Maximum 5 files allowed per submission';
  END IF;

  -- Create or update submission
  INSERT INTO public.swap_submissions (swap_id, submitted_by, notes, updated_at)
  VALUES (p_swap_id, v_user, v_notes, now())
  ON CONFLICT (swap_id) DO UPDATE
  SET submitted_by = EXCLUDED.submitted_by,
      notes = EXCLUDED.notes,
      updated_at = now()
  RETURNING * INTO v_submission;

  -- Process submission attachments with exact 24h retention from submission event
  IF v_file_count > 0 THEN
    FOR v_file_rec IN SELECT * FROM jsonb_array_elements(p_files)
    LOOP
      v_storage_path := v_file_rec->>'storage_path';
      v_file_name := v_file_rec->>'file_name';
      v_mime_type := public.get_canonical_mime_type(v_file_name);
      v_file_size := (v_file_rec->>'file_size')::bigint;

      IF v_storage_path IS NULL OR v_file_name IS NULL THEN
        RAISE EXCEPTION 'Invalid file payload: missing storage_path or file_name';
      END IF;

      INSERT INTO public.swap_submission_files (
        submission_id,
        storage_path,
        file_name,
        mime_type,
        file_size,
        storage_expires_at
      ) VALUES (
        v_submission.id,
        v_storage_path,
        v_file_name,
        v_mime_type,
        v_file_size,
        now() + interval '24 hours'
      );
    END LOOP;
  END IF;

  -- Transition swap status to submitted and set auto_release_at
  UPDATE public.swaps
  SET status = 'submitted',
      submitted_at = now(),
      auto_release_at = now() + interval '7 days',
      updated_at = now()
  WHERE id = p_swap_id;

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', v_submission.id,
    'status', 'submitted'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_swap_work(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_swap_work(uuid, text, jsonb) TO authenticated, service_role;


-- 3. Verify and enforce send_chat_message_with_attachments RPC establishes 6-hour chat attachment retention (delete_after = now() + 6 hours)
CREATE OR REPLACE FUNCTION public.send_chat_message_with_attachments(
  p_swap_id uuid,
  p_recipient_id uuid,
  p_body text DEFAULT NULL,
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
  v_message_id uuid := COALESCE(p_message_id, gen_random_uuid());
  v_message_rec public.swap_messages;
  v_body text := NULLIF(trim(p_body), '');
  v_att_count integer := 0;
  v_file jsonb;
  v_path text;
  v_name text;
  v_size bigint;
  v_mime text;
  v_expected_path text;
  v_att_rec public.swap_message_attachments;
  v_att_list jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_recipient_id IS NULL OR p_recipient_id = v_user THEN
    RAISE EXCEPTION 'Invalid message recipient';
  END IF;

  SELECT * INTO v_swap
  FROM public.swaps
  WHERE id = p_swap_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found';
  END IF;

  IF v_swap.status = 'open' THEN
    IF v_user <> v_swap.requester_id AND p_recipient_id <> v_swap.requester_id THEN
      RAISE EXCEPTION 'Messages on open swaps must be directed to the swap requester';
    END IF;
  ELSE
    IF NOT (
      (v_user = v_swap.requester_id AND p_recipient_id = v_swap.participant_id) OR
      (v_user = v_swap.participant_id AND p_recipient_id = v_swap.requester_id)
    ) THEN
      RAISE EXCEPTION 'Not authorized to chat on this swap';
    END IF;
  END IF;

  IF p_attachments IS NOT NULL AND jsonb_typeof(p_attachments) = 'array' THEN
    v_att_count := jsonb_array_length(p_attachments);
  END IF;

  IF v_body IS NULL AND v_att_count = 0 THEN
    RAISE EXCEPTION 'Message must contain body text or at least one file attachment';
  END IF;

  IF v_att_count > 5 THEN
    RAISE EXCEPTION 'Maximum 5 attachments allowed per chat message';
  END IF;

  INSERT INTO public.swap_messages (
    id,
    swap_id,
    sender_id,
    recipient_id,
    body,
    created_at,
    expires_at
  ) VALUES (
    v_message_id,
    p_swap_id,
    v_user,
    p_recipient_id,
    COALESCE(v_body, 'Attachment'),
    now(),
    now() + interval '6 hours'
  )
  RETURNING * INTO v_message_rec;

  IF v_att_count > 0 THEN
    FOR v_file IN SELECT * FROM jsonb_array_elements(p_attachments)
    LOOP
      v_path := v_file->>'storage_path';
      v_name := v_file->>'file_name';
      v_size := (v_file->>'file_size')::bigint;

      IF v_path IS NULL OR v_name IS NULL THEN
        RAISE EXCEPTION 'Invalid attachment metadata: missing path or name';
      END IF;

      v_expected_path := 'swap-chat-attachments/' || p_swap_id::text || '/' || v_user::text || '/';
      IF position(v_expected_path in v_path) <> 1 THEN
        RAISE EXCEPTION 'Invalid storage path convention: %', v_path;
      END IF;

      v_mime := public.get_canonical_mime_type(v_name);

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
        v_message_id,
        p_swap_id,
        v_user,
        v_path,
        v_name,
        v_mime,
        v_size,
        now() + interval '6 hours'
      )
      RETURNING * INTO v_att_rec;

      v_att_list := v_att_list || jsonb_build_object(
        'id', v_att_rec.id,
        'message_id', v_att_rec.message_id,
        'swap_id', v_att_rec.swap_id,
        'uploaded_by', v_att_rec.uploaded_by,
        'storage_path', v_att_rec.storage_path,
        'file_name', v_att_rec.file_name,
        'mime_type', v_att_rec.mime_type,
        'file_size', v_att_rec.file_size,
        'created_at', v_att_rec.created_at,
        'delete_after', v_att_rec.delete_after,
        'deleted_at', v_att_rec.deleted_at,
        'delete_status', v_att_rec.delete_status
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', jsonb_build_object(
      'id', v_message_rec.id,
      'swap_id', v_message_rec.swap_id,
      'sender_id', v_message_rec.sender_id,
      'recipient_id', v_message_rec.recipient_id,
      'body', v_message_rec.body,
      'created_at', v_message_rec.created_at,
      'expires_at', v_message_rec.expires_at,
      'attachments', v_att_list
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_chat_message_with_attachments(uuid, uuid, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_chat_message_with_attachments(uuid, uuid, text, jsonb, uuid) TO authenticated, service_role;
