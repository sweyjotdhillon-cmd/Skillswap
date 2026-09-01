-- Migration: 011_has_user_password_rpc.sql
-- Description: RPC function public.has_user_password() to check if current user has password credential in auth.users

CREATE OR REPLACE FUNCTION public.has_user_password()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_encrypted_password TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT encrypted_password INTO v_encrypted_password
  FROM auth.users
  WHERE id = v_user_id;

  RETURN v_encrypted_password IS NOT NULL AND v_encrypted_password <> '';
END;
$$;

-- Security Grants: Allow execution only for authenticated users and service_role. Explicitly revoke from anon and public.
REVOKE EXECUTE ON FUNCTION public.has_user_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_user_password() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
