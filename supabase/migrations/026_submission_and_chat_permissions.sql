-- Migration 026: Submission Flow Alignment & Chat Permission Workflow

-- ============================================================================
-- 1. HARDEN ATOMIC SUBMIT_SWAP_WORK RPC (Safe Idempotency & Error Messaging)
-- ============================================================================

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
  v_submission public.swap_submissions;
  v_file jsonb;
  v_clean_notes text := COALESCE(btrim(p_notes), '');
  v_files_count integer := 0;
  v_path text;
  v_file_name text;
  v_mime text;
  v_file_size bigint;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF length(v_clean_notes) > 10000 THEN
    RAISE EXCEPTION 'Submission notes exceed maximum length of 10000 characters.';
  END IF;

  IF p_files IS NOT NULL THEN
    IF jsonb_typeof(p_files) <> 'array' THEN
      RAISE EXCEPTION 'File metadata must be a JSON array.';
    END IF;
    v_files_count := jsonb_array_length(p_files);
  END IF;

  IF v_files_count > 5 THEN
    RAISE EXCEPTION 'Maximum 5 files allowed per submission.';
  END IF;

  IF length(v_clean_notes) = 0 AND v_files_count = 0 THEN
    RAISE EXCEPTION 'Submission must contain notes or at least one attachment.';
  END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  IF v_swap.participant_id IS NULL OR v_swap.participant_id <> v_user THEN
    RAISE EXCEPTION 'Only the designated participant can submit work for this swap.';
  END IF;

  IF v_swap.status NOT IN ('accepted', 'submitted') THEN
    RAISE EXCEPTION 'Swap is not eligible for submission (current status: %).', v_swap.status;
  END IF;

  IF v_files_count > 0 THEN
    FOR v_file IN SELECT * FROM jsonb_array_elements(p_files)
    LOOP
      v_path := v_file->>'storage_path';
      v_file_size := COALESCE((v_file->>'file_size')::bigint, 0);

      IF v_path IS NULL OR length(btrim(v_path)) = 0 THEN
        RAISE EXCEPTION 'Storage path cannot be empty.';
      END IF;

      IF split_part(v_path, '/', 1) <> 'submissions' OR
         split_part(v_path, '/', 2) <> p_swap_id::text OR
         split_part(v_path, '/', 3) <> v_user::text THEN
        RAISE EXCEPTION 'Invalid storage path structure for submission: %', v_path;
      END IF;

      IF v_path LIKE '%..%' THEN
        RAISE EXCEPTION 'Invalid storage path containing directory traversal: %', v_path;
      END IF;

      IF v_file_size < 0 OR v_file_size > 26214400 THEN
        RAISE EXCEPTION 'File size exceeds maximum allowed size of 25MB.';
      END IF;
    END LOOP;
  END IF;

  -- Upsert submission record safely
  INSERT INTO public.swap_submissions (swap_id, submitted_by, notes, updated_at)
  VALUES (p_swap_id, v_user, v_clean_notes, now())
  ON CONFLICT (swap_id) DO UPDATE
    SET notes = EXCLUDED.notes,
        submitted_by = EXCLUDED.submitted_by,
        updated_at = now()
  RETURNING * INTO v_submission;

  -- Refresh file metadata on re-submission or retry
  DELETE FROM public.swap_submission_files WHERE submission_id = v_submission.id;

  IF v_files_count > 0 THEN
    FOR v_file IN SELECT * FROM jsonb_array_elements(p_files)
    LOOP
      v_path := v_file->>'storage_path';
      v_file_name := COALESCE(v_file->>'file_name', 'attachment');
      v_mime := v_file->>'mime_type';
      v_file_size := COALESCE((v_file->>'file_size')::bigint, 0);

      INSERT INTO public.swap_submission_files (
        submission_id,
        storage_path,
        file_name,
        mime_type,
        file_size
      )
      VALUES (
        v_submission.id,
        v_path,
        v_file_name,
        v_mime,
        v_file_size
      );
    END LOOP;
  END IF;

  UPDATE public.swaps
  SET status = 'submitted',
      submitted_at = COALESCE(submitted_at, now()),
      updated_at = now()
  WHERE id = p_swap_id
  RETURNING * INTO v_swap;

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', v_submission.id,
    'swap_id', v_swap.id,
    'status', v_swap.status,
    'submitted_at', v_swap.submitted_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_swap_work(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_swap_work(uuid, text, jsonb) TO authenticated, service_role;

-- ============================================================================
-- 2. CHAT PERMISSION REQUESTS TABLE & RPC WORKFLOW
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.swap_chat_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swap_id uuid NOT NULL REFERENCES public.swaps(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_swap_chat_requests_swap_participant UNIQUE (swap_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_swap_chat_requests_swap_id ON public.swap_chat_requests(swap_id);
CREATE INDEX IF NOT EXISTS idx_swap_chat_requests_requester ON public.swap_chat_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_swap_chat_requests_participant ON public.swap_chat_requests(participant_id);

ALTER TABLE public.swap_chat_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swap_chat_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Swap members can view chat requests" ON public.swap_chat_requests;
CREATE POLICY "Swap members can view chat requests" ON public.swap_chat_requests
  FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid() OR participant_id = auth.uid()
  );

REVOKE ALL ON public.swap_chat_requests FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.swap_chat_requests TO authenticated, service_role;

-- 2.1 RPC: request_chat_access
CREATE OR REPLACE FUNCTION public.request_chat_access(p_swap_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_swap public.swaps;
  v_existing public.swap_chat_requests;
  v_req public.swap_chat_requests;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  IF v_swap.participant_id IS NULL OR v_swap.participant_id <> v_user THEN
    RAISE EXCEPTION 'Only the designated participant can request chat access.';
  END IF;

  IF v_swap.status NOT IN ('accepted', 'submitted', 'completed') THEN
    RAISE EXCEPTION 'Chat access can only be requested for active swaps.';
  END IF;

  IF v_swap.chat_permission = 'anyone' THEN
    RETURN jsonb_build_object('success', true, 'status', 'accepted', 'message', 'No chat permission required.');
  END IF;

  SELECT * INTO v_existing
  FROM public.swap_chat_requests
  WHERE swap_id = p_swap_id AND participant_id = v_user;

  IF v_existing IS NOT NULL THEN
    IF v_existing.status = 'pending' THEN
      RAISE EXCEPTION 'Chat access request is already pending.';
    ELSIF v_existing.status = 'declined' THEN
      RAISE EXCEPTION 'Chat access request was declined by the requester.';
    ELSIF v_existing.status = 'accepted' THEN
      RETURN jsonb_build_object('success', true, 'status', 'accepted', 'request_id', v_existing.id);
    END IF;
  END IF;

  INSERT INTO public.swap_chat_requests (
    swap_id,
    requester_id,
    participant_id,
    status
  ) VALUES (
    p_swap_id,
    v_swap.requester_id,
    v_user,
    'pending'
  )
  ON CONFLICT (swap_id, participant_id) DO UPDATE
    SET status = 'pending',
        updated_at = now()
  RETURNING * INTO v_req;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'pending',
    'request_id', v_req.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_chat_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_chat_access(uuid) TO authenticated, service_role;

-- 2.2 RPC: respond_chat_request
CREATE OR REPLACE FUNCTION public.respond_chat_request(
  p_swap_id uuid,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_swap public.swaps;
  v_new_status text;
  v_req public.swap_chat_requests;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_action NOT IN ('accept', 'decline') THEN
    RAISE EXCEPTION 'Action must be accept or decline.';
  END IF;

  v_new_status := CASE WHEN p_action = 'accept' THEN 'accepted' ELSE 'declined' END;

  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  IF v_swap.requester_id <> v_user THEN
    RAISE EXCEPTION 'Only the swap requester can respond to chat requests.';
  END IF;

  UPDATE public.swap_chat_requests
  SET status = v_new_status,
      updated_at = now()
  WHERE swap_id = p_swap_id AND requester_id = v_user
  RETURNING * INTO v_req;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending chat access request found for this swap.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_new_status,
    'request_id', v_req.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_chat_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_chat_request(uuid, text) TO authenticated, service_role;

-- 2.3 RPC: get_chat_permission_status
CREATE OR REPLACE FUNCTION public.get_chat_permission_status(p_swap_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_swap public.swaps;
  v_req public.swap_chat_requests;
  v_status text := 'required';
  v_is_requester boolean := false;
  v_is_participant boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  v_is_requester := (v_swap.requester_id = v_user);
  v_is_participant := (v_swap.participant_id IS NOT NULL AND v_swap.participant_id = v_user);

  IF v_is_requester OR v_swap.chat_permission = 'anyone' THEN
    v_status := 'allowed';
  ELSIF v_is_participant THEN
    SELECT * INTO v_req
    FROM public.swap_chat_requests
    WHERE swap_id = p_swap_id AND participant_id = v_user;

    IF v_req IS NULL THEN
      v_status := 'required';
    ELSE
      v_status := v_req.status; -- 'pending', 'accepted', 'declined'
    END IF;
  ELSE
    IF v_swap.chat_permission = 'anyone' THEN
      v_status := 'allowed';
    ELSE
      v_status := 'required';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'swap_id', p_swap_id,
    'chat_permission', v_swap.chat_permission,
    'status', v_status,
    'is_requester', v_is_requester,
    'is_participant', v_is_participant
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_chat_permission_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_permission_status(uuid) TO authenticated, service_role;

-- ============================================================================
-- 3. HARDEN RLS ON SWAP MESSAGES & REALTIME
-- ============================================================================

DROP POLICY IF EXISTS "Participants can send swap messages" ON public.swap_messages;
CREATE POLICY "Participants can send swap messages" ON public.swap_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    sender_id <> recipient_id AND
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id = swap_messages.swap_id
        AND (s.requester_id = auth.uid() OR s.participant_id = auth.uid())
        AND s.status IN ('accepted', 'submitted', 'completed')
        AND (
          s.requester_id = auth.uid() OR
          s.chat_permission = 'anyone' OR
          EXISTS (
            SELECT 1 FROM public.swap_chat_requests cr
            WHERE cr.swap_id = s.id
              AND cr.participant_id = auth.uid()
              AND cr.status = 'accepted'
          )
        )
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'realtime' AND table_name = 'messages') THEN
    DROP POLICY IF EXISTS "Swap members can listen and broadcast chat realtime" ON realtime.messages;
    CREATE POLICY "Swap members can listen and broadcast chat realtime" ON realtime.messages
      FOR ALL TO authenticated
      USING (
        CASE
          WHEN realtime.topic() LIKE 'skillswap-chat:%' THEN
            EXISTS (
              SELECT 1 FROM public.swaps s
              WHERE s.id::text = substring(realtime.topic() from 'skillswap-chat:(.*)')
                AND s.status IN ('accepted', 'submitted', 'completed')
                AND (
                  s.requester_id = auth.uid() OR
                  (
                    s.participant_id = auth.uid() AND
                    (
                      s.chat_permission = 'anyone' OR
                      EXISTS (
                        SELECT 1 FROM public.swap_chat_requests cr
                        WHERE cr.swap_id = s.id
                          AND cr.participant_id = auth.uid()
                          AND cr.status = 'accepted'
                      )
                    )
                  )
                )
            )
          ELSE true
        END
      )
      WITH CHECK (
        CASE
          WHEN realtime.topic() LIKE 'skillswap-chat:%' THEN
            EXISTS (
              SELECT 1 FROM public.swaps s
              WHERE s.id::text = substring(realtime.topic() from 'skillswap-chat:(.*)')
                AND s.status IN ('accepted', 'submitted', 'completed')
                AND (
                  s.requester_id = auth.uid() OR
                  (
                    s.participant_id = auth.uid() AND
                    (
                      s.chat_permission = 'anyone' OR
                      EXISTS (
                        SELECT 1 FROM public.swap_chat_requests cr
                        WHERE cr.swap_id = s.id
                          AND cr.participant_id = auth.uid()
                          AND cr.status = 'accepted'
                      )
                    )
                  )
                )
            )
          ELSE true
        END
      );
  END IF;
END $$;

-- Enable Realtime publication for swap_chat_requests
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr
      JOIN pg_class c ON pr.prrelid = c.oid
      WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
        AND c.relname = 'swap_chat_requests'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.swap_chat_requests;
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
