-- Migration 019: Final Submission Flow & Storage RLS Alignment
-- Align Database Constraints, Atomic submit_swap_work RPC, and Storage RLS with Canonical Path format:
-- submissions/<swapId>/<participantUserId>/<randomId>-<safeFilename>

-- 1. Safely drop legacy/conflicting notes check constraints on public.swap_submissions
ALTER TABLE public.swap_submissions DROP CONSTRAINT IF EXISTS swap_submissions_notes_check;
ALTER TABLE public.swap_submissions DROP CONSTRAINT IF EXISTS swap_submissions_notes_nonempty;
ALTER TABLE public.swap_submissions DROP CONSTRAINT IF EXISTS chk_swap_submissions_notes;
ALTER TABLE public.swap_submissions DROP CONSTRAINT IF EXISTS chk_swap_submissions_notes_length;

ALTER TABLE public.swap_submissions ALTER COLUMN notes SET DEFAULT '';

-- Enforce max 10,000 characters notes length, allowing empty notes when file attachments exist
ALTER TABLE public.swap_submissions
  ADD CONSTRAINT chk_swap_submissions_notes_length CHECK (length(btrim(notes)) <= 10000);

-- 2. Atomic submit_swap_work RPC Function
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
  v_path text;
  v_file_name text;
  v_mime text;
  v_file_size bigint;
BEGIN
  -- A. Authenticated user requirement
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  -- B. Notes length validation
  IF length(v_clean_notes) > 10000 THEN
    RAISE EXCEPTION 'Submission notes exceed maximum length of 10000 characters.';
  END IF;

  -- C. Validate file count
  IF p_files IS NOT NULL THEN
    IF jsonb_typeof(p_files) <> 'array' THEN
      RAISE EXCEPTION 'File metadata must be a JSON array.';
    END IF;
    v_files_count := jsonb_array_length(p_files);
  END IF;

  IF v_files_count > 5 THEN
    RAISE EXCEPTION 'Maximum 5 files allowed per submission.';
  END IF;

  -- D. Require either explanatory notes or at least one file attachment
  IF length(v_clean_notes) = 0 AND v_files_count = 0 THEN
    RAISE EXCEPTION 'Submission must contain notes or at least one attachment.';
  END IF;

  -- E. Load and lock swap record
  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  -- F. Verify current user is the participant
  IF v_swap.participant_id IS NULL OR v_swap.participant_id <> v_user THEN
    RAISE EXCEPTION 'Only the designated participant can submit work for this swap.';
  END IF;

  -- G. Verify swap status is accepted
  IF v_swap.status <> 'accepted' THEN
    RAISE EXCEPTION 'Swap is not eligible for submission (current status: %).', v_swap.status;
  END IF;

  -- H. Ensure single submission per swap
  SELECT id INTO v_existing_submission_id FROM public.swap_submissions WHERE swap_id = p_swap_id;
  IF v_existing_submission_id IS NOT NULL THEN
    RAISE EXCEPTION 'Work has already been submitted for this swap.';
  END IF;

  -- I. Validate storage paths and file sizes before database modification
  IF v_files_count > 0 THEN
    FOR v_file IN SELECT * FROM jsonb_array_elements(p_files)
    LOOP
      v_path := v_file->>'storage_path';
      v_file_size := COALESCE((v_file->>'file_size')::bigint, 0);

      IF v_path IS NULL OR length(btrim(v_path)) = 0 THEN
        RAISE EXCEPTION 'Storage path cannot be empty.';
      END IF;

      -- Canonical format requirement: submissions/<swapId>/<userId>/<random>-<filename>
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

  -- J. Insert submission record
  INSERT INTO public.swap_submissions (swap_id, submitted_by, notes)
  VALUES (p_swap_id, v_user, v_clean_notes)
  RETURNING * INTO v_submission;

  -- K. Insert file metadata
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

  -- L. Transition swap status atomically
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
-- Canonical Path Structure: submissions/<swapId>/<participantUserId>/<filename>
-- folder 1 = 'submissions'
-- folder 2 = swap ID
-- folder 3 = participant user ID
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Swap members can read submission files" ON storage.objects;
    CREATE POLICY "Swap members can read submission files" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'swap-submissions' AND
        (storage.foldername(name))[1] = 'submissions' AND
        EXISTS (
          SELECT 1 FROM public.swaps s
          WHERE s.id::text = (storage.foldername(name))[2]
            AND (s.requester_id = auth.uid() OR s.participant_id = auth.uid())
        )
      );

    DROP POLICY IF EXISTS "Swap participant can upload submission files" ON storage.objects;
    CREATE POLICY "Swap participant can upload submission files" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'swap-submissions' AND
        (storage.foldername(name))[1] = 'submissions' AND
        (storage.foldername(name))[3] = auth.uid()::text AND
        EXISTS (
          SELECT 1 FROM public.swaps s
          WHERE s.id::text = (storage.foldername(name))[2]
            AND s.participant_id = auth.uid()
            AND s.status = 'accepted'
        )
      );

    DROP POLICY IF EXISTS "Swap participant can delete submission files" ON storage.objects;
    CREATE POLICY "Swap participant can delete submission files" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'swap-submissions' AND
        (storage.foldername(name))[1] = 'submissions' AND
        (storage.foldername(name))[3] = auth.uid()::text AND
        EXISTS (
          SELECT 1 FROM public.swaps s
          WHERE s.id::text = (storage.foldername(name))[2]
            AND s.participant_id = auth.uid()
            AND s.status = 'accepted'
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
