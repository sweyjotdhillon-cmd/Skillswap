-- Migration 022: Canonical Creator Attachment Schema & SECURITY DEFINER RPC Hardening

-- ============================================================================
-- 1. Canonical Creator Attachment Table Architecture
-- Table: public.swap_attachment_files (primary)
-- View:  public.swap_attachments (backwards compatibility view over swap_attachment_files with security_invoker = true)
-- ============================================================================

-- Safely drop old view for swap_attachment_files if it was previously created as a view in 021
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'swap_attachment_files'
  ) THEN
    DROP VIEW public.swap_attachment_files CASCADE;
  END IF;
END $$;

-- Create canonical table public.swap_attachment_files
CREATE TABLE IF NOT EXISTS public.swap_attachment_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swap_id uuid NOT NULL REFERENCES public.swaps(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint CHECK (file_size >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Migrate data if public.swap_attachments was created as a table in earlier migrations, then drop table/view
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'swap_attachments' AND table_type = 'BASE TABLE'
  ) THEN
    INSERT INTO public.swap_attachment_files (id, swap_id, uploaded_by, storage_path, file_name, mime_type, file_size, created_at)
    SELECT id, swap_id, uploaded_by, storage_path, file_name, mime_type, file_size, created_at
    FROM public.swap_attachments
    ON CONFLICT (id) DO NOTHING;

    DROP TABLE public.swap_attachments CASCADE;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'swap_attachments'
  ) THEN
    DROP VIEW public.swap_attachments CASCADE;
  END IF;
END $$;

-- Compatibility view pointing to canonical table public.swap_attachment_files with security_invoker = true to enforce underlying RLS
CREATE OR REPLACE VIEW public.swap_attachments WITH (security_invoker = true) AS
SELECT
  id,
  swap_id,
  uploaded_by,
  storage_path,
  file_name,
  mime_type,
  file_size,
  created_at
FROM public.swap_attachment_files;

CREATE INDEX IF NOT EXISTS idx_swap_attachment_files_swap_id ON public.swap_attachment_files(swap_id);
CREATE INDEX IF NOT EXISTS idx_swap_attachment_files_uploaded_by ON public.swap_attachment_files(uploaded_by);

ALTER TABLE public.swap_attachment_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swap_attachment_files FORCE ROW LEVEL SECURITY;

-- RLS Policies on public.swap_attachment_files
DROP POLICY IF EXISTS "Swap members can view creator attachments" ON public.swap_attachment_files;
CREATE POLICY "Swap members can view creator attachments" ON public.swap_attachment_files
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id = swap_attachment_files.swap_id
        AND (
          s.requester_id = auth.uid() OR
          (s.participant_id = auth.uid() AND s.status IN ('accepted', 'submitted', 'completed'))
        )
    )
  );

DROP POLICY IF EXISTS "Swap creator can insert attachments" ON public.swap_attachment_files;
CREATE POLICY "Swap creator can insert attachments" ON public.swap_attachment_files
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id = swap_attachment_files.swap_id
        AND s.requester_id = auth.uid()
        AND s.status = 'open'
    )
  );

DROP POLICY IF EXISTS "Swap creator can delete attachments" ON public.swap_attachment_files;
CREATE POLICY "Swap creator can delete attachments" ON public.swap_attachment_files
  FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id = swap_attachment_files.swap_id
        AND s.requester_id = auth.uid()
        AND s.status = 'open'
    )
  );

REVOKE ALL ON public.swap_attachment_files FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.swap_attachment_files TO authenticated, service_role;
GRANT SELECT ON public.swap_attachments TO authenticated, service_role;

