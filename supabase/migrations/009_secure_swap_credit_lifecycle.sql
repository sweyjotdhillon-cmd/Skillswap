-- Production swap-credit lifecycle.  All money movement is derived from a persisted swap.
-- Browser callers can create, accept, submit, complete, or cancel their own eligible swap;
-- they cannot supply a payer, recipient, or settlement amount.

CREATE TABLE IF NOT EXISTS public.swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  participant_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  topic text NOT NULL CHECK (length(btrim(topic)) BETWEEN 1 AND 160),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 5000),
  requirements text NOT NULL CHECK (length(btrim(requirements)) BETWEEN 1 AND 5000),
  additional_message text,
  chat_permission text NOT NULL CHECK (chat_permission IN ('requester', 'participant', 'anyone')),
  credit_amount integer NOT NULL CHECK (credit_amount > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'submitted', 'completed', 'cancelled', 'declined', 'withdrawn', 'expired')),
  submitted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swaps_requester_status ON public.swaps(requester_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swaps_participant_status ON public.swaps(participant_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_swap_reservation ON public.credit_transactions(related_swap_id)
  WHERE transaction_type = 'reservation';

ALTER TABLE public.swaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants may view swaps" ON public.swaps;
CREATE POLICY "Participants may view swaps" ON public.swaps FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR participant_id = auth.uid() OR status = 'open');
REVOKE INSERT, UPDATE, DELETE ON public.swaps FROM anon, authenticated, public;
GRANT SELECT ON public.swaps TO authenticated;

-- The initial grant is an earned credit.  This corrects historical account counters without
-- creating another grant or changing balances.
UPDATE public.accounts a
SET credits_earned = GREATEST(a.credits_earned, 100)
WHERE EXISTS (SELECT 1 FROM public.credit_transactions t
              WHERE t.user_id = a.user_id AND t.transaction_type = 'initial_grant');

CREATE OR REPLACE FUNCTION public.ensure_credit_account(p_user_id uuid)
RETURNS public.accounts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_account public.accounts;
  v_key text := 'initial_grant:' || p_user_id::text;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'User ID cannot be null.'; END IF;

  INSERT INTO public.accounts(user_id, credits_balance, credits_reserved, credits_earned, credits_spent)
  VALUES (p_user_id, 0, 0, 0, 0) ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_account FROM public.accounts WHERE user_id = p_user_id FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE user_id = p_user_id AND (transaction_type = 'initial_grant' OR idempotency_key = v_key)
  ) THEN
    UPDATE public.accounts
    SET credits_balance = credits_balance + 100,
        credits_earned = credits_earned + 100
    WHERE user_id = p_user_id
    RETURNING * INTO v_account;

    INSERT INTO public.credit_transactions(user_id, amount, balance_after, transaction_type, reason, idempotency_key)
    VALUES (p_user_id, 100, v_account.credits_balance, 'initial_grant', 'Initial SkillSwap credit grant', v_key);

    INSERT INTO public.credit_operations(operation_id, user_id, operation_type, amount)
    VALUES (v_key, p_user_id, 'initial_grant', 100)
    ON CONFLICT (operation_id) DO NOTHING;
  END IF;

  RETURN v_account;
END $$;

