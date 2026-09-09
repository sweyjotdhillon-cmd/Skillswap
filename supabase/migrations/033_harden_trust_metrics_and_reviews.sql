-- Migration 033: Harden Trust Metrics, Review Identity Immutability, and Search Path Isolation
-- Hardens trust metric protections against client manipulation on INSERT/UPDATE,
-- enforces review identity immutability on public.swap_reviews,
-- synchronizes completed_swaps_count on status transitions and deletions,
-- and isolates search_path on trust-related SECURITY DEFINER functions.

-- 1. Harden protect_profile_reputation_metrics Trigger to handle both INSERT and UPDATE
CREATE OR REPLACE FUNCTION public.protect_profile_reputation_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.average_rating IS DISTINCT FROM NEW.average_rating OR
        OLD.review_count IS DISTINCT FROM NEW.review_count OR
        OLD.completed_swaps_count IS DISTINCT FROM NEW.completed_swaps_count OR
        OLD.is_verified IS DISTINCT FROM NEW.is_verified) THEN
      IF current_setting('skillswap.internal_update', true) IS DISTINCT FROM 'true' THEN
        IF auth.uid() IS NOT NULL THEN
          RAISE EXCEPTION 'Direct modification of trust and reputation metrics is prohibited';
        END IF;
      END IF;
    END IF;
  ELSIF (TG_OP = 'INSERT') THEN
    IF (NEW.is_verified IS TRUE OR
        (NEW.completed_swaps_count IS NOT NULL AND NEW.completed_swaps_count <> 0) OR
        (NEW.review_count IS NOT NULL AND NEW.review_count <> 0) OR
        NEW.average_rating IS NOT NULL) THEN
      IF current_setting('skillswap.internal_update', true) IS DISTINCT FROM 'true' THEN
        IF auth.uid() IS NOT NULL THEN
          RAISE EXCEPTION 'Direct specification of trust and reputation metrics on profile creation is prohibited';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_reputation_metrics ON public.profiles;
CREATE TRIGGER trg_protect_profile_reputation_metrics
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_reputation_metrics();

-- 2. Prevent Identity Manipulation on Reviews After Creation
CREATE OR REPLACE FUNCTION public.prevent_swap_review_identity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (OLD.swap_id IS DISTINCT FROM NEW.swap_id OR
      OLD.reviewer_id IS DISTINCT FROM NEW.reviewer_id OR
      OLD.reviewee_id IS DISTINCT FROM NEW.reviewee_id) THEN
    RAISE EXCEPTION 'Review identity (swap_id, reviewer_id, reviewee_id) cannot be modified after creation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_swap_review_identity_change ON public.swap_reviews;
CREATE TRIGGER trg_prevent_swap_review_identity_change
  BEFORE UPDATE ON public.swap_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_swap_review_identity_change();

-- 3. Synchronize completed_swaps_count on INSERT, UPDATE (status transitions), and DELETE
CREATE OR REPLACE FUNCTION public.update_profile_completed_swaps_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_ids UUID[] := ARRAY[]::UUID[];
  v_uid UUID;
BEGIN
  PERFORM set_config('skillswap.internal_update', 'true', true);

  IF (TG_OP = 'DELETE') THEN
    IF OLD.status = 'completed' THEN
      v_user_ids := ARRAY[OLD.requester_id, OLD.participant_id];
    END IF;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (NEW.status = 'completed' OR OLD.status = 'completed') THEN
      v_user_ids := ARRAY[OLD.requester_id, OLD.participant_id, NEW.requester_id, NEW.participant_id];
    END IF;
  ELSIF (TG_OP = 'INSERT') THEN
    IF NEW.status = 'completed' THEN
      v_user_ids := ARRAY[NEW.requester_id, NEW.participant_id];
    END IF;
  END IF;

  FOREACH v_uid IN ARRAY v_user_ids LOOP
    IF v_uid IS NOT NULL THEN
      UPDATE public.profiles
      SET completed_swaps_count = (
        SELECT COUNT(*)::integer
        FROM public.swaps
        WHERE status = 'completed' AND (requester_id = v_uid OR participant_id = v_uid)
      )
      WHERE id = v_uid;
    END IF;
  END LOOP;

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_profile_completed_swaps_count ON public.swaps;
CREATE TRIGGER trg_update_profile_completed_swaps_count
  AFTER INSERT OR UPDATE OR DELETE ON public.swaps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_profile_completed_swaps_count();

