-- Migration: 002_profile_and_skills_schema.sql
-- Description: Complete Profile, Accounts, Private Contacts, and Skills Schema with RLS Policies & Triggers

-- ============================================================================
-- 0. HELPER FUNCTIONS: AUTOMATIC UPDATED_AT TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ============================================================================
-- 1. PUBLIC PROFILES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  location TEXT,
  profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_username_format CHECK (
    username IS NULL OR username ~ '^[a-z0-9._]{3,30}$'
  )
);

-- Single Case-Insensitive Unique Index on Username (allows NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles(LOWER(username))
  WHERE username IS NOT NULL;

-- Trigger: Automatic updated_at timestamp
DROP TRIGGER IF EXISTS trg_profiles_set_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Trigger: Combined Username Rules (Normalization + Immutability Enforcement)
CREATE OR REPLACE FUNCTION public.handle_username_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1. Normalize NEW username to lowercase if provided
  IF NEW.username IS NOT NULL THEN
    NEW.username := LOWER(NEW.username);
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

-- Trigger: Prevent Direct Client Modification of profile_completed
CREATE OR REPLACE FUNCTION public.prevent_profile_completed_direct_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.profile_completed IS DISTINCT FROM NEW.profile_completed) AND (current_user IN ('authenticated', 'anon')) THEN
    RAISE EXCEPTION 'profile_completed cannot be updated directly by clients. Please call complete_profile() function.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_completed_direct_update ON public.profiles;
CREATE TRIGGER trg_prevent_profile_completed_direct_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_completed_direct_update();


