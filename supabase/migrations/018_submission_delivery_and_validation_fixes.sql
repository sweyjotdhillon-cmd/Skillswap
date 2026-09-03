-- Migration 018: Submission Delivery and Validation Fixes
-- Allows text-only, attachment-only, or combined submissions; hardens storage RLS and atomic submission RPC.

-- 1. Relax notes non-empty constraint on swap_submissions to allow attachment-only submissions
ALTER TABLE public.swap_submissions DROP CONSTRAINT IF EXISTS swap_submissions_notes_check;
ALTER TABLE public.swap_submissions ALTER COLUMN notes SET DEFAULT '';

-- 2. Updated Atomic submit_swap_work RPC supporting text-only OR attachment-only OR combined
CREATE OR REPLACE FUNCTION public.submit_swap_work(
  p_swap_id uuid,
  p_notes text DEFAULT '',
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
  v_clean_notes text := COALESCE(btrim(p_notes), '');
  v_files_count integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_files IS NOT NULL THEN
    v_files_count := jsonb_array_length(p_files);
  END IF;

  -- Rule: Must have either explanatory text or at least one file attachment
  IF length(v_clean_notes) = 0 AND v_files_count = 0 THEN
    RAISE EXCEPTION 'Submission must contain notes or at least one attachment.';
  END IF;

  -- Lock swap row
  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  -- Verify current user is the participant
  IF v_swap.participant_id IS NULL OR v_swap.participant_id <> v_user THEN
    RAISE EXCEPTION 'Only the designated participant can submit work for this swap.';
  END IF;

  -- Verify swap status is accepted
  IF v_swap.status <> 'accepted' THEN
    RAISE EXCEPTION 'Swap is not eligible for submission (current status: %).', v_swap.status;
  END IF;

  -- Ensure single submission per swap
  SELECT id INTO v_existing_submission_id FROM public.swap_submissions WHERE swap_id = p_swap_id;
  IF v_existing_submission_id IS NOT NULL THEN
    RAISE EXCEPTION 'Work has already been submitted for this swap.';
  END IF;

  -- Insert submission record
  INSERT INTO public.swap_submissions (swap_id, submitted_by, notes)
  VALUES (p_swap_id, v_user, v_clean_notes)
  RETURNING * INTO v_submission;

  -- Insert file metadata if attached
  IF v_files_count > 0 THEN
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

  -- Transition swap status atomically
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

-- 3. Storage RLS Security for swap-submissions Bucket
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

NOTIFY pgrst, 'reload schema';
