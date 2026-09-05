-- Migration 027: Remove Chat Permissions System

-- 1. Drop chat permission RPC functions
DROP FUNCTION IF EXISTS public.request_chat_access(uuid);
DROP FUNCTION IF EXISTS public.respond_chat_request(uuid, text);
DROP FUNCTION IF EXISTS public.get_chat_permission_status(uuid);

-- 2. Drop swap_chat_requests table
DROP TABLE IF EXISTS public.swap_chat_requests CASCADE;

-- 3. Drop chat_permission column from public.swaps
ALTER TABLE public.swaps DROP COLUMN IF EXISTS chat_permission;

-- 4. Drop obsolete create_credit_swap signatures
DROP FUNCTION IF EXISTS public.create_credit_swap(text, text, text, text, integer, text[], text, text);

-- 5. Redefine create_credit_swap SECURITY DEFINER RPC without p_chat_permission
CREATE OR REPLACE FUNCTION public.create_credit_swap(
  p_topic text,
  p_description text,
  p_requirements text,
  p_credit_amount integer,
  p_tags text[],
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
  v_tag text;
  v_allowed_tags text[] := ARRAY[
    -- Display Labels
    'Design',
    'Coding',
    'Writing',
    'Photography',
    'Video Editing',
    'Marketing',
    'Music',
    'Languages',
    'Career',
    'Fitness',
    'Other',
    -- Canonical Slugs
    'design',
    'coding',
    'writing',
    'photography',
    'video-editing',
    'marketing',
    'music',
    'languages',
    'career',
    'fitness',
    'other'
  ];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_credit_amount IS NULL OR p_credit_amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be greater than zero.';
  END IF;

  -- Validate mandatory tags array
  IF p_tags IS NULL OR array_length(p_tags, 1) IS NULL OR array_length(p_tags, 1) < 1 THEN
    RAISE EXCEPTION 'At least one swap tag is required.';
  END IF;

  -- Validate each submitted tag against canonical allowed tags
  FOREACH v_tag IN ARRAY p_tags LOOP
    IF NOT (v_tag = ANY(v_allowed_tags)) THEN
      RAISE EXCEPTION 'Invalid swap tag: "%". Tag must be one of the predefined options.', v_tag;
    END IF;
  END LOOP;

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
      credit_amount, tags, additional_message, idempotency_key
    )
    VALUES (
      v_user, p_topic, p_description, p_requirements,
      p_credit_amount, p_tags, p_additional_message, p_idempotency_key
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

REVOKE ALL ON FUNCTION public.create_credit_swap(text, text, text, integer, text[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_credit_swap(text, text, text, integer, text[], text, text) TO authenticated, service_role;

-- 6. Update RLS policy on public.swap_messages
DROP POLICY IF EXISTS "Participants can send swap messages" ON public.swap_messages;
CREATE POLICY "Participants can send swap messages" ON public.swap_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    sender_id <> recipient_id AND
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id = swap_messages.swap_id
        AND (s.requester_id = auth.uid() OR s.participant_id = auth.uid())
        AND s.status IN ('accepted', 'submitted', 'completed')
    )
  );

-- 7. Update Realtime RLS policy on realtime.messages
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime' AND c.relname = 'messages'
  ) THEN
    DROP POLICY IF EXISTS "Swap members can listen and broadcast chat realtime" ON realtime.messages;
    CREATE POLICY "Swap members can listen and broadcast chat realtime" ON realtime.messages
      FOR ALL
      TO authenticated
      USING (
        CASE
          WHEN realtime.topic() LIKE 'skillswap-chat:%' THEN
            EXISTS (
              SELECT 1 FROM public.swaps s
              WHERE s.id::text = substring(realtime.topic() from 'skillswap-chat:(.*)')
                AND (s.requester_id = auth.uid() OR s.participant_id = auth.uid())
            )
          ELSE true
        END
      )
      WITH CHECK (
        CASE
          WHEN realtime.topic() LIKE 'skillswap-chat:%' THEN
            EXISTS (
              SELECT 1 FROM public.swaps s
              WHERE s.id::text = substring(realtime.topic() from 'skillswap-chat:(.*)')
                AND (s.requester_id = auth.uid() OR s.participant_id = auth.uid())
            )
          ELSE true
        END
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
