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

  // Create auth and storage schemas & auth.uid() function helper
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

    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE IF NOT EXISTS storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL,
      owner uuid REFERENCES auth.users,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      public boolean DEFAULT false,
      avif_autodetection boolean DEFAULT false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    CREATE TABLE IF NOT EXISTS storage.objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket_id text REFERENCES storage.buckets(id),
      name text,
      owner uuid REFERENCES auth.users,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      last_accessed_at timestamptz DEFAULT now(),
      metadata jsonb,
      path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED
    );
    CREATE OR REPLACE FUNCTION storage.foldername(name text)
    RETURNS text[]
    LANGUAGE sql
    IMMUTABLE
    AS $$
      SELECT string_to_array(name, '/');
    $$;
  `);

  // Helper to switch current auth user in DB
  const setAuthUser = async (userId: string | null) => {
    if (userId) {
      await db.exec(`
        SELECT set_config('request.jwt.claim.sub', '${userId}', false);
        SET ROLE authenticated;
      `);
    } else {
      await db.exec(`
        SELECT set_config('request.jwt.claim.sub', '', false);
        SET ROLE anon;
      `);
    }
  };

  const setSuperuser = async () => {
    await db.exec(`
      RESET ROLE;
      SELECT set_config('request.jwt.claim.sub', '', false);
    `);
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
    '011_has_user_password_rpc.sql',
    '012_atomic_password_reset_security.sql',
    '013_chat_and_submissions.sql',
    '014_chat_and_submission_security_hardening.sql',
    '015_swap_expiry_and_submission_review_timeout.sql',
    '016_chat_rls_and_submission_fixes.sql',
  ];

  for (const file of migrationFiles) {
    const filePath = path.join(process.cwd(), 'supabase', 'migrations', file);
    const sql = fs.readFileSync(filePath, 'utf8');
    await db.exec(sql);
  }
  console.log(`✓ Applied all ${migrationFiles.length} schema migrations cleanly into PostgreSQL engine.`);

  // Setup test users in auth.users and public.profiles
  const userA = '10000000-0000-0000-0000-000000000001';
  const userB = '20000000-0000-0000-0000-000000000002';
  const userC = '30000000-0000-0000-0000-000000000003';

  await setSuperuser();
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
  await db.exec(`SELECT public.get_user_account();`);

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
  await db.exec(`SELECT public.get_user_account();`);
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
  console.log('Test 7: Complete swap lifecycle, atomic submission & settlement...');
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
  await db.exec(`SELECT public.get_user_account();`);

  // User B accepts Swap 2
  await db.query(`SELECT public.accept_credit_swap('${swap2Id}'::uuid);`);

  // User A (requester) attempts to submit work on Swap 2 -> Must be rejected!
  await setAuthUser(userA);
  errorCaught = false;
  try {
    await db.query(`
      SELECT public.submit_swap_work(
        '${swap2Id}'::uuid,
        'Requester trying to submit work',
        '[]'::jsonb
      );
    `);
  } catch (err: unknown) {
    errorCaught = true;
    assert((err as Error).message.includes('Only the designated participant can submit work'), 'Requester cannot submit work');
  }
  assert(errorCaught, 'Requester submission attempt rejected');

  // User C (unrelated) attempts to submit work on Swap 2 -> Must be rejected!
  await setAuthUser(userC);
  errorCaught = false;
  try {
    await db.query(`
      SELECT public.submit_swap_work(
        '${swap2Id}'::uuid,
        'Unrelated user trying to submit work',
        '[]'::jsonb
      );
    `);
  } catch (err: unknown) {
    errorCaught = true;
    assert((err as Error).message.includes('Only the designated participant can submit work'), 'Unrelated user cannot submit work');
  }
  assert(errorCaught, 'Unrelated user submission attempt rejected');

  // User A attempts to complete Swap 2 BEFORE submission -> Must be rejected!
  await setAuthUser(userA);
  errorCaught = false;
  try {
    await db.query(`SELECT public.complete_credit_swap('${swap2Id}'::uuid);`);
  } catch (err: unknown) {
    errorCaught = true;
    assert((err as Error).message.includes('not eligible for completion'), 'Cannot complete swap in accepted state');
  }
  assert(errorCaught, 'Premature completion before submission rejected');

  // User B submits work atomically with notes and file metadata
  await setAuthUser(userB);
  const submitRes = await db.query<{ submit_swap_work: { success: boolean; submission_id: string } }>(`
    SELECT public.submit_swap_work(
      '${swap2Id}'::uuid,
      'Finished TS mentoring session and code sample repo.',
      '[{"storage_path": "${swap2Id}/${userB}/code.zip", "file_name": "code.zip", "mime_type": "application/zip", "file_size": 10240}]'::jsonb
    );
  `);
  assert(submitRes.rows[0].submit_swap_work.success === true, 'Atomic submission succeeded');

  const subRecord = await db.query<{ notes: string }>(`SELECT notes FROM public.swap_submissions WHERE swap_id = '${swap2Id}';`);
  assert(subRecord.rows[0].notes.includes('Finished TS mentoring'), 'Submission notes persisted');

  const fileRecord = await db.query<{ file_name: string }>(`SELECT file_name FROM public.swap_submission_files WHERE submission_id = '${submitRes.rows[0].submit_swap_work.submission_id}';`);
  assert(fileRecord.rows[0].file_name === 'code.zip', 'File metadata persisted');

  // Attempt duplicate submission on same swap -> Must be rejected!
  errorCaught = false;
  try {
    await db.query(`
      SELECT public.submit_swap_work(
        '${swap2Id}'::uuid,
        'Duplicate submission attempt',
        '[]'::jsonb
      );
    `);
  } catch (err: unknown) {
    errorCaught = true;
    assert((err as Error).message.includes('not eligible for submission'), 'Duplicate submission attempt rejected');
  }
  assert(errorCaught, 'Duplicate submission on submitted swap rejected');

  // User A completes Swap 2 now that submission exists
  await setAuthUser(userA);
  await db.query(`SELECT public.complete_credit_swap('${swap2Id}'::uuid);`);

  // Check User A (Payer) Account
  res = await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userA}';`);
  assert(res.rows[0].credits_balance === 80, 'Payer balance remains 80');
  assert(res.rows[0].credits_reserved === 0, 'Payer reserved credits cleared');
  assert(res.rows[0].credits_spent === 20, 'Payer credits_spent updated to 20');

  // Check User B (Recipient) Account
  await setAuthUser(userB);
  res = await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userB}';`);
  assert(res.rows[0].credits_balance === 120, 'Recipient balance increased by 20 to 120');
  assert(res.rows[0].credits_earned === 120, 'Recipient earned credits increased by 20 to 120');
  console.log('  -> Complete submission and settlement lifecycle verified.');

  // =========================================================================
  // TEST 8: Duplicate Settlement Idempotency
  // =========================================================================
  console.log('Test 8: Duplicate settlement idempotency...');
  await setAuthUser(userA);
  const completeRes = await db.query<{ result: { idempotent_retry?: boolean } }>(`SELECT public.complete_credit_swap('${swap2Id}'::uuid) AS result;`);
  assert(completeRes.rows[0].result.idempotent_retry === true, 'Duplicate completion returns idempotent_retry');

  await setAuthUser(userB);
  res = await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userB}';`);
  assert(res.rows[0].credits_balance === 120, 'Recipient balance remains 120 (no double payout)');
  assert(res.rows[0].credits_earned === 120, 'Recipient earned remains 120');
  console.log('  -> Duplicate settlement idempotency verified.');

  // =========================================================================
  // TEST 9: Real P2P Messaging Persistence & Security
  // =========================================================================
  console.log('Test 9: Real P2P Messaging Persistence & Security...');
  await setAuthUser(userA);
  await db.query(`
    INSERT INTO public.swap_messages (swap_id, sender_id, recipient_id, body)
    VALUES ('${swap2Id}'::uuid, '${userA}'::uuid, '${userB}'::uuid, 'Hello User B, looking forward to working with you!');
  `);

  await setAuthUser(userB);
  const msgRes = await db.query<{ body: string }>(`SELECT body FROM public.swap_messages WHERE swap_id = '${swap2Id}';`);
  assert(msgRes.rows[0].body.includes('Hello User B'), 'User B successfully reads persisted message from User A');

  // User C (unrelated) attempts to read messages from Swap 2
  await setAuthUser(userC);
  const msgResC = await db.query(`SELECT body FROM public.swap_messages WHERE swap_id = '${swap2Id}';`);
  assert(msgResC.rows.length === 0, 'Unrelated User C receives 0 messages due to RLS');
  console.log('  -> P2P Chat persistence and RLS isolation verified.');

  // =========================================================================
  // TEST 10: Account Reconciliation Diagnostic Check
  // =========================================================================
  console.log('Test 10: Comprehensive account reconciliation check...');
  await setSuperuser();
  type ReconRow = {
    recon: {
      total_accounts: number;
      matching_accounts: number;
      discrepancies_count: number;
    };
  };
  let reconRes = await db.query<ReconRow>(`SELECT public.reconcile_credit_balances() AS recon;`);
  let recon = reconRes.rows[0].recon;

  assert(recon.total_accounts === 3, 'Reconciled 3 test accounts');
  assert(recon.matching_accounts === 3, 'All 3 accounts match accounting model exactly');
  assert(recon.discrepancies_count === 0, 'Zero accounting discrepancies detected');
  console.log('  -> Account reconciliation check passed cleanly!');

  // =========================================================================
  // TEST 11: Concurrency & Race-Condition Safety Verification
  // =========================================================================
  console.log('Test 11: Concurrency & race-condition safety verification...');
  await setAuthUser(userA);

  // 11a: Concurrent swap creation with identical idempotency key
  const concKey1 = 'swap_create:op_concurrency_1';
  const [cRes1, cRes2] = await Promise.all([
    db.query<{ swap_id: string }>(`
      SELECT public.create_credit_swap(
        'Concurrent Topic 1', 'Desc', 'Reqs', 'anyone', 15, NULL, '${concKey1}'
      ) AS swap_id;
    `),
    db.query<{ swap_id: string }>(`
      SELECT public.create_credit_swap(
        'Concurrent Topic 1', 'Desc', 'Reqs', 'anyone', 15, NULL, '${concKey1}'
      ) AS swap_id;
    `),
  ]);

  assert(Boolean(cRes1.rows[0].swap_id), 'First concurrent swap creation succeeded');
  assert(cRes1.rows[0].swap_id === cRes2.rows[0].swap_id, 'Both concurrent calls returned the identical swap_id');

  res = await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userA}';`);
  // Available balance was 80; reserving 15 once leaves 65
  assert(res.rows[0].credits_balance === 65, 'Account balance deducted exactly once (65 available)');
  assert(res.rows[0].credits_reserved === 15, 'Reserved credits increased exactly once (15 reserved)');

  // 11b: Concurrent reservation attempts exceeding available balance
  // User A currently has 65 available. Attempting two simultaneous creations of 50 credits each.
  const concResults = await Promise.allSettled([
    db.query<{ swap_id: string }>(`
      SELECT public.create_credit_swap('Concurrent A', 'Desc', 'Reqs', 'anyone', 50, NULL, 'swap_create:op_conc_a') AS swap_id;
    `),
    db.query<{ swap_id: string }>(`
      SELECT public.create_credit_swap('Concurrent B', 'Desc', 'Reqs', 'anyone', 50, NULL, 'swap_create:op_conc_b') AS swap_id;
    `),
  ]);

  const fulfilled = concResults.filter((r) => r.status === 'fulfilled');
  const rejected = concResults.filter((r) => r.status === 'rejected');
  assert(fulfilled.length === 1, 'Exactly one concurrent reservation request succeeded');
  assert(rejected.length === 1, 'Exactly one concurrent reservation request was rejected');

  res = await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userA}';`);
  assert(res.rows[0].credits_balance === 15, 'Balance non-negative and reduced by exactly 50 to 15');
  assert(res.rows[0].credits_reserved === 65, 'Reserved credits increased by 50 to 65');

  // 11c: Concurrent settlement attempts against the same swap
  // Create Swap 3 (10 credits), User B accepts and submits, User A completes concurrently
  swapRes = await db.query<{ swap_id: string }>(`
    SELECT public.create_credit_swap(
      'Concurrent Settlement Swap', 'Desc', 'Reqs', 'anyone', 10, NULL, 'swap_create:op_conc_settle'
    ) AS swap_id;
  `);
  const swap3Id = swapRes.rows[0].swap_id;

  await setAuthUser(userB);
  await db.query(`SELECT public.accept_credit_swap('${swap3Id}'::uuid);`);
  await db.query(`
    SELECT public.submit_swap_work(
      '${swap3Id}'::uuid,
      'Concurrent work submission',
      '[]'::jsonb
    );
  `);

  await setSuperuser();
  const userBBalBefore = (await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userB}';`)).rows[0].credits_balance;

  await setAuthUser(userA);
  const settleResults = await Promise.all([
    db.query<{ result: { success?: boolean; idempotent_retry?: boolean } }>(`
      SELECT public.complete_credit_swap('${swap3Id}'::uuid) AS result;
    `),
    db.query<{ result: { success?: boolean; idempotent_retry?: boolean } }>(`
      SELECT public.complete_credit_swap('${swap3Id}'::uuid) AS result;
    `),
  ]);

  const primarySettle = settleResults.find((s) => s.rows[0].result.idempotent_retry !== true);
  const duplicateSettle = settleResults.find((s) => s.rows[0].result.idempotent_retry === true);

  assert(Boolean(primarySettle), 'One settlement call executed the primary transfer');
  assert(Boolean(duplicateSettle), 'The concurrent settlement call returned an idempotent retry');

  await setSuperuser();
  const userBBalAfter = (await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userB}';`)).rows[0].credits_balance;
  assert(userBBalAfter === userBBalBefore + 10, 'Recipient awarded credits exactly once (no double payout)');

  // 11d: Concurrent cancellation/release attempts against the same swap
  // Create Swap 4 (5 credits) and cancel concurrently
  await setAuthUser(userA);
  swapRes = await db.query<{ swap_id: string }>(`
    SELECT public.create_credit_swap(
      'Concurrent Cancel Swap', 'Desc', 'Reqs', 'anyone', 5, NULL, 'swap_create:op_conc_cancel'
    ) AS swap_id;
  `);
  const swap4Id = swapRes.rows[0].swap_id;

  const userABalBeforeCancel = (await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userA}';`)).rows[0].credits_balance;

  const cancelResults = await Promise.all([
    db.query<{ result: { success?: boolean; idempotent_retry?: boolean } }>(`
      SELECT public.cancel_credit_swap('${swap4Id}'::uuid) AS result;
    `),
    db.query<{ result: { success?: boolean; idempotent_retry?: boolean } }>(`
      SELECT public.cancel_credit_swap('${swap4Id}'::uuid) AS result;
    `),
  ]);

  const primaryCancel = cancelResults.find((c) => c.rows[0].result.idempotent_retry !== true);
  const duplicateCancel = cancelResults.find((c) => c.rows[0].result.idempotent_retry === true);

  assert(Boolean(primaryCancel), 'One cancellation call executed the primary release');
  assert(Boolean(duplicateCancel), 'The concurrent cancellation call returned an idempotent retry');

  const userABalAfterCancel = (await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userA}';`)).rows[0].credits_balance;
  assert(userABalAfterCancel === userABalBeforeCancel + 5, 'Reserved credits refunded exactly once (no double refund)');

  // Final reconciliation check after concurrency tests
  await setSuperuser();
  reconRes = await db.query<ReconRow>(`SELECT public.reconcile_credit_balances() AS recon;`);
  recon = reconRes.rows[0].recon;
  assert(recon.discrepancies_count === 0, 'Zero accounting discrepancies detected after concurrency tests');
  console.log('  -> Concurrency & race-condition safety verified cleanly!');

  // =========================================================================
  // TEST 12: Swap Expiry & Submission Review Timeout Verification
  // =========================================================================
  console.log('Test 12: Swap expiry & submission review timeout verification...');

  // 12.0: Permissions Audit — Authenticated users MUST NOT be able to invoke maintenance RPCs!
  await setAuthUser(userA);
  let permErrorCaught = false;
  try {
    await db.query(`SELECT public.expire_abandoned_swaps(30);`);
  } catch (err: unknown) {
    permErrorCaught = (err as Error).message.includes('permission denied');
  }
  assert(permErrorCaught, 'expire_abandoned_swaps permission denied for authenticated user');

  permErrorCaught = false;
  try {
    await db.query(`SELECT public.process_submitted_swap_timeouts(7);`);
  } catch (err: unknown) {
    permErrorCaught = (err as Error).message.includes('permission denied');
  }
  assert(permErrorCaught, 'process_submitted_swap_timeouts permission denied for authenticated user');

  permErrorCaught = false;
  try {
    await db.query(`SELECT public.reconcile_credit_balances();`);
  } catch (err: unknown) {
    permErrorCaught = (err as Error).message.includes('permission denied');
  }
  assert(permErrorCaught, 'reconcile_credit_balances permission denied for authenticated user');

  permErrorCaught = false;
  try {
    await db.query(`SELECT public.request_password_reset_challenge_atomic('${userA}'::uuid, 'usera@example.com', 'hash', NOW(), 5);`);
  } catch (err: unknown) {
    permErrorCaught = (err as Error).message.includes('permission denied');
  }
  assert(permErrorCaught, 'request_password_reset_challenge_atomic permission denied for authenticated user');

  // 12a: Test expire_abandoned_swaps
  await setSuperuser();
  await db.exec(`
    INSERT INTO public.credit_transactions (user_id, amount, balance_after, transaction_type, reason)
    VALUES ('${userA}', 100, (SELECT credits_balance + 100 FROM public.accounts WHERE user_id = '${userA}'), 'transfer_received', 'Test topup');
    UPDATE public.accounts SET credits_balance = credits_balance + 100, credits_earned = credits_earned + 100 WHERE user_id = '${userA}';
  `);

  await setAuthUser(userA);
  swapRes = await db.query<{ swap_id: string }>(`
    SELECT public.create_credit_swap(
      'Abandoned Swap', 'Desc', 'Reqs', 'anyone', 15, NULL, 'swap_create:op_test_expire'
    ) AS swap_id;
  `);
  const expireSwapId = swapRes.rows[0].swap_id;

  // Backdate created_at to 35 days ago
  await setSuperuser();
  await db.query(`UPDATE public.swaps SET created_at = NOW() - INTERVAL '35 days' WHERE id = '${expireSwapId}';`);

  // 12a-1: Verify that supplying p_swap_id on a FRESH swap (created 1 day ago) DOES NOT bypass the 30-day cutoff
  await setAuthUser(userA);
  const freshSwapRes = await db.query<{ swap_id: string }>(`
    SELECT public.create_credit_swap('Fresh Swap', 'Desc', 'Reqs', 'anyone', 10, NULL, 'swap_create:op_fresh_expire') AS swap_id;
  `);
  const freshSwapId = freshSwapRes.rows[0].swap_id;
  await setSuperuser();
  await db.query(`UPDATE public.swaps SET created_at = NOW() - INTERVAL '1 day' WHERE id = '${freshSwapId}';`);

  const freshExpireAttempt = await db.query<{ result: { success: boolean; expired_count: number } }>(`
    SELECT public.expire_abandoned_swaps(30, '${freshSwapId}'::uuid) AS result;
  `);
  assert(freshExpireAttempt.rows[0].result.expired_count === 0, 'Fresh swap (1 day old) NOT expired despite passing p_swap_id');

  const userABalBeforeExpiry = (await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userA}';`)).rows[0].credits_balance;

  const expireRun1 = await db.query<{ result: { success: boolean; expired_count: number } }>(`
    SELECT public.expire_abandoned_swaps(30, '${expireSwapId}'::uuid) AS result;
  `);
  assert(expireRun1.rows[0].result.success === true, 'expire_abandoned_swaps executed successfully');
  assert(expireRun1.rows[0].result.expired_count === 1, 'Expired 1 abandoned swap');

  const expireSwapStatus = (await db.query<{ status: string }>(`SELECT status FROM public.swaps WHERE id = '${expireSwapId}';`)).rows[0].status;
  assert(expireSwapStatus === 'expired', 'Swap status updated to expired');

  const userABalAfterExpiry = (await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userA}';`)).rows[0].credits_balance;
  assert(userABalAfterExpiry === userABalBeforeExpiry + 15, 'Reserved credits refunded back to requester balance');

  // Second call must be idempotent
  const expireRun2 = await db.query<{ result: { expired_count: number } }>(`
    SELECT public.expire_abandoned_swaps(30, '${expireSwapId}'::uuid) AS result;
  `);
  assert(expireRun2.rows[0].result.expired_count === 0, 'Subsequent expiry call on expired swap is idempotent (0 modified)');

  // 12b: Test process_submitted_swap_timeouts
  await setAuthUser(userA);
  swapRes = await db.query<{ swap_id: string }>(`
    SELECT public.create_credit_swap(
      'Review Timeout Swap', 'Desc', 'Reqs', 'anyone', 20, NULL, 'swap_create:op_test_timeout'
    ) AS swap_id;
  `);
  const timeoutSwapId = swapRes.rows[0].swap_id;

  await setAuthUser(userB);
  await db.query(`SELECT public.accept_credit_swap('${timeoutSwapId}'::uuid);`);
  await db.query(`
    SELECT public.submit_swap_work(
      '${timeoutSwapId}'::uuid,
      'Work submitted for timeout test',
      '[]'::jsonb
    );
  `);

  // 12b-1: Verify that supplying p_swap_id on a FRESH submitted swap (submitted 1 day ago) DOES NOT bypass 7-day timeout
  await setSuperuser();
  await db.query(`UPDATE public.swaps SET submitted_at = NOW() - INTERVAL '1 day' WHERE id = '${timeoutSwapId}';`);

  const freshTimeoutAttempt = await db.query<{ result: { success: boolean; completed_count: number } }>(`
    SELECT public.process_submitted_swap_timeouts(7, '${timeoutSwapId}'::uuid) AS result;
  `);
  assert(freshTimeoutAttempt.rows[0].result.completed_count === 0, 'Fresh submitted swap (1 day old) NOT settled despite passing p_swap_id');

  // Backdate submitted_at to 8 days ago for genuine timeout
  await db.query(`UPDATE public.swaps SET submitted_at = NOW() - INTERVAL '8 days' WHERE id = '${timeoutSwapId}';`);

  const userBBalBeforeTimeout = (await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userB}';`)).rows[0].credits_balance;

  const timeoutRun1 = await db.query<{ result: { success: boolean; completed_count: number } }>(`
    SELECT public.process_submitted_swap_timeouts(7, '${timeoutSwapId}'::uuid) AS result;
  `);
  assert(timeoutRun1.rows[0].result.success === true, 'process_submitted_swap_timeouts executed successfully');
  assert(timeoutRun1.rows[0].result.completed_count === 1, 'Completed 1 timed-out submitted swap');

  const timeoutSwapStatus = (await db.query<{ status: string }>(`SELECT status FROM public.swaps WHERE id = '${timeoutSwapId}';`)).rows[0].status;
  assert(timeoutSwapStatus === 'completed', 'Swap status updated to completed');

  const userBBalAfterTimeout = (await db.query<AccountRow>(`SELECT * FROM public.accounts WHERE user_id = '${userB}';`)).rows[0].credits_balance;
  assert(userBBalAfterTimeout === userBBalBeforeTimeout + 20, 'Recipient awarded credits automatically upon review timeout');

  // Second call must be idempotent
  const timeoutRun2 = await db.query<{ result: { completed_count: number } }>(`
    SELECT public.process_submitted_swap_timeouts(7, '${timeoutSwapId}'::uuid) AS result;
  `);
  assert(timeoutRun2.rows[0].result.completed_count === 0, 'Subsequent timeout call on completed swap is idempotent (0 modified)');

  // Final account reconciliation check after expiry and timeout tests
  reconRes = await db.query<ReconRow>(`SELECT public.reconcile_credit_balances() AS recon;`);
  recon = reconRes.rows[0].recon;
  assert(recon.discrepancies_count === 0, 'Zero accounting discrepancies detected after expiry and timeout tests');
  console.log('  -> Swap expiry & submission review timeout verified cleanly!');

  // =========================================================================
  // TEST 13: Password Reset Atomic RPCs & Security Verification
  // =========================================================================
  console.log('Test 13: Password reset atomic RPCs & security verification...');
  await setSuperuser();

  const resetEmail = 'usera@example.com';
  const otpRaw = '123456';
  const crypto = await import('crypto');
  const hashStr = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
  const otpHash = hashStr(otpRaw);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // 13a: Atomic Challenge Creation & Rate Limiting (Concurrent Race Condition Check)
  const resetEmailC = 'userc@example.com';
  const otpHashC = hashStr('999999');

  // Launch 5 simultaneous reset requests to test advisory lock race condition protection
  const concurrentResetReqs = await Promise.all([
    db.query<{ result: { success: boolean; error_code?: string } }>(`
      SELECT public.request_password_reset_challenge_atomic('${userC}'::uuid, '${resetEmailC}', '${otpHashC}', '${expiresAt}'::timestamptz, 5) AS result;
    `),
    db.query<{ result: { success: boolean; error_code?: string } }>(`
      SELECT public.request_password_reset_challenge_atomic('${userC}'::uuid, '${resetEmailC}', '${otpHashC}', '${expiresAt}'::timestamptz, 5) AS result;
    `),
    db.query<{ result: { success: boolean; error_code?: string } }>(`
      SELECT public.request_password_reset_challenge_atomic('${userC}'::uuid, '${resetEmailC}', '${otpHashC}', '${expiresAt}'::timestamptz, 5) AS result;
    `),
    db.query<{ result: { success: boolean; error_code?: string } }>(`
      SELECT public.request_password_reset_challenge_atomic('${userC}'::uuid, '${resetEmailC}', '${otpHashC}', '${expiresAt}'::timestamptz, 5) AS result;
    `),
    db.query<{ result: { success: boolean; error_code?: string } }>(`
      SELECT public.request_password_reset_challenge_atomic('${userC}'::uuid, '${resetEmailC}', '${otpHashC}', '${expiresAt}'::timestamptz, 5) AS result;
    `),
  ]);

  const succCountC = concurrentResetReqs.filter((r) => r.rows[0].result.success === true).length;
  const rateLimitCountC = concurrentResetReqs.filter((r) => r.rows[0].result.error_code === 'RATE_LIMIT_EXCEEDED').length;

  assert(succCountC === 3, `Exactly 3 reset requests succeeded under concurrent load (got ${succCountC})`);
  assert(rateLimitCountC === 2, `Exactly 2 reset requests were rate limited under concurrent load (got ${rateLimitCountC})`);

  const create1 = await db.query<{ result: { success: boolean; challenge_id: string } }>(`
    SELECT public.request_password_reset_challenge_atomic(
      '${userA}'::uuid, '${resetEmail}', '${otpHash}', '${expiresAt}'::timestamptz, 5
    ) AS result;
  `);
  assert(create1.rows[0].result.success === true, 'First reset request created challenge successfully');

  const create2 = await db.query<{ result: { success: boolean } }>(`
    SELECT public.request_password_reset_challenge_atomic(
      '${userA}'::uuid, '${resetEmail}', '${otpHash}', '${expiresAt}'::timestamptz, 5
    ) AS result;
  `);
  assert(create2.rows[0].result.success === true, 'Second reset request created challenge successfully');

  const create3 = await db.query<{ result: { success: boolean } }>(`
    SELECT public.request_password_reset_challenge_atomic(
      '${userA}'::uuid, '${resetEmail}', '${otpHash}', '${expiresAt}'::timestamptz, 5
    ) AS result;
  `);
  assert(create3.rows[0].result.success === true, 'Third reset request created challenge successfully');

  // Fourth request within 15 minutes MUST be rate limited
  const create4 = await db.query<{ result: { success: boolean; error_code: string } }>(`
    SELECT public.request_password_reset_challenge_atomic(
      '${userA}'::uuid, '${resetEmail}', '${otpHash}', '${expiresAt}'::timestamptz, 5
    ) AS result;
  `);
  assert(create4.rows[0].result.success === false, 'Fourth reset request within 15 minutes rejected');
  assert(create4.rows[0].result.error_code === 'RATE_LIMIT_EXCEEDED', 'Correct RATE_LIMIT_EXCEEDED error code');

  // 13b: Wrong OTP Attempt Counting & Attempt Limits
  const wrongOtpHash = hashStr('000000');
  const recTokenRaw = 'token_test_abc_123';
  const recTokenHash = hashStr(recTokenRaw);
  const tokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // 4 wrong attempts
  for (let i = 1; i <= 4; i++) {
    const wrongRes = await db.query<{ result: { success: boolean; error_code: string } }>(`
      SELECT public.verify_password_reset_otp_atomic(
        '${resetEmail}', '${wrongOtpHash}', '${recTokenHash}', '${tokenExpiresAt}'::timestamptz
      ) AS result;
    `);
    assert(wrongRes.rows[0].result.success === false, `Wrong OTP attempt ${i} rejected`);
    assert(wrongRes.rows[0].result.error_code === 'INCORRECT_OTP', 'Returned INCORRECT_OTP error code');
  }

  // 5th wrong attempt hits maximum attempts limit
  const wrongRes5 = await db.query<{ result: { success: boolean; error_code: string } }>(`
    SELECT public.verify_password_reset_otp_atomic(
      '${resetEmail}', '${wrongOtpHash}', '${recTokenHash}', '${tokenExpiresAt}'::timestamptz
    ) AS result;
  `);
  assert(wrongRes5.rows[0].result.success === false, '5th wrong OTP attempt rejected');
  assert(wrongRes5.rows[0].result.error_code === 'TOO_MANY_ATTEMPTS', 'Max attempts reached returns TOO_MANY_ATTEMPTS');

  // 6th attempt even with correct OTP must fail because challenge was marked used upon hitting max attempts
  const correctAfterMax = await db.query<{ result: { success: boolean; error_code: string } }>(`
    SELECT public.verify_password_reset_otp_atomic(
      '${resetEmail}', '${otpHash}', '${recTokenHash}', '${tokenExpiresAt}'::timestamptz
    ) AS result;
  `);
  assert(correctAfterMax.rows[0].result.success === false, 'Correct OTP rejected after max attempts exceeded');
  assert(
    correctAfterMax.rows[0].result.error_code === 'TOO_MANY_ATTEMPTS' || correctAfterMax.rows[0].result.error_code === 'EXPIRED_OTP',
    'Returns error_code for invalidated challenge'
  );

  // 13c: Successful OTP Verification & Single-Use Recovery Token
  // Clear old challenges and create fresh challenge for User B
  await db.query(`DELETE FROM public.password_reset_challenges WHERE lower(email) = 'userb@example.com';`);

  const userBOtpHash = hashStr('654321');
  await db.query(`
    SELECT public.request_password_reset_challenge_atomic(
      '${userB}'::uuid, 'userb@example.com', '${userBOtpHash}', '${expiresAt}'::timestamptz, 5
    );
  `);

  const userBTokenRaw = 'userb_recovery_token_xyz';
  const userBTokenHash = hashStr(userBTokenRaw);

  const verifySuccess = await db.query<{ result: { success: boolean } }>(`
    SELECT public.verify_password_reset_otp_atomic(
      'userb@example.com', '${userBOtpHash}', '${userBTokenHash}', '${tokenExpiresAt}'::timestamptz
    ) AS result;
  `);
  assert(verifySuccess.rows[0].result.success === true, 'Correct OTP verified successfully');

  // Duplicate OTP verification attempt must fail
  const verifyDup = await db.query<{ result: { success: boolean; error_code: string } }>(`
    SELECT public.verify_password_reset_otp_atomic(
      'userb@example.com', '${userBOtpHash}', '${userBTokenHash}', '${tokenExpiresAt}'::timestamptz
    ) AS result;
  `);
  assert(verifyDup.rows[0].result.success === false, 'Duplicate OTP verification attempt rejected');

  // 13d: Concurrent Recovery Token Claim Atomicity
  const claimResults = await Promise.all([
    db.query<{ result: { success: boolean; user_id?: string; error_code?: string } }>(`
      SELECT public.claim_password_reset_recovery_token('userb@example.com', '${userBTokenHash}') AS result;
    `),
    db.query<{ result: { success: boolean; user_id?: string; error_code?: string } }>(`
      SELECT public.claim_password_reset_recovery_token('userb@example.com', '${userBTokenHash}') AS result;
    `),
  ]);

  const successfulClaim = claimResults.find((c) => c.rows[0].result.success === true);
  const rejectedClaim = claimResults.find((c) => c.rows[0].result.success === false);

  assert(Boolean(successfulClaim), 'One recovery token claim succeeded');
  assert(successfulClaim?.rows[0].result.user_id === userB, 'Claim returned correct user_id');
  assert(Boolean(rejectedClaim), 'Concurrent recovery token claim rejected');
  assert(rejectedClaim?.rows[0].result.error_code === 'INVALID_TOKEN', 'Rejected claim returned INVALID_TOKEN');

  console.log('  -> Password reset atomic RPCs & security verified cleanly!');

  console.log('--- ALL SKILLSWAP CREDIT INTEGRATION & SECURITY TESTS PASSED PERFECTLY! ---');
}

// Execute tests if executed directly
if (import.meta.url.endsWith('credits.test.ts') || process.argv[1]?.endsWith('credits.test.ts')) {
  runCreditSystemTests().catch((err) => {
    console.error('Integration test failure:', err);
    process.exit(1);
  });
}
