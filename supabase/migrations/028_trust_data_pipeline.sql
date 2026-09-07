-- Migration 028: Trust Data Pipeline (Section C.3)
-- Adds real trust and reputation columns to public.profiles, creates public.swap_reviews,
-- triggers for automatic rating and swap count updates, and atomic submit_swap_review RPC.

-- 1. Add trust metrics columns to public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_swaps_count INTEGER NOT NULL DEFAULT 0;

-- 2. Create public.swap_reviews table
CREATE TABLE IF NOT EXISTS public.swap_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swap_id UUID NOT NULL REFERENCES public.swaps(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewed_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT CHECK (length(review_text) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT swap_reviews_swap_reviewer_key UNIQUE (swap_id, reviewer_id)
);

-- Indexes for efficient query lookups
CREATE INDEX IF NOT EXISTS idx_swap_reviews_reviewed_user_id ON public.swap_reviews(reviewed_user_id);
CREATE INDEX IF NOT EXISTS idx_swap_reviews_swap_id ON public.swap_reviews(swap_id);

-- 3. Enable RLS on swap_reviews
ALTER TABLE public.swap_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can read public reviews
DROP POLICY IF EXISTS "Public swap reviews are viewable by everyone" ON public.swap_reviews;
CREATE POLICY "Public swap reviews are viewable by everyone"
  ON public.swap_reviews FOR SELECT
  USING (true);

-- RLS Policy: Participants of a completed swap can insert a review for their counterpart
DROP POLICY IF EXISTS "Participants of completed swaps can insert reviews" ON public.swap_reviews;
CREATE POLICY "Participants of completed swaps can insert reviews"
  ON public.swap_reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reviewer_id AND
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id = swap_id
        AND s.status = 'completed'
        AND (s.requester_id = auth.uid() OR s.participant_id = auth.uid())
        AND reviewed_user_id = (CASE WHEN s.requester_id = auth.uid() THEN s.participant_id ELSE s.requester_id END)
    )
  );

-- 4. Function & Trigger: Automatically recalculate average_rating and review_count on profiles
CREATE OR REPLACE FUNCTION public.update_profile_review_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.reviewed_user_id;
  ELSE
    v_user_id := NEW.reviewed_user_id;
  END IF;

  UPDATE public.profiles
  SET
    average_rating = (
      SELECT ROUND(AVG(rating)::numeric, 2)
      FROM public.swap_reviews
      WHERE reviewed_user_id = v_user_id
    ),
    review_count = (
      SELECT COUNT(*)::integer
      FROM public.swap_reviews
      WHERE reviewed_user_id = v_user_id
    )
  WHERE id = v_user_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_profile_review_metrics ON public.swap_reviews;
CREATE TRIGGER trg_update_profile_review_metrics
  AFTER INSERT OR UPDATE OR DELETE ON public.swap_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_profile_review_metrics();

-- 5. Function & Trigger: Automatically update completed_swaps_count on profiles
CREATE OR REPLACE FUNCTION public.update_profile_completed_swaps_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

-- 6. Atomic RPC: submit_swap_review
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
  v_target_user_id UUID;
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

  IF v_swap.requester_id = v_user_id THEN
    v_target_user_id := v_swap.participant_id;
  ELSIF v_swap.participant_id = v_user_id THEN
    v_target_user_id := v_swap.requester_id;
  ELSE
    RAISE EXCEPTION 'Only designated swap participants can submit reviews';
  END IF;

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Review target user unavailable';
  END IF;

  INSERT INTO public.swap_reviews (
    swap_id,
    reviewer_id,
    reviewed_user_id,
    rating,
    review_text
  ) VALUES (
    p_swap_id,
    v_user_id,
    v_target_user_id,
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

GRANT SELECT, INSERT ON public.swap_reviews TO authenticated;
GRANT SELECT ON public.swap_reviews TO anon;
