-- Migration 050: Fix Platform Trust Metric Settlement Trigger & Security Alignment
-- Description: Ensures SECURITY DEFINER settlement RPCs (e.g. complete_credit_swap) can refresh
--              profile trust metrics without triggering "Trust metrics are managed by the platform"
--              RLS/trigger exceptions, while strictly preventing direct client mutations.

-- ============================================================================
-- 1. CANONICAL REFRESH_PROFILE_TRUST_METRICS SECURITY DEFINER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.refresh_profile_trust_metrics(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Set transaction-local flag for internal maintenance
  PERFORM set_config('skillswap.internal_update', 'true', true);

  UPDATE public.profiles
  SET
    completed_swaps_count = (
      SELECT COUNT(*)::integer
      FROM public.swaps
      WHERE status = 'completed' AND (requester_id = p_user_id OR participant_id = p_user_id)
    ),
    average_rating = (
      SELECT ROUND(AVG(rating)::numeric, 2)
      FROM public.swap_reviews
      WHERE reviewee_id = p_user_id
    ),
    review_count = (
      SELECT COUNT(*)::integer
      FROM public.swap_reviews
      WHERE reviewee_id = p_user_id
    )
  WHERE id = p_user_id;

  -- Reset config to prevent session leakage
  PERFORM set_config('skillswap.internal_update', '', true);
END;
$$;

-- Strict RPC execution permissions on refresh_profile_trust_metrics
REVOKE ALL ON FUNCTION public.refresh_profile_trust_metrics(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_profile_trust_metrics(uuid) TO service_role;

-- ============================================================================
-- 2. TRIGGER FUNCTION TO SYNC COMPLETED SWAP TRUST METRICS ON SWAP CHANGES
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_completed_swap_trust_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('skillswap.internal_update', 'true', true);

  IF (TG_OP = 'DELETE') THEN
    IF OLD.status = 'completed' THEN
      PERFORM public.refresh_profile_trust_metrics(OLD.requester_id);
      PERFORM public.refresh_profile_trust_metrics(OLD.participant_id);
    END IF;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (NEW.status = 'completed' OR OLD.status = 'completed') THEN
      PERFORM public.refresh_profile_trust_metrics(OLD.requester_id);
      PERFORM public.refresh_profile_trust_metrics(OLD.participant_id);
      IF NEW.requester_id IS DISTINCT FROM OLD.requester_id THEN
        PERFORM public.refresh_profile_trust_metrics(NEW.requester_id);
      END IF;
      IF NEW.participant_id IS DISTINCT FROM OLD.participant_id THEN
        PERFORM public.refresh_profile_trust_metrics(NEW.participant_id);
      END IF;
    END IF;
  ELSIF (TG_OP = 'INSERT') THEN
    IF NEW.status = 'completed' THEN
      PERFORM public.refresh_profile_trust_metrics(NEW.requester_id);
      PERFORM public.refresh_profile_trust_metrics(NEW.participant_id);
    END IF;
  END IF;

  PERFORM set_config('skillswap.internal_update', '', true);

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_completed_swap_trust_metrics ON public.swaps;
CREATE TRIGGER trg_sync_completed_swap_trust_metrics
  AFTER INSERT OR UPDATE OR DELETE ON public.swaps
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_completed_swap_trust_metrics();

-- ============================================================================
-- 3. PREVENT DIRECT CLIENT MUTATIONS ON TRUST & REPUTATION METRICS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prevent_client_trust_metric_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.is_verified IS DISTINCT FROM NEW.is_verified OR
        OLD.completed_swaps_count IS DISTINCT FROM NEW.completed_swaps_count OR
        OLD.average_rating IS DISTINCT FROM NEW.average_rating OR
        OLD.review_count IS DISTINCT FROM NEW.review_count) THEN
      IF current_setting('skillswap.internal_update', true) IS DISTINCT FROM 'true' AND
         (auth.uid() IS NOT NULL OR CURRENT_USER IN ('authenticated', 'anon')) THEN
        RAISE EXCEPTION 'Trust metrics are managed by the platform';
      END IF;
    END IF;
  ELSIF (TG_OP = 'INSERT') THEN
    IF (NEW.is_verified IS TRUE OR
        (NEW.completed_swaps_count IS NOT NULL AND NEW.completed_swaps_count <> 0) OR
        (NEW.review_count IS NOT NULL AND NEW.review_count <> 0) OR
        NEW.average_rating IS NOT NULL) THEN
      IF current_setting('skillswap.internal_update', true) IS DISTINCT FROM 'true' AND
         (auth.uid() IS NOT NULL OR CURRENT_USER IN ('authenticated', 'anon')) THEN
        RAISE EXCEPTION 'Trust metrics are managed by the platform';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_client_trust_metric_changes ON public.profiles;
CREATE TRIGGER trg_prevent_client_trust_metric_changes
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_trust_metric_changes();

-- Alias function protect_profile_reputation_metrics with identical logic for legacy triggers
CREATE OR REPLACE FUNCTION public.protect_profile_reputation_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.is_verified IS DISTINCT FROM NEW.is_verified OR
        OLD.completed_swaps_count IS DISTINCT FROM NEW.completed_swaps_count OR
        OLD.average_rating IS DISTINCT FROM NEW.average_rating OR
        OLD.review_count IS DISTINCT FROM NEW.review_count) THEN
      IF current_setting('skillswap.internal_update', true) IS DISTINCT FROM 'true' AND
         (auth.uid() IS NOT NULL OR CURRENT_USER IN ('authenticated', 'anon')) THEN
        RAISE EXCEPTION 'Trust metrics are managed by the platform';
      END IF;
    END IF;
  ELSIF (TG_OP = 'INSERT') THEN
    IF (NEW.is_verified IS TRUE OR
        (NEW.completed_swaps_count IS NOT NULL AND NEW.completed_swaps_count <> 0) OR
        (NEW.review_count IS NOT NULL AND NEW.review_count <> 0) OR
        NEW.average_rating IS NOT NULL) THEN
      IF current_setting('skillswap.internal_update', true) IS DISTINCT FROM 'true' AND
         (auth.uid() IS NOT NULL OR CURRENT_USER IN ('authenticated', 'anon')) THEN
        RAISE EXCEPTION 'Trust metrics are managed by the platform';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_reputation_metrics ON public.profiles;

