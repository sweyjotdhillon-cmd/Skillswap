-- Migration 020: Swap Creator Attachments Metadata and Storage RLS

CREATE TABLE IF NOT EXISTS public.swap_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swap_id uuid NOT NULL REFERENCES public.swaps(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint CHECK (file_size >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swap_attachments_swap_id ON public.swap_attachments(swap_id);
CREATE INDEX IF NOT EXISTS idx_swap_attachments_uploaded_by ON public.swap_attachments(uploaded_by);

ALTER TABLE public.swap_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swap_attachments FORCE ROW LEVEL SECURITY;

-- RLS for swap_attachments table:
-- Requester OR accepted/submitted/completed participant can view attachments
DROP POLICY IF EXISTS "Swap members can view creator attachments" ON public.swap_attachments;
CREATE POLICY "Swap members can view creator attachments" ON public.swap_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id = swap_attachments.swap_id
        AND (
          s.requester_id = auth.uid() OR
          (s.participant_id = auth.uid() AND s.status IN ('accepted', 'submitted', 'completed'))
        )
    )
  );

-- Only swap requester/creator can insert creator attachments
DROP POLICY IF EXISTS "Swap creator can insert attachments" ON public.swap_attachments;
CREATE POLICY "Swap creator can insert attachments" ON public.swap_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id = swap_attachments.swap_id
        AND s.requester_id = auth.uid()
    )
  );

GRANT SELECT, INSERT ON public.swap_attachments TO authenticated, service_role;

-- Storage RLS Security for swap-attachments namespace in swap-submissions bucket
-- Canonical format: swap-attachments/<swap_id>/<requester_user_id>/<random_id>-<safe_filename>
-- (storage.foldername(name))[1] = 'swap-attachments'
-- (storage.foldername(name))[2] = swap_id
-- (storage.foldername(name))[3] = requester_user_id

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Swap members can read creator attachment files" ON storage.objects;
    CREATE POLICY "Swap members can read creator attachment files" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'swap-submissions' AND
        (storage.foldername(name))[1] = 'swap-attachments' AND
        EXISTS (
          SELECT 1 FROM public.swaps s
          WHERE s.id::text = (storage.foldername(name))[2]
            AND (
              s.requester_id = auth.uid() OR
              (s.participant_id = auth.uid() AND s.status IN ('accepted', 'submitted', 'completed'))
            )
        )
      );

    DROP POLICY IF EXISTS "Swap creator can upload attachment files" ON storage.objects;
    CREATE POLICY "Swap creator can upload attachment files" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'swap-submissions' AND
        (storage.foldername(name))[1] = 'swap-attachments' AND
        (storage.foldername(name))[3] = auth.uid()::text AND
        EXISTS (
          SELECT 1 FROM public.swaps s
          WHERE s.id::text = (storage.foldername(name))[2]
            AND s.requester_id = auth.uid()
        )
      );

    DROP POLICY IF EXISTS "Swap creator can delete attachment files" ON storage.objects;
    CREATE POLICY "Swap creator can delete attachment files" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'swap-submissions' AND
        (storage.foldername(name))[1] = 'swap-attachments' AND
        (storage.foldername(name))[3] = auth.uid()::text AND
        EXISTS (
          SELECT 1 FROM public.swaps s
          WHERE s.id::text = (storage.foldername(name))[2]
            AND s.requester_id = auth.uid()
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
