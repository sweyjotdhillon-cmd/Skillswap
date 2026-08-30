-- Create password_reset_challenges table for custom OTP password recovery flow

CREATE TABLE IF NOT EXISTS public.password_reset_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ NULL,
  recovery_token_hash TEXT NULL,
  token_expires_at TIMESTAMPTZ NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.password_reset_challenges ENABLE ROW LEVEL SECURITY;

-- Explicitly deny all public access for SELECT, INSERT, UPDATE, DELETE.
-- Only server-side Edge Functions with service_role key can access this table.
DROP POLICY IF EXISTS "Deny all client access to password_reset_challenges" ON public.password_reset_challenges;
CREATE POLICY "Deny all client access to password_reset_challenges"
  ON public.password_reset_challenges
  FOR ALL
  TO public
  USING (false);

-- Create indexes for efficient query performance & rate-limiting checks
CREATE INDEX IF NOT EXISTS idx_password_reset_challenges_email ON public.password_reset_challenges(email);
CREATE INDEX IF NOT EXISTS idx_password_reset_challenges_expires_at ON public.password_reset_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_challenges_email_created ON public.password_reset_challenges(email, created_at);

-- Helper RPC function for service_role user lookup by email
CREATE OR REPLACE FUNCTION public.get_user_by_email(p_email text)
RETURNS TABLE (id uuid, email text, providers text[])
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    u.id,
    u.email,
    ARRAY(
      SELECT jsonb_array_elements_text(
        CASE
          WHEN u.raw_app_meta_data->'providers' IS NOT NULL THEN u.raw_app_meta_data->'providers'
          WHEN u.raw_app_meta_data->'provider' IS NOT NULL THEN jsonb_build_array(u.raw_app_meta_data->'provider')
          ELSE '[]'::jsonb
        END
      )
    ) as providers
  FROM auth.users u
  WHERE lower(u.email) = lower(p_email)
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_by_email(text) TO service_role;
