-- Migration 014: Chat and Submission Security Hardening, Storage RLS, and Realtime Configuration

-- 1. HARDEN SWAP MESSAGES RLS
ALTER TABLE public.swap_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swap_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own swap messages" ON public.swap_messages;
DROP POLICY IF EXISTS "Swap participants can read swap messages" ON public.swap_messages;

CREATE POLICY "Swap participants can read swap messages" ON public.swap_messages
  FOR SELECT TO authenticated
  USING (
    (sender_id = auth.uid() OR recipient_id = auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id = swap_messages.swap_id
        AND (s.requester_id = auth.uid() OR s.participant_id = auth.uid())
    )
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
          (s.requester_id = auth.uid() AND s.participant_id = recipient_id) OR
          (s.participant_id = auth.uid() AND s.requester_id = recipient_id) OR
          (s.participant_id IS NULL AND s.requester_id = recipient_id AND s.requester_id <> auth.uid() AND s.chat_permission IN ('requester', 'anyone'))
        )
        AND (
          s.status IN ('accepted', 'submitted', 'completed') OR
          (s.chat_permission = 'anyone') OR
          (s.chat_permission = 'requester' AND s.requester_id = auth.uid()) OR
          (s.chat_permission = 'participant' AND s.participant_id = auth.uid())
        )
    )
  );

GRANT SELECT, INSERT ON public.swap_messages TO authenticated, service_role;

-- 2. REPLACEMENT ATOMIC SUBMIT_SWAP_WORK RPC (DETERMINISTIC SINGLE SUBMISSION)
CREATE OR REPLACE FUNCTION public.submit_swap_work(
  p_swap_id uuid,
  p_notes text,
  p_files jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_swap public.swaps;
  v_submission public.swap_submissions;
  v_file jsonb;
  v_existing_submission_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_notes IS NULL OR length(btrim(p_notes)) = 0 THEN
    RAISE EXCEPTION 'Submission notes cannot be empty.';
  END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  IF v_swap.participant_id IS NULL OR v_swap.participant_id <> v_user THEN
    RAISE EXCEPTION 'Only the designated participant can submit work for this swap.';
  END IF;

  IF v_swap.status <> 'accepted' THEN
    RAISE EXCEPTION 'Swap is not eligible for submission (current status: %).', v_swap.status;
  END IF;

  SELECT id INTO v_existing_submission_id FROM public.swap_submissions WHERE swap_id = p_swap_id;
  IF v_existing_submission_id IS NOT NULL THEN
    RAISE EXCEPTION 'Work has already been submitted for this swap.';
  END IF;

  -- Create submission record
  INSERT INTO public.swap_submissions (swap_id, submitted_by, notes)
  VALUES (p_swap_id, v_user, p_notes)
  RETURNING * INTO v_submission;

  -- Insert file metadata if attached
  IF p_files IS NOT NULL AND jsonb_array_length(p_files) > 0 THEN
    FOR v_file IN SELECT * FROM jsonb_array_elements(p_files)
    LOOP
      INSERT INTO public.swap_submission_files (
        submission_id,
        storage_path,
        file_name,
        mime_type,
        file_size
      )
      VALUES (
        v_submission.id,
        v_file->>'storage_path',
        v_file->>'file_name',
        v_file->>'mime_type',
        COALESCE((v_file->>'file_size')::bigint, 0)
      );
    END LOOP;
  END IF;

  -- Transition swap status to submitted
  UPDATE public.swaps
  SET status = 'submitted',
      submitted_at = now(),
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
END $$;

GRANT EXECUTE ON FUNCTION public.submit_swap_work(uuid, text, jsonb) TO authenticated, service_role;

-- 3. STORAGE RLS POLICIES FOR SWAP-SUBMISSIONS BUCKET
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Swap members can read submission files" ON storage.objects;
    CREATE POLICY "Swap members can read submission files" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'swap-submissions' AND
        EXISTS (
          SELECT 1 FROM public.swaps s
          WHERE s.id::text = (storage.foldername(name))[1]
            AND (s.requester_id = auth.uid() OR s.participant_id = auth.uid())
        )
      );

    DROP POLICY IF EXISTS "Swap participant can upload submission files" ON storage.objects;
    CREATE POLICY "Swap participant can upload submission files" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'swap-submissions' AND
        (storage.foldername(name))[2] = auth.uid()::text AND
        EXISTS (
          SELECT 1 FROM public.swaps s
          WHERE s.id::text = (storage.foldername(name))[1]
            AND s.participant_id = auth.uid()
            AND s.status = 'accepted'
        )
      );

    DROP POLICY IF EXISTS "Swap participant can delete submission files" ON storage.objects;
    CREATE POLICY "Swap participant can delete submission files" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'swap-submissions' AND
        (storage.foldername(name))[2] = auth.uid()::text AND
        EXISTS (
          SELECT 1 FROM public.swaps s
          WHERE s.id::text = (storage.foldername(name))[1]
            AND s.participant_id = auth.uid()
            AND s.status = 'accepted'
        )
      );
  END IF;
END $$;

-- 4. REALTIME PUBLICATION CONFIGURATION
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

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr
      JOIN pg_class c ON pr.prrelid = c.oid
      WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
        AND c.relname = 'swap_submissions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.swap_submissions;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr
      JOIN pg_class c ON pr.prrelid = c.oid
      WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
        AND c.relname = 'swaps'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.swaps;
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
