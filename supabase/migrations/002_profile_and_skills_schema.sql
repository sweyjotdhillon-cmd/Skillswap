-- Migration 002: Profile, Skills, and Account Storage Architecture for SkillSwap

-- 1. Users Mapping Table (Maps Supabase auth.users UUID to compact BIGINT internal SkillSwap User ID)
CREATE TABLE IF NOT EXISTS public.users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_users_auth_id ON public.users(auth_id);

-- 2. Profiles Table (Stores core profile identity & metadata)
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id BIGINT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  contact TEXT NULL,
  bio TEXT NULL,
  avatar TEXT NULL,
  profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique index for permanent usernames
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles (lower(username));

-- Database Trigger: Enforce Username Immutability
CREATE OR REPLACE FUNCTION public.prevent_username_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.username IS DISTINCT FROM NEW.username THEN
    RAISE EXCEPTION 'Username cannot be changed once assigned.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_username_immutable ON public.profiles;
CREATE TRIGGER check_username_immutable
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_username_change();

-- 3. Predefined Global Skills Library
CREATE TABLE IF NOT EXISTS public.skills (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_skills_name_lower ON public.skills (lower(name));

-- Seed predefined skills library
INSERT INTO public.skills (name, category) VALUES
  ('Python', 'Software Engineering'),
  ('JavaScript', 'Software Engineering'),
  ('TypeScript', 'Software Engineering'),
  ('React', 'Software Engineering'),
  ('Node.js', 'Software Engineering'),
  ('HTML & CSS', 'Software Engineering'),
  ('Artificial Intelligence', 'AI & Machine Learning'),
  ('Machine Learning', 'AI & Machine Learning'),
  ('Data Analysis', 'AI & Machine Learning'),
  ('SQL & Databases', 'Software Engineering'),
  ('Graphic Design', 'Design & Creative'),
  ('Photoshop', 'Design & Creative'),
  ('Figma & UI/UX', 'Design & Creative'),
  ('Video Editing', 'Design & Creative'),
  ('Illustration', 'Design & Creative'),
  ('Digital Marketing', 'Marketing & Sales'),
  ('SEO Optimization', 'Marketing & Sales'),
  ('Content Strategy', 'Marketing & Sales'),
  ('Copywriting', 'Marketing & Sales'),
  ('Social Media Management', 'Marketing & Sales'),
  ('Public Speaking', 'Personal & Professional'),
  ('Project Management', 'Business & Leadership'),
  ('Financial Analysis', 'Business & Leadership'),
  ('Excel & Spreadsheets', 'Business & Leadership'),
  ('Cloud Computing (AWS/GCP)', 'Software Engineering'),
  ('Cyber Security', 'Software Engineering'),
  ('Mobile App Development', 'Software Engineering'),
  ('Spanish Language', 'Languages'),
  ('French Language', 'Languages'),
  ('German Language', 'Languages'),
  ('Mandarin Language', 'Languages'),
  ('Music Production', 'Design & Creative'),
  ('Photography', 'Design & Creative'),
  ('Product Management', 'Business & Leadership')
ON CONFLICT (name) DO NOTHING;

-- 4. User-Skills Predefined Relationship Table
CREATE TABLE IF NOT EXISTS public.user_skills (
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  skill_id INT NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON public.user_skills (user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill_id ON public.user_skills (skill_id);

-- 5. User Custom Skills Table
CREATE TABLE IF NOT EXISTS public.user_custom_skills (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_custom_skill UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_user_custom_skills_user_id ON public.user_custom_skills (user_id);

-- Database Trigger: Enforce Maximum 10 Skills Limit (Predefined + Custom combined)
CREATE OR REPLACE FUNCTION public.enforce_max_skills_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_total_skills INT;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM public.user_skills WHERE user_id = NEW.user_id) +
    (SELECT COUNT(*) FROM public.user_custom_skills WHERE user_id = NEW.user_id)
  INTO v_total_skills;

  IF v_total_skills >= 10 THEN
    RAISE EXCEPTION 'User cannot select or add more than 10 total skills.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_max_skills_user_skills ON public.user_skills;
CREATE TRIGGER check_max_skills_user_skills
  BEFORE INSERT ON public.user_skills
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_max_skills_limit();

DROP TRIGGER IF EXISTS check_max_skills_user_custom_skills ON public.user_custom_skills;
CREATE TRIGGER check_max_skills_user_custom_skills
  BEFORE INSERT ON public.user_custom_skills
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_max_skills_limit();

-- 6. Account & Credit State Table
CREATE TABLE IF NOT EXISTS public.accounts (
  user_id BIGINT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  credits INT NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Helper RPC: Username Validation
CREATE OR REPLACE FUNCTION public.validate_username(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean TEXT;
  v_reserved TEXT[] := ARRAY[
    'admin', 'administrator', 'support', 'help', 'system', 'moderator',
    'official', 'skillswap', 'api', 'root', 'null', 'undefined', 'settings',
    'profile', 'auth', 'login', 'signup', 'explore', 'about', 'terms',
    'privacy', 'contact', 'dashboard'
  ];
  v_exists BOOLEAN;
BEGIN
  IF p_username IS NULL OR trim(p_username) = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Username cannot be empty.');
  END IF;

  v_clean := lower(trim(p_username));

  IF length(v_clean) < 3 OR length(v_clean) > 20 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Username must be between 3 and 20 characters.');
  END IF;

  IF v_clean !~ '^[a-z0-9._]+$' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Username can only contain letters, numbers, underscores, and periods.');
  END IF;

  IF v_clean = ANY(v_reserved) THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This username is reserved by the system.');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = v_clean
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Username is already taken.');
  END IF;

  RETURN jsonb_build_object('valid', true, 'reason', 'Username is available.');
END;
$$;

-- 8. RPC: Atomic First-Time Profile Creation
CREATE OR REPLACE FUNCTION public.create_first_time_profile(
  p_auth_id UUID,
  p_name TEXT,
  p_username TEXT,
  p_contact TEXT DEFAULT NULL,
  p_bio TEXT DEFAULT NULL,
  p_avatar TEXT DEFAULT NULL,
  p_skill_ids INT[] DEFAULT '{}',
  p_custom_skills TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id BIGINT;
  v_username_val JSONB;
  v_total_skills INT;
  v_skill_id INT;
  v_custom_name TEXT;
  v_profile_exists BOOLEAN;
BEGIN
  IF p_auth_id IS NULL THEN
    RAISE EXCEPTION 'Authentication user ID is required.';
  END IF;

  -- Validate username
  v_username_val := public.validate_username(p_username);
  IF NOT (v_username_val->>'valid')::BOOLEAN THEN
    RAISE EXCEPTION 'Invalid username: %', (v_username_val->>'reason');
  END IF;

  -- Calculate total skills requested
  v_total_skills := COALESCE(array_length(p_skill_ids, 1), 0) + COALESCE(array_length(p_custom_skills, 1), 0);
  IF v_total_skills > 10 THEN
    RAISE EXCEPTION 'A maximum of 10 skills can be selected.';
  END IF;

  -- Find or create compact internal user ID
  SELECT id INTO v_user_id FROM public.users WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    INSERT INTO public.users (auth_id) VALUES (p_auth_id) RETURNING id INTO v_user_id;
  END IF;

  -- Ensure profile does not already exist
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id = v_user_id) INTO v_profile_exists;
  IF v_profile_exists THEN
    RAISE EXCEPTION 'Profile already exists for this account.';
  END IF;

  -- Insert profile
  INSERT INTO public.profiles (
    user_id,
    name,
    username,
    contact,
    bio,
    avatar,
    profile_completed
  ) VALUES (
    v_user_id,
    trim(p_name),
    lower(trim(p_username)),
    trim(p_contact),
    trim(p_bio),
    trim(p_avatar),
    TRUE
  );

  -- Insert predefined skills
  IF p_skill_ids IS NOT NULL THEN
    FOREACH v_skill_id IN ARRAY p_skill_ids LOOP
      INSERT INTO public.user_skills (user_id, skill_id)
      VALUES (v_user_id, v_skill_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Insert custom skills
  IF p_custom_skills IS NOT NULL THEN
    FOREACH v_custom_name IN ARRAY p_custom_skills LOOP
      IF trim(v_custom_name) <> '' THEN
        INSERT INTO public.user_custom_skills (user_id, name)
        VALUES (v_user_id, trim(v_custom_name))
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  -- Initialize Account Credits
  INSERT INTO public.accounts (user_id, credits)
  VALUES (v_user_id, 10)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN public.get_my_profile(p_auth_id);
END;
$$;

-- 9. RPC: Update Existing Profile (Forbids Username Changes)
CREATE OR REPLACE FUNCTION public.update_profile(
  p_auth_id UUID,
  p_name TEXT,
  p_contact TEXT DEFAULT NULL,
  p_bio TEXT DEFAULT NULL,
  p_avatar TEXT DEFAULT NULL,
  p_skill_ids INT[] DEFAULT '{}',
  p_custom_skills TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id BIGINT;
  v_total_skills INT;
  v_skill_id INT;
  v_custom_name TEXT;
BEGIN
  SELECT id INTO v_user_id FROM public.users WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  v_total_skills := COALESCE(array_length(p_skill_ids, 1), 0) + COALESCE(array_length(p_custom_skills, 1), 0);
  IF v_total_skills > 10 THEN
    RAISE EXCEPTION 'A maximum of 10 skills can be selected.';
  END IF;

  -- Update profile metadata without altering username
  UPDATE public.profiles
  SET
    name = trim(p_name),
    contact = trim(p_contact),
    bio = trim(p_bio),
    avatar = trim(p_avatar),
    updated_at = NOW()
  WHERE user_id = v_user_id;

  -- Replace predefined skills
  DELETE FROM public.user_skills WHERE user_id = v_user_id;
  IF p_skill_ids IS NOT NULL THEN
    FOREACH v_skill_id IN ARRAY p_skill_ids LOOP
      INSERT INTO public.user_skills (user_id, skill_id)
      VALUES (v_user_id, v_skill_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Replace custom skills
  DELETE FROM public.user_custom_skills WHERE user_id = v_user_id;
  IF p_custom_skills IS NOT NULL THEN
    FOREACH v_custom_name IN ARRAY p_custom_skills LOOP
      IF trim(v_custom_name) <> '' THEN
        INSERT INTO public.user_custom_skills (user_id, name)
        VALUES (v_user_id, trim(v_custom_name))
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN public.get_my_profile(p_auth_id);
END;
$$;

-- 10. RPC: Fetch Private Profile for Authenticated User
CREATE OR REPLACE FUNCTION public.get_my_profile(p_auth_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id BIGINT;
  v_result JSONB;
BEGIN
  SELECT id INTO v_user_id FROM public.users WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'user_id', u.id,
    'auth_id', u.auth_id,
    'name', p.name,
    'username', p.username,
    'contact', p.contact,
    'bio', p.bio,
    'avatar', p.avatar,
    'profile_completed', p.profile_completed,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'credits', COALESCE(a.credits, 0),
    'skills', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'category', s.category))
      FROM public.user_skills us
      JOIN public.skills s ON s.id = us.skill_id
      WHERE us.user_id = u.id
    ), '[]'::jsonb),
    'custom_skills', COALESCE((
      SELECT jsonb_agg(ucs.name)
      FROM public.user_custom_skills ucs
      WHERE ucs.user_id = u.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.users u
  JOIN public.profiles p ON p.user_id = u.id
  LEFT JOIN public.accounts a ON a.user_id = u.id
  WHERE u.id = v_user_id;

  RETURN v_result;
END;
$$;

-- 11. RPC: Fetch Public Profile by Username
CREATE OR REPLACE FUNCTION public.get_public_profile(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'user_id', u.id,
    'name', p.name,
    'username', p.username,
    'bio', p.bio,
    'avatar', p.avatar,
    'created_at', p.created_at,
    'skills', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'category', s.category))
      FROM public.user_skills us
      JOIN public.skills s ON s.id = us.skill_id
      WHERE us.user_id = u.id
    ), '[]'::jsonb),
    'custom_skills', COALESCE((
      SELECT jsonb_agg(ucs.name)
      FROM public.user_custom_skills ucs
      WHERE ucs.user_id = u.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.profiles p
  JOIN public.users u ON u.id = p.user_id
  WHERE lower(p.username) = lower(trim(p_username));

  RETURN v_result;
END;
$$;

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_custom_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- Grants for executing RPC functions
GRANT EXECUTE ON FUNCTION public.validate_username(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_first_time_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT[], TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_profile(UUID, TEXT, TEXT, TEXT, TEXT, INT[], TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_profile(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_profile(TEXT) TO anon, authenticated, service_role;

-- Public RLS Policies
CREATE POLICY "Public profiles are readable by everyone"
  ON public.profiles FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public skills library is readable by everyone"
  ON public.skills FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public user skills are readable by everyone"
  ON public.user_skills FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public user custom skills are readable by everyone"
  ON public.user_custom_skills FOR SELECT TO anon, authenticated USING (true);
