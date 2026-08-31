-- Migration: 005_fix_username_identity_integrity.sql
-- Description: Enforce database-level username uniqueness, permanence, and harden SECURITY DEFINER functions

-- ============================================================================
-- 1. DEDUPLICATE EXISTING NON-NULL USERNAMES (IF ANY EXIST)
-- ============================================================================
-- Keep the earliest created profile for any duplicate username (case-insensitive),
-- and safely set duplicate usernames to NULL before applying the unique index.
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY LOWER(username)
           ORDER BY created_at ASC, id ASC
         ) AS row_num
  FROM public.profiles
  WHERE username IS NOT NULL
)
UPDATE public.profiles
SET username = NULL
WHERE id IN (
  SELECT id FROM duplicates WHERE row_num > 1
);


-- ============================================================================
-- 2. CASE-INSENSITIVE UNIQUE INDEX ON PROFILES(USERNAME)
-- ============================================================================
-- Ensure two different profile IDs can NEVER own the same username (race-condition safe)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (LOWER(username))
  WHERE username IS NOT NULL;


-- ============================================================================
-- 3. PERMANENT USERNAME IMMUTABILITY TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_username_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1. Normalize NEW username to trimmed lowercase if provided
  IF NEW.username IS NOT NULL THEN
    NEW.username := LOWER(TRIM(NEW.username));
    IF NEW.username = '' THEN
      NEW.username := NULL;
    END IF;
  END IF;

  -- 2. Enforce Immutability: Block change once OLD username is set
  IF TG_OP = 'UPDATE' THEN
    IF OLD.username IS NOT NULL AND NEW.username IS DISTINCT FROM OLD.username THEN
      RAISE EXCEPTION 'Username is permanently immutable once set.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_username_rules ON public.profiles;
CREATE TRIGGER trg_handle_username_rules
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_username_rules();


-- ============================================================================
-- 4. HARDEN SECURITY DEFINER FUNCTIONS
-- ============================================================================

-- Procedure: Check Username Availability
CREATE OR REPLACE FUNCTION public.check_username_available(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean TEXT;
  v_current_uid UUID;
BEGIN
  v_clean := LOWER(TRIM(p_username));
  IF v_clean IS NULL OR v_clean = '' THEN
    RETURN FALSE;
  END IF;

  v_current_uid := auth.uid();

  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE LOWER(username) = v_clean
      AND (v_current_uid IS NULL OR id <> v_current_uid)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_username_available(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_username_available(TEXT) TO anon, authenticated, service_role;


-- Procedure: Add User Skill (Atomic, Concurrency-Safe)
CREATE OR REPLACE FUNCTION public.add_user_skill(
  p_skill_id UUID DEFAULT NULL,
  p_custom_skill_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_total_skills INT;
  v_clean_custom_name TEXT;
  v_new_id UUID;
BEGIN
  -- Derive user ID exclusively from auth.uid()
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  -- Validate input parameters
  IF p_skill_id IS NULL AND (p_custom_skill_name IS NULL OR TRIM(p_custom_skill_name) = '') THEN
    RAISE EXCEPTION 'Must provide either a predefined skill_id or a custom_skill_name.';
  END IF;

  IF p_skill_id IS NOT NULL AND (p_custom_skill_name IS NOT NULL AND TRIM(p_custom_skill_name) <> '') THEN
    RAISE EXCEPTION 'Cannot provide both skill_id and custom_skill_name simultaneously.';
  END IF;

  -- Transaction-level advisory lock per user to eliminate concurrent race conditions
  PERFORM pg_advisory_xact_lock(hashtext('user_skills_lock_' || v_user_id::text));

  -- Count total existing skills across both tables
  SELECT (
    (SELECT COUNT(*) FROM public.user_skills WHERE user_id = v_user_id) +
    (SELECT COUNT(*) FROM public.user_custom_skills WHERE user_id = v_user_id)
  ) INTO v_total_skills;

  IF v_total_skills >= 10 THEN
    RAISE EXCEPTION 'Maximum skill limit reached. A user cannot have more than 10 total skills.';
  END IF;

  -- Branch 1: Predefined Skill Insertion
  IF p_skill_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.skills WHERE id = p_skill_id) THEN
      RAISE EXCEPTION 'Predefined skill with ID % does not exist.', p_skill_id;
    END IF;

    INSERT INTO public.user_skills (user_id, skill_id)
    VALUES (v_user_id, p_skill_id)
    ON CONFLICT (user_id, skill_id) DO NOTHING
    RETURNING id INTO v_new_id;

    IF v_new_id IS NULL THEN
      SELECT id INTO v_new_id FROM public.user_skills WHERE user_id = v_user_id AND skill_id = p_skill_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'type', 'predefined', 'id', v_new_id);
  END IF;

  -- Branch 2: Custom Skill Insertion
  v_clean_custom_name := TRIM(p_custom_skill_name);

  -- Validate custom skill doesn't match predefined catalog
  IF EXISTS (SELECT 1 FROM public.skills WHERE LOWER(name) = LOWER(v_clean_custom_name)) THEN
    RAISE EXCEPTION 'Custom skill "%" already exists in predefined skills catalog. Please add it as a predefined skill.', v_clean_custom_name;
  END IF;

  INSERT INTO public.user_custom_skills (user_id, skill_name)
  VALUES (v_user_id, v_clean_custom_name)
  ON CONFLICT (user_id, LOWER(skill_name)) DO NOTHING
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL THEN
    SELECT id INTO v_new_id FROM public.user_custom_skills WHERE user_id = v_user_id AND LOWER(skill_name) = LOWER(v_clean_custom_name);
  END IF;

  RETURN jsonb_build_object('success', true, 'type', 'custom', 'id', v_new_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_user_skill(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_user_skill(UUID, TEXT) TO authenticated;


-- Procedure: Complete Onboarding Profile
CREATE OR REPLACE FUNCTION public.complete_profile()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_username TEXT;
  v_full_name TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT username, full_name INTO v_username, v_full_name
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_username IS NULL OR TRIM(v_username) = '' THEN
    RAISE EXCEPTION 'Cannot complete profile: Username must be assigned first.';
  END IF;

  IF v_full_name IS NULL OR TRIM(v_full_name) = '' THEN
    RAISE EXCEPTION 'Cannot complete profile: Full name is required.';
  END IF;

  -- Set session setting to allow updating profile_completed
  PERFORM set_config('app.allow_profile_completion', 'true', true);

  -- Update profiles table
  UPDATE public.profiles
  SET profile_completed = TRUE,
      updated_at = NOW()
  WHERE id = v_user_id;

  -- Ensure account record exists
  INSERT INTO public.accounts (user_id, credits_balance)
  VALUES (v_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Ensure private contact record exists
  INSERT INTO public.user_private_contacts (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'profile_completed', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_profile() TO authenticated;


-- ============================================================================
-- 5. REFRESH SCHEMA CACHE
-- ============================================================================
NOTIFY pgrst, 'reload schema';
