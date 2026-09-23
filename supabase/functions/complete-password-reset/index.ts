import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
import { handleCors, createErrorResponse } from '../_shared/cors.ts';

async function hashString(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  const { corsHeaders, correlationId, errorResponse } = handleCors(req);
  if (errorResponse) {
    return errorResponse;
  }

  try {
    const { email, recoveryToken, newPassword } = await req.json();

    if (!email || typeof email !== 'string' || !/\S+@\S+\.\S+/.test(email.trim())) {
      return createErrorResponse('INVALID_EMAIL', 'Please provide a valid email address.', 400, corsHeaders, correlationId);
    }

    if (!recoveryToken || typeof recoveryToken !== 'string') {
      return createErrorResponse('INVALID_TOKEN', 'Invalid or missing recovery authorization.', 400, corsHeaders, correlationId);
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return createErrorResponse('WEAK_PASSWORD', 'Password must be at least 8 characters long.', 400, corsHeaders, correlationId);
    }

    const cleanEmail = email.trim().toLowerCase();
    const tokenHash = await hashString(recoveryToken.trim());

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !supabaseServiceKey) {
      return createErrorResponse('SERVER_ERROR', 'Database service configuration missing.', 500, corsHeaders, correlationId);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Atomically claim and consume the single-use recovery token in PostgreSQL
    const { data: claimRes, error: claimErr } = await supabase.rpc('claim_password_reset_recovery_token', {
      p_email: cleanEmail,
      p_token_hash: tokenHash,
    });

    if (claimErr) {
      console.error(`[${correlationId}] RPC claim_password_reset_recovery_token error:`, claimErr.message || 'Claim recovery token error');
      return createErrorResponse('SERVER_ERROR', 'Failed to authorize recovery token.', 500, corsHeaders, correlationId);
    }

    if (!claimRes.success) {
      return createErrorResponse(claimRes.error_code || 'INVALID_TOKEN', claimRes.message || 'Recovery authorization is invalid.', 400, corsHeaders, correlationId);
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
      return createErrorResponse('USER_NOT_FOUND', 'User account not found.', 404, corsHeaders, correlationId);
    }

    // Update password using server-side admin API
    const { error: updatePasswordErr } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
      email_confirm: true,
    });

    if (updatePasswordErr) {
      console.error(`[${correlationId}] Error updating user password via Admin API:`, updatePasswordErr.message || 'Admin update user error');
      return createErrorResponse('UPDATE_FAILED', updatePasswordErr.message || 'Failed to update password.', 500, corsHeaders, correlationId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password updated successfully.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    console.error(`[${correlationId}] Unexpected error in complete-password-reset:`, err instanceof Error ? err.message : 'Server error');
    return createErrorResponse('SERVER_ERROR', 'An unexpected error occurred.', 500, corsHeaders, correlationId);
  }
});
