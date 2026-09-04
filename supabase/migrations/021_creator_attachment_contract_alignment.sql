-- Migration 021: Creator Attachment Contract, RPCs and Storage RLS Alignment

-- 1. Register swap-attachments bucket in storage.buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('swap-attachments', 'swap-attachments', false, 26214400)
ON CONFLICT (id) DO NOTHING;

-- 2. Compatibility View for public.swap_attachment_files pointing to public.swap_attachments
CREATE OR REPLACE VIEW public.swap_attachment_files AS
SELECT
  id,
  swap_id,
  uploaded_by,
  storage_path,
  file_name,
  mime_type,
  file_size,
  created_at
FROM public.swap_attachments;

GRANT SELECT ON public.swap_attachment_files TO authenticated, service_role;

-- 3. Security DEFINER RPC: register_swap_attachment
CREATE OR REPLACE FUNCTION public.register_swap_attachment(
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
  v_requester_id uuid;
  v_status text;
  v_attachment_id uuid;
  v_expected_prefix text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT requester_id, status INTO v_requester_id, v_status
  FROM public.swaps
  WHERE id = p_swap_id;

  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'Swap not found';
  END IF;

  IF v_requester_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the swap creator can add attachments';
  END IF;

  IF v_status != 'open' THEN
    RAISE EXCEPTION 'Attachments can only be added when swap is open';
  END IF;

  v_expected_prefix := 'swap-attachments/' || p_swap_id::text || '/' || auth.uid()::text || '/';
  IF p_storage_path NOT LIKE v_expected_prefix || '%' THEN
    RAISE EXCEPTION 'Invalid storage path for creator attachment';
  END IF;

  INSERT INTO public.swap_attachments (
    swap_id,
    uploaded_by,
    storage_path,
    file_name,
    mime_type,
    file_size
  ) VALUES (
    p_swap_id,
    auth.uid(),
    p_storage_path,
    p_file_name,
    p_mime_type,
    p_file_size
  ) RETURNING id INTO v_attachment_id;

  RETURN jsonb_build_object(
    'success', true,
    'attachment_id', v_attachment_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_swap_attachment(uuid, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_swap_attachment(uuid, text, text, text, bigint) TO authenticated, service_role;

-- 4. Security DEFINER RPC: unregister_swap_attachment
CREATE OR REPLACE FUNCTION public.unregister_swap_attachment(
  p_attachment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uploaded_by uuid;
  v_swap_id uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT a.uploaded_by, a.swap_id, s.status
  INTO v_uploaded_by, v_swap_id, v_status
  FROM public.swap_attachments a
  JOIN public.swaps s ON s.id = a.swap_id
  WHERE a.id = p_attachment_id;

  IF v_uploaded_by IS NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'Attachment already removed or not found');
  END IF;

  IF v_uploaded_by != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to unregister this attachment';
  END IF;

  IF v_status != 'open' THEN
    RAISE EXCEPTION 'Attachments can only be removed while swap is open';
  END IF;

  DELETE FROM public.swap_attachments
  WHERE id = p_attachment_id AND uploaded_by = auth.uid();

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.unregister_swap_attachment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unregister_swap_attachment(uuid) TO authenticated, service_role;

-- 5. Storage RLS Security for swap-attachments bucket
-- Canonical format: swap-attachments/<swap_id>/<creator_user_id>/<uuid>-<safe_filename>
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Swap members can read creator attachment files in swap-attachments bucket" ON storage.objects;
    CREATE POLICY "Swap members can read creator attachment files in swap-attachments bucket" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'swap-attachments' AND
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

    DROP POLICY IF EXISTS "Swap creator can upload attachment files in swap-attachments bucket" ON storage.objects;
    CREATE POLICY "Swap creator can upload attachment files in swap-attachments bucket" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'swap-attachments' AND
        (storage.foldername(name))[1] = 'swap-attachments' AND
        (storage.foldername(name))[3] = auth.uid()::text AND
        EXISTS (
          SELECT 1 FROM public.swaps s
          WHERE s.id::text = (storage.foldername(name))[2]
            AND s.requester_id = auth.uid()
            AND s.status = 'open'
        )
      );

    DROP POLICY IF EXISTS "Swap creator can delete attachment files in swap-attachments bucket" ON storage.objects;
    CREATE POLICY "Swap creator can delete attachment files in swap-attachments bucket" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'swap-attachments' AND
        (storage.foldername(name))[1] = 'swap-attachments' AND
        (storage.foldername(name))[3] = auth.uid()::text AND
        EXISTS (
          SELECT 1 FROM public.swaps s
          WHERE s.id::text = (storage.foldername(name))[2]
            AND s.requester_id = auth.uid()
            AND s.status = 'open'
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
