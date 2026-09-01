-- Migration: 006_credit_system_infrastructure.sql
-- Description: Robust, Atomic Backend Credit Infrastructure with Initial Grant, Ledger, Row Locking, RLS & RPC Procedures

-- ============================================================================
-- 1. ACCOUNTS TABLE ENHANCEMENTS
-- ============================================================================

-- Ensure columns exist and constraints are enforced
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS credits_balance INT NOT NULL DEFAULT 0;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS credits_earned INT NOT NULL DEFAULT 0;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS credits_spent INT NOT NULL DEFAULT 0;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Drop old constraints if present and re-add to guarantee integrity
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS chk_min_balance;
ALTER TABLE public.accounts ADD CONSTRAINT chk_min_balance CHECK (credits_balance >= 0);

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS chk_min_earned;
ALTER TABLE public.accounts ADD CONSTRAINT chk_min_earned CHECK (credits_earned >= 0);

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS chk_min_spent;
ALTER TABLE public.accounts ADD CONSTRAINT chk_min_spent CHECK (credits_spent >= 0);


-- ============================================================================
-- 2. CREDIT TRANSACTIONS LEDGER TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.accounts(user_id) ON DELETE CASCADE,
  amount INT NOT NULL,
  balance_after INT NOT NULL CONSTRAINT chk_tx_balance_after CHECK (balance_after >= 0),
  transaction_type TEXT NOT NULL CONSTRAINT chk_tx_type CHECK (
    transaction_type IN (
      'initial_grant',
      'swap_offer',
      'swap_hold',
      'swap_completion',
      'swap_reward',
      'refund',
      'cancellation_refund',
      'adjustment',
      'admin_adjustment',
      'reversal',
      'transfer_sent',
      'transfer_received'
    )
  ),
  reason TEXT NOT NULL,
  idempotency_key TEXT,
  related_swap_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index on idempotency_key (prevents duplicate retries while allowing NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_idempotency
  ON public.credit_transactions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Query performance index for listing a user's transaction history in reverse chronological order
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created
  ON public.credit_transactions(user_id, created_at DESC);


-- ============================================================================
-- 3. CORE ATOMIC STORED PROCEDURES (SECURITY DEFINER)
-- ============================================================================

-- Function: Ensure Credit Account & Perform Exactly-Once Initial Grant (+100 Credits)
CREATE OR REPLACE FUNCTION public.ensure_credit_account(p_user_id UUID)
RETURNS public.accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.accounts;
  v_idempotency_key TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null.';
  END IF;

  -- 1. Ensure account row exists
  INSERT INTO public.accounts (user_id, credits_balance, credits_earned, credits_spent)
  VALUES (p_user_id, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- 2. Obtain row lock for update
  SELECT * INTO v_account
  FROM public.accounts
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- 3. Idempotent check for initial grant
  v_idempotency_key := 'initial_grant_' || p_user_id::text;

  IF NOT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND (transaction_type = 'initial_grant' OR idempotency_key = v_idempotency_key)
  ) THEN
    -- Apply +100 Initial Credit Grant
    UPDATE public.accounts
    SET credits_balance = credits_balance + 100,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING * INTO v_account;

    -- Record Permanent Ledger Entry
    INSERT INTO public.credit_transactions (
      user_id,
      amount,
      balance_after,
      transaction_type,
      reason,
      idempotency_key
    ) VALUES (
      p_user_id,
      100,
      v_account.credits_balance,
      'initial_grant',
      'Initial SkillSwap credit grant',
      v_idempotency_key
    );
  END IF;

  RETURN v_account;
END;
$$;


-- Function: Deduct Credits Atomically with Balance Checking & Idempotency
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_amount INT,
  p_reason TEXT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_related_swap_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_transaction_type TEXT DEFAULT 'swap_hold'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_account public.accounts;
  v_existing_tx public.credit_transactions;
  v_new_tx_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be greater than zero.';
  END IF;

  -- Idempotency check: Return existing result if duplicate key
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    SELECT * INTO v_existing_tx
    FROM public.credit_transactions
    WHERE idempotency_key = TRIM(p_idempotency_key);

    IF v_existing_tx.id IS NOT NULL THEN
      SELECT * INTO v_account FROM public.accounts WHERE user_id = v_user_id;
      RETURN jsonb_build_object(
        'success', true,
        'idempotent_retry', true,
        'transaction_id', v_existing_tx.id,
        'credits_balance', v_account.credits_balance,
        'credits_spent', v_account.credits_spent
      );
    END IF;
  END IF;

  -- Ensure credit account exists & obtain row lock
  PERFORM public.ensure_credit_account(v_user_id);

  SELECT * INTO v_account
  FROM public.accounts
  WHERE user_id = v_user_id
  FOR UPDATE;

  -- Verify sufficient balance
  IF v_account.credits_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient credit balance for this operation.';
  END IF;

  -- Atomically deduct credits
  UPDATE public.accounts
  SET credits_balance = credits_balance - p_amount,
      credits_spent = credits_spent + p_amount,
      updated_at = NOW()
  WHERE user_id = v_user_id
  RETURNING * INTO v_account;

  -- Insert ledger entry
  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    balance_after,
    transaction_type,
    reason,
    idempotency_key,
    related_swap_id,
    metadata
  ) VALUES (
    v_user_id,
    -p_amount,
    v_account.credits_balance,
    COALESCE(p_transaction_type, 'swap_hold'),
    COALESCE(p_reason, 'Credit deduction'),
    NULLIF(TRIM(p_idempotency_key), ''),
    p_related_swap_id,
    p_metadata
  )
  RETURNING id INTO v_new_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_new_tx_id,
    'credits_balance', v_account.credits_balance,
    'credits_spent', v_account.credits_spent
  );
