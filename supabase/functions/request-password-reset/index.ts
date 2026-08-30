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

function generateOTP(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = (100000 + (array[0] % 900000)).toString();
  return code;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Find user in auth.users (paginated search)
    let matchedUser = null;
    let page = 1;
    const perPage = 100;
    while (!matchedUser) {
      const { data: userData, error: userError } = await supabase.auth.admin.listUsers({
        page,
        perPage,
      });

      if (userError) {
        console.error('Error listing users:', userError);
        return new Response(
          JSON.stringify({ error: 'SERVER_ERROR', message: 'Failed to process request.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const users = userData?.users || [];
      matchedUser = users.find((u) => u.email?.toLowerCase() === cleanEmail) || null;

      if (users.length < perPage) {
        break;
      }
      page++;
    }

    if (matchedUser) {
      const providers = matchedUser.app_metadata?.providers || [matchedUser.app_metadata?.provider];
      const hasEmailProvider =
        providers.includes('email') ||
        matchedUser.identities?.some((id: any) => id.provider === 'email');
      const hasGoogleProvider =
        providers.includes('google') ||
        matchedUser.identities?.some((id: any) => id.provider === 'google');

      if (hasGoogleProvider && !hasEmailProvider) {
        return new Response(
          JSON.stringify({
            error: 'GOOGLE_ACCOUNT',
            message: 'This account was created with Google. Please continue with Google Sign-In.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Generate 6-digit OTP using cryptographically secure random generator
    const otp = generateOTP();
    const otpHash = await hashString(otp);

    // Invalidate previous active OTP challenges for this email
    await supabase
      .from('password_reset_challenges')
      .update({ used_at: new Date().toISOString() })
      .eq('email', cleanEmail)
      .is('used_at', null);

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Store hash of OTP in password_reset_challenges table
    const { error: insertError } = await supabase.from('password_reset_challenges').insert({
      user_id: matchedUser ? matchedUser.id : null,
      email: cleanEmail,
      otp_hash: otpHash,
      expires_at: expiresAt,
      attempt_count: 0,
      max_attempts: 5,
    });

    if (insertError) {
      console.error('Error inserting OTP challenge:', insertError);
      return new Response(
        JSON.stringify({ error: 'SERVER_ERROR', message: 'Failed to generate verification code.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send email using Resend transactional email provider
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey) {
      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: 'SkillSwap <noreply@skillswap.app>',
            to: [cleanEmail],
            subject: 'SkillSwap password reset code',
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
                <h2 style="color: #4f46e5; margin-bottom: 16px; font-size: 22px;">SkillSwap Password Reset</h2>
                <p style="font-size: 15px; color: #334155; margin-bottom: 16px;">Your 6-digit verification code is:</p>
                <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #4f46e5; margin: 20px 0; padding: 14px 24px; background-color: #f1f5f9; display: inline-block; border-radius: 8px;">
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

        if (!resendRes.ok) {
          const errBody = await resendRes.text();
          console.error('Resend email error:', errBody);
        }
      } catch (emailErr) {
        console.error('Error sending email:', emailErr);
      }
    } else {
      console.warn('RESEND_API_KEY is not configured in Edge Function environment secrets.');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'A 6-digit verification code has been sent to your email.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Unexpected error in request-password-reset:', err);
    return new Response(
      JSON.stringify({ error: 'SERVER_ERROR', message: err.message || 'An unexpected error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
