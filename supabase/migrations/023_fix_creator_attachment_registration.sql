-- Migration 023: Fix Creator Attachment Path Contract and Registration RPC
-- Replaces path validation contract in register_swap_attachment with deterministic segment checks

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
  v_user_id uuid := auth.uid();
  v_requester_id uuid;
  v_status text;
  v_attachment_id uuid;
  v_clean_filename text;
  v_file_segment text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT requester_id, status INTO v_requester_id, v_status
  FROM public.swaps
  WHERE id = p_swap_id;

  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'Swap not found';
  END IF;

  IF v_requester_id != v_user_id THEN
    RAISE EXCEPTION 'Only the swap creator can add attachments';
  END IF;

  IF v_status != 'open' THEN
    RAISE EXCEPTION 'Attachments can only be added when swap is open';
  END IF;

  v_clean_filename := COALESCE(btrim(p_file_name), '');
  IF v_clean_filename = '' THEN
    RAISE EXCEPTION 'Attachment file name cannot be empty';
  END IF;

  IF p_file_size IS NOT NULL THEN
    IF p_file_size < 0 OR p_file_size > 26214400 THEN
      RAISE EXCEPTION 'File size exceeds maximum allowed size of 25MB';
    END IF;
  END IF;

  -- Validate storage path structure: swap-attachments/<swap_id>/<user_id>/<filename>
  IF p_storage_path IS NULL OR btrim(p_storage_path) = '' THEN
    RAISE EXCEPTION 'Storage path cannot be empty';
  END IF;

  IF p_storage_path LIKE '/%' THEN
    RAISE EXCEPTION 'Invalid storage path: leading slash not allowed';
  END IF;

  IF p_storage_path LIKE '%..%' THEN
    RAISE EXCEPTION 'Invalid storage path containing directory traversal';
  END IF;

  IF split_part(p_storage_path, '/', 1) <> 'swap-attachments' THEN
    RAISE EXCEPTION 'Invalid storage path: must begin with swap-attachments prefix';
  END IF;

  IF split_part(p_storage_path, '/', 2) <> p_swap_id::text THEN
    RAISE EXCEPTION 'Invalid storage path: swap ID mismatch';
  END IF;

  IF split_part(p_storage_path, '/', 3) <> v_user_id::text THEN
    RAISE EXCEPTION 'Invalid storage path: creator user ID mismatch';
  END IF;

  v_file_segment := split_part(p_storage_path, '/', 4);
  IF v_file_segment IS NULL OR btrim(v_file_segment) = '' THEN
    RAISE EXCEPTION 'Invalid storage path: missing file name segment';
  END IF;

  IF split_part(p_storage_path, '/', 5) <> '' THEN
    RAISE EXCEPTION 'Invalid storage path: unexpected subfolder or extra segments';
  END IF;

  INSERT INTO public.swap_attachment_files (
    swap_id,
    uploaded_by,
    storage_path,
    file_name,
    mime_type,
    file_size
  ) VALUES (
    p_swap_id,
    v_user_id,
    p_storage_path,
    v_clean_filename,
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

NOTIFY pgrst, 'reload schema';
