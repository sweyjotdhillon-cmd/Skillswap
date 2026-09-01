-- Migration: 008_credit_reservation_system.sql
-- Description: Enhances credit system with reservation semantics (credits_reserved), operations tracking table, and atomic reservation, release, and settlement RPCs.

-- ============================================================================
-- 1. ACCOUNTS TABLE ENHANCEMENTS FOR RESERVATION
-- ============================================================================

ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS credits_reserved INT NOT NULL DEFAULT 0;

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS chk_min_reserved;
ALTER TABLE public.accounts ADD CONSTRAINT chk_min_reserved CHECK (credits_reserved >= 0);

-- Update credit_transactions transaction_type constraint to allow reservation/settlement types
ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS chk_tx_type;
ALTER TABLE public.credit_transactions ADD CONSTRAINT chk_tx_type CHECK (
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
    'transfer_received',
    'reservation',
    'reservation_release',
    'settlement_payer',
    'settlement_recipient'
  )
);

-- ============================================================================
-- 2. CREDIT OPERATIONS TRACKING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.credit_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES public.accounts(user_id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL,
  amount INT NOT NULL,
  related_swap_id TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_operations_user
  ON public.credit_operations(user_id, created_at DESC);

ALTER TABLE public.credit_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own credit operations" ON public.credit_operations;
CREATE POLICY "Users can view their own credit operations"
  ON public.credit_operations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.credit_operations FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.credit_operations TO authenticated, service_role;


-- ============================================================================
-- 3. UPDATED `ensure_credit_account` WITH `credits_reserved`
-- ============================================================================

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

  -- Ensure account row exists
  INSERT INTO public.accounts (user_id, credits_balance, credits_reserved, credits_earned, credits_spent)
  VALUES (p_user_id, 0, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Obtain row lock
  SELECT * INTO v_account
  FROM public.accounts
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Idempotent check for initial grant
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

    -- Record Ledger Entry
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


-- ============================================================================
-- 4. ATOMIC CREDIT RESERVATION PROC: `reserve_my_credits`
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reserve_my_credits(
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
  v_user_id UUID;
  v_account public.accounts;
  v_existing_tx public.credit_transactions;
  v_new_tx_id UUID;
  v_key TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be greater than zero.';
  END IF;

  v_key := NULLIF(TRIM(p_idempotency_key), '');

  -- Check Idempotency
  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existing_tx
    FROM public.credit_transactions
    WHERE idempotency_key = v_key;

    IF v_existing_tx.id IS NOT NULL THEN
      SELECT * INTO v_account FROM public.accounts WHERE user_id = v_user_id;
      RETURN jsonb_build_object(
        'success', true,
        'idempotent_retry', true,
        'transaction_id', v_existing_tx.id,
        'credits_balance', v_account.credits_balance,
        'credits_reserved', v_account.credits_reserved
      );
    END IF;
  END IF;

  PERFORM public.ensure_credit_account(v_user_id);

  SELECT * INTO v_account
  FROM public.accounts
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_account.credits_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient credit balance for this operation.';
  END IF;

  -- Move credits from balance to reserved
  UPDATE public.accounts
  SET credits_balance = credits_balance - p_amount,
      credits_reserved = credits_reserved + p_amount,
      updated_at = NOW()
  WHERE user_id = v_user_id
  RETURNING * INTO v_account;

  BEGIN
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
      'reservation',
      COALESCE(p_reason, 'Credit reservation'),
      v_key,
      p_related_swap_id,
      p_metadata
    )
    RETURNING id INTO v_new_tx_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing_tx
    FROM public.credit_transactions
    WHERE idempotency_key = v_key;

    RETURN jsonb_build_object(
      'success', true,
      'idempotent_retry', true,
      'transaction_id', v_existing_tx.id,
      'credits_balance', v_account.credits_balance,
      'credits_reserved', v_account.credits_reserved
    );
  END;

  IF v_key IS NOT NULL THEN
    INSERT INTO public.credit_operations (operation_id, user_id, operation_type, amount, related_swap_id, metadata)
    VALUES (v_key, v_user_id, 'reserve', p_amount, p_related_swap_id, p_metadata)
    ON CONFLICT (operation_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_new_tx_id,
    'credits_balance', v_account.credits_balance,
    'credits_reserved', v_account.credits_reserved
  );
END;
$$;


-- ============================================================================
-- 5. ATOMIC RESERVED CREDIT RELEASE PROC: `release_reserved_credits`
-- ============================================================================

CREATE OR REPLACE FUNCTION public.release_reserved_credits(
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
  v_caller_id UUID;
  v_account public.accounts;
  v_existing_tx public.credit_transactions;
  v_new_tx_id UUID;
  v_key TEXT;
  v_release_amount INT;
BEGIN
  v_caller_id := auth.uid();

  -- Authorize caller
  IF v_caller_id IS NOT NULL AND v_caller_id <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized credit release for another user.';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required.';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be greater than zero.';
  END IF;

  v_key := NULLIF(TRIM(p_idempotency_key), '');

  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existing_tx
    FROM public.credit_transactions
    WHERE idempotency_key = v_key;

    IF v_existing_tx.id IS NOT NULL THEN
      SELECT * INTO v_account FROM public.accounts WHERE user_id = p_user_id;
      RETURN jsonb_build_object(
        'success', true,
        'idempotent_retry', true,
        'transaction_id', v_existing_tx.id,
        'credits_balance', v_account.credits_balance,
        'credits_reserved', v_account.credits_reserved
      );
    END IF;
  END IF;

  PERFORM public.ensure_credit_account(p_user_id);

  SELECT * INTO v_account
  FROM public.accounts
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Determine safe release amount (cannot release more than currently reserved)
  v_release_amount := LEAST(v_account.credits_reserved, p_amount);
  IF v_release_amount <= 0 THEN
    v_release_amount := p_amount; -- If reserved was 0 or already moved, refund to balance safely
  END IF;

  UPDATE public.accounts
  SET credits_reserved = GREATEST(0, credits_reserved - v_release_amount),
      credits_balance = credits_balance + v_release_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_account;

  BEGIN
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
      v_release_amount,
      v_account.credits_balance,
      'reservation_release',
      COALESCE(p_reason, 'Reserved credits released'),
      v_key,
      p_related_swap_id,
      p_metadata
    )
    RETURNING id INTO v_new_tx_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing_tx
    FROM public.credit_transactions
    WHERE idempotency_key = v_key;

    RETURN jsonb_build_object(
      'success', true,
      'idempotent_retry', true,
      'transaction_id', v_existing_tx.id,
      'credits_balance', v_account.credits_balance,
      'credits_reserved', v_account.credits_reserved
    );
  END;

  IF v_key IS NOT NULL THEN
    INSERT INTO public.credit_operations (operation_id, user_id, operation_type, amount, related_swap_id, metadata)
    VALUES (v_key, p_user_id, 'release', v_release_amount, p_related_swap_id, p_metadata)
    ON CONFLICT (operation_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_new_tx_id,
    'credits_balance', v_account.credits_balance,
    'credits_reserved', v_account.credits_reserved
  );
END;
$$;


-- ============================================================================
-- 6. ATOMIC RESERVED CREDIT SETTLEMENT PROC: `settle_reserved_credit_transfer`
-- ============================================================================

CREATE OR REPLACE FUNCTION public.settle_reserved_credit_transfer(
  p_payer_id UUID,
  p_recipient_id UUID,
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
  v_caller_id UUID;
  v_payer_account public.accounts;
  v_recipient_account public.accounts;
  v_existing_tx public.credit_transactions;
  v_key_payer TEXT;
  v_key_recipient TEXT;
  v_payer_tx_id UUID;
  v_recipient_tx_id UUID;
  v_deduct_from_reserved INT;
BEGIN
  v_caller_id := auth.uid();

  IF p_payer_id IS NULL OR p_recipient_id IS NULL OR p_payer_id = p_recipient_id THEN
    RAISE EXCEPTION 'Invalid settlement participants.';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be greater than zero.';
  END IF;

  v_key_payer := CASE WHEN NULLIF(TRIM(p_idempotency_key), '') IS NOT NULL THEN TRIM(p_idempotency_key) || '_settle_payer' ELSE NULL END;
  v_key_recipient := CASE WHEN NULLIF(TRIM(p_idempotency_key), '') IS NOT NULL THEN TRIM(p_idempotency_key) || '_settle_recipient' ELSE NULL END;

  -- Idempotency Check
  IF v_key_payer IS NOT NULL THEN
    SELECT * INTO v_existing_tx
    FROM public.credit_transactions
    WHERE idempotency_key = v_key_payer;

    IF v_existing_tx.id IS NOT NULL THEN
      SELECT * INTO v_payer_account FROM public.accounts WHERE user_id = p_payer_id;
      RETURN jsonb_build_object(
        'success', true,
        'idempotent_retry', true,
        'transaction_id', v_existing_tx.id,
        'payer_credits_balance', v_payer_account.credits_balance,
        'payer_credits_reserved', v_payer_account.credits_reserved
      );
    END IF;
  END IF;

  PERFORM public.ensure_credit_account(p_payer_id);
  PERFORM public.ensure_credit_account(p_recipient_id);

  -- Deterministic Row Locking Order to Prevent Deadlocks
  IF p_payer_id < p_recipient_id THEN
    SELECT * INTO v_payer_account FROM public.accounts WHERE user_id = p_payer_id FOR UPDATE;
    SELECT * INTO v_recipient_account FROM public.accounts WHERE user_id = p_recipient_id FOR UPDATE;
  ELSE
    SELECT * INTO v_recipient_account FROM public.accounts WHERE user_id = p_recipient_id FOR UPDATE;
    SELECT * INTO v_payer_account FROM public.accounts WHERE user_id = p_payer_id FOR UPDATE;
  END IF;

  -- Consume payer's reserved credits (and spent total increases)
  v_deduct_from_reserved := LEAST(v_payer_account.credits_reserved, p_amount);

  UPDATE public.accounts
  SET credits_reserved = GREATEST(0, credits_reserved - v_deduct_from_reserved),
      credits_spent = credits_spent + p_amount,
      updated_at = NOW()
  WHERE user_id = p_payer_id
  RETURNING * INTO v_payer_account;

  -- Increase recipient's balance & earned total
  UPDATE public.accounts
  SET credits_balance = credits_balance + p_amount,
      credits_earned = credits_earned + p_amount,
      updated_at = NOW()
  WHERE user_id = p_recipient_id
  RETURNING * INTO v_recipient_account;

  -- Insert Payer Ledger Record
  BEGIN
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
      p_payer_id,
      0, -- Balance was already deducted when reserved; reserved is now consumed
      v_payer_account.credits_balance,
      'settlement_payer',
      COALESCE(p_reason, 'Swap settlement completed'),
      v_key_payer,
      p_related_swap_id,
      p_metadata
    )
    RETURNING id INTO v_payer_tx_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing_tx FROM public.credit_transactions WHERE idempotency_key = v_key_payer;
    v_payer_tx_id := v_existing_tx.id;
  END;

  -- Insert Recipient Ledger Record
  BEGIN
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
      p_recipient_id,
      p_amount,
      v_recipient_account.credits_balance,
      'settlement_recipient',
      COALESCE(p_reason, 'Swap settlement earned'),
      v_key_recipient,
      p_related_swap_id,
      p_metadata
    )
    RETURNING id INTO v_recipient_tx_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing_tx FROM public.credit_transactions WHERE idempotency_key = v_key_recipient;
    v_recipient_tx_id := v_existing_tx.id;
  END;

  IF NULLIF(TRIM(p_idempotency_key), '') IS NOT NULL THEN
    INSERT INTO public.credit_operations (operation_id, user_id, operation_type, amount, related_swap_id, metadata)
    VALUES (TRIM(p_idempotency_key), p_payer_id, 'settlement', p_amount, p_related_swap_id, p_metadata)
    ON CONFLICT (operation_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payer_transaction_id', v_payer_tx_id,
    'recipient_transaction_id', v_recipient_tx_id,
    'payer_credits_balance', v_payer_account.credits_balance,
    'payer_credits_reserved', v_payer_account.credits_reserved,
    'recipient_credits_balance', v_recipient_account.credits_balance
  );
END;
$$;


-- ============================================================================
-- 7. FUNCTION WRAPPERS / ALIASES FOR COMPATIBILITY
-- ============================================================================

-- Function: `spend_my_credits` (wrapper around reserve_my_credits)
CREATE OR REPLACE FUNCTION public.spend_my_credits(
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
BEGIN
  RETURN public.reserve_my_credits(p_amount, p_reason, p_idempotency_key, p_related_swap_id, p_metadata);
END;
$$;

-- Function: `credit_add_for_user` (wrapper around add_credits)
CREATE OR REPLACE FUNCTION public.credit_add_for_user(
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
BEGIN
  RETURN public.add_credits(p_user_id, p_amount, p_reason, p_idempotency_key, p_related_swap_id, p_metadata, 'swap_reward');
END;
$$;

-- Function: `credit_transfer` (wrapper around transfer_credits)
CREATE OR REPLACE FUNCTION public.credit_transfer(
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
BEGIN
  RETURN public.transfer_credits(p_to_user_id, p_amount, p_reason, p_idempotency_key, p_related_swap_id, p_metadata);
END;
$$;


-- ============================================================================
-- 8. GRANTS & FUNCTION EXECUTION PERMISSIONS
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.reserve_my_credits(INT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_my_credits(INT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.release_reserved_credits(UUID, INT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_reserved_credits(UUID, INT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.settle_reserved_credit_transfer(UUID, UUID, INT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_reserved_credit_transfer(UUID, UUID, INT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.spend_my_credits(INT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spend_my_credits(INT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.credit_add_for_user(UUID, INT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_add_for_user(UUID, INT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.credit_transfer(UUID, INT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_transfer(UUID, INT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
