import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
import { handleCors, createErrorResponse } from '../_shared/cors.ts';

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

Deno.serve(async (req: Request) => {
  const { corsHeaders, correlationId, errorResponse } = handleCors(req);
  if (errorResponse) {
    return errorResponse;
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string' || !/\S+@\S+\.\S+/.test(email.trim())) {
      return createErrorResponse('INVALID_EMAIL', 'Please provide a valid email address.', 400, corsHeaders, correlationId);
    }

    const cleanEmail = email.trim().toLowerCase();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !supabaseServiceKey) {
      return createErrorResponse('SERVER_ERROR', 'Database service configuration missing.', 500, corsHeaders, correlationId);
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
        console.error(`[${correlationId}] RPC request_password_reset_challenge_atomic error:`, atomicErr.message || 'Atomic challenge error');
        return createErrorResponse('SERVER_ERROR', 'Failed to generate verification code.', 500, corsHeaders, correlationId);
      }

      if (!atomicRes?.success) {
        if (atomicRes?.error_code === 'RATE_LIMIT_EXCEEDED') {
          return createErrorResponse(
            'RATE_LIMIT_EXCEEDED',
            atomicRes.message || 'Too many password reset requests for this email. Please wait 15 minutes before trying again.',
            429,
            corsHeaders,
            correlationId
          );
        }
        return createErrorResponse(
          atomicRes?.error_code || 'SERVER_ERROR',
          atomicRes?.message || 'Failed to generate verification code.',
          500,
          corsHeaders,
          correlationId
        );
      }

      // Send email using Brevo REST API
      const brevoApiKey = Deno.env.get('BREVO_API_KEY');
      const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL') || Deno.env.get('SENDER_EMAIL') || 'noreply@brevo.com';

      if (!brevoApiKey) {
        console.error(`[${correlationId}] BREVO_API_KEY secret is not configured in Edge Function.`);
        return createErrorResponse('EMAIL_SEND_FAILED', 'Email service configuration is missing. Please contact support.', 500, corsHeaders, correlationId);
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
          console.error(`[${correlationId}] Brevo API email delivery failed with status:`, brevoRes.status);
          return createErrorResponse('EMAIL_SEND_FAILED', 'Failed to deliver verification code via email provider.', 500, corsHeaders, correlationId);
        }
      } catch (emailErr: unknown) {
        console.error(`[${correlationId}] Exception during Brevo email send:`, emailErr instanceof Error ? emailErr.message : 'Network error');
        return createErrorResponse('EMAIL_SEND_FAILED', 'An error occurred while attempting to send email.', 500, corsHeaders, correlationId);
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
    console.error(`[${correlationId}] Unexpected error in request-password-reset:`, err instanceof Error ? err.message : 'Server error');
    return createErrorResponse('SERVER_ERROR', 'An unexpected error occurred.', 500, corsHeaders, correlationId);
  }
});
