import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { handleCors } from '../_shared/cors.ts';

async function hashString(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  const { corsHeaders, errorResponse } = handleCors(req);
  if (errorResponse) {
    return errorResponse;
  }

  try {
    const { email, otp } = await req.json();

    if (!email || typeof email !== 'string' || !/\S+@\S+\.\S+/.test(email.trim())) {
      return new Response(
        JSON.stringify({ error: 'INVALID_EMAIL', message: 'Please provide a valid email address.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
      return new Response(
        JSON.stringify({ error: 'INVALID_OTP', message: 'Verification code must be 6 digits.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'SERVER_ERROR', message: 'Database service configuration missing.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const suppliedOtpHash = await hashString(cleanOtp);
    const recoveryToken = crypto.randomUUID();
    const recoveryTokenHash = await hashString(recoveryToken);
    const tokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data: rpcRes, error: rpcErr } = await supabase.rpc('verify_password_reset_otp_atomic', {
      p_email: cleanEmail,
      p_supplied_otp_hash: suppliedOtpHash,
      p_recovery_token_hash: recoveryTokenHash,
      p_token_expires_at: tokenExpiresAt,
    });

    if (rpcErr) {
      console.error('RPC verify_password_reset_otp_atomic error:', rpcErr);
      return new Response(
        JSON.stringify({ error: 'SERVER_ERROR', message: 'Failed to complete verification step.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!rpcRes.success) {
      return new Response(
        JSON.stringify({ error: rpcRes.error_code || 'INVALID_OTP', message: rpcRes.message || 'Verification failed.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        recoveryToken,
        message: 'OTP verified successfully.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    console.error('Unexpected error in verify-password-reset-otp:', err);
    return new Response(
      JSON.stringify({ error: 'SERVER_ERROR', message: 'An unexpected error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
