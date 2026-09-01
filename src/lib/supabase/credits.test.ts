import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export async function runCreditSystemTests() {
  console.log('--- Starting SkillSwap Database Integration & Unit Test Suite ---');

  // 1. Initialize embedded PostgreSQL engine (PGlite)
  const db = new PGlite();

  // Create auth schema & auth.uid() function helper
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text,
      raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
      raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
      is_anonymous boolean DEFAULT false
    );
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
  `);

  // Helper to switch current auth user in DB
  const setAuthUser = async (userId: string | null) => {
    if (userId) {
      await db.exec(`SELECT set_config('request.jwt.claim.sub', '${userId}', false);`);
    } else {
      await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false);`);
    }
  };

  // Load and apply all repository migrations in order
  const migrationFiles = [
    '001_password_reset_challenges.sql',
    '002_profile_and_skills_schema.sql',
    '003_anonymous_onboarding_and_identity_linking.sql',
    '004_seed_skills_catalog.sql',
    '005_fix_username_identity_integrity.sql',
    '006_credit_system_infrastructure.sql',
    '007_credit_system_audit_fixes.sql',
    '008_credit_reservation_system.sql',
    '009_secure_swap_credit_lifecycle.sql',
    '010_credit_system_idempotency_and_reconciliation.sql',
  ];

  for (const file of migrationFiles) {
    const filePath = path.join(process.cwd(), 'supabase', 'migrations', file);
    const sql = fs.readFileSync(filePath, 'utf8');
    await db.exec(sql);
  }
  console.log('✓ Applied all 10 schema migrations cleanly into PostgreSQL engine.');

  // Setup test users in auth.users and public.profiles
  const userA = '10000000-0000-0000-0000-000000000001';
  const userB = '20000000-0000-0000-0000-000000000002';
  const userC = '30000000-0000-0000-0000-000000000003';

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${userA}', 'usera@example.com'),
      ('${userB}', 'userb@example.com'),
      ('${userC}', 'userc@example.com');

    UPDATE public.profiles SET full_name = 'User A', username = 'usera' WHERE id = '${userA}';
    UPDATE public.profiles SET full_name = 'User B', username = 'userb' WHERE id = '${userB}';
    UPDATE public.profiles SET full_name = 'User C', username = 'userc' WHERE id = '${userC}';
  `);

  // =========================================================================
  // TEST 1: Initial Grant & Initializer Idempotency
  // =========================================================================
  console.log('Test 1: Initial grant & initializer idempotency...');
  await setAuthUser(userA);
  await db.exec(`SELECT public.ensure_credit_account('${userA}'::uuid);`);

  type AccountRow = {
    credits_balance: number;
    credits_reserved: number;
    credits_earned: number;
    credits_spent: number;
  };

  let res = await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userA}';`);
  assert(res.rows[0].credits_balance === 100, 'Initial balance is 100');
  assert(res.rows[0].credits_reserved === 0, 'Initial reserved is 0');
  assert(res.rows[0].credits_earned === 100, 'Initial earned is 100');
  assert(res.rows[0].credits_spent === 0, 'Initial spent is 0');

  // Retry initializer
  await db.exec(`SELECT public.ensure_credit_account('${userA}'::uuid);`);
  res = await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userA}';`);
  assert(res.rows[0].credits_balance === 100, 'Retry initializer preserves 100 balance');
  assert(res.rows[0].credits_earned === 100, 'Retry initializer preserves 100 earned');
  console.log('  -> Initial grant exactly once verified.');

  // =========================================================================
  // TEST 2: Create Swap & Credit Reservation
  // =========================================================================
  console.log('Test 2: Create swap & credit reservation...');
  const swapKey1 = 'swap_create:op_test_1';
  let swapRes = await db.query<{ swap_id: string }>(`
    SELECT public.create_credit_swap(
      'React Consulting', 'Provide React code review', 'Need React expert',
      'anyone', 20, 'Looking forward', '${swapKey1}'
    ) AS swap_id;
  `);
  const swap1Id = swapRes.rows[0].swap_id;
  assert(Boolean(swap1Id), 'Swap 1 created successfully');

  res = await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userA}';`);
  assert(res.rows[0].credits_balance === 80, 'Available balance reduced to 80');
  assert(res.rows[0].credits_reserved === 20, 'Reserved credits increased to 20');
  console.log('  -> Swap reservation atomic balance state verified.');

  // =========================================================================
  // TEST 3: Create Swap Idempotency (Duplicate Request)
  // =========================================================================
  console.log('Test 3: Create swap idempotency on duplicate call...');
  swapRes = await db.query<{ swap_id: string }>(`
    SELECT public.create_credit_swap(
      'React Consulting', 'Provide React code review', 'Need React expert',
      'anyone', 20, 'Looking forward', '${swapKey1}'
    ) AS swap_id;
  `);
  const duplicateSwapId = swapRes.rows[0].swap_id;
  assert(duplicateSwapId === swap1Id, 'Duplicate create call returns identical swap ID');

  res = await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userA}';`);
  assert(res.rows[0].credits_balance === 80, 'Balance remains 80 after duplicate create call');
  assert(res.rows[0].credits_reserved === 20, 'Reserved remains 20 after duplicate create call');

  const swapsCount = await db.query<{ count: string | number }>(`SELECT COUNT(*) FROM public.swaps WHERE requester_id = '${userA}';`);
  assert(Number(swapsCount.rows[0].count) === 1, 'Only 1 swap record exists');

  const txCount = await db.query<{ count: string | number }>(`SELECT COUNT(*) FROM public.credit_transactions WHERE user_id = '${userA}' AND transaction_type = 'reservation';`);
  assert(Number(txCount.rows[0].count) === 1, 'Only 1 reservation transaction exists');
  console.log('  -> Create swap idempotency verified.');

  // =========================================================================
  // TEST 4: Insufficient Credits Protection
  // =========================================================================
  console.log('Test 4: Insufficient credit balance protection...');
  let errorCaught = false;
  try {
    await db.query(`
      SELECT public.create_credit_swap(
        'Huge Task', 'Needs 200 credits', 'Requirements',
        'anyone', 200, NULL, 'swap_create:op_excessive'
      );
    `);
  } catch (err: unknown) {
    errorCaught = true;
    assert((err as Error).message.includes('Insufficient credit balance'), 'Correct error message thrown');
  }
  assert(errorCaught, 'Insufficient balance error was caught');

  res = await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userA}';`);
  assert(res.rows[0].credits_balance === 80, 'Available balance remains 80 after failed swap');
  assert(res.rows[0].credits_reserved === 20, 'Reserved credits remain 20 after failed swap');
  console.log('  -> Insufficient balance protection verified.');

  // =========================================================================
  // TEST 5: Swap Cancellation & Reservation Release
  // =========================================================================
  console.log('Test 5: Swap cancellation & reservation release...');
  await db.query(`SELECT public.cancel_credit_swap('${swap1Id}'::uuid);`);

  res = await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userA}';`);
  assert(res.rows[0].credits_balance === 100, 'Available balance restored to 100 upon cancellation');
  assert(res.rows[0].credits_reserved === 0, 'Reserved credits cleared to 0 upon cancellation');

  const swapStatus = await db.query<{ status: string }>(`SELECT status FROM public.swaps WHERE id = '${swap1Id}';`);
  assert(swapStatus.rows[0].status === 'cancelled', 'Swap status updated to cancelled');
  console.log('  -> Cancellation and release verified.');

  // =========================================================================
  // TEST 6: Duplicate Cancellation Idempotency
  // =========================================================================
  console.log('Test 6: Duplicate cancellation idempotency...');
  const cancelRes = await db.query<{ result: { idempotent_retry?: boolean } }>(`SELECT public.cancel_credit_swap('${swap1Id}'::uuid) AS result;`);
  assert(cancelRes.rows[0].result.idempotent_retry === true, 'Duplicate cancellation returns idempotent_retry flag');

  res = await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userA}';`);
  assert(res.rows[0].credits_balance === 100, 'Balance remains 100 (no extra refund)');
  assert(res.rows[0].credits_reserved === 0, 'Reserved remains 0');
  console.log('  -> Duplicate cancellation idempotency verified.');

  // =========================================================================
  // TEST 7: Swap Acceptance, Submission, and Settlement
  // =========================================================================
  console.log('Test 7: Complete swap lifecycle and atomic settlement...');
  // User A creates Swap 2 (20 credits)
  swapRes = await db.query<{ swap_id: string }>(`
    SELECT public.create_credit_swap(
      'TypeScript Mentoring', 'Provide TS guidance', 'Beginner friendly',
      'anyone', 20, NULL, 'swap_create:op_test_2'
    ) AS swap_id;
  `);
  const swap2Id = swapRes.rows[0].swap_id;

  // Initialize User B
  await setAuthUser(userB);
  await db.exec(`SELECT public.ensure_credit_account('${userB}'::uuid);`);

  // User B accepts & submits Swap 2
  await db.query(`SELECT public.accept_credit_swap('${swap2Id}'::uuid);`);
  await db.query(`SELECT public.submit_credit_swap('${swap2Id}'::uuid);`);

  // User A completes Swap 2
  await setAuthUser(userA);
  await db.query(`SELECT public.complete_credit_swap('${swap2Id}'::uuid);`);

  // Check User A (Payer) Account
  res = await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userA}';`);
  assert(res.rows[0].credits_balance === 80, 'Payer balance remains 80');
  assert(res.rows[0].credits_reserved === 0, 'Payer reserved credits cleared');
  assert(res.rows[0].credits_spent === 20, 'Payer credits_spent updated to 20');

  // Check User B (Recipient) Account
  res = await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userB}';`);
  assert(res.rows[0].credits_balance === 120, 'Recipient balance increased by 20 to 120');
  assert(res.rows[0].credits_earned === 120, 'Recipient earned credits increased by 20 to 120');
  console.log('  -> Complete settlement lifecycle verified.');

  // =========================================================================
  // TEST 8: Duplicate Settlement Idempotency
  // =========================================================================
  console.log('Test 8: Duplicate settlement idempotency...');
  const completeRes = await db.query<{ result: { idempotent_retry?: boolean } }>(`SELECT public.complete_credit_swap('${swap2Id}'::uuid) AS result;`);
  assert(completeRes.rows[0].result.idempotent_retry === true, 'Duplicate completion returns idempotent_retry');

  res = await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userB}';`);
  assert(res.rows[0].credits_balance === 120, 'Recipient balance remains 120 (no double payout)');
  assert(res.rows[0].credits_earned === 120, 'Recipient earned remains 120');
  console.log('  -> Duplicate settlement idempotency verified.');

  // =========================================================================
  // TEST 9: Unauthorized Actions Security Check
  // =========================================================================
  console.log('Test 9: Unauthorized action security enforcement...');
  await setAuthUser(userC);
  await db.exec(`SELECT public.ensure_credit_account('${userC}'::uuid);`);

  // User C tries to complete User A's swap
  errorCaught = false;
  try {
    await db.query(`SELECT public.complete_credit_swap('${swap2Id}'::uuid);`);
  } catch (err: unknown) {
    errorCaught = true;
    assert((err as Error).message.includes('not eligible for completion'), 'Throws not eligible error for unauthorized user');
  }
  assert(errorCaught, 'Unauthorized completion attempt blocked');

  // User C tries to cancel User A/B's swap
  errorCaught = false;
  try {
    await db.query(`SELECT public.cancel_credit_swap('${swap2Id}'::uuid);`);
  } catch (err: unknown) {
    errorCaught = true;
    assert((err as Error).message.includes('cannot be cancelled'), 'Throws cannot be cancelled error for unauthorized user');
  }
  assert(errorCaught, 'Unauthorized cancellation attempt blocked');
  console.log('  -> Security rules against unauthorized mutations verified.');

  // =========================================================================
  // TEST 10: Concurrency & Race Condition Safety
  // =========================================================================
  console.log('Test 10: Concurrency & account boundary checks...');
  await setAuthUser(userC); // User C has 100 credits

  // Attempt to create 6 parallel swaps of 20 credits each (total 120 required)
  const concurrentCreationProms = [1, 2, 3, 4, 5, 6].map((i) =>
    db.query(`
      SELECT public.create_credit_swap(
        'Concurrent Swap ${i}', 'Description', 'Reqs',
        'anyone', 20, NULL, 'swap_create:concurrent_${i}'
      );
    `)
  );

  const results = await Promise.allSettled(concurrentCreationProms);
  const fulfilledCount = results.filter((r) => r.status === 'fulfilled').length;
  const rejectedCount = results.filter((r) => r.status === 'rejected').length;

  assert(fulfilledCount === 5, 'Exactly 5 swaps succeeded (5 * 20 = 100 credits)');
  assert(rejectedCount === 1, 'Exactly 1 swap rejected due to insufficient credits');

  res = await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userC}';`);
  assert(res.rows[0].credits_balance === 0, 'Available balance is exactly 0');
  assert(res.rows[0].credits_reserved === 100, 'Reserved credits is exactly 100');
  console.log('  -> Concurrency safety & non-negative balance boundary verified.');

  // =========================================================================
  // TEST 11: Account Reconciliation Diagnostic Check
  // =========================================================================
  console.log('Test 11: Comprehensive account reconciliation check...');
  type ReconRow = {
    recon: {
      total_accounts: number;
      matching_accounts: number;
      discrepancies_count: number;
    };
  };
  const reconRes = await db.query<ReconRow>(`SELECT public.reconcile_credit_balances() AS recon;`);
  const recon = reconRes.rows[0].recon;

  assert(recon.total_accounts === 3, 'Reconciled 3 test accounts');
  assert(recon.matching_accounts === 3, 'All 3 accounts match accounting model exactly');
  assert(recon.discrepancies_count === 0, 'Zero accounting discrepancies detected');
  console.log('  -> Account reconciliation check passed cleanly!');

  console.log('--- ALL SKILLSWAP CREDIT INTEGRATION & SECURITY TESTS PASSED PERFECTLY! ---');
}

// Execute tests if executed directly
if (import.meta.url.endsWith('credits.test.ts') || process.argv[1]?.endsWith('credits.test.ts')) {
  runCreditSystemTests().catch((err) => {
    console.error('Integration test failure:', err);
    process.exit(1);
  });
}
