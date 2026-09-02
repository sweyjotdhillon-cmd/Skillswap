-- 012_atomic_password_reset_security.sql
-- Concurrency-safe, atomic OTP verification and single-use recovery token consumption.

CREATE OR REPLACE FUNCTION public.verify_password_reset_otp_atomic(
  p_email text,
  p_supplied_otp_hash text,
  p_recovery_token_hash text,
  p_token_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_challenge public.password_reset_challenges%ROWTYPE;
  v_new_attempts int;
BEGIN
  -- Lock active unused challenge row for the specified email
  SELECT * INTO v_challenge
  FROM public.password_reset_challenges
  WHERE lower(email) = lower(p_email)
    AND used_at IS NULL
  ORDER BY created_at DESC
  FOR UPDATE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'EXPIRED_OTP',
      'message', 'Verification code has expired or is invalid. Please request a new code.'
    );
  END IF;

  -- Check expiration
  IF v_challenge.expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'EXPIRED_OTP',
      'message', 'That code has expired. Please request a new code.'
    );
  END IF;

  -- Check attempts limit
  IF v_challenge.attempt_count >= v_challenge.max_attempts THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TOO_MANY_ATTEMPTS',
      'message', 'Maximum attempts exceeded. Please request a new verification code.'
    );
  END IF;

  -- Prevent duplicate verification of an already-verified challenge
  IF v_challenge.recovery_token_hash IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'EXPIRED_OTP',
      'message', 'Verification code has already been used. Please request a new code.'
    );
  END IF;

  -- Compare OTP hash
  IF v_challenge.otp_hash <> p_supplied_otp_hash THEN
    v_new_attempts := v_challenge.attempt_count + 1;
    IF v_new_attempts >= v_challenge.max_attempts THEN
      UPDATE public.password_reset_challenges
      SET attempt_count = v_new_attempts,
          used_at = NOW()
      WHERE id = v_challenge.id;

      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'TOO_MANY_ATTEMPTS',
        'message', 'Maximum attempts exceeded. Please request a new verification code.'
      );
    ELSE
      UPDATE public.password_reset_challenges
      SET attempt_count = v_new_attempts
      WHERE id = v_challenge.id;

      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'INCORRECT_OTP',
        'message', 'That code is incorrect. Please try again.'
      );
    END IF;
  END IF;

  -- OTP matched: store recovery token hash atomically
  UPDATE public.password_reset_challenges
  SET recovery_token_hash = p_recovery_token_hash,
      token_expires_at = p_token_expires_at
  WHERE id = v_challenge.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'OTP verified successfully.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_password_reset_recovery_token(
  p_email text,
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_challenge public.password_reset_challenges%ROWTYPE;
BEGIN
  -- Lock matching unused challenge row with FOR UPDATE
  SELECT * INTO v_challenge
  FROM public.password_reset_challenges
  WHERE lower(email) = lower(p_email)
    AND recovery_token_hash = p_token_hash
    AND used_at IS NULL
  FOR UPDATE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_TOKEN',
      'message', 'Recovery authorization is invalid or has already been used.'
    );
  END IF;

  -- Confirm recovery token is unexpired
  IF v_challenge.token_expires_at IS NULL OR v_challenge.token_expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TOKEN_EXPIRED',
      'message', 'Recovery authorization has expired. Please verify code again.'
    );
  END IF;

  -- Atomically consume the challenge BEFORE password modification occurs
  UPDATE public.password_reset_challenges
  SET used_at = NOW()
  WHERE id = v_challenge.id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_challenge.user_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_password_reset_otp_atomic(text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_password_reset_otp_atomic(text, text, text, timestamptz) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_password_reset_recovery_token(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_password_reset_recovery_token(text, text) TO service_role;
