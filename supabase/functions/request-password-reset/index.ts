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

function generateOTP(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = (100000 + (array[0] % 900000)).toString();
  return code;
}

serve(async (req) => {
  const { corsHeaders, errorResponse } = handleCors(req);
  if (errorResponse) {
    return errorResponse;
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string' || !/\S+@\S+\.\S+/.test(email.trim())) {
      return new Response(
        JSON.stringify({ error: 'INVALID_EMAIL', message: 'Please provide a valid email address.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'SERVER_ERROR', message: 'Database service configuration missing.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Server-side cleanup of expired challenges older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await supabase
      .from('password_reset_challenges')
      .delete()
      .lt('expires_at', oneHourAgo);

    // Fast lookup for user in auth.users via RPC or admin listUsers fallback
    let matchedUser: { id: string; email: string } | null = null;
    try {
      const { data: rpcUser } = await supabase.rpc('get_user_by_email', { p_email: cleanEmail });
      if (rpcUser && rpcUser.length > 0) {
        matchedUser = rpcUser[0];
      }
    } catch {
      // Fallback to admin.listUsers if RPC function is unavailable
      let page = 1;
      const perPage = 100;
      while (!matchedUser && page <= 5) {
        const { data: userData } = await supabase.auth.admin.listUsers({ page, perPage });
        const users = userData?.users || [];
        const found = users.find((u: { email?: string; id: string }) => u.email?.toLowerCase() === cleanEmail);
        if (found) {
          matchedUser = { id: found.id, email: found.email || cleanEmail };
          break;
        }
        if (users.length < perPage) break;
        page++;
      }
    }

    // If account exists, generate OTP and send via Brevo REST API
    if (matchedUser) {
      const otp = generateOTP();
      const otpHash = await hashString(otp);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

      // Call atomic RPC for rate-limiting, invalidating old challenges, and creating new challenge
      const { data: atomicRes, error: atomicErr } = await supabase.rpc('request_password_reset_challenge_atomic', {
        p_user_id: matchedUser.id,
        p_email: cleanEmail,
        p_otp_hash: otpHash,
        p_expires_at: expiresAt,
        p_max_attempts: 5,
      });

      if (atomicErr) {
        console.error('RPC request_password_reset_challenge_atomic error:', atomicErr);
        return new Response(
          JSON.stringify({ error: 'SERVER_ERROR', message: 'Failed to generate verification code.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!atomicRes?.success) {
        if (atomicRes?.error_code === 'RATE_LIMIT_EXCEEDED') {
          return new Response(
            JSON.stringify({
              error: 'RATE_LIMIT_EXCEEDED',
              message: atomicRes.message || 'Too many password reset requests for this email. Please wait 15 minutes before trying again.',
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ error: atomicRes?.error_code || 'SERVER_ERROR', message: atomicRes?.message || 'Failed to generate verification code.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Send email using Brevo REST API
      const brevoApiKey = Deno.env.get('BREVO_API_KEY');
      const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL') || Deno.env.get('SENDER_EMAIL') || 'noreply@brevo.com';

      if (!brevoApiKey) {
        console.error('BREVO_API_KEY secret is not configured in Edge Function.');
        return new Response(
          JSON.stringify({
            error: 'EMAIL_SEND_FAILED',
            message: 'Email service configuration is missing. Please contact support.',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': brevoApiKey,
          },
          body: JSON.stringify({
            sender: { name: 'SkillSwap', email: senderEmail },
            to: [{ email: cleanEmail }],
            subject: 'SkillSwap password reset code',
            htmlContent: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
                <h2 style="color: #d6a64a; margin-bottom: 16px; font-size: 22px;">SkillSwap Password Reset</h2>
                <p style="font-size: 15px; color: #334155; margin-bottom: 16px;">Your 6-digit verification code is:</p>
                <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #11161c; margin: 20px 0; padding: 14px 24px; background-color: #f7f5f0; display: inline-block; border-radius: 8px; border: 1px solid #d6a64a;">
                  ${otp}
                </div>
                <p style="font-size: 14px; color: #64748b; margin-top: 20px;">This code expires in 10 minutes.</p>
                <p style="font-size: 13px; color: #94a3b8; margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                  If you did not request a password reset, you can safely ignore this email.
                </p>
              </div>
            `,
          }),
        });

        if (!brevoRes.ok) {
          const errText = await brevoRes.text();
          console.error('Brevo API email delivery failed:', errText);
          return new Response(
            JSON.stringify({
              error: 'EMAIL_SEND_FAILED',
              message: 'Failed to deliver verification code via email provider.',
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (emailErr: unknown) {
        console.error('Exception during Brevo email send:', emailErr);
        return new Response(
          JSON.stringify({
            error: 'EMAIL_SEND_FAILED',
            message: 'An error occurred while attempting to send email.',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Return generic success message to prevent account enumeration
    return new Response(
      JSON.stringify({
        success: true,
        message: 'A 6-digit verification code has been sent to your email address if an account exists.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    console.error('Unexpected error in request-password-reset:', err);
    return new Response(
      JSON.stringify({ error: 'SERVER_ERROR', message: 'An unexpected error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
