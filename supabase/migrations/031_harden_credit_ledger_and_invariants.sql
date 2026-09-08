-- Migration 031: Harden Credit Ledger and Dual-Balance Invariants (F.1)
-- Ensures strict database-level constraints for chk_min_balance and dual-balance ledger integrity.

-- 1. Ensure chk_min_balance and chk_min_reserved constraints exist on public.accounts
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS chk_min_balance;
ALTER TABLE public.accounts ADD CONSTRAINT chk_min_balance CHECK (credits_balance >= 0);

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS chk_min_reserved;
ALTER TABLE public.accounts ADD CONSTRAINT chk_min_reserved CHECK (credits_reserved >= 0);

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS chk_min_earned;
ALTER TABLE public.accounts ADD CONSTRAINT chk_min_earned CHECK (credits_earned >= 0);

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS chk_min_spent;
ALTER TABLE public.accounts ADD CONSTRAINT chk_min_spent CHECK (credits_spent >= 0);

-- 2. Ensure public.credit_operations table and idempotency constraint
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

-- Ensure index on credit_operations operation_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_operations_operation_id
  ON public.credit_operations(operation_id);

-- Ensure credit_transactions idempotency constraint
ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS uq_credit_tx_idempotency;
ALTER TABLE public.credit_transactions ADD CONSTRAINT uq_credit_tx_idempotency UNIQUE (idempotency_key);

-- 3. Enhance reconcile_credit_balances to verify the dual-balance ledger equation:
-- Available + Reserved = Total Earned - Total Spent
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

    -- Dual-balance equation invariant:
    -- Available (credits_balance) = Earned - Spent - Reserved
    -- Total = Available + Reserved = Earned - Spent
    v_calc_balance := v_calc_earned - v_calc_spent - v_calc_reserved;

    IF r.stored_balance = v_calc_balance
       AND r.stored_reserved = v_calc_reserved
       AND r.stored_earned = v_calc_earned
       AND r.stored_spent = v_calc_spent
       AND (r.stored_balance + r.stored_reserved = r.stored_earned - r.stored_spent) THEN
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
        'calculated_spent', v_calc_spent,
        'equation_valid', (r.stored_balance + r.stored_reserved = r.stored_earned - r.stored_spent)
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

NOTIFY pgrst, 'reload schema';
