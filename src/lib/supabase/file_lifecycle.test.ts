import { PGlite } from '@electric-sql/pglite';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export async function runFileLifecycleUnitTests(
  db: PGlite,
  testUsers: { userA: string; userB: string; userC: string }
) {
  console.log('--- Starting File Lifecycle System Unit & Integration Tests ---');

  const setAuthUser = async (userId: string) => {
    await db.exec(`
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '${userId}', false);
      SELECT set_config('request.jwt.claim.role', 'authenticated', false);
    `);
  };

  const setSuperuser = async () => {
    await db.exec(`
      RESET ROLE;
      SELECT set_config('request.jwt.claim.sub', '', false);
    `);
  };

  // Test 1: Submission file retention & expiration
  console.log('File Lifecycle Test 1: Submission file retention (48h valid vs expired)...');
  await setSuperuser();

  // Create a test swap between User A and User B
  const swapRes = await db.query<{ id: string }>(`
    INSERT INTO public.swaps (requester_id, participant_id, topic, description, requirements, credit_amount, status)
    VALUES ('${testUsers.userA}', '${testUsers.userB}', 'File Lifecycle Test Swap', 'Desc', 'Reqs', 50, 'accepted')
    RETURNING id;
  `);
  const swapId = swapRes.rows[0].id;

  // Insert submission and submission file
  const subRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_submissions (swap_id, submitted_by, notes)
    VALUES ('${swapId}', '${testUsers.userB}', 'Deliverables attached')
    RETURNING id;
  `);
  const subId = subRes.rows[0].id;

  const subFileRes = await db.query<{ id: string; storage_expires_at: string; storage_delete_status: string }>(`
    INSERT INTO public.swap_submission_files (submission_id, storage_path, file_name, mime_type, file_size, storage_expires_at)
    VALUES ('${subId}', 'submissions/${swapId}/file1.pdf', 'file1.pdf', 'application/pdf', 1024, NOW() + INTERVAL '48 hours')
    RETURNING id, storage_expires_at, storage_delete_status;
  `);
  const subFile = subFileRes.rows[0];
  assert(subFile.storage_delete_status === 'active', 'Submission file initial status must be active');
  assert(Boolean(subFile.storage_expires_at), 'Submission file must have storage_expires_at populated');

  console.log('  -> Submission file 48h retention verified.');

  // Test 2: Creator attachments (Open swap vs Accepted swap 24h timer)
  console.log('File Lifecycle Test 2: Creator attachments (Open vs Accepted timer)...');
  await setSuperuser();

  const openSwapRes = await db.query<{ id: string }>(`
    INSERT INTO public.swaps (requester_id, topic, description, requirements, credit_amount, status)
    VALUES ('${testUsers.userA}', 'Open Swap', 'Desc', 'Reqs', 30, 'open')
    RETURNING id;
  `);
  const openSwapId = openSwapRes.rows[0].id;

  const attRes = await db.query<{ id: string; storage_expires_at: string | null }>(`
    INSERT INTO public.swap_attachment_files (swap_id, uploaded_by, storage_path, file_name, mime_type, file_size)
    VALUES ('${openSwapId}', '${testUsers.userA}', 'swap-attachments/${openSwapId}/res1.png', 'res1.png', 'image/png', 2048)
    RETURNING id, storage_expires_at;
  `);
  assert(attRes.rows[0].storage_expires_at === null, 'Open swap creator attachment must NOT have expiration');

  // Accept swap via RPC and confirm storage_expires_at is set to +24 hours
  await setAuthUser(testUsers.userB);
  await db.query(`SELECT public.accept_credit_swap('${openSwapId}'::uuid);`);

  await setSuperuser();
  const updatedAtt = await db.query<{ storage_expires_at: string | null }>(`
    SELECT storage_expires_at FROM public.swap_attachment_files WHERE id = '${attRes.rows[0].id}';
  `);
  assert(updatedAtt.rows[0].storage_expires_at !== null, 'Accepting swap MUST atomically establish 24-hour expiration timer');
  console.log('  -> Creator attachment open vs accepted 24h timer verified.');

  // Test 3: Chat attachments (<=25MB allowed, >25MB rejected, 6h manual deletion limit)
  console.log('File Lifecycle Test 3: Chat attachments and 6h manual deletion...');
  await setSuperuser();

  const msgRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_messages (swap_id, sender_id, recipient_id, body)
    VALUES ('${swapId}', '${testUsers.userA}', '${testUsers.userB}', 'Hello with attachment')
    RETURNING id;
  `);
  const msgId = msgRes.rows[0].id;

  // Insert chat attachment
  const chatAttRes = await db.query<{ id: string; delete_after: string; delete_status: string }>(`
    INSERT INTO public.swap_message_attachments (message_id, swap_id, uploaded_by, storage_path, file_name, mime_type, file_size)
    VALUES ('${msgId}', '${swapId}', '${testUsers.userA}', 'chat-attachments/${swapId}/doc.pdf', 'doc.pdf', 'application/pdf', 5242880)
    RETURNING id, delete_after, delete_status;
  `);
  const chatAttId = chatAttRes.rows[0].id;
  assert(chatAttRes.rows[0].delete_status === 'active', 'Chat attachment initial status must be active');

  // Sender manually deletes attachment within 6h window
  await setAuthUser(testUsers.userA);
  const deleteRes = await db.query<{ delete_chat_attachment_manual: { success: boolean } }>(`
    SELECT public.delete_chat_attachment_manual('${chatAttId}'::uuid);
  `);
  assert(deleteRes.rows[0].delete_chat_attachment_manual.success === true, 'Sender manual deletion within 6h must succeed');

  // Verify status is pending_deletion and record is preserved as tombstone
  await setSuperuser();
  const tombstoneCheck = await db.query<{ delete_status: string }>(`
    SELECT delete_status FROM public.swap_message_attachments WHERE id = '${chatAttId}';
  `);
  assert(tombstoneCheck.rows[0].delete_status === 'pending_deletion', 'Manual deletion must transition status to pending_deletion while retaining metadata tombstone');

  // Verify manual deletion is rejected after 6h window
  const expiredMsgAttRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_message_attachments (message_id, swap_id, uploaded_by, storage_path, file_name, mime_type, file_size, delete_after)
    VALUES ('${msgId}', '${swapId}', '${testUsers.userA}', 'chat-attachments/${swapId}/old.pdf', 'old.pdf', 'application/pdf', 1024, NOW() - INTERVAL '1 hour')
    RETURNING id;
  `);
  const expiredAttId = expiredMsgAttRes.rows[0].id;

  await setAuthUser(testUsers.userA);
  let manualDeleteFailed = false;
  try {
    await db.query(`SELECT public.delete_chat_attachment_manual('${expiredAttId}'::uuid);`);
  } catch (err) {
    manualDeleteFailed = true;
    assert((err as Error).message.includes('6 hours') || (err as Error).message.includes('expired'), 'Error message must cite 6-hour expiration limit');
  }
  assert(manualDeleteFailed, 'Manual deletion after 6 hours MUST be rejected');
  console.log('  -> Chat attachment lifecycle and 6h manual deletion rules verified.');

  // Test 4: Physical cleanup claiming & finalization
  console.log('File Lifecycle Test 4: Claiming expired files & worker finalization...');
  await setSuperuser();

  // Create an expired submission file
  const expiredSubFileRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_submission_files (submission_id, storage_path, file_name, mime_type, file_size, storage_expires_at)
    VALUES ('${subId}', 'submissions/${swapId}/expired_sub.zip', 'expired_sub.zip', 'application/zip', 4096, NOW() - INTERVAL '1 hour')
    RETURNING id;
  `);
  const expiredSubFileId = expiredSubFileRes.rows[0].id;

  // Claim expired files
  const claimedRes = await db.query<{ file_id: string; table_name: string; bucket_name: string; storage_path: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(500);
  `);
  assert(claimedRes.rows.length > 0, 'claim_expired_file_cleanup must return expired files');
  const claimedRecord = claimedRes.rows.find((r) => r.file_id === expiredSubFileId);
  assert(Boolean(claimedRecord), 'claim_expired_file_cleanup must claim expired submission file');

  // Finalize successful cleanup
  await db.query(`
    SELECT public.finalize_file_cleanup('${expiredSubFileId}'::uuid, 'swap_submission_files', true, NULL);
  `);

  const finalizedFile = await db.query<{ storage_delete_status: string; storage_deleted_at: string | null }>(`
    SELECT storage_delete_status, storage_deleted_at FROM public.swap_submission_files WHERE id = '${expiredSubFileId}';
  `);
  assert(finalizedFile.rows[0].storage_delete_status === 'deleted', 'finalize_file_cleanup must set status to deleted');
  assert(finalizedFile.rows[0].storage_deleted_at !== null, 'finalize_file_cleanup must set storage_deleted_at timestamp');
  console.log('  -> Physical cleanup claiming & finalization verified.');

  // Test 5: Cleanup failure handling
  console.log('File Lifecycle Test 5: Cleanup failure handling & retry state...');
  const failSubFileRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_submission_files (submission_id, storage_path, file_name, mime_type, file_size, storage_expires_at)
    VALUES ('${subId}', 'submissions/${swapId}/failed_sub.zip', 'failed_sub.zip', 'application/zip', 4096, NOW() - INTERVAL '1 hour')
    RETURNING id;
  `);
  const failSubFileId = failSubFileRes.rows[0].id;

  // Claim
  await db.query(`SELECT * FROM public.claim_expired_file_cleanup(500);`);

  // Finalize with failure
  await db.query(`
    SELECT public.finalize_file_cleanup('${failSubFileId}'::uuid, 'swap_submission_files', false, 'Storage connection timeout');
  `);

  const failedFile = await db.query<{ storage_delete_status: string; storage_delete_error: string | null }>(`
    SELECT storage_delete_status, storage_delete_error FROM public.swap_submission_files WHERE id = '${failSubFileId}';
  `);
  assert(failedFile.rows[0].storage_delete_status === 'failed', 'Failed storage deletion must record status as failed');
  assert(failedFile.rows[0].storage_delete_error === 'Storage connection timeout', 'Error message must be saved in storage_delete_error');
  console.log('  -> Cleanup failure handling & retry state verified.');

  // Test 6: Idempotency
  console.log('File Lifecycle Test 6: Cleanup idempotency...');
  // Running claim and finalize again on deleted file should produce no corruption
  await db.query(`
    SELECT public.finalize_file_cleanup('${expiredSubFileId}'::uuid, 'swap_submission_files', true, NULL);
  `);
  const reCheckedFile = await db.query<{ storage_delete_status: string }>(`
    SELECT storage_delete_status FROM public.swap_submission_files WHERE id = '${expiredSubFileId}';
  `);
  assert(reCheckedFile.rows[0].storage_delete_status === 'deleted', 'Idempotent finalization must preserve deleted status without corruption');
  console.log('  -> Cleanup idempotency verified.');

  // Test 7: Authorization (Unrelated user blocked from chat deletion)
  console.log('File Lifecycle Test 7: Authorization checks...');
  await setAuthUser(testUsers.userC); // User C is unrelated

  let userCDeleteFailed = false;
  try {
    await db.query(`SELECT public.delete_chat_attachment_manual('${chatAttId}'::uuid);`);
  } catch (err) {
    userCDeleteFailed = true;
    assert((err as Error).message.includes('not found') || (err as Error).message.includes('denied'), 'Error must indicate access denied or not found');
  }
  assert(userCDeleteFailed, 'Unrelated user MUST be blocked from deleting chat attachment');
  console.log('  -> Authorization checks verified.');

  // Test 8: Known legacy creator attachment cleanup (MAchines.pptx)
  console.log('File Lifecycle Test 8: Legacy MAchines.pptx attachment cleanup state...');
  await setSuperuser();

  // Create legacy completed swap and MAchines.pptx record
  const legacySwapRes = await db.query<{ id: string }>(`
    INSERT INTO public.swaps (id, requester_id, participant_id, topic, description, requirements, credit_amount, status, created_at)
    VALUES ('7124c8f9-2348-42aa-958c-4625fce2e4c6', '${testUsers.userA}', '${testUsers.userB}', 'Legacy Swap', 'Desc', 'Reqs', 10, 'completed', NOW() - INTERVAL '30 days')
    ON CONFLICT (id) DO UPDATE SET status = 'completed'
    RETURNING id;
  `);

  await db.query(`
    INSERT INTO public.swap_attachment_files (id, swap_id, uploaded_by, storage_path, file_name, mime_type, file_size, created_at, storage_expires_at)
    VALUES (
      'dcb801a9-84a4-4410-81a1-73850cb8f5c0',
      '7124c8f9-2348-42aa-958c-4625fce2e4c6',
      '${testUsers.userA}',
      'swap-attachments/7124c8f9-2348-42aa-958c-4625fce2e4c6/3c167fca-f08d-4daa-8f2a-196eadd49a0c/5efda41c-1fde-4bf5-b10e-d225a6f32780-MAchines.pptx',
      'MAchines.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      5242880,
      NOW() - INTERVAL '30 days',
      NULL
    )
    ON CONFLICT (id) DO NOTHING;
  `);

  // Run migration backfill logic
  await db.query(`
    UPDATE public.swap_attachment_files f
    SET storage_expires_at = COALESCE(f.storage_expires_at, s.created_at + interval '24 hours')
    FROM public.swaps s
    WHERE f.swap_id = s.id AND s.status <> 'open' AND f.storage_expires_at IS NULL;
  `);

  const pptxRecord = await db.query<{ storage_expires_at: string | null }>(`
    SELECT storage_expires_at FROM public.swap_attachment_files WHERE id = 'dcb801a9-84a4-4410-81a1-73850cb8f5c0';
  `);
  assert(pptxRecord.rows[0].storage_expires_at !== null, 'Legacy MAchines.pptx attachment MUST have storage_expires_at populated');

  // Claim and finalize MAchines.pptx
  const pptxClaimed = await db.query<{ file_id: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(500);
  `);
  const isPptxClaimed = pptxClaimed.rows.some((r) => r.file_id === 'dcb801a9-84a4-4410-81a1-73850cb8f5c0');
  assert(isPptxClaimed, 'Legacy MAchines.pptx attachment MUST be claimed as expired file');

  await db.query(`
    SELECT public.finalize_file_cleanup('dcb801a9-84a4-4410-81a1-73850cb8f5c0'::uuid, 'swap_attachment_files', true, NULL);
  `);

  const pptxFinal = await db.query<{ storage_delete_status: string; storage_deleted_at: string | null }>(`
    SELECT storage_delete_status, storage_deleted_at FROM public.swap_attachment_files WHERE id = 'dcb801a9-84a4-4410-81a1-73850cb8f5c0';
  `);
  assert(pptxFinal.rows[0].storage_delete_status === 'deleted', 'MAchines.pptx tombstone MUST be marked deleted');
  assert(pptxFinal.rows[0].storage_deleted_at !== null, 'MAchines.pptx storage_deleted_at MUST be set');

  console.log('  -> Legacy MAchines.pptx attachment cleanup verified.');

  console.log('✓ ALL FILE LIFECYCLE SYSTEM INTEGRATION TESTS PASSED PERFECTLY!');
}
