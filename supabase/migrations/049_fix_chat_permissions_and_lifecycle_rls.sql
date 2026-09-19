-- Migration 049: Canonical Fix for Chat Permissions, RLS Policies, and Atomic RPCs
-- Description: Synchronize swap_messages and swap_message_attachments RLS policies and RPCs.
--              Enforces bidirectional messaging for open swaps (applicant <-> requester) and
--              active swaps (requester <-> participant), fixes tautological predicate on chat attachments,
--              and ensures expired files/messages never trigger generic RLS permission errors.

-- ============================================================================
-- 1. SWAP_MESSAGES RLS POLICIES & PERMISSIONS
-- ============================================================================
ALTER TABLE public.swap_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swap_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Swap participants can read swap messages" ON public.swap_messages;
DROP POLICY IF EXISTS "Users can read their own swap messages" ON public.swap_messages;

CREATE POLICY "Users can read their own swap messages" ON public.swap_messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid() OR recipient_id = auth.uid()
  );

DROP POLICY IF EXISTS "Participants can send swap messages" ON public.swap_messages;

CREATE POLICY "Participants can send swap messages" ON public.swap_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    sender_id <> recipient_id AND
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id = swap_messages.swap_id
        AND (
          -- OPEN swap: Non-requester applicant sending to requester OR Requester replying to applicant
          (s.status = 'open' AND (
            (s.requester_id = recipient_id AND auth.uid() <> s.requester_id) OR
            (s.requester_id = auth.uid() AND recipient_id <> s.requester_id)
          ))
          OR
          -- ACTIVE swap: Requester <-> Participant
          (s.status IN ('accepted', 'submitted', 'completed') AND
           ((s.requester_id = auth.uid() AND s.participant_id = recipient_id) OR
            (s.participant_id = auth.uid() AND s.requester_id = recipient_id)))
        )
    )
  );

DROP POLICY IF EXISTS "Recipients can update read status" ON public.swap_messages;

CREATE POLICY "Recipients can update read status" ON public.swap_messages
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.swap_messages TO authenticated, service_role;

-- ============================================================================
-- 2. SWAP_MESSAGE_ATTACHMENTS RLS POLICIES & PERMISSIONS
-- ============================================================================
ALTER TABLE public.swap_message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swap_message_attachments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Swap participants can view chat attachments" ON public.swap_message_attachments;

CREATE POLICY "Swap participants can view chat attachments" ON public.swap_message_attachments
  FOR SELECT TO authenticated
  USING (
    uploaded_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.swap_messages m
      WHERE m.id = swap_message_attachments.message_id
        AND (m.sender_id = auth.uid() OR m.recipient_id = auth.uid())
    ) OR
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
      SELECT 1 FROM public.swap_messages m
      WHERE m.id = swap_message_attachments.message_id
        AND m.swap_id = swap_message_attachments.swap_id
        AND m.sender_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Sender can update chat attachments" ON public.swap_message_attachments;

CREATE POLICY "Sender can update chat attachments" ON public.swap_message_attachments
  FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.swap_message_attachments TO authenticated, service_role;

-- ============================================================================
-- 3. SYNCHRONIZE send_chat_message_with_attachments SECURITY DEFINER RPC
-- ============================================================================
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

  -- Validate participant / authorization rules based on swap status
  IF v_swap.status = 'open' THEN
    IF v_user = v_swap.requester_id THEN
      IF p_recipient_id IS NULL OR p_recipient_id = v_swap.requester_id THEN
        RAISE EXCEPTION 'Invalid recipient: Swap creator cannot send open-swap messages to themselves.';
      END IF;
    ELSE
      IF p_recipient_id <> v_swap.requester_id THEN
        RAISE EXCEPTION 'Invalid recipient: Open swap messages must be addressed to the swap requester.';
      END IF;
    END IF;
  ELSIF v_swap.status IN ('accepted', 'submitted', 'completed') THEN
    IF v_swap.requester_id <> v_user AND COALESCE(v_swap.participant_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_user THEN
      RAISE EXCEPTION 'Unauthorized: User is not a participant in this swap.';
    END IF;
    IF p_recipient_id IS NULL OR (p_recipient_id <> v_swap.requester_id AND p_recipient_id <> COALESCE(v_swap.participant_id, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
      RAISE EXCEPTION 'Invalid recipient for this swap.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Swap is not active.';
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
-- 4. SYNCHRONIZE register_swap_message_attachment RPC FOR OPEN & ACTIVE SWAPS
-- ============================================================================
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

  -- Open swap applicant or requester, OR active swap requester or participant
  IF v_swap.status = 'open' THEN
    IF v_swap.requester_id <> v_user AND v_msg.sender_id <> v_user THEN
      RAISE EXCEPTION 'Unauthorized: User is not authorized to attach files on this swap.';
    END IF;
  ELSIF v_swap.status IN ('accepted', 'submitted', 'completed') THEN
    IF v_swap.requester_id <> v_user AND COALESCE(v_swap.participant_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_user THEN
      RAISE EXCEPTION 'Unauthorized: User is not a participant in this swap.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Swap is not active.';
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

REVOKE ALL ON FUNCTION public.register_swap_message_attachment(uuid, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_swap_message_attachment(uuid, text, text, text, bigint) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
