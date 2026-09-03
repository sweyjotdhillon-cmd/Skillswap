-- Migration 010: Swap Creation Idempotency & Comprehensive Credit Accounting Reconciliation

-- 1. Ensure public.credit_transactions schema columns
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS related_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add idempotency_key to public.swaps and create unique constraint
ALTER TABLE public.swaps ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.swaps DROP CONSTRAINT IF EXISTS uq_swaps_idempotency;
ALTER TABLE public.swaps ADD CONSTRAINT uq_swaps_idempotency UNIQUE (idempotency_key);

-- Ensure credit_transactions has plain UNIQUE constraint for idempotency_key
-- (allows multiple NULLs while supporting ON CONFLICT (idempotency_key) DO NOTHING)
ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS uq_credit_tx_idempotency;
ALTER TABLE public.credit_transactions ADD CONSTRAINT uq_credit_tx_idempotency UNIQUE (idempotency_key);

-- 2. Update create_credit_swap procedure to support idempotency key
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
SET search_path = public
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

  -- Idempotency Check: return existing swap if key matches for caller
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

-- 3. Comprehensive Credit Reconciliation Procedure
CREATE OR REPLACE FUNCTION public.reconcile_credit_balances()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_accounts int := 0;
  v_matching_accounts int := 0;
  v_discrepancies_count int := 0;
  v_discrepancy_details jsonb := '[]'::jsonb;
  r RECORD;
  v_calc_earned int;
  v_calc_spent int;
  v_calc_reserved int;
  v_calc_balance int;
BEGIN
  FOR r IN
    SELECT
      a.user_id,
      a.credits_balance AS stored_balance,
      a.credits_reserved AS stored_reserved,
      a.credits_earned AS stored_earned,
      a.credits_spent AS stored_spent
    FROM public.accounts a
  LOOP
    v_total_accounts := v_total_accounts + 1;

    -- Calculate earned from positive income transaction types
    SELECT COALESCE(SUM(t.amount), 0) INTO v_calc_earned
    FROM public.credit_transactions t
    WHERE t.user_id = r.user_id
      AND t.transaction_type IN ('initial_grant', 'settlement_recipient', 'swap_reward', 'transfer_received', 'add_credits', 'manual_grant');

    -- Calculate spent from completed swaps and sent direct transfers
    SELECT COALESCE(SUM(s.credit_amount), 0) INTO v_calc_spent
    FROM public.swaps s
    WHERE s.requester_id = r.user_id AND s.status = 'completed';

    v_calc_spent := v_calc_spent + COALESCE((
      SELECT SUM(-t.amount)
      FROM public.credit_transactions t
      WHERE t.user_id = r.user_id
        AND t.transaction_type IN ('transfer_sent', 'spend', 'manual_spend')
    ), 0);

    -- Calculate reserved from active non-terminal swaps where user is requester
    SELECT COALESCE(SUM(s.credit_amount), 0) INTO v_calc_reserved
    FROM public.swaps s
    WHERE s.requester_id = r.user_id AND s.status IN ('open', 'accepted', 'submitted');

    -- Derived available balance = earned - spent - reserved
    v_calc_balance := v_calc_earned - v_calc_spent - v_calc_reserved;

    IF r.stored_balance = v_calc_balance
       AND r.stored_reserved = v_calc_reserved
       AND r.stored_earned = v_calc_earned
       AND r.stored_spent = v_calc_spent THEN
      v_matching_accounts := v_matching_accounts + 1;
    ELSE
      v_discrepancies_count := v_discrepancies_count + 1;
      v_discrepancy_details := v_discrepancy_details || jsonb_build_object(
        'user_id', r.user_id,
        'stored_balance', r.stored_balance,
        'calculated_balance', v_calc_balance,
        'stored_reserved', r.stored_reserved,
        'calculated_reserved', v_calc_reserved,
        'stored_earned', r.stored_earned,
        'calculated_earned', v_calc_earned,
        'stored_spent', r.stored_spent,
        'calculated_spent', v_calc_spent
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total_accounts', v_total_accounts,
    'matching_accounts', v_matching_accounts,
    'discrepancies_count', v_discrepancies_count,
    'discrepancies', v_discrepancy_details
  );
END;
$$;

-- 4. Permissions & Security
GRANT EXECUTE ON FUNCTION public.create_credit_swap(text,text,text,text,integer,text,text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reconcile_credit_balances() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_credit_balances() TO service_role;

NOTIFY pgrst, 'reload schema';
