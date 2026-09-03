-- Migration 013: Production Chat and Submission Workflows with RLS and Storage Security

-- Ensure storage schema and tables exist for testing and production environments
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner uuid REFERENCES auth.users,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  public boolean DEFAULT false,
  avif_autodetection boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid REFERENCES auth.users,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  metadata jsonb,
  path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED
);

-- Register swap-submissions bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('swap-submissions', 'swap-submissions', false, 26214400)
ON CONFLICT (id) DO NOTHING;

-- 1. SWAP MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.swap_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swap_id uuid NOT NULL REFERENCES public.swaps(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_swap_messages_different_users CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_swap_messages_swap_created ON public.swap_messages(swap_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_swap_messages_recipient_created ON public.swap_messages(recipient_id, created_at ASC);

ALTER TABLE public.swap_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swap_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own swap messages" ON public.swap_messages;
CREATE POLICY "Users can read their own swap messages" ON public.swap_messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid() OR recipient_id = auth.uid()
  );

DROP POLICY IF EXISTS "Participants can send swap messages" ON public.swap_messages;
CREATE POLICY "Participants can send swap messages" ON public.swap_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    sender_id <> recipient_id AND
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id = swap_id
        AND (
          (s.requester_id = auth.uid() AND s.participant_id = recipient_id) OR
          (s.participant_id = auth.uid() AND s.requester_id = recipient_id) OR
          (s.requester_id = auth.uid() AND s.participant_id IS NULL AND s.chat_permission IN ('requester', 'anyone'))
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

-- 2. SWAP SUBMISSIONS & FILES TABLES
CREATE TABLE IF NOT EXISTS public.swap_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swap_id uuid NOT NULL UNIQUE REFERENCES public.swaps(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes text NOT NULL CHECK (length(btrim(notes)) > 0),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swap_submissions_swap_id ON public.swap_submissions(swap_id);
CREATE INDEX IF NOT EXISTS idx_swap_submissions_submitted_by ON public.swap_submissions(submitted_by);

ALTER TABLE public.swap_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swap_submissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Swap members can view submissions" ON public.swap_submissions;
CREATE POLICY "Swap members can view submissions" ON public.swap_submissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id = swap_submissions.swap_id
        AND (s.requester_id = auth.uid() OR s.participant_id = auth.uid())
    )
  );

GRANT SELECT ON public.swap_submissions TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.swap_submission_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.swap_submissions(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint CHECK (file_size >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swap_submission_files_submission ON public.swap_submission_files(submission_id);

ALTER TABLE public.swap_submission_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swap_submission_files FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Swap members can view submission files" ON public.swap_submission_files;
CREATE POLICY "Swap members can view submission files" ON public.swap_submission_files
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.swap_submissions sub
      JOIN public.swaps s ON sub.swap_id = s.id
      WHERE sub.id = swap_submission_files.submission_id
        AND (s.requester_id = auth.uid() OR s.participant_id = auth.uid())
    )
  );

GRANT SELECT ON public.swap_submission_files TO authenticated, service_role;

-- 3. ATOMIC SUBMISSION RPC
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

  -- Create or update submission record
  INSERT INTO public.swap_submissions (swap_id, submitted_by, notes)
  VALUES (p_swap_id, v_user, p_notes)
  ON CONFLICT (swap_id) DO UPDATE
    SET notes = EXCLUDED.notes,
        updated_at = now()
  RETURNING * INTO v_submission;

  -- Remove existing file records if re-submitting to maintain clean metadata state
  DELETE FROM public.swap_submission_files WHERE submission_id = v_submission.id;

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

-- 4. HARDENED COMPLETE_CREDIT_SWAP RPC (Ensuring submission exists before completing)
CREATE OR REPLACE FUNCTION public.complete_credit_swap(p_swap_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_swap public.swaps;
  v_payer public.accounts;
  v_payee public.accounts;
  v_has_submission boolean;
BEGIN
  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found.';
  END IF;

  IF v_swap.status = 'completed' AND v_swap.requester_id = v_user THEN
    RETURN jsonb_build_object('success', true, 'idempotent_retry', true);
  END IF;

  IF v_user IS NULL OR v_swap.requester_id <> v_user OR v_swap.participant_id IS NULL OR v_swap.status <> 'submitted' THEN
    RAISE EXCEPTION 'Swap is not eligible for completion.';
  END IF;

  -- Verify a valid submission record exists
  SELECT EXISTS(SELECT 1 FROM public.swap_submissions WHERE swap_id = p_swap_id) INTO v_has_submission;
  IF NOT v_has_submission THEN
    RAISE EXCEPTION 'Cannot complete swap without a recorded work submission.';
  END IF;

  -- Row lock order by user_id to prevent deadlock
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

  -- Settle credits
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
  VALUES (
    v_swap.requester_id, 0, v_payer.credits_balance, 'settlement_payer', 'Swap settlement', v_swap.participant_id, p_swap_id::text, 'swap_settlement:' || p_swap_id::text || ':payer'
  ), (
    v_swap.participant_id, v_swap.credit_amount, v_payee.credits_balance, 'settlement_recipient', 'Swap settlement reward', v_swap.requester_id, p_swap_id::text, 'swap_settlement:' || p_swap_id::text || ':recipient'
  );

  INSERT INTO public.credit_operations(operation_id, user_id, operation_type, amount, related_swap_id)
  VALUES ('swap_settlement:' || p_swap_id::text, v_swap.requester_id, 'settlement', v_swap.credit_amount, p_swap_id::text);

  UPDATE public.swap_submissions
  SET reviewed_at = now(),
      reviewed_by = v_user
  WHERE swap_id = p_swap_id;

  UPDATE public.swaps
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_swap_id;

  RETURN jsonb_build_object(
    'success', true,
    'payer_credits_balance', v_payer.credits_balance,
    'payer_credits_reserved', v_payer.credits_reserved,
    'recipient_credits_balance', v_payee.credits_balance
  );
END $$;

-- 5. REALTIME PUBLICATION ENABLEMENT
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.swap_messages;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.swap_submissions;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.swaps;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

NOTIFY pgrst, 'reload schema';
