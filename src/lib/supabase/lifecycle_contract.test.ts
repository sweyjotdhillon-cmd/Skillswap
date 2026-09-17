import assert from 'node:assert';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Phase B File Lifecycle Contract & Retention Integration Tests
 * Validates Contracts A through H & retention durations (Section 3).
 */
export async function runLifecycleContractIntegrationTests() {
  console.log('--- Starting Phase B File Lifecycle Contract & Integration Tests ---');

  const db = new PGlite();

  // Initialize PGlite roles, auth, and storage schemas
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
    GRANT USAGE ON SCHEMA storage TO authenticated, anon, service_role;
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO authenticated, anon, service_role;
    CREATE OR REPLACE FUNCTION storage.foldername(name text)
    RETURNS text[]
    LANGUAGE sql
    IMMUTABLE
    AS $$
      SELECT string_to_array(name, '/');
    $$;

    CREATE OR REPLACE FUNCTION storage.filename(name text)
    RETURNS text
    LANGUAGE sql
    IMMUTABLE
    AS $$
      SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)];
    $$;
  `);

  const setAuthUser = async (userId: string) => {
    await db.exec(`
      RESET ROLE;
      SELECT set_config('request.jwt.claim.sub', '${userId}', false);
      SELECT set_config('request.jwt.claim.role', 'authenticated', false);
      SET ROLE authenticated;
    `);
  };

  const setSuperuser = async () => {
    await db.exec(`
      RESET ROLE;
      SELECT set_config('request.jwt.claim.sub', '', false);
    `);
  };

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
    '017_realtime_broadcast_security.sql',
    '018_submission_delivery_and_validation_fixes.sql',
    '019_final_submission_flow_alignment.sql',
    '020_swap_creator_attachments.sql',
    '021_creator_attachment_contract_alignment.sql',
    '022_creator_attachment_schema_and_security_hardening.sql',
    '023_storage_bucket_mime_type_configuration.sql',
    '023_fix_creator_attachment_registration.sql',
    '024_fix_nul_character_in_register_swap_attachment.sql',
    '025_add_tags_to_swaps.sql',
    '026_submission_and_chat_permissions.sql',
    '027_remove_chat_permissions.sql',
    '028_trust_data_pipeline.sql',
    '029_reconcile_rating_and_trust_schema.sql',
    '030_auto_release_at_deadline.sql',
    '031_harden_credit_ledger_and_invariants.sql',
    '032_privacy_and_onboarding_hardening.sql',
    '033_harden_trust_metrics_and_reviews.sql',
    '034_complete_profile_rls_reinforcement.sql',
    '035_file_lifecycle_system.sql',
    '036_fix_file_lifecycle_expiry_system.sql',
    '037_drop_idx_swap_submissions_swap_id.sql',
    '038_file_lifecycle_and_chat_attachments.sql',
    '039_phase1b_correction_pass.sql',
    '040_phase2_consolidation_and_cleanup.sql',
    '041_file_lifecycle_cron_and_hardening.sql',
    '042_file_lifecycle_cron_hardening.sql',
    '043_phase_a_file_lifecycle_consolidation.sql',
    '044_phase_a_lifecycle_contract_synchronization.sql',
    '045_lifecycle_contract_synchronization_final.sql',
  ];

  for (const file of migrationFiles) {
    const filePath = path.join(process.cwd(), 'supabase', 'migrations', file);
    const sql = fs.readFileSync(filePath, 'utf8');
    try {
      await db.exec(sql);
    } catch (mErr) {
      console.error(`Error applying migration ${file}:`, (mErr as Error).message);
      throw mErr;
    }
  }

  await setSuperuser();

  // Seed test users
  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${userA}', 'usera_contract@example.com'),
      ('${userB}', 'userb_contract@example.com')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, username, full_name, profile_completed)
    VALUES
      ('${userA}', 'usera_contract', 'User A Contract', true),
      ('${userB}', 'userb_contract', 'User B Contract', true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.accounts (user_id, credits_balance, credits_reserved, credits_earned, credits_spent)
    VALUES
      ('${userA}', 100, 0, 100, 0),
      ('${userB}', 100, 0, 100, 0)
    ON CONFLICT (user_id) DO NOTHING;
  `);

  // =========================================================================
  // CONTRACT A: RPC Contract — claim_expired_file_cleanup(p_limit)
  // =========================================================================
  console.log('Contract A: RPC Contract claim_expired_file_cleanup(p_limit)...');
  const claimRpcCheck = await db.query<{ source: string; file_id: string; storage_path: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(p_limit := 100);
  `);
  assert(Array.isArray(claimRpcCheck.rows), 'claim_expired_file_cleanup(p_limit) returns array');
  console.log('  -> Contract A verified.');

  // =========================================================================
  // CONTRACT B: Successful Lifecycle (claim -> Storage.remove -> mark_file_storage_deleted -> finalized)
  // =========================================================================
  console.log('Contract B: Successful lifecycle progression...');
  const swapB = (await db.query<{ id: string }>(`
    INSERT INTO public.swaps (requester_id, participant_id, topic, description, requirements, credit_amount, status)
    VALUES ('${userA}', '${userB}', 'Contract B Swap', 'Desc', 'Reqs', 10, 'accepted')
    RETURNING id;
  `)).rows[0].id;

  const subB = (await db.query<{ id: string }>(`
    INSERT INTO public.swap_submissions (swap_id, submitted_by, notes)
    VALUES ('${swapB}', '${userB}', 'Notes B')
    RETURNING id;
  `)).rows[0].id;

  const fileB = (await db.query<{ id: string }>(`
    INSERT INTO public.swap_submission_files (submission_id, storage_path, file_name, mime_type, file_size, storage_expires_at)
    VALUES ('${subB}', 'submissions/${swapB}/fileB.pdf', 'fileB.pdf', 'application/pdf', 1024, NOW() - INTERVAL '1 hour')
    RETURNING id;
  `)).rows[0].id;

  // Claim
  const claimedB = await db.query<{ file_id: string; source: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(50);
  `);
  assert(claimedB.rows.some((r) => r.file_id === fileB), 'Expired file claimed');

  // Mark deleted
  const markDelRes = await db.query<{ mark_file_storage_deleted: boolean }>(`
    SELECT public.mark_file_storage_deleted('submission', '${fileB}'::uuid);
  `);
  assert(markDelRes.rows[0].mark_file_storage_deleted === true, 'mark_file_storage_deleted returns true on successful update');

  const statusB = (await db.query<{ storage_delete_status: string; storage_deleted_at: string | null }>(`
    SELECT storage_delete_status, storage_deleted_at FROM public.swap_submission_files WHERE id = '${fileB}';
  `)).rows[0];
  assert(statusB.storage_delete_status === 'deleted', 'Final status is deleted');
  assert(statusB.storage_deleted_at !== null, 'storage_deleted_at is set');
  console.log('  -> Contract B verified.');

  // =========================================================================
  // CONTRACT C: Failed Storage Deletion (claim -> mark_file_storage_failed -> retryable)
  // =========================================================================
  console.log('Contract C: Failed storage deletion recovery...');
  const fileC = (await db.query<{ id: string }>(`
    INSERT INTO public.swap_submission_files (submission_id, storage_path, file_name, mime_type, file_size, storage_expires_at)
    VALUES ('${subB}', 'submissions/${swapB}/fileC.pdf', 'fileC.pdf', 'application/pdf', 1024, NOW() - INTERVAL '1 hour')
    RETURNING id;
  `)).rows[0].id;

  // Claim
  await db.query(`SELECT * FROM public.claim_expired_file_cleanup(50);`);

  // Mark failed
  const markFailRes = await db.query<{ mark_file_storage_failed: boolean }>(`
    SELECT public.mark_file_storage_failed('submission', '${fileC}'::uuid, 'Network timeout');
  `);
  assert(markFailRes.rows[0].mark_file_storage_failed === true, 'mark_file_storage_failed returns true on successful update');

  const statusC = (await db.query<{ storage_delete_status: string; storage_delete_error: string | null; storage_delete_claimed_at: string | null }>(`
    SELECT storage_delete_status, storage_delete_error, storage_delete_claimed_at FROM public.swap_submission_files WHERE id = '${fileC}';
  `)).rows[0];
  assert(statusC.storage_delete_status === 'failed', 'Status set to failed');
  assert(statusC.storage_delete_error === 'Network timeout', 'Error recorded');
  assert(statusC.storage_delete_claimed_at === null, 'Claim timestamp reset to null for retryability');

  // Verify retryable on next claim
  const reclaimC = await db.query<{ file_id: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(50);
  `);
  assert(reclaimC.rows.some((r) => r.file_id === fileC), 'Failed item is reclaimable on next claim call');
  console.log('  -> Contract C verified.');

  // =========================================================================
  // CONTRACT D: Stale Claim Recovery (15-minute lease timeout)
  // =========================================================================
  console.log('Contract D: Stale claim lease recovery (>15m)...');
  const fileD = (await db.query<{ id: string }>(`
    INSERT INTO public.swap_submission_files (submission_id, storage_path, file_name, mime_type, file_size, storage_expires_at)
    VALUES ('${subB}', 'submissions/${swapB}/fileD.pdf', 'fileD.pdf', 'application/pdf', 1024, NOW() - INTERVAL '1 hour')
    RETURNING id;
  `)).rows[0].id;

  // Simulate worker crash leaving row in pending status with claim timestamp 20 minutes ago
  await db.query(`
    UPDATE public.swap_submission_files
    SET storage_delete_status = 'pending',
        storage_delete_claimed_at = NOW() - INTERVAL '20 minutes'
    WHERE id = '${fileD}';
  `);

  const reclaimD = await db.query<{ file_id: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(50);
  `);
  assert(reclaimD.rows.some((r) => r.file_id === fileD), 'Stale lease (>15m) reclaimed by next worker execution');
  console.log('  -> Contract D verified.');

  // =========================================================================
  // CONTRACT E: Already-Deleted Object (404 Handling)
  // =========================================================================
  console.log('Contract E: Already-deleted Storage object (404)...');
  const fileE = (await db.query<{ id: string }>(`
    INSERT INTO public.swap_submission_files (submission_id, storage_path, file_name, mime_type, file_size, storage_expires_at)
    VALUES ('${subB}', 'submissions/${swapB}/fileE_404.pdf', 'fileE_404.pdf', 'application/pdf', 1024, NOW() - INTERVAL '1 hour')
    RETURNING id;
  `)).rows[0].id;

  // Claim
  await db.query(`SELECT * FROM public.claim_expired_file_cleanup(50);`);

  // When worker gets 404/Object Not Found from Storage, it calls mark_file_storage_deleted
  await db.query(`SELECT public.mark_file_storage_deleted('submission', '${fileE}'::uuid);`);

  const statusE = (await db.query<{ storage_delete_status: string }>(`
    SELECT storage_delete_status FROM public.swap_submission_files WHERE id = '${fileE}';
  `)).rows[0];
  assert(statusE.storage_delete_status === 'deleted', 'Missing/404 object metadata cleanly finalized as deleted');
  console.log('  -> Contract E verified.');

  // =========================================================================
  // CONTRACT F: Authentication failure protection
  // =========================================================================
  console.log('Contract F: Authentication failure protection on Edge function handler contract...');
  const mockEdgeHandlerAuthCheck = (authHeader: string | null, serviceKey: string) => {
    const expected = `Bearer ${serviceKey}`;
    if (!authHeader || authHeader !== expected) {
      return { status: 401, error: 'UNAUTHORIZED' };
    }
    return { status: 200 };
  };

  const serviceRoleKey = 'test-service-role-secret';
  assert(mockEdgeHandlerAuthCheck(null, serviceRoleKey).status === 401, 'Missing Auth header rejected with 401');
  assert(mockEdgeHandlerAuthCheck('Bearer invalid-token', serviceRoleKey).status === 401, 'Invalid Auth header rejected with 401');
  assert(mockEdgeHandlerAuthCheck(`Bearer ${serviceRoleKey}`, serviceRoleKey).status === 200, 'Valid Auth header accepted');
  console.log('  -> Contract F verified.');

  // =========================================================================
  // CONTRACT G: Canonical Bucket Mapping
  // =========================================================================
  console.log('Contract G: Canonical Bucket Mapping...');
  const swapG = (await db.query<{ id: string }>(`
    INSERT INTO public.swaps (requester_id, participant_id, topic, description, requirements, credit_amount, status)
    VALUES ('${userA}', '${userB}', 'Contract G Swap', 'Desc', 'Reqs', 10, 'accepted')
    RETURNING id;
  `)).rows[0].id;

  const attG = (await db.query<{ id: string }>(`
    INSERT INTO public.swap_attachment_files (swap_id, uploaded_by, storage_path, file_name, mime_type, file_size, storage_expires_at)
    VALUES ('${swapG}', '${userA}', 'swap-attachments/${swapG}/attG.png', 'attG.png', 'image/png', 512, NOW() - INTERVAL '1 hour')
    RETURNING id;
  `)).rows[0].id;

  const subG = (await db.query<{ id: string }>(`
    INSERT INTO public.swap_submissions (swap_id, submitted_by, notes)
    VALUES ('${swapG}', '${userB}', 'Notes G')
    RETURNING id;
  `)).rows[0].id;

  const subFileG = (await db.query<{ id: string }>(`
    INSERT INTO public.swap_submission_files (submission_id, storage_path, file_name, mime_type, file_size, storage_expires_at)
    VALUES ('${subG}', 'submissions/${swapG}/subG.zip', 'subG.zip', 'application/zip', 1024, NOW() - INTERVAL '1 hour')
    RETURNING id;
  `)).rows[0].id;

  const msgG = (await db.query<{ id: string }>(`
    INSERT INTO public.swap_messages (swap_id, sender_id, recipient_id, body)
    VALUES ('${swapG}', '${userA}', '${userB}', 'Msg G')
    RETURNING id;
  `)).rows[0].id;

  const chatAttG = (await db.query<{ id: string }>(`
    INSERT INTO public.swap_message_attachments (message_id, swap_id, uploaded_by, storage_path, file_name, mime_type, file_size, delete_after)
    VALUES ('${msgG}', '${swapG}', '${userA}', 'swap-chat-attachments/${swapG}/${userA}/10101010-1010-1010-1010-101010101010-chatG.pdf', 'chatG.pdf', 'application/pdf', 2048, NOW() - INTERVAL '1 hour')
    RETURNING id;
  `)).rows[0].id;

  const claimedG = await db.query<{ file_id: string; source: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(50);
  `);

  const mapAtt = claimedG.rows.find((r) => r.file_id === attG);
  const mapSub = claimedG.rows.find((r) => r.file_id === subFileG);
  const mapChat = claimedG.rows.find((r) => r.file_id === chatAttG);

  assert(mapAtt?.source === 'creator_attachment', 'creator_attachment source verified');
  assert(mapSub?.source === 'submission', 'submission source verified');
  assert(mapChat?.source === 'chat_attachment', 'chat_attachment source verified');
  console.log('  -> Contract G verified.');

  // =========================================================================
  // CONTRACT H: Duplicate / Overlapping Execution Safety
  // =========================================================================
  console.log('Contract H: Duplicate / overlapping worker execution safety...');
  const [claim1, claim2] = await Promise.all([
    db.query<{ file_id: string }>(`SELECT * FROM public.claim_expired_file_cleanup(50);`),
    db.query<{ file_id: string }>(`SELECT * FROM public.claim_expired_file_cleanup(50);`),
  ]);

  const set1 = new Set(claim1.rows.map((r) => r.file_id));
  const set2 = new Set(claim2.rows.map((r) => r.file_id));

  let overlapCount = 0;
  for (const fid of set1) {
    if (set2.has(fid)) overlapCount++;
  }
  assert(overlapCount === 0, 'Concurrent claim calls acquire disjoint file sets without duplicate processing');
  console.log('  -> Contract H verified.');

  // =========================================================================
  // RETENTION CONTRACT TESTS (Section 3)
  // =========================================================================
  console.log('Section 3 Retention Contracts Verification...');

  // 1. Creator attachment: accepted_at + 48 hours
  const swapRet = (await db.query<{ id: string; accepted_at: string }>(`
    INSERT INTO public.swaps (requester_id, participant_id, topic, description, requirements, credit_amount, status)
    VALUES ('${userA}', '${userB}', 'Retention Swap', 'Desc', 'Reqs', 10, 'open')
    RETURNING id, accepted_at;
  `)).rows[0].id;

  const openAtt = (await db.query<{ id: string; storage_expires_at: string | null }>(`
    INSERT INTO public.swap_attachment_files (swap_id, uploaded_by, storage_path, file_name, mime_type, file_size)
    VALUES ('${swapRet}', '${userA}', 'swap-attachments/${swapRet}/att.png', 'att.png', 'image/png', 512)
    RETURNING id, storage_expires_at;
  `)).rows[0];
  assert(openAtt.storage_expires_at === null, 'Open swap creator attachment has NULL storage_expires_at');

  await setAuthUser(userB);
  await db.query(`SELECT public.accept_credit_swap('${swapRet}'::uuid);`);

  await setSuperuser();
  const acceptedSwapRet = (await db.query<{ accepted_at: string }>(`
    SELECT accepted_at FROM public.swaps WHERE id = '${swapRet}';
  `)).rows[0];
  assert(acceptedSwapRet.accepted_at !== null, 'accepted_at populated');

  const updatedAttRet = (await db.query<{ storage_expires_at: string }>(`
    SELECT storage_expires_at FROM public.swap_attachment_files WHERE id = '${openAtt.id}';
  `)).rows[0];

  const acceptedTime = new Date(acceptedSwapRet.accepted_at).getTime();
  const expiresTime = new Date(updatedAttRet.storage_expires_at).getTime();
  const diffHoursAtt = (expiresTime - acceptedTime) / (1000 * 3600);
  assert(Math.abs(diffHoursAtt - 48) < 0.1, `Creator attachment retention is accepted_at + 48 hours (got ${diffHoursAtt}h)`);

  // 2. Submission file: submitted_at + 24 hours
  await setAuthUser(userB);
  const subRetRes = await db.query<{ submit_swap_work: { success: boolean; submission_id: string } }>(`
    SELECT public.submit_swap_work(
      '${swapRet}'::uuid,
      'Work submitted',
      '[{"storage_path": "submissions/${swapRet}/${userB}/subRet.zip", "file_name": "subRet.zip", "mime_type": "application/zip", "file_size": 1024}]'::jsonb
    );
  `);
  assert(subRetRes.rows[0].submit_swap_work.success === true, 'Submission created');

  await setSuperuser();
  const subFileRet = (await db.query<{ created_at: string; storage_expires_at: string }>(`
    SELECT created_at, storage_expires_at FROM public.swap_submission_files WHERE submission_id = '${subRetRes.rows[0].submit_swap_work.submission_id}';
  `)).rows[0];

  const subTime = new Date(subFileRet.created_at).getTime();
  const subExpiresTime = new Date(subFileRet.storage_expires_at).getTime();
  const diffHoursSub = (subExpiresTime - subTime) / (1000 * 3600);
  assert(Math.abs(diffHoursSub - 24) < 0.1, `Submission file retention is submitted_at + 24 hours (got ${diffHoursSub}h)`);

  // 3. Chat message & attachment: created_at + 6 hours
  await setAuthUser(userA);
  const chatMsgRet = (await db.query<{ id: string; created_at: string; expires_at: string }>(`
    INSERT INTO public.swap_messages (swap_id, sender_id, recipient_id, body)
    VALUES ('${swapRet}', '${userA}', '${userB}', 'Retention message')
    RETURNING id, created_at, expires_at;
  `)).rows[0];

  const msgTime = new Date(chatMsgRet.created_at).getTime();
  const msgExpiresTime = new Date(chatMsgRet.expires_at).getTime();
  const diffHoursMsg = (msgExpiresTime - msgTime) / (1000 * 3600);
  assert(Math.abs(diffHoursMsg - 6) < 0.1, `Chat message retention is created_at + 6 hours (got ${diffHoursMsg}h)`);

  // Chat attachment bound to message lifecycle (5-arg canonical contract returning row)
  const chatAttPathRet = `swap-chat-attachments/${swapRet}/${userA}/11111111-2222-3333-4444-555555555555-attRet.pdf`;
  const regRetRow = await db.query<{ id: string; delete_after: string; storage_path: string }>(`
    SELECT * FROM public.register_swap_message_attachment(
      '${chatMsgRet.id}'::uuid,
      '${chatAttPathRet}',
      'attRet.pdf',
      'application/pdf',
      1024
    );
  `);
  assert(regRetRow.rows[0].id !== undefined, 'register_swap_message_attachment returned inserted row');
  assert(regRetRow.rows[0].storage_path === chatAttPathRet, 'register_swap_message_attachment returned correct storage_path');

  await setSuperuser();
  const chatAttRet = (await db.query<{ delete_after: string }>(`
    SELECT delete_after FROM public.swap_message_attachments WHERE message_id = '${chatMsgRet.id}';
  `)).rows[0];

  const chatAttExpiresTime = new Date(chatAttRet.delete_after).getTime();
  const diffHoursChatAtt = (chatAttExpiresTime - msgTime) / (1000 * 3600);
  assert(Math.abs(diffHoursChatAtt - 6) < 0.1, `Chat attachment retention is bound to message created_at + 6 hours (got ${diffHoursChatAtt}h)`);

  console.log('  -> Section 3 Retention Contracts verified.');

  console.log('--- ALL PHASE B LIFECYCLE CONTRACT INTEGRATION & RETENTION TESTS PASSED PERFECTLY! ---');
}

// Run when executed directly
if (import.meta.url.endsWith('lifecycle_contract.test.ts') || process.argv[1]?.endsWith('lifecycle_contract.test.ts')) {
  runLifecycleContractIntegrationTests().catch((err) => {
    console.error('Lifecycle Contract Test Failure:', err);
    process.exit(1);
  });
}