END;
$$;


-- Function: Add Credits Atomically with Idempotency
CREATE OR REPLACE FUNCTION public.add_credits(
  p_user_id UUID,
  p_amount INT,
  p_reason TEXT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_related_swap_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_transaction_type TEXT DEFAULT 'swap_reward'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.accounts;
  v_existing_tx public.credit_transactions;
  v_new_tx_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required.';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be greater than zero.';
  END IF;

  -- Idempotency check: Return existing result if duplicate key
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    SELECT * INTO v_existing_tx
    FROM public.credit_transactions
    WHERE idempotency_key = TRIM(p_idempotency_key);

    IF v_existing_tx.id IS NOT NULL THEN
      SELECT * INTO v_account FROM public.accounts WHERE user_id = p_user_id;
      RETURN jsonb_build_object(
        'success', true,
        'idempotent_retry', true,
        'transaction_id', v_existing_tx.id,
        'credits_balance', v_account.credits_balance,
        'credits_earned', v_account.credits_earned
      );
    END IF;
  END IF;

  -- Ensure credit account exists & obtain row lock
  PERFORM public.ensure_credit_account(p_user_id);

  SELECT * INTO v_account
  FROM public.accounts
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Atomically add credits
  UPDATE public.accounts
  SET credits_balance = credits_balance + p_amount,
      credits_earned = credits_earned + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_account;

  -- Insert ledger entry
  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    balance_after,
    transaction_type,
    reason,
    idempotency_key,
    related_swap_id,
    metadata
  ) VALUES (
    p_user_id,
    p_amount,
    v_account.credits_balance,
    COALESCE(p_transaction_type, 'swap_reward'),
    COALESCE(p_reason, 'Credit addition'),
    NULLIF(TRIM(p_idempotency_key), ''),
    p_related_swap_id,
    p_metadata
  )
  RETURNING id INTO v_new_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_new_tx_id,
    'credits_balance', v_account.credits_balance,
    'credits_earned', v_account.credits_earned
  );
END;
$$;


-- Function: Refund / Release Credits (e.g. Swap Rejection or Cancellation)
CREATE OR REPLACE FUNCTION public.release_swap_credits(
  p_user_id UUID,
  p_amount INT,
  p_reason TEXT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_related_swap_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.accounts;
  v_existing_tx public.credit_transactions;
  v_new_tx_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required.';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be greater than zero.';
  END IF;

  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    SELECT * INTO v_existing_tx
    FROM public.credit_transactions
    WHERE idempotency_key = TRIM(p_idempotency_key);

    IF v_existing_tx.id IS NOT NULL THEN
      SELECT * INTO v_account FROM public.accounts WHERE user_id = p_user_id;
      RETURN jsonb_build_object(
        'success', true,
        'idempotent_retry', true,
        'transaction_id', v_existing_tx.id,
        'credits_balance', v_account.credits_balance
      );
    END IF;
  END IF;

  PERFORM public.ensure_credit_account(p_user_id);

  SELECT * INTO v_account
  FROM public.accounts
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Refund credits to balance (reduce credits_spent if applicable)
  UPDATE public.accounts
  SET credits_balance = credits_balance + p_amount,
      credits_spent = GREATEST(0, credits_spent - p_amount),
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_account;

  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    balance_after,
    transaction_type,
    reason,
    idempotency_key,
    related_swap_id,
    metadata
  ) VALUES (
    p_user_id,
    p_amount,
    v_account.credits_balance,
    'cancellation_refund',
    COALESCE(p_reason, 'Swap cancellation refund'),
    NULLIF(TRIM(p_idempotency_key), ''),
    p_related_swap_id,
    p_metadata
  )
  RETURNING id INTO v_new_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_new_tx_id,
    'credits_balance', v_account.credits_balance
  );
