import assert from 'node:assert';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { getFileExpiryStatus } from '../fileExpiry';

/**
 * Dedicated Creator Attachment Lifecycle & 10-Invariant Verification Test Suite
 */
export async function runCreatorAttachmentLifecycleTests() {
  console.log('--- Starting Creator Attachment Lifecycle & 10-Invariant Tests ---');

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
    SET search_path = public, storage, auth, pg_temp;

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
    '048_file_lifecycle_contract_repair.sql',
    '049_fix_chat_permissions_and_lifecycle_rls.sql',
    '050_fix_platform_trust_metric_settlement_trigger.sql',
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
  const userA = 'a1111111-1111-4111-a111-111111111111';
  const userB = 'b2222222-2222-4222-a222-222222222222';

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${userA}', 'usera_inv@example.com'),
      ('${userB}', 'userb_inv@example.com')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, username, full_name, profile_completed)
    VALUES
      ('${userA}', 'usera_inv', 'User A Inv', true),
      ('${userB}', 'userb_inv', 'User B Inv', true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.accounts (user_id, credits_balance, credits_reserved, credits_earned, credits_spent)
    VALUES
      ('${userA}', 100, 0, 100, 0),
      ('${userB}', 100, 0, 100, 0)
    ON CONFLICT (user_id) DO NOTHING;
  `);

  // =========================================================================
  // Invariant 1: Uploading/creating swap does NOT start 48h countdown
  // =========================================================================
  console.log('Invariant 1: Uploading/creating swap does NOT start 48h countdown...');
  await setSuperuser();

  const swap1Res = await db.query<{ id: string; created_at: string }>(`
    INSERT INTO public.swaps (requester_id, topic, description, requirements, credit_amount, status)
    VALUES ('${userA}', 'Invariant 1 Swap', 'Desc', 'Reqs', 20, 'open')
    RETURNING id, created_at;
  `);
  const swap1Id = swap1Res.rows[0].id;

  const att1Res = await db.query<{ id: string; storage_expires_at: string | null }>(`
    INSERT INTO public.swap_attachment_files (swap_id, uploaded_by, storage_path, file_name, mime_type, file_size)
    VALUES ('${swap1Id}', '${userA}', 'swap-attachments/${swap1Id}/${userA}/11111111-1111-1111-1111-111111111111-doc.pdf', 'doc.pdf', 'application/pdf', 1024)
    RETURNING id, storage_expires_at;
  `);
  assert.strictEqual(att1Res.rows[0].storage_expires_at, null, 'storage_expires_at MUST be NULL on upload for open swap');

  const uiStatus1 = getFileExpiryStatus(att1Res.rows[0].storage_expires_at);
  assert.strictEqual(uiStatus1.isExpired, false, 'UI status is not expired');
  assert.strictEqual(uiStatus1.displayText, '', 'UI displays no countdown text for NULL expiry');
  assert.strictEqual(uiStatus1.isPreAcceptance, true, 'UI status correctly identifies NULL expiry as pre-acceptance state');
  console.log('  -> Invariant 1 verified.');

  // =========================================================================
  // Invariant 2 & 5: Accepting swap starts 48h countdown from accepted_at
  // =========================================================================
  console.log('Invariant 2 & 5: Accepting swap starts 48h countdown from accepted_at...');
  await setAuthUser(userB);

  await db.query(`SELECT public.accept_credit_swap('${swap1Id}'::uuid);`);

  await setSuperuser();
  const acceptedSwap1 = (await db.query<{ accepted_at: string }>(`
    SELECT accepted_at FROM public.swaps WHERE id = '${swap1Id}';
  `)).rows[0];
  assert.notStrictEqual(acceptedSwap1.accepted_at, null, 'accepted_at populated upon acceptance');

  const updatedAtt1 = (await db.query<{ storage_expires_at: string }>(`
    SELECT storage_expires_at FROM public.swap_attachment_files WHERE id = '${att1Res.rows[0].id}';
  `)).rows[0];
  assert.notStrictEqual(updatedAtt1.storage_expires_at, null, 'storage_expires_at set upon acceptance');

  const acceptedTs = new Date(acceptedSwap1.accepted_at).getTime();
  const expiresTs = new Date(updatedAtt1.storage_expires_at).getTime();
  const diffHours = (expiresTs - acceptedTs) / (1000 * 3600);
  assert.ok(Math.abs(diffHours - 48) < 0.01, `storage_expires_at equals accepted_at + 48h (got ${diffHours}h)`);
  console.log('  -> Invariant 2 & 5 verified.');

  // =========================================================================
  // Invariant 3 & 4: UI countdown is derived from DB storage_expires_at, NOT created_at + 48h
  // =========================================================================
  console.log('Invariant 3 & 4: UI countdown is derived from DB storage_expires_at, NOT created_at + 48h...');
  // Create a swap created 100 hours ago
  const swapOldRes = await db.query<{ id: string }>(`
    INSERT INTO public.swaps (requester_id, topic, description, requirements, credit_amount, status, created_at)
    VALUES ('${userA}', 'Old Swap', 'Desc', 'Reqs', 20, 'open', NOW() - INTERVAL '100 hours')
    RETURNING id;
  `);
  const swapOldId = swapOldRes.rows[0].id;

  const attOldRes = await db.query<{ id: string; created_at: string; storage_expires_at: string | null }>(`
    INSERT INTO public.swap_attachment_files (swap_id, uploaded_by, storage_path, file_name, mime_type, file_size, created_at)
    VALUES ('${swapOldId}', '${userA}', 'swap-attachments/${swapOldId}/${userA}/22222222-2222-2222-2222-222222222222-old.pdf', 'old.pdf', 'application/pdf', 1024, NOW() - INTERVAL '100 hours')
    RETURNING id, created_at, storage_expires_at;
  `);
  assert.strictEqual(attOldRes.rows[0].storage_expires_at, null, 'Open attachment created 100h ago still has NULL storage_expires_at');

  // If UI incorrectly calculated created_at + 48h, it would be expired now.
  const wrongUiCalc = getFileExpiryStatus(new Date(new Date(attOldRes.rows[0].created_at).getTime() + 48 * 3600 * 1000).toISOString());
  assert.strictEqual(wrongUiCalc.isExpired, true, 'created_at + 48h would be incorrectly expired');

  // Real UI implementation uses DB storage_expires_at (null), so it is active and not expired
  const realUiCalc = getFileExpiryStatus(attOldRes.rows[0].storage_expires_at);
  assert.strictEqual(realUiCalc.isExpired, false, 'Real UI using DB storage_expires_at is NOT expired');

  // Accept the old swap now
  await setAuthUser(userB);
  await db.query(`SELECT public.accept_credit_swap('${swapOldId}'::uuid);`);

  await setSuperuser();
  const attOldAccepted = (await db.query<{ storage_expires_at: string }>(`
    SELECT storage_expires_at FROM public.swap_attachment_files WHERE id = '${attOldRes.rows[0].id}';
  `)).rows[0];

  const uiAfterAccept = getFileExpiryStatus(attOldAccepted.storage_expires_at);
  assert.strictEqual(uiAfterAccept.isExpired, false, 'Post-acceptance UI derived from storage_expires_at is active');
  assert.ok(uiAfterAccept.displayText.includes('day') || uiAfterAccept.displayText.includes('hours'), 'UI displays ~48h remaining');
  console.log('  -> Invariant 3 & 4 verified.');

  // =========================================================================
  // Requirement 7 Coverage: Creator attachment with NULL expiry & Unaccepted Open Swap
  // =========================================================================
  console.log('Requirement 7: Creator attachment with NULL expiry is pre-acceptance and NOT claimed by worker...');
  const swapNeverRes = await db.query<{ id: string }>(`
    INSERT INTO public.swaps (requester_id, topic, description, requirements, credit_amount, status, created_at)
    VALUES ('${userA}', 'Never Accepted Swap', 'Desc', 'Reqs', 20, 'open', NOW() - INTERVAL '10 days')
    RETURNING id;
  `);
  const swapNeverId = swapNeverRes.rows[0].id;

  const attNeverRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_attachment_files (swap_id, uploaded_by, storage_path, file_name, mime_type, file_size, created_at)
    VALUES ('${swapNeverId}', '${userA}', 'swap-attachments/${swapNeverId}/${userA}/33333333-3333-3333-3333-333333333333-never.pdf', 'never.pdf', 'application/pdf', 1024, NOW() - INTERVAL '10 days')
    RETURNING id;
  `);

  // Run cleanup worker while swap is open -> attachment is NOT claimed
  const claimedNever = await db.query<{ file_id: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(500);
  `);
  assert.strictEqual(claimedNever.rows.some((r) => r.file_id === attNeverRes.rows[0].id), false, 'Unaccepted open swap creator attachment with NULL expiry MUST NOT be claimed for cleanup while open');
  console.log('  -> Creator attachment with NULL expiry verified.');

  // =========================================================================
  // Requirement 7 Coverage: Retry after failed physical deletion
  // =========================================================================
  console.log('Requirement 7: Retry after failed physical deletion for creator attachment...');
  const failAttRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_attachment_files (swap_id, uploaded_by, storage_path, file_name, mime_type, file_size, storage_expires_at)
    VALUES ('${swap1Id}', '${userA}', 'swap-attachments/${swap1Id}/${userA}/55555555-5555-5555-5555-555555555555-retry.pdf', 'retry.pdf', 'application/pdf', 1024, NOW() - INTERVAL '2 hours')
    RETURNING id;
  `);
  const failAttId = failAttRes.rows[0].id;

  // Claim
  await db.query(`SELECT * FROM public.claim_expired_file_cleanup(500);`);

  // Mark failed
  const failRes = await db.query<{ mark_file_storage_failed: boolean }>(`
    SELECT public.mark_file_storage_failed('creator_attachment', '${failAttId}'::uuid, 'Simulated storage network failure');
  `);
  assert.strictEqual(failRes.rows[0].mark_file_storage_failed, true, 'mark_file_storage_failed returns true for creator_attachment');

  const failedAttRecord = (await db.query<{ storage_delete_status: string; storage_delete_claimed_at: string | null }>(`
    SELECT storage_delete_status, storage_delete_claimed_at FROM public.swap_attachment_files WHERE id = '${failAttId}';
  `)).rows[0];
  assert.strictEqual(failedAttRecord.storage_delete_status, 'failed', 'Status is failed');
  assert.strictEqual(failedAttRecord.storage_delete_claimed_at, null, 'Claim timestamp is reset to null');

  // Re-claim on next worker run
  const reclaimedFail = await db.query<{ file_id: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(500);
  `);
  assert.strictEqual(reclaimedFail.rows.some((r) => r.file_id === failAttId), true, 'Failed creator attachment is successfully reclaimed on next cleanup worker run');
  console.log('  -> Retry after failed physical deletion verified.');

  // =========================================================================
  // Requirement 7 Coverage: Already-missing physical Storage object (404)
  // =========================================================================
  console.log('Requirement 7: Already-missing physical Storage object (404) handling for creator attachment...');
  const missingAttRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_attachment_files (swap_id, uploaded_by, storage_path, file_name, mime_type, file_size, storage_expires_at)
    VALUES ('${swap1Id}', '${userA}', 'swap-attachments/${swap1Id}/${userA}/66666666-6666-6666-6666-666666666666-missing404.pdf', 'missing404.pdf', 'application/pdf', 1024, NOW() - INTERVAL '2 hours')
    RETURNING id;
  `);
  const missingAttId = missingAttRes.rows[0].id;

  // Claim
  await db.query(`SELECT * FROM public.claim_expired_file_cleanup(500);`);

  // Mark deleted directly as worker does when Storage API returns 404 Object Not Found
  const markMissingRes = await db.query<{ mark_file_storage_deleted: boolean }>(`
    SELECT public.mark_file_storage_deleted('creator_attachment', '${missingAttId}'::uuid);
  `);
  assert.strictEqual(markMissingRes.rows[0].mark_file_storage_deleted, true, 'mark_file_storage_deleted returns true for 404 missing object');

  const missingAttRecord = (await db.query<{ storage_delete_status: string; storage_deleted_at: string | null }>(`
    SELECT storage_delete_status, storage_deleted_at FROM public.swap_attachment_files WHERE id = '${missingAttId}';
  `)).rows[0];
  assert.strictEqual(missingAttRecord.storage_delete_status, 'deleted', '404 missing creator attachment is finalized as deleted');
  assert.notStrictEqual(missingAttRecord.storage_deleted_at, null, 'storage_deleted_at timestamp is populated');
  console.log('  -> Already-missing physical Storage object (404) verified.');

  // =========================================================================
  // Requirement 7 Coverage: Duplicate / Stale Cleanup Claims (15m lease timeout recovery)
  // =========================================================================
  console.log('Requirement 7: Duplicate / stale cleanup claims (15m lease recovery) for creator attachment...');
  const staleAttRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_attachment_files (swap_id, uploaded_by, storage_path, file_name, mime_type, file_size, storage_expires_at)
    VALUES ('${swap1Id}', '${userA}', 'swap-attachments/${swap1Id}/${userA}/77777777-7777-7777-7777-777777777777-stale.pdf', 'stale.pdf', 'application/pdf', 1024, NOW() - INTERVAL '2 hours')
    RETURNING id;
  `);
  const staleAttId = staleAttRes.rows[0].id;

  // Simulate worker crash leaving row in pending status with claim timestamp 20 minutes ago
  await db.query(`
    UPDATE public.swap_attachment_files
    SET storage_delete_status = 'pending',
        storage_delete_claimed_at = NOW() - INTERVAL '20 minutes'
    WHERE id = '${staleAttId}';
  `);

  const reclaimStale = await db.query<{ file_id: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(500);
  `);
  assert.strictEqual(reclaimStale.rows.some((r) => r.file_id === staleAttId), true, 'Stale lease (>15m) creator attachment is successfully reclaimed');
  console.log('  -> Duplicate / stale cleanup claims verified.');

  // =========================================================================
  // Invariant 7: Displayed expiry time matches accepted_at + 48 hours
  // =========================================================================
  console.log('Invariant 7: Displayed expiry time matches accepted_at + 48 hours...');
  const acceptedAt1Ts = new Date(acceptedSwap1.accepted_at).getTime();
  const expiresAt1Ts = new Date(updatedAtt1.storage_expires_at).getTime();
  assert.strictEqual(expiresAt1Ts, acceptedAt1Ts + 48 * 3600 * 1000, 'expiresAt matches accepted_at + 48 hours exactly');
  console.log('  -> Invariant 7 verified.');

  // =========================================================================
  // Invariant 8: Refreshing/reopening page preserves exact expiry timestamp
  // =========================================================================
  console.log('Invariant 8: Refreshing/reopening page preserves exact expiry timestamp...');
  // Simulating page refresh by re-querying swap_attachment_files
  const refreshFetch = (await db.query<{ storage_expires_at: string }>(`
    SELECT storage_expires_at FROM public.swap_attachment_files WHERE id = '${att1Res.rows[0].id}';
  `)).rows[0];
  assert.strictEqual(
    new Date(refreshFetch.storage_expires_at).getTime(),
    new Date(updatedAtt1.storage_expires_at).getTime(),
    'Refetched storage_expires_at matches original timestamp'
  );
  console.log('  -> Invariant 8 verified.');

  // =========================================================================
  // Invariant 9: Cleanup worker uses storage_expires_at <= now()
  // =========================================================================
  console.log('Invariant 9: Cleanup worker uses storage_expires_at <= now()...');
  // Insert an accepted creator attachment whose storage_expires_at was set in the past
  const expiredAttRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_attachment_files (swap_id, uploaded_by, storage_path, file_name, mime_type, file_size, storage_expires_at)
    VALUES ('${swap1Id}', '${userA}', 'swap-attachments/${swap1Id}/${userA}/44444444-4444-4444-4444-444444444444-exp.pdf', 'exp.pdf', 'application/pdf', 1024, NOW() - INTERVAL '1 hour')
    RETURNING id;
  `);

  const claimedExp = await db.query<{ file_id: string; source: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(500);
  `);
  assert.ok(claimedExp.rows.some((r) => r.file_id === expiredAttRes.rows[0].id && r.source === 'creator_attachment'), 'Expired creator attachment claimed by cleanup worker');
  console.log('  -> Invariant 9 verified.');

  // =========================================================================
  // Invariant 10: Physical storage deletion produces explicit expired/deleted UI state
  // =========================================================================
  console.log('Invariant 10: Physical storage deletion produces explicit expired/deleted UI state...');
  await db.query(`
    SELECT public.mark_file_storage_deleted('creator_attachment', '${expiredAttRes.rows[0].id}'::uuid);
  `);

  const deletedAtt = (await db.query<{ storage_expires_at: string; storage_deleted_at: string; storage_delete_status: string }>(`
    SELECT storage_expires_at, storage_deleted_at, storage_delete_status FROM public.swap_attachment_files WHERE id = '${expiredAttRes.rows[0].id}';
  `)).rows[0];

  assert.strictEqual(deletedAtt.storage_delete_status, 'deleted', 'Database status is deleted');

  const deletedUiStatus = getFileExpiryStatus(deletedAtt.storage_expires_at, deletedAtt.storage_delete_status);
  assert.strictEqual(deletedUiStatus.isExpired, true, 'UI identifies item as expired');
  assert.strictEqual(deletedUiStatus.isDeleted, true, 'UI identifies item as deleted');
  assert.strictEqual(deletedUiStatus.displayText, 'File expired', 'UI displayText is explicit "File expired"');
  assert.strictEqual(deletedUiStatus.subtext, 'This file is no longer available.', 'UI subtext explains unavailability');
  console.log('  -> Invariant 10 verified.');

  // =========================================================================
  // Verification of Preserved Lifecycles: Submission 24h & Chat 6h
  // =========================================================================
  console.log('Verification of Preserved Lifecycles (Submission 24h & Chat 6h)...');
  await setAuthUser(userB);

  const subWorkRes = await db.query<{ submit_swap_work: { success: boolean; submission_id: string } }>(`
    SELECT public.submit_swap_work(
      '${swap1Id}'::uuid,
      'Submission for invariant test',
      '[{"storage_path": "submissions/${swap1Id}/${userB}/sub.zip", "file_name": "sub.zip", "mime_type": "application/zip", "file_size": 1024}]'::jsonb
    );
  `);
  assert.strictEqual(subWorkRes.rows[0].submit_swap_work.success, true);

  await setSuperuser();
  const subFile = (await db.query<{ created_at: string; storage_expires_at: string }>(`
    SELECT created_at, storage_expires_at FROM public.swap_submission_files WHERE submission_id = '${subWorkRes.rows[0].submit_swap_work.submission_id}';
  `)).rows[0];

  const subCreatedTs = new Date(subFile.created_at).getTime();
  const subExpiresTs = new Date(subFile.storage_expires_at).getTime();
  const subDiffHours = (subExpiresTs - subCreatedTs) / (1000 * 3600);
  assert.ok(Math.abs(subDiffHours - 24) < 0.01, `Submission retention is 24h (got ${subDiffHours}h)`);

  await setAuthUser(userA);
  const chatMsg = (await db.query<{ id: string; created_at: string; expires_at: string }>(`
    INSERT INTO public.swap_messages (swap_id, sender_id, recipient_id, body)
    VALUES ('${swap1Id}', '${userA}', '${userB}', 'Chat lifecycle test')
    RETURNING id, created_at, expires_at;
  `)).rows[0];

  const msgCreatedTs = new Date(chatMsg.created_at).getTime();
  const msgExpiresTs = new Date(chatMsg.expires_at).getTime();
  const msgDiffHours = (msgExpiresTs - msgCreatedTs) / (1000 * 3600);
  assert.ok(Math.abs(msgDiffHours - 6) < 0.01, `Chat message retention is 6h (got ${msgDiffHours}h)`);

  console.log('  -> Submission 24h and Chat 6h lifecycles remain unchanged and verified.');

  console.log('--- ALL CREATOR ATTACHMENT LIFECYCLE & 10-INVARIANT TESTS PASSED PERFECTLY! ---');
}

// Run when executed directly
if (import.meta.url.endsWith('creator_attachment_lifecycle.test.ts') || process.argv[1]?.endsWith('creator_attachment_lifecycle.test.ts')) {
  runCreatorAttachmentLifecycleTests().catch((err) => {
    console.error('Creator Attachment Lifecycle Test Failure:', err);
    process.exit(1);
  });
}
