-- Migration 034: Supabase RLS Reinforcement for complete_profile() (L19 Security Hardening)
-- Hardens complete_profile RPC against cross-user profile completion attacks,
-- parameter injection, session config leakage, and search_path escalation,
-- while reinforcing Row Level Security (RLS) on public.profiles.

-- ============================================================================
-- 1. DROP EXISTING FUNCTION DEFINITIONS TO ELIMINATE OVERLOAD BYPASSES
-- ============================================================================
DROP FUNCTION IF EXISTS public.complete_profile();
DROP FUNCTION IF EXISTS public.complete_profile(UUID);

-- ============================================================================
-- 2. CREATE HARDENED complete_profile() RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_profile(
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_profile RECORD;
  v_skills_count INT;
BEGIN
  -- 1. Derive user identity strictly from auth.uid()
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  -- 2. Enforce explicit ownership check if a profile/user ID parameter is provided
  IF p_user_id IS NOT NULL AND p_user_id <> v_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot complete profile for another user.';
  END IF;

  -- 3. Acquire transaction-level advisory lock per user to eliminate race conditions
  PERFORM pg_advisory_xact_lock(hashtext('complete_profile_lock_' || v_user_id::text));

  -- 4. Verify profile existence
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found.';
  END IF;

  -- 5. Idempotency check: Return success early if profile is already completed
  IF v_profile.profile_completed = TRUE THEN
    RETURN jsonb_build_object(
      'success', true,
      'profile_completed', true,
      'message', 'Profile is already completed.'
    );
  END IF;

  -- 6. Enforce custom username requirement
  IF v_profile.username IS NULL OR TRIM(v_profile.username) = '' OR v_profile.username LIKE 'user_%' THEN
    RAISE EXCEPTION 'A valid custom username is required before completing your profile.';
  END IF;

  -- 7. Enforce at least 1 skill requirement across predefined and custom skills
  SELECT (
    (SELECT COUNT(*) FROM public.user_skills WHERE user_id = v_user_id) +
    (SELECT COUNT(*) FROM public.user_custom_skills WHERE user_id = v_user_id)
  ) INTO v_skills_count;

  IF v_skills_count < 1 THEN
    RAISE EXCEPTION 'At least 1 skill must be added before completing your profile.';
  END IF;

  -- 8. Enable session variables for profile update
  PERFORM set_config('app.allow_profile_completion', 'true', true);
  PERFORM set_config('skillswap.internal_update', 'true', true);

  -- 9. Execute update restricted strictly to v_user_id (auth.uid())
  UPDATE public.profiles
  SET profile_completed = TRUE,
      updated_at = NOW()
  WHERE id = v_user_id;

  -- 10. Immediately reset session variables to prevent session leakage in transaction
  PERFORM set_config('app.allow_profile_completion', 'false', true);
  PERFORM set_config('skillswap.internal_update', 'false', true);

  -- 11. Ensure credit account exists for the user
  PERFORM public.ensure_credit_account(v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'profile_completed', true,
    'message', 'Profile completed successfully.'
  );
END;
$$;

-- ============================================================================
-- 3. EXPLICIT GRANTS & ACCESS CONTROL
-- ============================================================================
REVOKE ALL ON FUNCTION public.complete_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_profile(UUID) TO authenticated, service_role;

-- ============================================================================
-- 4. REINFORCE ROW LEVEL SECURITY (RLS) ON public.profiles
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

NOTIFY pgrst, 'reload schema';
