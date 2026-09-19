-- Migration 047: Idempotent Correction for Swap Chat Permissions, RLS Policies, and Atomic RPC
-- Description: Synchronize swap_messages RLS policies and send_chat_message_with_attachments RPC
--              to ensure support for open swap messaging (applicant -> requester) and active swap messaging
--              (requester <-> participant) while strictly blocking unauthorized non-members, self-messaging,
--              and inactive swaps.

-- 1. Update SELECT and INSERT RLS policies on public.swap_messages
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
          -- OPEN swap: authenticated non-requester sending message to requester
          (s.status = 'open' AND s.requester_id = recipient_id AND auth.uid() <> s.requester_id)
          OR
          -- ACTIVE swap: requester <-> participant
          (s.status IN ('accepted', 'submitted', 'completed') AND
           ((s.requester_id = auth.uid() AND s.participant_id = recipient_id) OR
            (s.participant_id = auth.uid() AND s.requester_id = recipient_id)))
        )
    )
  );

GRANT SELECT, INSERT ON public.swap_messages TO authenticated, service_role;

-- 2. Synchronize send_chat_message_with_attachments SECURITY DEFINER RPC
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
      RAISE EXCEPTION 'Unauthorized: Swap creator cannot send open-swap messages to themselves.';
    END IF;
    IF p_recipient_id <> v_swap.requester_id THEN
      RAISE EXCEPTION 'Invalid recipient: Open swap messages must be addressed to the swap requester.';
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

-- 3. Ensure Realtime publication includes swap_messages
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr
      JOIN pg_class c ON pr.prrelid = c.oid
      WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
        AND c.relname = 'swap_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.swap_messages;
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

NOTIFY pgrst, 'reload schema';
