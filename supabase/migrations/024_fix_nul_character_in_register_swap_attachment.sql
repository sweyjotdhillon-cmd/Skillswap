-- Migration 024: Fix register_swap_attachment RPC NUL Character Bug and Harden Path Validation

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
  v_uuid_part text;
  v_file_suffix text;
BEGIN
  -- 1. Authenticated user check
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Validate input presence
  IF p_swap_id IS NULL THEN
    RAISE EXCEPTION 'Swap ID cannot be NULL';
  END IF;

  IF p_storage_path IS NULL OR btrim(p_storage_path) = '' THEN
    RAISE EXCEPTION 'Storage path cannot be empty';
  END IF;

  v_clean_filename := COALESCE(btrim(p_file_name), '');
  IF v_clean_filename = '' THEN
    RAISE EXCEPTION 'Attachment file name cannot be empty';
  END IF;

  IF v_clean_filename LIKE '%/%' THEN
    RAISE EXCEPTION 'Attachment file name cannot contain slashes';
  END IF;

  -- 3. Check swap existence, ownership, and open status
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

  -- 4. Enforce 25 MB file size limit
  IF p_file_size IS NOT NULL THEN
    IF p_file_size < 0 OR p_file_size > 26214400 THEN
      RAISE EXCEPTION 'File size exceeds maximum allowed size of 25MB';
    END IF;
  END IF;

  -- 5. Validate storage path structure: swap-attachments/<swap_id>/<user_id>/<uuid>-<filename>
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

  -- 6. Validate generated UUID prefix and filename suffix in segment 4 (<uuid>-<sanitized_filename>)
  IF length(v_file_segment) <= 37 THEN
    RAISE EXCEPTION 'Invalid storage path file segment: format must be <uuid>-<filename>';
  END IF;

  IF substr(v_file_segment, 37, 1) <> '-' THEN
    RAISE EXCEPTION 'Invalid storage path file segment: missing separator hyphen after UUID';
  END IF;

  v_uuid_part := substring(v_file_segment from 1 for 36);
  IF v_uuid_part !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid storage path file segment: invalid UUID prefix';
  END IF;

  v_file_suffix := substring(v_file_segment from 38);
  IF v_file_suffix <> v_clean_filename THEN
    RAISE EXCEPTION 'Invalid storage path file segment: filename suffix mismatch';
  END IF;

  -- 7. Reject duplicate storage paths
  IF EXISTS (
    SELECT 1 FROM public.swap_attachment_files
    WHERE storage_path = p_storage_path
  ) THEN
    RAISE EXCEPTION 'Duplicate storage path';
  END IF;

  -- 8. Insert metadata into public.swap_attachment_files
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
