-- Migration: 007_credit_system_audit_fixes.sql
-- Description: Hardens RPC Credit Functions with Authorization Verification, Graceful Idempotency Exception Handling, Fixes Typos, and Adds Reusable Reconciliation Function.

-- ============================================================================
-- 1. HARDEN `add_credits` SECURITY & AUTHORIZATION
-- ============================================================================
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
  v_caller_id UUID;
  v_account public.accounts;
  v_existing_tx public.credit_transactions;
  v_new_tx_id UUID;
BEGIN
  v_caller_id := auth.uid();

  -- Security Check: When called by authenticated user role, user can only modify their own account
  IF v_caller_id IS NOT NULL AND v_caller_id <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized credit addition for another user.';
  END IF;

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

  -- Insert ledger entry with exception handling for race condition on idempotency key
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
      p_amount,
      v_account.credits_balance,
      COALESCE(p_transaction_type, 'swap_reward'),
      COALESCE(p_reason, 'Credit addition'),
      NULLIF(TRIM(p_idempotency_key), ''),
      p_related_swap_id,
      p_metadata
    )
    RETURNING id INTO v_new_tx_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing_tx
    FROM public.credit_transactions
    WHERE idempotency_key = TRIM(p_idempotency_key);

    RETURN jsonb_build_object(
      'success', true,
      'idempotent_retry', true,
      'transaction_id', v_existing_tx.id,
      'credits_balance', v_account.credits_balance,
      'credits_earned', v_account.credits_earned
    );
  END;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_new_tx_id,
    'credits_balance', v_account.credits_balance,
    'credits_earned', v_account.credits_earned
  );
END;
$$;


-- ============================================================================
-- 2. HARDEN `release_swap_credits` SECURITY & AUTHORIZATION
-- ============================================================================
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
  v_caller_id UUID;
  v_account public.accounts;
  v_existing_tx public.credit_transactions;
  v_new_tx_id UUID;
BEGIN
  v_caller_id := auth.uid();

  -- Security Check: Authenticated users can only release/refund credits to their own account
  IF v_caller_id IS NOT NULL AND v_caller_id <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized credit release for another user.';
  END IF;

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
      p_amount,
      v_account.credits_balance,
      'cancellation_refund',
      COALESCE(p_reason, 'Swap cancellation refund'),
      NULLIF(TRIM(p_idempotency_key), ''),
      p_related_swap_id,
      p_metadata
    )
    RETURNING id INTO v_new_tx_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing_tx
    FROM public.credit_transactions
    WHERE idempotency_key = TRIM(p_idempotency_key);

    RETURN jsonb_build_object(
      'success', true,
      'idempotent_retry', true,
      'transaction_id', v_existing_tx.id,
      'credits_balance', v_account.credits_balance
    );
  END;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_new_tx_id,
    'credits_balance', v_account.credits_balance
  );
END;
$$;


-- ============================================================================
-- 3. HARDEN `deduct_credits` CONCURRENCY & EXCEPTION HANDLING
-- ============================================================================
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
      COALESCE(p_transaction_type, 'swap_hold'),
      COALESCE(p_reason, 'Credit deduction'),
      NULLIF(TRIM(p_idempotency_key), ''),
      p_related_swap_id,
      p_metadata
    )
    RETURNING id INTO v_new_tx_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing_tx
    FROM public.credit_transactions
    WHERE idempotency_key = TRIM(p_idempotency_key);

    RETURN jsonb_build_object(
      'success', true,
      'idempotent_retry', true,
      'transaction_id', v_existing_tx.id,
      'credits_balance', v_account.credits_balance,
      'credits_spent', v_account.credits_spent
    );
  END;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_new_tx_id,
    'credits_balance', v_account.credits_balance,
    'credits_spent', v_account.credits_spent
  );
END;
$$;


-- ============================================================================
-- 4. FIX VARIABLE TYPO IN `transfer_credits`
-- ============================================================================
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
  PERFORM public.ensure_credit_account(v_from_user_id);
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


-- ============================================================================
-- 5. REUSABLE BALANCE RECONCILIATION FUNCTION FOR DIAGNOSTICS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reconcile_credit_balances()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_accounts INT := 0;
  v_matching_accounts INT := 0;
  v_discrepancies_count INT := 0;
  v_discrepancy_details JSONB := '[]'::jsonb;
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      a.user_id,
      a.credits_balance AS stored_balance,
      COALESCE(SUM(t.amount), 0) AS calculated_balance
    FROM public.accounts a
    LEFT JOIN public.credit_transactions t ON a.user_id = t.user_id
    GROUP BY a.user_id, a.credits_balance
  LOOP
    v_total_accounts := v_total_accounts + 1;
    IF r.stored_balance = r.calculated_balance THEN
      v_matching_accounts := v_matching_accounts + 1;
    ELSE
      v_discrepancies_count := v_discrepancies_count + 1;
      v_discrepancy_details := v_discrepancy_details || jsonb_build_object(
        'user_id', r.user_id,
        'stored_balance', r.stored_balance,
        'calculated_balance', r.calculated_balance,
        'difference', r.stored_balance - r.calculated_balance
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total_accounts_checked', v_total_accounts,
    'matching_accounts', v_matching_accounts,
    'discrepancies_count', v_discrepancies_count,
    'discrepancy_details', v_discrepancy_details
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_credit_balances() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
