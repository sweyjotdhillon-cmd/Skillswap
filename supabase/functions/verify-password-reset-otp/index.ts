import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function hashString(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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
        JSON.stringify({ error: 'INVALID_OTP', message: 'That code is incorrect. Please try again.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Find active unexpired, unused challenge
    const { data: challenges, error: fetchErr } = await supabase
      .from('password_reset_challenges')
      .select('*')
      .eq('email', cleanEmail)
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchErr || !challenges || challenges.length === 0) {
      return new Response(
        JSON.stringify({ error: 'EXPIRED_OTP', message: 'That code has expired. Please request a new code.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const challenge = challenges[0];

    // Check expiration
    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      return new Response(
        JSON.stringify({ error: 'EXPIRED_OTP', message: 'That code has expired. Please request a new code.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check attempts limit
    if (challenge.attempt_count >= challenge.max_attempts) {
      return new Response(
        JSON.stringify({ error: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts. Please request a new code.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Hash supplied OTP and compare securely
    const suppliedOtpHash = await hashString(cleanOtp);

    if (suppliedOtpHash !== challenge.otp_hash) {
      const newAttemptCount = challenge.attempt_count + 1;
      const isMaxedOut = newAttemptCount >= challenge.max_attempts;

      await supabase
        .from('password_reset_challenges')
        .update({
          attempt_count: newAttemptCount,
          used_at: isMaxedOut ? new Date().toISOString() : null,
        })
        .eq('id', challenge.id);

      if (isMaxedOut) {
        return new Response(
          JSON.stringify({ error: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts. Please request a new code.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'INCORRECT_OTP', message: 'That code is incorrect. Please try again.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate secure short-lived recovery authorization token
    const recoveryToken = crypto.randomUUID();
    const recoveryTokenHash = await hashString(recoveryToken);
    const tokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Store token hash in database challenge
    const { error: updateErr } = await supabase
      .from('password_reset_challenges')
      .update({
        recovery_token_hash: recoveryTokenHash,
        token_expires_at: tokenExpiresAt,
      })
      .eq('id', challenge.id);

    if (updateErr) {
      console.error('Error updating challenge recovery token:', updateErr);
      return new Response(
        JSON.stringify({ error: 'SERVER_ERROR', message: 'Failed to verify verification code.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
  } catch (err: any) {
    console.error('Unexpected error in verify-password-reset-otp:', err);
    return new Response(
      JSON.stringify({ error: 'SERVER_ERROR', message: err.message || 'An unexpected error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
