-- Migration 015: Swap Escrow Automatic Expiry and Submission Review Timeout

-- 1. Automatic Expiry Function for Abandoned Open/Accepted Swaps
CREATE OR REPLACE FUNCTION public.expire_abandoned_swaps(
  p_abandoned_days integer DEFAULT 30,
  p_swap_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_swap RECORD;
  v_requester_account public.accounts;
  v_expired_count integer := 0;
  v_expired_ids uuid[] := ARRAY[]::uuid[];
  v_cutoff timestamptz := NOW() - (p_abandoned_days || ' days')::interval;
BEGIN
  IF p_abandoned_days IS NULL OR p_abandoned_days < 1 THEN
    p_abandoned_days := 30;
  END IF;

  FOR v_swap IN
    SELECT *
    FROM public.swaps
    WHERE status IN ('open', 'accepted')
      AND created_at <= v_cutoff
      AND (p_swap_id IS NULL OR id = p_swap_id)
    FOR UPDATE
  LOOP
    -- Double-check eligibility inside locked row loop
    IF v_swap.status IN ('open', 'accepted') THEN
      -- Lock requester account
      SELECT * INTO v_requester_account
      FROM public.accounts
      WHERE user_id = v_swap.requester_id
      FOR UPDATE;

      -- Release reserved credits if requester account has reserved credits
      IF v_requester_account.credits_reserved >= v_swap.credit_amount THEN
        UPDATE public.accounts
        SET credits_reserved = credits_reserved - v_swap.credit_amount,
            credits_balance = credits_balance + v_swap.credit_amount
        WHERE user_id = v_swap.requester_id
        RETURNING * INTO v_requester_account;

        INSERT INTO public.credit_transactions(
          user_id, amount, balance_after, transaction_type, reason, related_swap_id, idempotency_key
        )
        VALUES (
          v_swap.requester_id,
          v_swap.credit_amount,
          v_requester_account.credits_balance,
          'reservation_release',
          'Swap expired due to inactivity; reservation released',
          v_swap.id::text,
          'swap_expiry:' || v_swap.id::text
        )
        ON CONFLICT (idempotency_key) DO NOTHING;

        INSERT INTO public.credit_operations(
          operation_id, user_id, operation_type, amount, related_swap_id
        )
        VALUES (
          'swap_expiry:' || v_swap.id::text,
          v_swap.requester_id,
          'release',
          v_swap.credit_amount,
          v_swap.id::text
        )
        ON CONFLICT (operation_id) DO NOTHING;
      END IF;

      -- Transition swap status to expired
      UPDATE public.swaps
      SET status = 'expired',
          cancelled_at = COALESCE(cancelled_at, NOW()),
          updated_at = NOW()
      WHERE id = v_swap.id;

      v_expired_count := v_expired_count + 1;
      v_expired_ids := array_append(v_expired_ids, v_swap.id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'expired_count', v_expired_count,
    'expired_swap_ids', to_jsonb(v_expired_ids)
  );
END;
$$;

-- 2. Automatic Settlement Review Timeout for Submitted Swaps (Default 7 Days)
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
      AND submitted_at IS NOT NULL
      AND submitted_at <= v_cutoff
      AND (p_swap_id IS NULL OR id = p_swap_id)
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

REVOKE EXECUTE ON FUNCTION public.expire_abandoned_swaps(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_abandoned_swaps(integer, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.process_submitted_swap_timeouts(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_submitted_swap_timeouts(integer, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
