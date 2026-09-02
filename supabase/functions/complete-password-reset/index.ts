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

    // Atomically claim and consume the single-use recovery token in PostgreSQL
    const { data: claimRes, error: claimErr } = await supabase.rpc('claim_password_reset_recovery_token', {
      p_email: cleanEmail,
      p_token_hash: tokenHash,
    });

    if (claimErr) {
      console.error('RPC claim_password_reset_recovery_token error:', claimErr);
      return new Response(
        JSON.stringify({ error: 'SERVER_ERROR', message: 'Failed to authorize recovery token.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!claimRes.success) {
      return new Response(
        JSON.stringify({ error: claimRes.error_code || 'INVALID_TOKEN', message: claimRes.message || 'Recovery authorization is invalid.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let userId = claimRes.user_id;

    if (!userId) {
      try {
        const { data: rpcUser } = await supabase.rpc('get_user_by_email', { p_email: cleanEmail });
        if (rpcUser && rpcUser.length > 0) {
          userId = rpcUser[0].id;
        }
      } catch {
        let page = 1;
        const perPage = 100;
        while (!userId && page <= 5) {
          const { data: userData } = await supabase.auth.admin.listUsers({ page, perPage });
          const users = userData?.users || [];
          const found = users.find((u: { email?: string; id: string }) => u.email?.toLowerCase() === cleanEmail);
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

    // Update password using server-side admin API
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

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password updated successfully.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    console.error('Unexpected error in complete-password-reset:', err);
    return new Response(
      JSON.stringify({ error: 'SERVER_ERROR', message: 'An unexpected error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
