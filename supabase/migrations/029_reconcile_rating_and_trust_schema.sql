-- Migration 029: Reconcile Rating and Trust Schema to Canonical reviewee_id (Section C.3 Alignment)
-- Reconciles live database and repository migration schema drift by standardizing on `reviewee_id`,
-- enforcing strict Requester (A) -> Participant (B) review authorization rules, locking down RLS policies,
-- and protecting trust and reputation metrics against direct user manipulation.

-- 1. Standardize column name in public.swap_reviews to canonical `reviewee_id`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'swap_reviews' AND column_name = 'reviewed_user_id'
  ) THEN
    ALTER TABLE public.swap_reviews RENAME COLUMN reviewed_user_id TO reviewee_id;
  END IF;
END $$;

-- Ensure table public.swap_reviews exists with canonical structure
CREATE TABLE IF NOT EXISTS public.swap_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swap_id UUID NOT NULL REFERENCES public.swaps(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT CHECK (length(review_text) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT swap_reviews_swap_reviewer_key UNIQUE (swap_id, reviewer_id)
);

-- Drop legacy index if exists and create canonical indexes
DROP INDEX IF EXISTS public.idx_swap_reviews_reviewed_user_id;
CREATE INDEX IF NOT EXISTS idx_swap_reviews_reviewee_id ON public.swap_reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_swap_reviews_swap_id ON public.swap_reviews(swap_id);
CREATE INDEX IF NOT EXISTS idx_swap_reviews_reviewer_id ON public.swap_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_swap_reviews_reviewee_created ON public.swap_reviews(reviewee_id, created_at DESC);

-- 2. RLS Security Policies for swap_reviews
ALTER TABLE public.swap_reviews ENABLE ROW LEVEL SECURITY;

-- SELECT: Publicly readable for social proof display
DROP POLICY IF EXISTS "Public swap reviews are viewable by everyone" ON public.swap_reviews;
CREATE POLICY "Public swap reviews are viewable by everyone"
  ON public.swap_reviews FOR SELECT
  USING (true);

-- INSERT: Authenticated requester only, completed swap, participant as reviewee, no self-review
DROP POLICY IF EXISTS "Participants of completed swaps can insert reviews" ON public.swap_reviews;
DROP POLICY IF EXISTS "Requesters of completed swaps can insert reviews" ON public.swap_reviews;
CREATE POLICY "Requesters of completed swaps can insert reviews"
  ON public.swap_reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reviewer_id AND
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id = swap_id
        AND s.status = 'completed'
        AND s.requester_id = auth.uid()
        AND s.participant_id = reviewee_id
        AND s.requester_id <> s.participant_id
    )
  );

-- UPDATE: Original reviewer only, immutable reviewer_id, reviewee_id, and swap_id
DROP POLICY IF EXISTS "Reviewers can update their own reviews" ON public.swap_reviews;
CREATE POLICY "Reviewers can update their own reviews"
  ON public.swap_reviews FOR UPDATE
  TO authenticated
  USING (auth.uid() = reviewer_id)
  WITH CHECK (
    auth.uid() = reviewer_id
  );

-- DELETE: Original reviewer only
DROP POLICY IF EXISTS "Reviewers can delete their own reviews" ON public.swap_reviews;
CREATE POLICY "Reviewers can delete their own reviews"
  ON public.swap_reviews FOR DELETE
  TO authenticated
  USING (auth.uid() = reviewer_id);

-- 3. Automatic Reputation Aggregation Trigger Function
CREATE OR REPLACE FUNCTION public.update_profile_review_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_update_profile_review_metrics ON public.swap_reviews;
CREATE TRIGGER trg_update_profile_review_metrics
  AFTER INSERT OR UPDATE OR DELETE ON public.swap_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_profile_review_metrics();

-- 4. Automatic Completed Swaps Counter Trigger Function
CREATE OR REPLACE FUNCTION public.update_profile_completed_swaps_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('skillswap.internal_update', 'true', true);

  IF (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed')) THEN
    -- Recalculate for requester
    UPDATE public.profiles
    SET completed_swaps_count = (
      SELECT COUNT(*)::integer
      FROM public.swaps
      WHERE status = 'completed' AND (requester_id = NEW.requester_id OR participant_id = NEW.requester_id)
    )
    WHERE id = NEW.requester_id;

    -- Recalculate for participant if present
    IF NEW.participant_id IS NOT NULL THEN
      UPDATE public.profiles
      SET completed_swaps_count = (
        SELECT COUNT(*)::integer
        FROM public.swaps
        WHERE status = 'completed' AND (requester_id = NEW.participant_id OR participant_id = NEW.participant_id)
      )
      WHERE id = NEW.participant_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_profile_completed_swaps_count ON public.swaps;
CREATE TRIGGER trg_update_profile_completed_swaps_count
  AFTER UPDATE OF status ON public.swaps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_profile_completed_swaps_count();

-- 5. Trigger to Protect Trust & Reputation Columns on Profiles
CREATE OR REPLACE FUNCTION public.protect_profile_reputation_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_reputation_metrics ON public.profiles;
CREATE TRIGGER trg_protect_profile_reputation_metrics
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_reputation_metrics();

-- 6. Canonical Atomic RPC: submit_swap_review
CREATE OR REPLACE FUNCTION public.submit_swap_review(
  p_swap_id UUID,
  p_rating INTEGER,
  p_review_text TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Revoke default public/anon access and grant explicitly to authenticated users
REVOKE EXECUTE ON FUNCTION public.submit_swap_review FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_swap_review TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.swap_reviews TO authenticated;
GRANT SELECT ON public.swap_reviews TO anon;