-- ============================================================================
-- 4. HARDEN SUBMIT_SWAP_WORK RPC WITH CANONICAL PATH VALIDATION & 24H EXPIRY
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_swap_work(
  p_swap_id uuid,
  p_notes text DEFAULT NULL,
  p_files jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_swap public.swaps;
  v_submission public.swap_submissions;
  v_file_rec jsonb;
  v_notes text := NULLIF(trim(p_notes), '');
  v_file_count integer := 0;
  v_storage_path text;
  v_file_name text;
  v_mime_type text;
  v_file_size bigint;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_swap
  FROM public.swaps
  WHERE id = p_swap_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap not found';
  END IF;

  IF v_swap.participant_id IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'Only the assigned swap participant can submit work';
  END IF;

  IF v_swap.status NOT IN ('accepted', 'submitted') THEN
    RAISE EXCEPTION 'Swap must be in accepted or submitted status to submit work (current: %)', v_swap.status;
  END IF;

  IF p_files IS NOT NULL AND jsonb_typeof(p_files) = 'array' THEN
    v_file_count := jsonb_array_length(p_files);
  END IF;

  IF v_notes IS NULL AND v_file_count = 0 THEN
    RAISE EXCEPTION 'Submission must contain notes or at least one file attachment';
  END IF;

  IF v_file_count > 5 THEN
    RAISE EXCEPTION 'Maximum 5 files allowed per submission';
  END IF;

  -- Create or update submission
  INSERT INTO public.swap_submissions (swap_id, submitted_by, notes, updated_at)
  VALUES (p_swap_id, v_user, v_notes, now())
  ON CONFLICT (swap_id) DO UPDATE
  SET submitted_by = EXCLUDED.submitted_by,
      notes = EXCLUDED.notes,
      updated_at = now()
  RETURNING * INTO v_submission;

  -- If re-submitting with new files, remove previous submission file records for this submission
  IF v_file_count > 0 THEN
    DELETE FROM public.swap_submission_files WHERE submission_id = v_submission.id;

    FOR v_file_rec IN SELECT * FROM jsonb_array_elements(p_files)
    LOOP
      v_storage_path := v_file_rec->>'storage_path';
      v_file_name := v_file_rec->>'file_name';
      v_mime_type := public.get_canonical_mime_type(v_file_name);
      v_file_size := (v_file_rec->>'file_size')::bigint;

      IF v_storage_path IS NULL OR v_file_name IS NULL THEN
        RAISE EXCEPTION 'Invalid file payload: missing storage_path or file_name';
      END IF;

      IF v_mime_type IS NULL THEN
        RAISE EXCEPTION 'Invalid file format or upload rejected: unsupported file extension for "%".', v_file_name;
      END IF;

      IF split_part(v_storage_path, '/', 1) <> 'submissions' OR
         split_part(v_storage_path, '/', 2) <> p_swap_id::text OR
         split_part(v_storage_path, '/', 3) <> v_user::text THEN
        RAISE EXCEPTION 'Invalid storage path structure for submission: %', v_storage_path;
      END IF;

      INSERT INTO public.swap_submission_files (
        submission_id,
        storage_path,
        file_name,
        mime_type,
        file_size,
        storage_expires_at
      ) VALUES (
        v_submission.id,
        v_storage_path,
        v_file_name,
        v_mime_type,
        v_file_size,
        now() + interval '24 hours'
      );
    END LOOP;
  END IF;

  -- Transition swap status to submitted and set auto_release_at
  UPDATE public.swaps
  SET status = 'submitted',
      submitted_at = COALESCE(submitted_at, now()),
      auto_release_at = now() + interval '7 days',
      updated_at = now()
  WHERE id = p_swap_id;

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', v_submission.id,
    'status', 'submitted'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_swap_work(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_swap_work(uuid, text, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