-- ============================================================================
-- 2. SEPARATE PRIVATE CONTACTS TABLE (Phone Only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_private_contacts (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone_number TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_user_private_contacts_set_updated_at ON public.user_private_contacts;
CREATE TRIGGER trg_user_private_contacts_set_updated_at
  BEFORE UPDATE ON public.user_private_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();


-- ============================================================================
-- 3. SEPARATE ACCOUNTS TABLE (Credits & Financial Metrics - Default 0 Balance)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.accounts (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  credits_balance INT NOT NULL DEFAULT 0 CONSTRAINT chk_min_balance CHECK (credits_balance >= 0),
  credits_earned INT NOT NULL DEFAULT 0 CONSTRAINT chk_min_earned CHECK (credits_earned >= 0),
  credits_spent INT NOT NULL DEFAULT 0 CONSTRAINT chk_min_spent CHECK (credits_spent >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_accounts_set_updated_at ON public.accounts;
CREATE TRIGGER trg_accounts_set_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();


-- ============================================================================
-- 4. PREDEFINED & CUSTOM SKILLS SCHEMA (Single Profile Skill Set)
-- ============================================================================

-- Catalog of predefined system skills (Admin managed)
CREATE TABLE IF NOT EXISTS public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique index for catalog skills
CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_name_lower ON public.skills(LOWER(name));

-- User Predefined Skills relationship
CREATE TABLE IF NOT EXISTS public.user_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_skill UNIQUE (user_id, skill_id)
);

-- User Custom Skills relationship
CREATE TABLE IF NOT EXISTS public.user_custom_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique index for user custom skills
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_custom_skills_unique
  ON public.user_custom_skills(user_id, LOWER(skill_name));


-- ============================================================================
-- 5. TRUSTED STORED PROCEDURES (add_user_skill & complete_profile)
-- ============================================================================

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
    RETURNING id INTO v_new_id;

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
  RETURNING id INTO v_new_id;

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

  -- Update profiles table (Executes with table owner role privileges)
  UPDATE public.profiles
  SET profile_completed = TRUE,
      updated_at = NOW()
  WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true, 'profile_completed', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_profile() TO authenticated;


-- ============================================================================
-- 6. AUTOMATIC USER INITIALIZATION TRIGGER & BACKFILL FOR auth.users
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Create Profile with profile_completed = FALSE & Deterministic full_name Fallback
  INSERT INTO public.profiles (id, full_name, avatar_url, profile_completed)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
      NULLIF(TRIM(split_part(NEW.email, '@', 1)), ''),
      'SkillSwap User'
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    ),
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;

  -- 2. Create Account (Default 0 Credits)
  INSERT INTO public.accounts (user_id, credits_balance)
  VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- 3. Create Private Contact Entry
  INSERT INTO public.user_private_contacts (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- One-Time Backfill for Existing auth.users
DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN SELECT * FROM auth.users LOOP
    INSERT INTO public.profiles (id, full_name, avatar_url, profile_completed)
    VALUES (
      u.id,
      COALESCE(
        NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
        NULLIF(TRIM(u.raw_user_meta_data->>'name'), ''),
        NULLIF(TRIM(split_part(u.email, '@', 1)), ''),
        'SkillSwap User'
      ),
      COALESCE(
        u.raw_user_meta_data->>'avatar_url',
        u.raw_user_meta_data->>'picture'
      ),
      FALSE
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.accounts (user_id, credits_balance)
    VALUES (u.id, 0)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.user_private_contacts (user_id)
    VALUES (u.id)
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END;
$$;


-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES (Idempotent: DROP POLICY IF EXISTS)
-- ============================================================================

-- --- Profiles RLS ---
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);


-- --- Private Contacts RLS (Restricted strictly to owner) ---
ALTER TABLE public.user_private_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own private contacts" ON public.user_private_contacts;
CREATE POLICY "Users can view their own private contacts"
  ON public.user_private_contacts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own private contacts" ON public.user_private_contacts;
CREATE POLICY "Users can update their own private contacts"
  ON public.user_private_contacts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own private contacts" ON public.user_private_contacts;
CREATE POLICY "Users can insert their own private contacts"
  ON public.user_private_contacts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);


-- --- Accounts RLS (Restricted SELECT strictly to owner; NO client INSERT/UPDATE/DELETE) ---
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own credit account balance" ON public.accounts;
CREATE POLICY "Users can view their own credit account balance"
  ON public.accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);


-- --- Predefined Skills Catalog RLS (Public SELECT; Admin/Server write only) ---
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Skills catalog is viewable by everyone" ON public.skills;
CREATE POLICY "Skills catalog is viewable by everyone"
  ON public.skills FOR SELECT USING (true);


-- --- User Skills RLS (Public SELECT; Owner DELETE only; Additions via add_user_skill RPC) ---
ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User skills are viewable by everyone" ON public.user_skills;
CREATE POLICY "User skills are viewable by everyone"
  ON public.user_skills FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can delete their own predefined skills" ON public.user_skills;
CREATE POLICY "Users can delete their own predefined skills"
  ON public.user_skills FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


-- --- User Custom Skills RLS (Public SELECT; Owner DELETE only; Additions via add_user_skill RPC) ---
ALTER TABLE public.user_custom_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User custom skills are viewable by everyone" ON public.user_custom_skills;
CREATE POLICY "User custom skills are viewable by everyone"
  ON public.user_custom_skills FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can delete their own custom skills" ON public.user_custom_skills;
CREATE POLICY "Users can delete their own custom skills"
  ON public.user_custom_skills FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


-- ============================================================================
-- 8. GRANT MINIMAL ROLE PERMISSIONS
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Full access for service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- Minimal table grants for authenticated and anon roles according to security contract
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

GRANT SELECT, INSERT, UPDATE ON public.user_private_contacts TO authenticated;

GRANT SELECT ON public.accounts TO authenticated;

GRANT SELECT ON public.skills TO anon, authenticated;

GRANT SELECT, DELETE ON public.user_skills TO authenticated;
GRANT SELECT ON public.user_skills TO anon;

GRANT SELECT, DELETE ON public.user_custom_skills TO authenticated;
GRANT SELECT ON public.user_custom_skills TO anon;

-- ============================================================================
-- 9. REFRESH POSTGREST SCHEMA CACHE
-- ============================================================================
NOTIFY pgrst, 'reload schema';