END;
$$;


-- Function: Atomic Cross-User Transfer with Deadlock Prevention (Row Lock Sorting)
CREATE OR REPLACE FUNCTION public.transfer_credits(
  p_to_user_id UUID,
  p_amount INT,
  p_reason TEXT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_related_swap_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_user_id UUID;
  v_from_account public.accounts;
  v_to_account public.accounts;
  v_existing_tx public.credit_transactions;
  v_sent_tx_id UUID;
  v_recv_tx_id UUID;
BEGIN
  v_from_user_id := auth.uid();
  IF v_from_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_to_user_id IS NULL OR v_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Invalid transfer recipient.';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be greater than zero.';
  END IF;

  -- Idempotency Check
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    SELECT * INTO v_existing_tx
    FROM public.credit_transactions
    WHERE idempotency_key = TRIM(p_idempotency_key) || '_sent';

    IF v_existing_tx.id IS NOT NULL THEN
      SELECT * INTO v_from_account FROM public.accounts WHERE user_id = v_from_user_id;
      RETURN jsonb_build_object(
        'success', true,
        'idempotent_retry', true,
        'transaction_id', v_existing_tx.id,
        'credits_balance', v_from_account.credits_balance
      );
    END IF;
  END IF;

  -- Ensure credit accounts exist
  PERFORM public.ensure_credit_account(v_from_from_id) FROM (SELECT v_from_user_id AS v_from_from_id) t;
  PERFORM public.ensure_credit_account(p_to_user_id);

  -- Deadlock prevention: Always lock accounts in deterministic UUID order
  IF v_from_user_id < p_to_user_id THEN
    SELECT * INTO v_from_account FROM public.accounts WHERE user_id = v_from_user_id FOR UPDATE;
    SELECT * INTO v_to_account FROM public.accounts WHERE user_id = p_to_user_id FOR UPDATE;
  ELSE
    SELECT * INTO v_to_account FROM public.accounts WHERE user_id = p_to_user_id FOR UPDATE;
    SELECT * INTO v_from_account FROM public.accounts WHERE user_id = v_from_user_id FOR UPDATE;
  END IF;

  -- Check balance of sender
  IF v_from_account.credits_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient credit balance for this transfer.';
  END IF;

  -- Update Sender
  UPDATE public.accounts
  SET credits_balance = credits_balance - p_amount,
      credits_spent = credits_spent + p_amount,
      updated_at = NOW()
  WHERE user_id = v_from_user_id
  RETURNING * INTO v_from_account;

  -- Update Recipient
  UPDATE public.accounts
  SET credits_balance = credits_balance + p_amount,
      credits_earned = credits_earned + p_amount,
      updated_at = NOW()
  WHERE user_id = p_to_user_id
  RETURNING * INTO v_to_account;

  -- Insert Sender Ledger Record
  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    balance_after,
    transaction_type,
    reason,
    idempotency_key,
    related_swap_id,
    metadata
  ) VALUES (
    v_from_user_id,
    -p_amount,
    v_from_account.credits_balance,
    'transfer_sent',
    COALESCE(p_reason, 'Credit transfer sent'),
    CASE WHEN p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN TRIM(p_idempotency_key) || '_sent' ELSE NULL END,
    p_related_swap_id,
    p_metadata
  )
  RETURNING id INTO v_sent_tx_id;

  -- Insert Recipient Ledger Record
  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    balance_after,
    transaction_type,
    reason,
    idempotency_key,
    related_swap_id,
    metadata
  ) VALUES (
    p_to_user_id,
    p_amount,
    v_to_account.credits_balance,
    'transfer_received',
    COALESCE(p_reason, 'Credit transfer received'),
    CASE WHEN p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN TRIM(p_idempotency_key) || '_recv' ELSE NULL END,
    p_related_swap_id,
    p_metadata
  )
  RETURNING id INTO v_recv_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'sent_transaction_id', v_sent_tx_id,
    'recv_transaction_id', v_recv_tx_id,
    'from_credits_balance', v_from_account.credits_balance
  );
