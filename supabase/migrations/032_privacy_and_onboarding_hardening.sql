-- Migration 032: Privacy-by-Design, Onboarding Hardening & RLS Audit

-- ============================================================================
-- 1. Secure & Hardened complete_profile() RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.complete_profile()
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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('complete_profile_lock_' || v_user_id::text));

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found.';
  END IF;

  IF v_profile.profile_completed = TRUE THEN
    RETURN jsonb_build_object(
      'success', true,
      'profile_completed', true,
      'message', 'Profile is already completed.'
    );
  END IF;

  IF v_profile.username IS NULL OR TRIM(v_profile.username) = '' OR v_profile.username LIKE 'user_%' THEN
    RAISE EXCEPTION 'A valid custom username is required before completing your profile.';
  END IF;

  SELECT (
    (SELECT COUNT(*) FROM public.user_skills WHERE user_id = v_user_id) +
    (SELECT COUNT(*) FROM public.user_custom_skills WHERE user_id = v_user_id)
  ) INTO v_skills_count;

  IF v_skills_count < 1 THEN
    RAISE EXCEPTION 'At least 1 skill must be added before completing your profile.';
  END IF;

  -- Use session variables so triggers allow updating profile_completed and trust columns
  PERFORM set_config('app.allow_profile_completion', 'true', true);
  PERFORM set_config('skillswap.internal_update', 'true', true);

  UPDATE public.profiles
  SET profile_completed = TRUE,
      updated_at = NOW()
  WHERE id = v_user_id;

  PERFORM public.ensure_credit_account(v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'profile_completed', true,
    'message', 'Profile completed successfully.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_profile() TO authenticated, service_role;

-- Re-define add_user_skill to target public.skills catalog table
CREATE OR REPLACE FUNCTION public.add_user_skill(
  p_skill_id UUID DEFAULT NULL,
  p_custom_skill_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_total_skills INT;
  v_clean_custom_name TEXT;
  v_new_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_skill_id IS NULL AND (p_custom_skill_name IS NULL OR TRIM(p_custom_skill_name) = '') THEN
    RAISE EXCEPTION 'Must provide either a predefined skill_id or a custom_skill_name.';
  END IF;

  IF p_skill_id IS NOT NULL AND (p_custom_skill_name IS NOT NULL AND TRIM(p_custom_skill_name) <> '') THEN
    RAISE EXCEPTION 'Cannot provide both skill_id and custom_skill_name simultaneously.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('user_skills_lock_' || v_user_id::text));

  SELECT (
    (SELECT COUNT(*) FROM public.user_skills WHERE user_id = v_user_id) +
    (SELECT COUNT(*) FROM public.user_custom_skills WHERE user_id = v_user_id)
  ) INTO v_total_skills;

  IF v_total_skills >= 10 THEN
    RAISE EXCEPTION 'Maximum skill limit reached. A user cannot have more than 10 total skills.';
  END IF;

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

  v_clean_custom_name := TRIM(p_custom_skill_name);

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

REVOKE ALL ON FUNCTION public.add_user_skill(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_user_skill(UUID, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 2. Audit & Harden RLS Policies on Profile & Contact Tables
-- ============================================================================

-- Table: public.profiles
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

-- Table: public.user_private_contacts (strictly private to owner)
ALTER TABLE public.user_private_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_private_contacts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own private contacts" ON public.user_private_contacts;
CREATE POLICY "Users can view their own private contacts"
  ON public.user_private_contacts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own private contacts" ON public.user_private_contacts;
CREATE POLICY "Users can insert their own private contacts"
  ON public.user_private_contacts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own private contacts" ON public.user_private_contacts;
CREATE POLICY "Users can update their own private contacts"
  ON public.user_private_contacts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own private contacts" ON public.user_private_contacts;
CREATE POLICY "Users can delete their own private contacts"
  ON public.user_private_contacts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.user_private_contacts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_private_contacts TO authenticated, service_role;

-- Table: public.user_skills
ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skills FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User skills are viewable by everyone" ON public.user_skills;
CREATE POLICY "User skills are viewable by everyone"
  ON public.user_skills FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can delete their own predefined skills" ON public.user_skills;
CREATE POLICY "Users can delete their own predefined skills"
  ON public.user_skills FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Table: public.user_custom_skills
ALTER TABLE public.user_custom_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_custom_skills FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User custom skills are viewable by everyone" ON public.user_custom_skills;
CREATE POLICY "User custom skills are viewable by everyone"
  ON public.user_custom_skills FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can delete their own custom skills" ON public.user_custom_skills;
CREATE POLICY "Users can delete their own custom skills"
  ON public.user_custom_skills FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
