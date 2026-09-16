-- Migration 039: Phase 1B Correction Pass & Hardened Attachment Security
-- Strategy: Forward-only migration history preservation.

-- 1. Fix Historical Chat Message Expiry Backfill
-- Correct expires_at = created_at + interval '6 hours' for all historical swap messages
UPDATE public.swap_messages
SET expires_at = created_at + interval '6 hours';

-- 2. Server-side Canonical MIME Allowlist Function
CREATE OR REPLACE FUNCTION public.get_canonical_mime_type(p_file_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ext text;
BEGIN
  IF p_file_name IS NULL OR length(trim(p_file_name)) = 0 THEN
    RETURN NULL;
  END IF;

  v_ext := lower(substring(trim(p_file_name) from '\.([a-zA-Z0-9]+)$'));

  -- If file has no extension (e.g., README or Makefile), default to application/octet-stream
  IF v_ext IS NULL OR v_ext = '' THEN
    IF trim(p_file_name) NOT LIKE '%.%' THEN
      RETURN 'application/octet-stream';
    ELSE
      RETURN NULL;
    END IF;
  END IF;

  CASE v_ext
    -- Images
    WHEN 'png' THEN RETURN 'image/png';
    WHEN 'jpg', 'jpeg' THEN RETURN 'image/jpeg';
    WHEN 'webp' THEN RETURN 'image/webp';
    WHEN 'gif' THEN RETURN 'image/gif';
    WHEN 'svg' THEN RETURN 'image/svg+xml';
    WHEN 'heic' THEN RETURN 'image/heic';
    WHEN 'avif' THEN RETURN 'image/avif';
    WHEN 'bmp' THEN RETURN 'image/bmp';
    WHEN 'tiff' THEN RETURN 'image/tiff';

    -- Documents
    WHEN 'pdf' THEN RETURN 'application/pdf';
    WHEN 'doc' THEN RETURN 'application/msword';
    WHEN 'docx' THEN RETURN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    WHEN 'txt' THEN RETURN 'text/plain';
    WHEN 'md' THEN RETURN 'text/markdown';
    WHEN 'rtf' THEN RETURN 'application/rtf';

    -- Spreadsheets
    WHEN 'csv' THEN RETURN 'text/csv';
    WHEN 'xls' THEN RETURN 'application/vnd.ms-excel';
    WHEN 'xlsx' THEN RETURN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    -- Presentations
    WHEN 'ppt' THEN RETURN 'application/vnd.ms-powerpoint';
    WHEN 'pptx' THEN RETURN 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

    -- Archives
    WHEN 'zip' THEN RETURN 'application/zip';
    WHEN 'tar' THEN RETURN 'application/x-tar';
    WHEN 'gz' THEN RETURN 'application/gzip';
    WHEN 'bz2' THEN RETURN 'application/x-bzip2';
    WHEN 'xz' THEN RETURN 'application/x-xz';
    WHEN 'rar' THEN RETURN 'application/vnd.rar';
    WHEN '7z' THEN RETURN 'application/x-7z-compressed';

    -- Code & Development
    WHEN 'py' THEN RETURN 'text/x-python';
    WHEN 'js', 'jsx' THEN RETURN 'text/javascript';
    WHEN 'ts', 'tsx' THEN RETURN 'text/typescript';
    WHEN 'html' THEN RETURN 'text/html';
    WHEN 'css' THEN RETURN 'text/css';
    WHEN 'scss' THEN RETURN 'text/x-scss';
    WHEN 'java' THEN RETURN 'text/x-java-source';
    WHEN 'c' THEN RETURN 'text/x-c';
    WHEN 'cpp', 'cc', 'cxx' THEN RETURN 'text/x-c++';
    WHEN 'h' THEN RETURN 'text/x-h';
    WHEN 'hpp' THEN RETURN 'text/x-h++';
    WHEN 'cs', 'go', 'rs', 'swift', 'kt', 'dart', 'r', 'bat', 'ps1', 'toml', 'ini', 'cfg', 'log' THEN RETURN 'text/plain';
    WHEN 'php' THEN RETURN 'application/x-httpd-php';
    WHEN 'rb' THEN RETURN 'text/x-ruby';
    WHEN 'lua' THEN RETURN 'text/x-lua';
    WHEN 'scala' THEN RETURN 'text/x-scala';
    WHEN 'hs' THEN RETURN 'text/x-haskell';
    WHEN 'sql' THEN RETURN 'application/sql';
    WHEN 'sh' THEN RETURN 'application/x-sh';
    WHEN 'json' THEN RETURN 'application/json';
    WHEN 'xml' THEN RETURN 'application/xml';
    WHEN 'yaml', 'yml' THEN RETURN 'text/yaml';

    -- Media
    WHEN 'mp3' THEN RETURN 'audio/mpeg';
    WHEN 'wav' THEN RETURN 'audio/wav';
    WHEN 'flac' THEN RETURN 'audio/flac';
    WHEN 'aac' THEN RETURN 'audio/aac';
    WHEN 'ogg', 'oga', 'opus', 'spx' THEN RETURN 'audio/ogg';
    WHEN 'm4a' THEN RETURN 'audio/mp4';
    WHEN 'mp4' THEN RETURN 'video/mp4';
    WHEN 'mkv' THEN RETURN 'video/x-matroska';
    WHEN 'mov' THEN RETURN 'video/quicktime';
    WHEN 'avi' THEN RETURN 'video/x-msvideo';
    WHEN 'webm' THEN RETURN 'video/webm';
    WHEN 'flv' THEN RETURN 'video/x-flv';

    -- Design
    WHEN 'fig' THEN RETURN 'application/octet-stream';
    WHEN 'psd' THEN RETURN 'image/vnd.adobe.photoshop';
    WHEN 'ai' THEN RETURN 'application/postscript';

    ELSE RETURN NULL;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.get_canonical_mime_type(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_canonical_mime_type(text) TO authenticated, service_role;

-- 3. Hardened register_swap_message_attachment with Server-side MIME Validation
CREATE OR REPLACE FUNCTION public.register_swap_message_attachment(
  p_message_id uuid,
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
  v_user uuid := auth.uid();
  v_msg public.swap_messages;
  v_swap public.swaps;
  v_stored_filename text;
  v_canonical_mime text;
  v_expires_at timestamptz;
  v_att_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  IF v_swap.requester_id <> v_user AND COALESCE(v_swap.participant_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_user THEN
    RAISE EXCEPTION 'Unauthorized: User is not a participant in this swap.';
  END IF;

  SELECT * INTO v_msg FROM public.swap_messages WHERE id = p_message_id AND swap_id = p_swap_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found for this swap.';
  END IF;

  IF v_msg.sender_id <> v_user THEN
    RAISE EXCEPTION 'Unauthorized: Only message sender can attach files.';
  END IF;

  IF p_storage_path IS NULL OR p_storage_path NOT LIKE 'chat-attachments/' || p_swap_id::text || '/' || p_message_id::text || '/%' THEN
    RAISE EXCEPTION 'Invalid storage path structure for chat attachment.';
  END IF;

  IF p_file_size IS NOT NULL AND p_file_size > 26214400 THEN
    RAISE EXCEPTION 'File size exceeds maximum allowed limit of 25MB.';
  END IF;

  -- Server-side MIME validation: do NOT trust client p_mime_type
  v_canonical_mime := public.get_canonical_mime_type(p_file_name);
  IF v_canonical_mime IS NULL THEN
    RAISE EXCEPTION 'Invalid file format or upload rejected: unsupported file extension for "%".', p_file_name;
  END IF;

  v_stored_filename := regexp_replace(COALESCE(p_file_name, 'unnamed_file'), '[\0\r\n\t/]', '_', 'g');
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
    p_swap_id,
    v_user,
    p_storage_path,
    v_stored_filename,
    v_canonical_mime,
    p_file_size,
    v_expires_at
  )
  RETURNING id INTO v_att_id;

  RETURN jsonb_build_object(
    'success', true,
    'attachment_id', v_att_id,
    'storage_path', p_storage_path,
    'mime_type', v_canonical_mime,
    'delete_after', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_swap_message_attachment(uuid, uuid, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_swap_message_attachment(uuid, uuid, text, text, text, bigint) TO authenticated, service_role;

-- 4. Hardened register_swap_attachment with Server-side MIME Validation
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
  v_canonical_mime text;
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

  -- Server-side MIME validation: do NOT trust client p_mime_type
  v_canonical_mime := public.get_canonical_mime_type(v_clean_filename);
  IF v_canonical_mime IS NULL THEN
    RAISE EXCEPTION 'Invalid file format or upload rejected: unsupported file extension for "%".', v_clean_filename;
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
    v_canonical_mime,
    p_file_size
  ) RETURNING id INTO v_attachment_id;

  RETURN jsonb_build_object(
    'success', true,
    'attachment_id', v_attachment_id,
    'mime_type', v_canonical_mime
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

-- 5. Hardened submit_swap_work with Server-side MIME Validation & File Count Limits
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
  v_submission_id uuid;
  v_file record;
  v_submitted_at timestamptz := now();
  v_auto_release_at timestamptz := v_submitted_at + interval '7 days';
  v_clean_notes text;
  v_file_count integer := 0;
  v_file_path text;
  v_file_name text;
  v_stored_filename text;
  v_canonical_mime text;
  v_file_size bigint;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  IF v_swap.participant_id IS NULL OR v_swap.participant_id <> v_user THEN
    RAISE EXCEPTION 'Only the designated participant can submit work.';
  END IF;

  IF v_swap.status NOT IN ('accepted', 'submitted') THEN
    RAISE EXCEPTION 'Swap is not eligible for submission (current status: %).', v_swap.status;
  END IF;

  v_clean_notes := trim(COALESCE(p_notes, ''));
  IF p_files IS NOT NULL AND jsonb_typeof(p_files) = 'array' THEN
    v_file_count := jsonb_array_length(p_files);
  END IF;

  IF v_clean_notes = '' AND v_file_count = 0 THEN
    RAISE EXCEPTION 'Submission must contain notes or at least one attachment.';
  END IF;

  IF v_file_count > 5 THEN
    RAISE EXCEPTION 'Exceeded maximum limit of 5 files per submission.';
  END IF;

  UPDATE public.swaps
  SET status = 'submitted',
      submitted_at = COALESCE(submitted_at, v_submitted_at),
      auto_release_at = COALESCE(auto_release_at, v_auto_release_at),
      updated_at = v_submitted_at
  WHERE id = p_swap_id
  RETURNING * INTO v_swap;

  SELECT id INTO v_submission_id
  FROM public.swap_submissions
  WHERE swap_id = p_swap_id;

  IF v_submission_id IS NOT NULL THEN
    UPDATE public.swap_submissions
    SET notes = v_clean_notes,
        updated_at = v_submitted_at
    WHERE id = v_submission_id;

    DELETE FROM public.swap_submission_files
    WHERE submission_id = v_submission_id;
  ELSE
    INSERT INTO public.swap_submissions (
      swap_id,
      submitted_by,
      notes,
      created_at,
      updated_at
    ) VALUES (
      p_swap_id,
      v_user,
      v_clean_notes,
      v_submitted_at,
      v_submitted_at
    )
    RETURNING id INTO v_submission_id;
  END IF;

  IF v_file_count > 0 THEN
    FOR v_file IN SELECT * FROM jsonb_to_recordset(p_files) AS x(
      storage_path text,
      file_name text,
      mime_type text,
      file_size bigint
    )
    LOOP
      v_file_path := trim(COALESCE(v_file.storage_path, ''));
      v_file_name := trim(COALESCE(v_file.file_name, 'unnamed_file'));
      v_file_size := COALESCE(v_file.file_size, 0);

      IF v_file_size > 26214400 THEN
        RAISE EXCEPTION 'File size exceeds maximum allowed limit of 25MB.';
      END IF;

      IF v_file_path NOT LIKE 'submissions/' || p_swap_id::text || '/' || v_user::text || '/%' THEN
        RAISE EXCEPTION 'Invalid storage path structure for submission file.';
      END IF;

      -- Server-side MIME validation: do NOT trust client p_mime_type
      v_canonical_mime := public.get_canonical_mime_type(v_file_name);
      IF v_canonical_mime IS NULL THEN
        RAISE EXCEPTION 'Invalid file format or upload rejected: unsupported file extension for "%".', v_file_name;
      END IF;

      v_stored_filename := regexp_replace(v_file_name, '[\0\r\n\t/]', '_', 'g');

      INSERT INTO public.swap_submission_files (
        submission_id,
        storage_path,
        file_name,
        mime_type,
        file_size,
        created_at,
        storage_expires_at
      ) VALUES (
        v_submission_id,
        v_file_path,
        v_stored_filename,
        v_canonical_mime,
        v_file_size,
        v_submitted_at,
        v_submitted_at + interval '24 hours'
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', v_submission_id,
    'swap_id', p_swap_id,
    'status', v_swap.status,
    'submitted_at', v_swap.submitted_at,
    'auto_release_at', v_swap.auto_release_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_swap_work(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_swap_work(uuid, text, jsonb) TO authenticated, service_role;

-- 6. Atomic RPC send_chat_message_with_attachments
-- Guarantees atomic creation of message AND attachment metadata in one transaction.
-- Handles TEXT ONLY, TEXT + ATTACHMENT, and ATTACHMENT ONLY cleanly.
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
  v_created_attachments jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  IF v_swap.requester_id <> v_user AND COALESCE(v_swap.participant_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_user THEN
    RAISE EXCEPTION 'Unauthorized: User is not a participant in this swap.';
  END IF;

  IF p_recipient_id IS NULL OR (p_recipient_id <> v_swap.requester_id AND p_recipient_id <> COALESCE(v_swap.participant_id, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
    RAISE EXCEPTION 'Invalid recipient for this swap.';
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

      IF v_storage_path NOT LIKE 'chat-attachments/' || p_swap_id::text || '/' || v_msg_id::text || '/%' THEN
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