END;
$$;


-- Function: Get Current User's Authoritative Account Record
CREATE OR REPLACE FUNCTION public.get_user_account()
RETURNS public.accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_account public.accounts;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  RETURN public.ensure_credit_account(v_user_id);
END;
$$;


-- Function: Get Current User's Credit Transactions History
CREATE OR REPLACE FUNCTION public.get_user_credit_transactions(
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  amount INT,
  balance_after INT,
  transaction_type TEXT,
  reason TEXT,
  related_swap_id TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.amount,
    t.balance_after,
    t.transaction_type,
    t.reason,
    t.related_swap_id,
    t.created_at
  FROM public.credit_transactions t
  WHERE t.user_id = v_user_id
  ORDER BY t.created_at DESC
  LIMIT LEAST(p_limit, 100)
  OFFSET GREATEST(p_offset, 0);
END;
$$;


-- ============================================================================
-- 4. INTEGRATION WITH AUTH & PROFILE TRIGGERS & PROCEDURES
-- ============================================================================

-- Update handle_new_user trigger function to guarantee initial credit grant
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Create Profile with profile_completed = FALSE
  INSERT INTO public.profiles (id, full_name, avatar_url, profile_completed)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
      NULLIF(TRIM(split_part(NEW.email, '@', 1)), ''),
      'SkillSwap User'
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    ),
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;

  -- 2. Create Account & Grant 100 Initial Credits (Exactly Once)
  PERFORM public.ensure_credit_account(NEW.id);

  -- 3. Create Private Contact Entry
  INSERT INTO public.user_private_contacts (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Update complete_profile function to also ensure credit account
CREATE OR REPLACE FUNCTION public.complete_profile()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_username TEXT;
  v_full_name TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT username, full_name INTO v_username, v_full_name
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_username IS NULL OR TRIM(v_username) = '' THEN
    RAISE EXCEPTION 'Cannot complete profile: Username must be assigned first.';
  END IF;

  IF v_full_name IS NULL OR TRIM(v_full_name) = '' THEN
    RAISE EXCEPTION 'Cannot complete profile: Full name is required.';
  END IF;

  -- Set session setting to allow updating profile_completed
  PERFORM set_config('app.allow_profile_completion', 'true', true);

  -- Update profiles table
  UPDATE public.profiles
  SET profile_completed = TRUE,
      updated_at = NOW()
  WHERE id = v_user_id;

  -- Ensure credit account and 100 initial credits grant
  PERFORM public.ensure_credit_account(v_user_id);

  -- Ensure private contact record exists
  INSERT INTO public.user_private_contacts (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'profile_completed', true);
END;
$$;


-- ============================================================================
-- 5. ONE-TIME BACKFILL MIGRATION FOR ALL EXISTING USERS
-- ============================================================================

DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN SELECT id FROM public.profiles LOOP
    PERFORM public.ensure_credit_account(u.id);
  END LOOP;
END;
$$;


-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES & GRANTS
-- ============================================================================

-- --- Accounts RLS ---
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own credit account balance" ON public.accounts;
CREATE POLICY "Users can view their own credit account balance"
  ON public.accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Explicitly revoke write access to accounts table from client roles
REVOKE INSERT, UPDATE, DELETE ON public.accounts FROM anon, authenticated, PUBLIC;


-- --- Credit Transactions RLS ---
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own credit transaction history" ON public.credit_transactions;
CREATE POLICY "Users can view their own credit transaction history"
  ON public.credit_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Explicitly revoke direct client inserts/updates/deletes on transaction ledger
REVOKE INSERT, UPDATE, DELETE ON public.credit_transactions FROM anon, authenticated, PUBLIC;


-- ============================================================================
-- 7. GRANTS & FUNCTION PERMISSIONS
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT ON public.accounts TO authenticated;
GRANT SELECT ON public.credit_transactions TO authenticated;

-- Function Execution Grants
REVOKE EXECUTE ON FUNCTION public.ensure_credit_account(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_credit_account(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.deduct_credits(INT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_credits(INT, TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.add_credits(UUID, INT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_credits(UUID, INT, TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.release_swap_credits(UUID, INT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_swap_credits(UUID, INT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.transfer_credits(UUID, INT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_credits(UUID, INT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_account() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_credit_transactions(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_credit_transactions(INT, INT) TO authenticated, service_role;


-- ============================================================================
-- 8. REFRESH POSTGREST SCHEMA CACHE
-- ============================================================================
NOTIFY pgrst, 'reload schema';