-- 4. Harden update_profile_review_metrics Trigger Function with search_path
CREATE OR REPLACE FUNCTION public.update_profile_review_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('skillswap.internal_update', 'true', true);

  IF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
    SET
      average_rating = (
        SELECT ROUND(AVG(rating)::numeric, 2)
        FROM public.swap_reviews
        WHERE reviewee_id = OLD.reviewee_id
      ),
      review_count = (
        SELECT COUNT(*)::integer
        FROM public.swap_reviews
        WHERE reviewee_id = OLD.reviewee_id
      )
    WHERE id = OLD.reviewee_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.reviewee_id IS DISTINCT FROM NEW.reviewee_id THEN
      UPDATE public.profiles
      SET
        average_rating = (
          SELECT ROUND(AVG(rating)::numeric, 2)
          FROM public.swap_reviews
          WHERE reviewee_id = OLD.reviewee_id
        ),
        review_count = (
          SELECT COUNT(*)::integer
          FROM public.swap_reviews
          WHERE reviewee_id = OLD.reviewee_id
        )
      WHERE id = OLD.reviewee_id;
    END IF;

    UPDATE public.profiles
    SET
      average_rating = (
        SELECT ROUND(AVG(rating)::numeric, 2)
        FROM public.swap_reviews
        WHERE reviewee_id = NEW.reviewee_id
      ),
      review_count = (
        SELECT COUNT(*)::integer
        FROM public.swap_reviews
        WHERE reviewee_id = NEW.reviewee_id
      )
    WHERE id = NEW.reviewee_id;
  ELSE
    UPDATE public.profiles
    SET
      average_rating = (
        SELECT ROUND(AVG(rating)::numeric, 2)
        FROM public.swap_reviews
        WHERE reviewee_id = NEW.reviewee_id
      ),
      review_count = (
        SELECT COUNT(*)::integer
        FROM public.swap_reviews
        WHERE reviewee_id = NEW.reviewee_id
      )
    WHERE id = NEW.reviewee_id;
  END IF;

  RETURN NULL;
END;
$$;

-- 5. Harden submit_swap_review RPC with search_path
CREATE OR REPLACE FUNCTION public.submit_swap_review(
  p_swap_id UUID,
  p_rating INTEGER,
  p_review_text TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_swap RECORD;
  v_review_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be an integer between 1 and 5';
  END IF;

  SELECT * INTO v_swap FROM public.swaps WHERE id = p_swap_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found';
  END IF;

  IF v_swap.status <> 'completed' THEN
    RAISE EXCEPTION 'Reviews can only be submitted for completed swaps';
  END IF;

  -- Strictly enforce A -> B rule: Requester reviews Participant
  IF v_swap.requester_id <> v_user_id THEN
    RAISE EXCEPTION 'Only the swap requester can submit a review for the participant';
  END IF;

  IF v_swap.participant_id IS NULL THEN
    RAISE EXCEPTION 'Swap participant unavailable';
  END IF;

  IF v_swap.requester_id = v_swap.participant_id THEN
    RAISE EXCEPTION 'Cannot review yourself';
  END IF;

  INSERT INTO public.swap_reviews (
    swap_id,
    reviewer_id,
    reviewee_id,
    rating,
    review_text
  ) VALUES (
    p_swap_id,
    v_user_id,
    v_swap.participant_id,
    p_rating,
    NULLIF(TRIM(p_review_text), '')
  )
  RETURNING id INTO v_review_id;

  RETURN jsonb_build_object(
    'success', true,
    'review_id', v_review_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You have already submitted a review for this swap.'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_swap_review FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_swap_review TO authenticated;

NOTIFY pgrst, 'reload schema';