CREATE OR REPLACE FUNCTION public.create_credit_swap(p_topic text, p_description text, p_requirements text,
  p_chat_permission text, p_credit_amount integer, p_additional_message text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_swap uuid; v_account public.accounts;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;
  IF p_credit_amount IS NULL OR p_credit_amount <= 0 THEN RAISE EXCEPTION 'Credit amount must be greater than zero.'; END IF;
  INSERT INTO public.swaps(requester_id, topic, description, requirements, chat_permission, credit_amount, additional_message)
  VALUES (v_user, p_topic, p_description, p_requirements, p_chat_permission, p_credit_amount, p_additional_message) RETURNING id INTO v_swap;
  PERFORM public.ensure_credit_account(v_user);
  SELECT * INTO v_account FROM public.accounts WHERE user_id = v_user FOR UPDATE;
  IF v_account.credits_balance < p_credit_amount THEN RAISE EXCEPTION 'Insufficient credit balance.'; END IF;
  UPDATE public.accounts SET credits_balance = credits_balance - p_credit_amount, credits_reserved = credits_reserved + p_credit_amount
    WHERE user_id = v_user RETURNING * INTO v_account;
  INSERT INTO public.credit_transactions(user_id, amount, balance_after, transaction_type, reason, related_swap_id, idempotency_key)
  VALUES (v_user, -p_credit_amount, v_account.credits_balance, 'reservation', 'Swap credit reservation', v_swap::text, 'swap_reservation:' || v_swap::text);
  INSERT INTO public.credit_operations(operation_id, user_id, operation_type, amount, related_swap_id)
  VALUES ('swap_reservation:' || v_swap::text, v_user, 'reserve', p_credit_amount, v_swap::text);
  RETURN v_swap;
END $$;

CREATE OR REPLACE FUNCTION public.accept_credit_swap(p_swap_id uuid)
RETURNS public.swaps LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_swap public.swaps;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;
  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Swap not found.'; END IF;
  IF v_swap.status = 'accepted' AND v_swap.participant_id = v_user THEN RETURN v_swap; END IF;
  IF v_swap.status <> 'open' OR v_swap.requester_id = v_user THEN RAISE EXCEPTION 'Swap cannot be accepted.'; END IF;
  UPDATE public.swaps SET participant_id = v_user, status = 'accepted' WHERE id = p_swap_id RETURNING * INTO v_swap;
  RETURN v_swap;
END $$;

CREATE OR REPLACE FUNCTION public.submit_credit_swap(p_swap_id uuid)
RETURNS public.swaps LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_swap public.swaps;
BEGIN
  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id FOR UPDATE;
  IF NOT FOUND OR v_user IS NULL OR v_swap.participant_id <> v_user OR v_swap.status <> 'accepted' THEN RAISE EXCEPTION 'Swap cannot be submitted.'; END IF;
  UPDATE public.swaps SET status='submitted', submitted_at=now() WHERE id=p_swap_id RETURNING * INTO v_swap;
  RETURN v_swap;
END $$;

CREATE OR REPLACE FUNCTION public.complete_credit_swap(p_swap_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_swap public.swaps; v_payer public.accounts; v_payee public.accounts;
BEGIN
  SELECT * INTO v_swap FROM public.swaps WHERE id=p_swap_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Swap not found.'; END IF;
  IF v_swap.status='completed' AND v_swap.requester_id=v_user THEN RETURN jsonb_build_object('success',true,'idempotent_retry',true); END IF;
  IF v_user IS NULL OR v_swap.requester_id<>v_user OR v_swap.participant_id IS NULL OR v_swap.status<>'submitted' THEN RAISE EXCEPTION 'Swap is not eligible for completion.'; END IF;
  IF v_swap.requester_id < v_swap.participant_id THEN
    SELECT * INTO v_payer FROM public.accounts WHERE user_id=v_swap.requester_id FOR UPDATE; SELECT * INTO v_payee FROM public.accounts WHERE user_id=v_swap.participant_id FOR UPDATE;
  ELSE
    SELECT * INTO v_payee FROM public.accounts WHERE user_id=v_swap.participant_id FOR UPDATE; SELECT * INTO v_payer FROM public.accounts WHERE user_id=v_swap.requester_id FOR UPDATE;
  END IF;
  IF v_payer.credits_reserved < v_swap.credit_amount THEN RAISE EXCEPTION 'Reserved credit commitment is missing.'; END IF;
  UPDATE public.accounts SET credits_reserved=credits_reserved-v_swap.credit_amount, credits_spent=credits_spent+v_swap.credit_amount WHERE user_id=v_swap.requester_id RETURNING * INTO v_payer;
  UPDATE public.accounts SET credits_balance=credits_balance+v_swap.credit_amount, credits_earned=credits_earned+v_swap.credit_amount WHERE user_id=v_swap.participant_id RETURNING * INTO v_payee;
  INSERT INTO public.credit_transactions(user_id,amount,balance_after,transaction_type,reason,related_user_id,related_swap_id,idempotency_key)
    VALUES(v_swap.requester_id,0,v_payer.credits_balance,'settlement_payer','Swap settlement',v_swap.participant_id,p_swap_id::text,'swap_settlement:'||p_swap_id::text||':payer'),
          (v_swap.participant_id,v_swap.credit_amount,v_payee.credits_balance,'settlement_recipient','Swap settlement reward',v_swap.requester_id,p_swap_id::text,'swap_settlement:'||p_swap_id::text||':recipient');
  INSERT INTO public.credit_operations(operation_id,user_id,operation_type,amount,related_swap_id) VALUES('swap_settlement:'||p_swap_id::text,v_swap.requester_id,'settlement',v_swap.credit_amount,p_swap_id::text);
  UPDATE public.swaps SET status='completed',completed_at=now() WHERE id=p_swap_id;
  RETURN jsonb_build_object('success',true,'payer_credits_balance',v_payer.credits_balance,'payer_credits_reserved',v_payer.credits_reserved,'recipient_credits_balance',v_payee.credits_balance);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_credit_swap(p_swap_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_swap public.swaps;
  v_requester_account public.accounts;
  v_status_to_set text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Swap not found.'; END IF;

  -- Idempotent check: if swap is already in a terminal cancelled/declined status
  IF v_swap.status IN ('cancelled', 'declined', 'withdrawn', 'expired') THEN
    IF v_swap.requester_id = v_user OR v_swap.participant_id = v_user THEN
      RETURN jsonb_build_object('success', true, 'idempotent_retry', true);
    END IF;
  END IF;

  -- Security check: caller must be requester OR participant (or participant eligible if open)
  IF v_swap.requester_id <> v_user AND (v_swap.participant_id IS NULL OR v_swap.participant_id <> v_user) THEN
    RAISE EXCEPTION 'Swap cannot be cancelled by this user.';
  END IF;

  IF v_swap.status NOT IN ('open', 'accepted', 'submitted') THEN
    RAISE EXCEPTION 'Swap cannot be cancelled in its current status.';
  END IF;

  -- Determine new status: 'declined' if participant cancels, 'cancelled' if requester cancels
  v_status_to_set := CASE WHEN v_swap.requester_id = v_user THEN 'cancelled' ELSE 'declined' END;

  -- Lock and release reserved credits from requester's account
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
END $$;

CREATE OR REPLACE FUNCTION public.reconcile_credit_balances()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_accounts int := 0;
  v_matching_accounts int := 0;
  v_discrepancies_count int := 0;
  v_discrepancy_details jsonb := '[]'::jsonb;
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      a.user_id,
      a.credits_balance AS stored_balance,
      a.credits_reserved AS stored_reserved,
      a.credits_earned AS stored_earned,
      a.credits_spent AS stored_spent,
      COALESCE(SUM(t.amount), 0) AS calculated_balance,
      COALESCE(SUM(t.amount) FILTER (
        WHERE t.transaction_type IN ('initial_grant', 'settlement_recipient', 'swap_reward', 'transfer_received')
      ), 0) AS calculated_earned
    FROM public.accounts a
    LEFT JOIN public.credit_transactions t ON a.user_id = t.user_id
    GROUP BY a.user_id, a.credits_balance, a.credits_reserved, a.credits_earned, a.credits_spent
  LOOP
    v_total_accounts := v_total_accounts + 1;
    IF r.stored_balance = r.calculated_balance AND r.stored_earned = r.calculated_earned THEN
      v_matching_accounts := v_matching_accounts + 1;
    ELSE
      v_discrepancies_count := v_discrepancies_count + 1;
      v_discrepancy_details := v_discrepancy_details || jsonb_build_object(
        'user_id', r.user_id,
        'stored_balance', r.stored_balance,
        'calculated_balance', r.calculated_balance,
        'stored_earned', r.stored_earned,
        'calculated_earned', r.calculated_earned
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total_accounts', v_total_accounts,
    'matching_accounts', v_matching_accounts,
    'discrepancies_count', v_discrepancies_count,
    'discrepancies', v_discrepancy_details
  );
END $$;

-- Old generic mutation RPCs are not a browser API.  Only lifecycle RPCs are executable.
REVOKE EXECUTE ON FUNCTION public.ensure_credit_account(uuid), public.add_credits(uuid,integer,text,text,text,jsonb,text), public.credit_add_for_user(uuid,integer,text,text,text,jsonb), public.transfer_credits(uuid,integer,text,text,text,jsonb), public.credit_transfer(uuid,integer,text,text,text,jsonb), public.settle_reserved_credit_transfer(uuid,uuid,integer,text,text,text,jsonb), public.release_reserved_credits(uuid,integer,text,text,text,jsonb), public.reserve_my_credits(integer,text,text,text,jsonb), public.spend_my_credits(integer,text,text,text,jsonb), public.release_swap_credits(uuid,integer,text,text,text,jsonb) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.create_credit_swap(text,text,text,text,integer,text), public.accept_credit_swap(uuid), public.submit_credit_swap(uuid), public.complete_credit_swap(uuid), public.cancel_credit_swap(uuid), public.reconcile_credit_balances() TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