-- ============================================================================
-- 2. Storage Bucket and RLS Policies for swap-attachments
-- Canonical format: swap-attachments/<swap_id>/<creator_user_id>/<safe_filename>
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('swap-attachments', 'swap-attachments', false, 26214400)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Swap members can read creator attachment files in swap-attachments bucket" ON storage.objects;
    DROP POLICY IF EXISTS "Swap members can read creator attachment files" ON storage.objects;
    CREATE POLICY "Swap members can read creator attachment files in swap-attachments bucket" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'swap-attachments' AND
        (storage.foldername(name))[1] = 'swap-attachments' AND
        storage.filename(name) IS NOT NULL AND storage.filename(name) <> '' AND
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
    DROP POLICY IF EXISTS "Swap creator can upload attachment files" ON storage.objects;
    CREATE POLICY "Swap creator can upload attachment files in swap-attachments bucket" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'swap-attachments' AND
        (storage.foldername(name))[1] = 'swap-attachments' AND
        (storage.foldername(name))[3] = auth.uid()::text AND
        storage.filename(name) IS NOT NULL AND storage.filename(name) <> '' AND
        EXISTS (
          SELECT 1 FROM public.swaps s
          WHERE s.id::text = (storage.foldername(name))[2]
            AND s.requester_id = auth.uid()
            AND s.status = 'open'
        )
      );

    DROP POLICY IF EXISTS "Swap creator can delete attachment files in swap-attachments bucket" ON storage.objects;
    DROP POLICY IF EXISTS "Swap creator can delete attachment files" ON storage.objects;
    CREATE POLICY "Swap creator can delete attachment files in swap-attachments bucket" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'swap-attachments' AND
        (storage.foldername(name))[1] = 'swap-attachments' AND
        (storage.foldername(name))[3] = auth.uid()::text AND
        storage.filename(name) IS NOT NULL AND storage.filename(name) <> '' AND
        EXISTS (
          SELECT 1 FROM public.swaps s
          WHERE s.id::text = (storage.foldername(name))[2]
            AND s.requester_id = auth.uid()
            AND s.status = 'open'
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 3. Hardened SECURITY DEFINER RPCs for Creator Attachments
-- ============================================================================

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

  INSERT INTO public.swap_attachment_files (
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
  FROM public.swap_attachment_files a
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

  DELETE FROM public.swap_attachment_files
  WHERE id = p_attachment_id AND uploaded_by = auth.uid();

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.unregister_swap_attachment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unregister_swap_attachment(uuid) TO authenticated, service_role;

-- ============================================================================
-- 4. Audit & Hardening of All Relevant SECURITY DEFINER RPCs Used by Swaps
-- ============================================================================

-- 4.1 create_credit_swap
CREATE OR REPLACE FUNCTION public.create_credit_swap(
  p_topic text,
  p_description text,
  p_requirements text,
  p_chat_permission text,
  p_credit_amount integer,
  p_additional_message text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_swap uuid;
  v_existing_swap uuid;
  v_account public.accounts;
  v_op_key text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_credit_amount IS NULL OR p_credit_amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be greater than zero.';
  END IF;

  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    SELECT id INTO v_existing_swap
    FROM public.swaps
    WHERE idempotency_key = p_idempotency_key AND requester_id = v_user;

    IF v_existing_swap IS NOT NULL THEN
      RETURN v_existing_swap;
    END IF;
  END IF;

  PERFORM public.ensure_credit_account(v_user);

  SELECT * INTO v_account FROM public.accounts WHERE user_id = v_user FOR UPDATE;

  IF v_account.credits_balance < p_credit_amount THEN
    RAISE EXCEPTION 'Insufficient credit balance.';
  END IF;

  BEGIN
    INSERT INTO public.swaps(
      requester_id, topic, description, requirements,
      chat_permission, credit_amount, additional_message, idempotency_key
    )
    VALUES (
      v_user, p_topic, p_description, p_requirements,
      p_chat_permission, p_credit_amount, p_additional_message, p_idempotency_key
    )
    RETURNING id INTO v_swap;
  EXCEPTION WHEN unique_violation THEN
    IF p_idempotency_key IS NOT NULL THEN
      SELECT id INTO v_existing_swap
      FROM public.swaps
      WHERE idempotency_key = p_idempotency_key AND requester_id = v_user;

      IF v_existing_swap IS NOT NULL THEN
        RETURN v_existing_swap;
      END IF;
    END IF;
    RAISE;
  END;

  UPDATE public.accounts
  SET credits_balance = credits_balance - p_credit_amount,
      credits_reserved = credits_reserved + p_credit_amount
  WHERE user_id = v_user
  RETURNING * INTO v_account;

  v_op_key := COALESCE(p_idempotency_key, 'swap_reservation:' || v_swap::text);

  INSERT INTO public.credit_transactions(
    user_id, amount, balance_after, transaction_type, reason, related_swap_id, idempotency_key
  )
  VALUES (
    v_user, -p_credit_amount, v_account.credits_balance, 'reservation',
    'Swap credit reservation', v_swap::text, 'swap_reservation:' || v_swap::text
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  INSERT INTO public.credit_operations(
    operation_id, user_id, operation_type, amount, related_swap_id
  )
  VALUES (
    v_op_key, v_user, 'reserve', p_credit_amount, v_swap::text
  )
  ON CONFLICT (operation_id) DO NOTHING;

  RETURN v_swap;
END;
$$;

REVOKE ALL ON FUNCTION public.create_credit_swap(text, text, text, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_credit_swap(text, text, text, text, integer, text, text) TO authenticated, service_role;

-- 4.2 accept_credit_swap
CREATE OR REPLACE FUNCTION public.accept_credit_swap(p_swap_id uuid)
RETURNS public.swaps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_swap public.swaps;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  IF v_swap.status = 'accepted' AND v_swap.participant_id = v_user THEN
    RETURN v_swap;
  END IF;

  IF v_swap.status <> 'open' OR v_swap.requester_id = v_user THEN
    RAISE EXCEPTION 'Swap cannot be accepted.';
  END IF;

  UPDATE public.swaps
  SET participant_id = v_user, status = 'accepted'
  WHERE id = p_swap_id
  RETURNING * INTO v_swap;

  RETURN v_swap;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_credit_swap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_credit_swap(uuid) TO authenticated, service_role;

-- 4.3 cancel_credit_swap
CREATE OR REPLACE FUNCTION public.cancel_credit_swap(p_swap_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_swap public.swaps;
  v_requester_account public.accounts;
  v_status_to_set text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  IF v_swap.status IN ('cancelled', 'declined', 'withdrawn', 'expired') THEN
    IF v_swap.requester_id = v_user OR v_swap.participant_id = v_user THEN
      RETURN jsonb_build_object('success', true, 'idempotent_retry', true);
    END IF;
  END IF;

  IF v_swap.requester_id <> v_user AND (v_swap.participant_id IS NULL OR v_swap.participant_id <> v_user) THEN
    RAISE EXCEPTION 'Swap cannot be cancelled by this user.';
  END IF;

  IF v_swap.status NOT IN ('open', 'accepted', 'submitted') THEN
    RAISE EXCEPTION 'Swap cannot be cancelled in its current status.';
  END IF;

  v_status_to_set := CASE WHEN v_swap.requester_id = v_user THEN 'cancelled' ELSE 'declined' END;

  SELECT * INTO v_requester_account FROM public.accounts WHERE user_id = v_swap.requester_id FOR UPDATE;

  IF v_requester_account.credits_reserved >= v_swap.credit_amount THEN
    UPDATE public.accounts
    SET credits_reserved = credits_reserved - v_swap.credit_amount,
        credits_balance = credits_balance + v_swap.credit_amount
    WHERE user_id = v_swap.requester_id
    RETURNING * INTO v_requester_account;

    INSERT INTO public.credit_transactions(user_id, amount, balance_after, transaction_type, reason, related_swap_id, idempotency_key)
    VALUES (
      v_swap.requester_id,
      v_swap.credit_amount,
      v_requester_account.credits_balance,
      'reservation_release',
      'Swap ' || v_status_to_set || '; reservation released',
      p_swap_id::text,
      'swap_release:' || p_swap_id::text
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    INSERT INTO public.credit_operations(operation_id, user_id, operation_type, amount, related_swap_id)
    VALUES ('swap_release:' || p_swap_id::text, v_swap.requester_id, 'release', v_swap.credit_amount, p_swap_id::text)
    ON CONFLICT (operation_id) DO NOTHING;
  END IF;

  UPDATE public.swaps
  SET status = v_status_to_set,
      cancelled_at = now()
  WHERE id = p_swap_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status_to_set,
    'requester_credits_balance', v_requester_account.credits_balance,
    'requester_credits_reserved', v_requester_account.credits_reserved
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_credit_swap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_credit_swap(uuid) TO authenticated, service_role;

-- 4.4 submit_credit_swap
CREATE OR REPLACE FUNCTION public.submit_credit_swap(p_swap_id uuid)
RETURNS public.swaps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_swap public.swaps;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id FOR UPDATE;
  IF NOT FOUND OR v_swap.participant_id <> v_user OR v_swap.status <> 'accepted' THEN
    RAISE EXCEPTION 'Swap cannot be submitted.';
  END IF;

  UPDATE public.swaps
  SET status = 'submitted', submitted_at = now()
  WHERE id = p_swap_id
  RETURNING * INTO v_swap;

  RETURN v_swap;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_credit_swap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_credit_swap(uuid) TO authenticated, service_role;

-- 4.5 submit_swap_work
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
  v_existing_submission_id uuid;
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

  IF v_swap.status <> 'accepted' THEN
    RAISE EXCEPTION 'Swap is not eligible for submission (current status: %).', v_swap.status;
  END IF;

  SELECT id INTO v_existing_submission_id FROM public.swap_submissions WHERE swap_id = p_swap_id;
  IF v_existing_submission_id IS NOT NULL THEN
    RAISE EXCEPTION 'Work has already been submitted for this swap.';
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

  INSERT INTO public.swap_submissions (swap_id, submitted_by, notes)
  VALUES (p_swap_id, v_user, v_clean_notes)
  RETURNING * INTO v_submission;

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
END;
$$;

REVOKE ALL ON FUNCTION public.submit_swap_work(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_swap_work(uuid, text, jsonb) TO authenticated, service_role;

-- 4.6 complete_credit_swap
CREATE OR REPLACE FUNCTION public.complete_credit_swap(p_swap_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_swap public.swaps;
  v_payer public.accounts;
  v_payee public.accounts;
  v_has_submission boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  IF v_swap.status = 'completed' AND v_swap.requester_id = v_user THEN
    RETURN jsonb_build_object('success', true, 'idempotent_retry', true);
  END IF;

  IF v_swap.requester_id <> v_user OR v_swap.participant_id IS NULL OR v_swap.status <> 'submitted' THEN
    RAISE EXCEPTION 'Swap is not eligible for completion.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.swap_submissions WHERE swap_id = p_swap_id
  ) INTO v_has_submission;

  IF NOT v_has_submission THEN
    RAISE EXCEPTION 'Cannot complete swap: no work submission found.';
  END IF;

  IF v_swap.requester_id < v_swap.participant_id THEN
    SELECT * INTO v_payer FROM public.accounts WHERE user_id = v_swap.requester_id FOR UPDATE;
    SELECT * INTO v_payee FROM public.accounts WHERE user_id = v_swap.participant_id FOR UPDATE;
  ELSE
    SELECT * INTO v_payee FROM public.accounts WHERE user_id = v_swap.participant_id FOR UPDATE;
    SELECT * INTO v_payer FROM public.accounts WHERE user_id = v_swap.requester_id FOR UPDATE;
  END IF;

  IF v_payer.credits_reserved < v_swap.credit_amount THEN
    RAISE EXCEPTION 'Reserved credit commitment is missing.';
  END IF;

  UPDATE public.accounts
  SET credits_reserved = credits_reserved - v_swap.credit_amount,
      credits_spent = credits_spent + v_swap.credit_amount
  WHERE user_id = v_swap.requester_id
  RETURNING * INTO v_payer;

  UPDATE public.accounts
  SET credits_balance = credits_balance + v_swap.credit_amount,
      credits_earned = credits_earned + v_swap.credit_amount
  WHERE user_id = v_swap.participant_id
  RETURNING * INTO v_payee;

  INSERT INTO public.credit_transactions(user_id, amount, balance_after, transaction_type, reason, related_user_id, related_swap_id, idempotency_key)
  VALUES
    (v_swap.requester_id, 0, v_payer.credits_balance, 'settlement_payer', 'Swap settlement', v_swap.participant_id, p_swap_id::text, 'swap_settlement:' || p_swap_id::text || ':payer'),
    (v_swap.participant_id, v_swap.credit_amount, v_payee.credits_balance, 'settlement_recipient', 'Swap settlement reward', v_swap.requester_id, p_swap_id::text, 'swap_settlement:' || p_swap_id::text || ':recipient');

  INSERT INTO public.credit_operations(operation_id, user_id, operation_type, amount, related_swap_id)
  VALUES ('swap_settlement:' || p_swap_id::text, v_swap.requester_id, 'settlement', v_swap.credit_amount, p_swap_id::text);

  UPDATE public.swaps
  SET status = 'completed', completed_at = now()
  WHERE id = p_swap_id;

  RETURN jsonb_build_object(
    'success', true,
    'payer_credits_balance', v_payer.credits_balance,
    'payer_credits_reserved', v_payer.credits_reserved,
    'recipient_credits_balance', v_payee.credits_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_credit_swap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_credit_swap(uuid) TO authenticated, service_role;

-- 4.7 complete_profile
CREATE OR REPLACE FUNCTION public.complete_profile()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_profile RECORD;
  v_skills_count INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('complete_profile_lock_' || v_user_id::text));

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found.';
  END IF;

  IF v_profile.is_profile_completed = TRUE THEN
    RETURN jsonb_build_object('success', true, 'message', 'Profile is already completed.');
  END IF;

  IF v_profile.username IS NULL OR TRIM(v_profile.username) = '' OR v_profile.username LIKE 'user_%' THEN
    RAISE EXCEPTION 'A valid custom username is required before completing your profile.';
  END IF;

  SELECT (
    (SELECT COUNT(*) FROM public.user_skills WHERE user_id = v_user_id) +
    (SELECT COUNT(*) FROM public.user_custom_skills WHERE user_id = v_user_id)
  ) INTO v_skills_count;

  IF v_skills_count < 1 THEN
    RAISE EXCEPTION 'At least 1 skill must be added before completing your profile.';
  END IF;

  UPDATE public.profiles
  SET is_profile_completed = TRUE,
      updated_at = NOW()
  WHERE id = v_user_id;

  PERFORM public.ensure_credit_account(v_user_id);

  RETURN jsonb_build_object('success', true, 'message', 'Profile completed successfully.');
END;
$$;

REVOKE ALL ON FUNCTION public.complete_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_profile() TO authenticated, service_role;

-- 4.8 get_user_account
CREATE OR REPLACE FUNCTION public.get_user_account()
RETURNS public.accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  RETURN public.ensure_credit_account(v_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_account() TO authenticated, service_role;

-- 4.9 has_user_password
CREATE OR REPLACE FUNCTION public.has_user_password()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_encrypted_password TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT encrypted_password INTO v_encrypted_password
  FROM auth.users
  WHERE id = v_user_id;

  RETURN v_encrypted_password IS NOT NULL AND v_encrypted_password <> '';
END;
$$;

REVOKE ALL ON FUNCTION public.has_user_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_user_password() TO authenticated, service_role;

-- 4.10 add_user_skill
CREATE OR REPLACE FUNCTION public.add_user_skill(
  p_skill_id UUID DEFAULT NULL,
  p_custom_skill_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_total_skills INT;
  v_clean_custom_name TEXT;
  v_new_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_skill_id IS NULL AND (p_custom_skill_name IS NULL OR TRIM(p_custom_skill_name) = '') THEN
    RAISE EXCEPTION 'Must provide either a predefined skill_id or a custom_skill_name.';
  END IF;

  IF p_skill_id IS NOT NULL AND (p_custom_skill_name IS NOT NULL AND TRIM(p_custom_skill_name) <> '') THEN
    RAISE EXCEPTION 'Cannot provide both skill_id and custom_skill_name simultaneously.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('user_skills_lock_' || v_user_id::text));

  SELECT (
    (SELECT COUNT(*) FROM public.user_skills WHERE user_id = v_user_id) +
    (SELECT COUNT(*) FROM public.user_custom_skills WHERE user_id = v_user_id)
  ) INTO v_total_skills;

  IF v_total_skills >= 10 THEN
    RAISE EXCEPTION 'Maximum skill limit (10) reached.';
  END IF;

  IF p_skill_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.skills_catalog WHERE id = p_skill_id AND is_active = TRUE) THEN
      RAISE EXCEPTION 'Invalid or inactive skill_id.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.user_skills WHERE user_id = v_user_id AND skill_id = p_skill_id) THEN
      RAISE EXCEPTION 'Skill is already added to your profile.';
    END IF;

    INSERT INTO public.user_skills (user_id, skill_id)
    VALUES (v_user_id, p_skill_id)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
      'success', true,
      'type', 'predefined',
      'id', v_new_id
    );
  ELSE
    v_clean_custom_name := TRIM(p_custom_skill_name);
    IF LENGTH(v_clean_custom_name) < 2 OR LENGTH(v_clean_custom_name) > 50 THEN
      RAISE EXCEPTION 'Custom skill name must be between 2 and 50 characters.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.user_custom_skills
      WHERE user_id = v_user_id AND LOWER(custom_skill_name) = LOWER(v_clean_custom_name)
    ) THEN
      RAISE EXCEPTION 'Skill is already added to your profile.';
    END IF;

    INSERT INTO public.user_custom_skills (user_id, custom_skill_name)
    VALUES (v_user_id, v_clean_custom_name)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
      'success', true,
      'type', 'custom',
      'id', v_new_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.add_user_skill(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_user_skill(UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
