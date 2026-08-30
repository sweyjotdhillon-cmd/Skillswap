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

-- Deny all public access for SELECT, INSERT, UPDATE, DELETE.
-- Only server-side Edge Functions with service_role key can access this table.
-- (By default, enabling RLS without policies denies all client access).

-- Create index on email and expires_at for efficient query performance
CREATE INDEX IF NOT EXISTS idx_password_reset_challenges_email ON public.password_reset_challenges(email);
CREATE INDEX IF NOT EXISTS idx_password_reset_challenges_expires_at ON public.password_reset_challenges(expires_at);
