import { formatFriendlyErrorMessage } from './profile';
import { formatAcceptSwapErrorMessage, formatSubmissionErrorMessage } from './credits';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runErrorRecoveryUnitTests() {
  console.log('--- Starting Section L.3 Plain-Language Error Recovery Unit Tests ---');

  // =========================================================================
  // 1. Insufficient SkillCredits
  // =========================================================================
  console.log('Test 1: Insufficient SkillCredits error recovery formatting...');
  const msgCreditsWithBal = formatAcceptSwapErrorMessage('chk_min_balance', 50, 40);
  assert(
    msgCreditsWithBal === 'You tried to accept a swap requiring 50 SkillCredits, but you currently have 40 available. Complete a task to earn more credits, then try again.',
    'Insufficient credits with balance data explains what happened, why, and what to do next'
  );

  const msgCreditsGeneric = formatFriendlyErrorMessage('insufficient credit balance');
  assert(
    msgCreditsGeneric.includes('insufficient SkillCredits') && msgCreditsGeneric.includes('Complete a swap to earn more credits'),
    'Generic insufficient credits message provides actionable next step'
  );

  // =========================================================================
  // 2. Unauthorized Action / RLS Failure
  // =========================================================================
  console.log('Test 2: Unauthorized action & RLS failure recovery formatting...');
  const rlsError = { message: 'new row violates row-level security policy "swaps_insert_policy" (SQLSTATE 42501)' };
  const msgAuth = formatFriendlyErrorMessage(rlsError);
  assert(
    msgAuth === 'You don’t have permission to perform this action. Make sure you’re signed in with the correct account.',
    'Sanitizes RLS policy and SQLSTATE jargon into plain-language permission error'
  );
  assert(!msgAuth.includes('42501') && !msgAuth.includes('row-level security') && !msgAuth.includes('swaps_insert_policy'), 'No SQL/RLS jargon leaked');

  // =========================================================================
  // 3. Profile Requirement
  // =========================================================================
  console.log('Test 3: Incomplete profile requirement formatting...');
  const profileErr = { message: 'profile_completed check failed for active action' };
  const msgProfile = formatFriendlyErrorMessage(profileErr);
  assert(
    msgProfile === 'Your profile needs a few more details before you can continue. Complete the required profile steps and try again.',
    'Incomplete profile error explains problem and provides completion guidance'
  );

  // =========================================================================
  // 4. Transaction No Longer Available / Already Accepted
  // =========================================================================
  console.log('Test 4: Unavailable transaction recovery formatting...');
  const unavailableErr = formatAcceptSwapErrorMessage('swap is no longer available');
  assert(
    unavailableErr === 'This swap is no longer available. It may have already been accepted or completed.',
    'Unavailable swap error explains transaction state clearly'
  );

  // =========================================================================
  // 5. Cannot Accept Own Swap
  // =========================================================================
  console.log('Test 5: Own swap acceptance attempt formatting...');
  const ownSwapErr = formatAcceptSwapErrorMessage('cannot accept your own swap');
  assert(
    ownSwapErr === 'You cannot accept your own swap request. Browse other open swaps in the marketplace.',
    'Cannot accept own swap provides clear redirection step'
  );

  // =========================================================================
  // 6. Authentication / Session Expiry
  // =========================================================================
  console.log('Test 6: Session expiry recovery formatting...');
  const sessionErr = formatFriendlyErrorMessage('jwt expired');
  assert(
    sessionErr === 'Your session has expired. Please sign in again with your account to continue.',
    'Session expiry error instructs user to sign in again'
  );

  // =========================================================================
  // 7. Network / Connection Failure
  // =========================================================================
  console.log('Test 7: Network failure recovery formatting...');
  const networkErr = formatFriendlyErrorMessage('Failed to fetch');
  assert(
    networkErr === 'Unable to connect to the server right now. Please check your connection and try again.',
    'Network error instructs user to check connection'
  );

  // =========================================================================
  // 8. File Upload Failure (Submission)
  // =========================================================================
  console.log('Test 8: File upload failure recovery formatting...');
  const upload400Err = formatSubmissionErrorMessage({ status: 400 }, 'deliverable.png');
  assert(
    upload400Err === 'The file "deliverable.png" could not be accepted. Check that the file is valid and under 25MB, then try again.',
    'File upload error includes filename and file size guidance'
  );

  // =========================================================================
  // 9. Generic / Unknown Supabase & PostgreSQL Failure Fallback
  // =========================================================================
  console.log('Test 9: Generic database error fallback formatting...');
  const dbError = { message: 'PGRST116 JSON object requested, multiple rows returned (SQLSTATE 23505)' };
  const msgGeneric = formatFriendlyErrorMessage(dbError);
  assert(
    msgGeneric === 'We couldn’t complete that action right now. Please try again.',
    'Sanitizes raw PostgREST PGRST error and SQL code into polite fallback'
  );
  assert(!msgGeneric.includes('PGRST116') && !msgGeneric.includes('SQLSTATE') && !msgGeneric.includes('JSON'), 'No internal DB details leaked');

  console.log('✓ All Section L.3 Plain-Language Error Recovery unit tests passed perfectly!');
}

// Execute tests if run directly
if (import.meta.url.endsWith('error_recovery.test.ts') || process.argv[1]?.endsWith('error_recovery.test.ts')) {
  runErrorRecoveryUnitTests();
}
