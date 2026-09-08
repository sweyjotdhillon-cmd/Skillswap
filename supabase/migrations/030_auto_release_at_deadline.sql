-- Migration 030: Add auto_release_at to public.swaps & align auto-release timeout handling

-- 1. Add auto_release_at timestamptz column to public.swaps
ALTER TABLE public.swaps ADD COLUMN IF NOT EXISTS auto_release_at timestamptz;

-- Index for efficient timeout queries
CREATE INDEX IF NOT EXISTS idx_swaps_status_auto_release ON public.swaps(status, auto_release_at) WHERE status = 'submitted';

-- 2. Backfill existing submitted swaps with auto_release_at = submitted_at + 7 days if null
UPDATE public.swaps
SET auto_release_at = submitted_at + interval '7 days'
WHERE status = 'submitted' AND auto_release_at IS NULL AND submitted_at IS NOT NULL;

-- 3. Update submit_swap_work RPC to populate auto_release_at when status transitions to submitted
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
  v_submitted_time timestamptz := now();
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
  VALUES (p_swap_id, v_user, v_clean_notes, v_submitted_time)
  ON CONFLICT (swap_id) DO UPDATE
    SET notes = EXCLUDED.notes,
        submitted_by = EXCLUDED.submitted_by,
        updated_at = v_submitted_time
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
      submitted_at = COALESCE(submitted_at, v_submitted_time),
      auto_release_at = COALESCE(auto_release_at, COALESCE(submitted_at, v_submitted_time) + interval '7 days'),
      updated_at = v_submitted_time
  WHERE id = p_swap_id
  RETURNING * INTO v_swap;

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', v_submission.id,
    'swap_id', v_swap.id,
    'status', v_swap.status,
    'submitted_at', v_swap.submitted_at,
    'auto_release_at', v_swap.auto_release_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_swap_work(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_swap_work(uuid, text, jsonb) TO authenticated, service_role;

-- 4. Update process_submitted_swap_timeouts RPC to consume auto_release_at
CREATE OR REPLACE FUNCTION public.process_submitted_swap_timeouts(
  p_timeout_days integer DEFAULT 7,
  p_swap_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_swap RECORD;
  v_payer public.accounts;
  v_payee public.accounts;
  v_completed_count integer := 0;
  v_completed_ids uuid[] := ARRAY[]::uuid[];
  v_cutoff timestamptz := NOW() - (p_timeout_days || ' days')::interval;
BEGIN
  IF p_timeout_days IS NULL OR p_timeout_days < 1 THEN
    p_timeout_days := 7;
  END IF;

  FOR v_swap IN
    SELECT *
    FROM public.swaps
    WHERE status = 'submitted'
      AND (p_swap_id IS NULL OR id = p_swap_id)
      AND (
        (auto_release_at IS NOT NULL AND auto_release_at <= NOW())
        OR (auto_release_at IS NULL AND submitted_at IS NOT NULL AND submitted_at <= v_cutoff)
      )
    FOR UPDATE
  LOOP
    IF v_swap.status = 'submitted' AND v_swap.participant_id IS NOT NULL THEN
      -- Lock requester and participant accounts in deterministic ID order
      IF v_swap.requester_id < v_swap.participant_id THEN
        SELECT * INTO v_payer FROM public.accounts WHERE user_id = v_swap.requester_id FOR UPDATE;
        SELECT * INTO v_payee FROM public.accounts WHERE user_id = v_swap.participant_id FOR UPDATE;
      ELSE
        SELECT * INTO v_payee FROM public.accounts WHERE user_id = v_swap.participant_id FOR UPDATE;
        SELECT * INTO v_payer FROM public.accounts WHERE user_id = v_swap.requester_id FOR UPDATE;
      END IF;

      IF v_payer.credits_reserved >= v_swap.credit_amount THEN
        -- Settle escrow from requester to participant
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

        INSERT INTO public.credit_transactions(
          user_id, amount, balance_after, transaction_type, reason, related_user_id, related_swap_id, idempotency_key
        )
        VALUES (
          v_swap.requester_id,
          0,
          v_payer.credits_balance,
          'settlement_payer',
          'Swap completed automatically via review timeout',
          v_swap.participant_id,
          v_swap.id::text,
          'swap_review_timeout:' || v_swap.id::text || ':payer'
        )
        ON CONFLICT (idempotency_key) DO NOTHING;

        INSERT INTO public.credit_transactions(
          user_id, amount, balance_after, transaction_type, reason, related_user_id, related_swap_id, idempotency_key
        )
        VALUES (
          v_swap.participant_id,
          v_swap.credit_amount,
          v_payee.credits_balance,
          'settlement_recipient',
          'Swap reward awarded automatically via review timeout',
          v_swap.requester_id,
          v_swap.id::text,
          'swap_review_timeout:' || v_swap.id::text || ':recipient'
        )
        ON CONFLICT (idempotency_key) DO NOTHING;

        INSERT INTO public.credit_operations(
          operation_id, user_id, operation_type, amount, related_swap_id
        )
        VALUES (
          'swap_review_timeout:' || v_swap.id::text,
          v_swap.requester_id,
          'settlement',
          v_swap.credit_amount,
          v_swap.id::text
        )
        ON CONFLICT (operation_id) DO NOTHING;
      END IF;

      -- Mark swap completed
      UPDATE public.swaps
      SET status = 'completed',
          completed_at = COALESCE(completed_at, NOW()),
          updated_at = NOW()
      WHERE id = v_swap.id;

      v_completed_count := v_completed_count + 1;
      v_completed_ids := array_append(v_completed_ids, v_swap.id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'completed_count', v_completed_count,
    'completed_swap_ids', to_jsonb(v_completed_ids)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_submitted_swap_timeouts(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_submitted_swap_timeouts(integer, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
