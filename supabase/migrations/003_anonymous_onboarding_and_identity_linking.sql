-- Migration: 003_anonymous_onboarding_and_identity_linking.sql
-- Description: Update Profiles RLS policy and handle_new_user trigger to prevent premature account/profile creation for anonymous users

-- 1. Update public profiles RLS policy to ensure public queries strictly filter profile_completed = TRUE while owner can view their profile during onboarding
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (profile_completed = true OR auth.uid() = id);

-- 2. Audit and update handle_new_user trigger function so anonymous users do not receive premature profiles, accounts, or contact entries
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Do NOT create permanent profile/account/contact records for anonymous onboarding users
  IF NEW.is_anonymous IS TRUE THEN
    RETURN NEW;
  END IF;

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

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
