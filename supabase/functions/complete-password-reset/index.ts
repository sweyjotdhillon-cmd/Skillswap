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
    const { email, recoveryToken, newPassword } = await req.json();

    if (!email || typeof email !== 'string' || !/\S+@\S+\.\S+/.test(email.trim())) {
      return new Response(
        JSON.stringify({ error: 'INVALID_EMAIL', message: 'Please provide a valid email address.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!recoveryToken || typeof recoveryToken !== 'string') {
      return new Response(
        JSON.stringify({ error: 'INVALID_TOKEN', message: 'Invalid or missing recovery authorization.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return new Response(
        JSON.stringify({ error: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters long.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const tokenHash = await hashString(recoveryToken.trim());

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'SERVER_ERROR', message: 'Database service configuration missing.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Find matching challenge by recovery_token_hash
    const { data: challenges, error: fetchErr } = await supabase
      .from('password_reset_challenges')
      .select('*')
      .eq('email', cleanEmail)
      .eq('recovery_token_hash', tokenHash)
      .is('used_at', null)
      .limit(1);

    if (fetchErr || !challenges || challenges.length === 0) {
      return new Response(
        JSON.stringify({ error: 'INVALID_TOKEN', message: 'Recovery authorization is invalid or has already been used.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const challenge = challenges[0];

    // Confirm recovery token is unexpired
    if (!challenge.token_expires_at || new Date(challenge.token_expires_at).getTime() < Date.now()) {
      return new Response(
        JSON.stringify({ error: 'TOKEN_EXPIRED', message: 'Recovery authorization has expired. Please verify code again.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Identify user ID
    let userId = challenge.user_id;

    if (!userId) {
      try {
        const { data: rpcUser } = await supabase.rpc('get_user_by_email', { p_email: cleanEmail });
        if (rpcUser && rpcUser.length > 0) {
          userId = rpcUser[0].id;
        }
      } catch (_) {
        let page = 1;
        const perPage = 100;
        while (!userId && page <= 5) {
          const { data: userData } = await supabase.auth.admin.listUsers({ page, perPage });
          const users = userData?.users || [];
          const found = users.find((u) => u.email?.toLowerCase() === cleanEmail);
          if (found) {
            userId = found.id;
          }
          if (users.length < perPage) break;
          page++;
        }
      }
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'USER_NOT_FOUND', message: 'User account not found.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Update password using server-side admin API
    const { error: updatePasswordErr } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
      email_confirm: true,
    });

    if (updatePasswordErr) {
      console.error('Error updating user password via Admin API:', updatePasswordErr);
      return new Response(
        JSON.stringify({ error: 'UPDATE_FAILED', message: updatePasswordErr.message || 'Failed to update password.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Mark challenge as consumed (used_at)
    await supabase
      .from('password_reset_challenges')
      .update({ used_at: new Date().toISOString() })
      .eq('id', challenge.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password updated successfully.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Unexpected error in complete-password-reset:', err);
    return new Response(
      JSON.stringify({ error: 'SERVER_ERROR', message: err.message || 'An unexpected error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
