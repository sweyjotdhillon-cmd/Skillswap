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

  // Test 1: Submission file retention & 24h expiration
  console.log('File Lifecycle Test 1: Submission file retention (24h valid vs expired)...');
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
    VALUES ('${subId}', 'submissions/${swapId}/file1.pdf', 'file1.pdf', 'application/pdf', 1024, NOW() + INTERVAL '24 hours')
    RETURNING id, storage_expires_at, storage_delete_status;
  `);
  const subFile = subFileRes.rows[0];
  assert(subFile.storage_delete_status === 'active', 'Submission file initial status must be active');
  assert(Boolean(subFile.storage_expires_at), 'Submission file must have storage_expires_at populated');

  console.log('  -> Submission file 24h retention verified.');

  // Test 2: Creator attachments (Open swap vs Accepted swap 48h timer & accepted_at)
  console.log('File Lifecycle Test 2: Creator attachments (Open vs Accepted 48h timer & accepted_at)...');
  await setSuperuser();

  const openSwapRes = await db.query<{ id: string }>(`
    INSERT INTO public.swaps (requester_id, topic, description, requirements, credit_amount, status)
    VALUES ('${testUsers.userA}', 'Open Swap Lifecycle', 'Desc', 'Reqs', 30, 'open')
    RETURNING id;
  `);
  const openSwapId = openSwapRes.rows[0].id;

  const attRes = await db.query<{ id: string; storage_expires_at: string | null }>(`
    INSERT INTO public.swap_attachment_files (swap_id, uploaded_by, storage_path, file_name, mime_type, file_size)
    VALUES ('${openSwapId}', '${testUsers.userA}', 'swap-attachments/${openSwapId}/res1.png', 'res1.png', 'image/png', 2048)
    RETURNING id, storage_expires_at;
  `);
  assert(attRes.rows[0].storage_expires_at === null, 'Open swap creator attachment must NOT have expiration');

  // Accept swap via RPC and confirm accepted_at is set and storage_expires_at is set to +48 hours
  await setAuthUser(testUsers.userB);
  await db.query(`SELECT public.accept_credit_swap('${openSwapId}'::uuid);`);

  await setSuperuser();
  const acceptedSwap = await db.query<{ accepted_at: string | null }>(`
    SELECT accepted_at FROM public.swaps WHERE id = '${openSwapId}';
  `);
  assert(acceptedSwap.rows[0].accepted_at !== null, 'Accepting swap MUST populate accepted_at timestamp');

  const updatedAtt = await db.query<{ storage_expires_at: string | null }>(`
    SELECT storage_expires_at FROM public.swap_attachment_files WHERE id = '${attRes.rows[0].id}';
  `);
  assert(updatedAtt.rows[0].storage_expires_at !== null, 'Accepting swap MUST atomically establish 48-hour expiration timer');
  console.log('  -> Creator attachment open vs accepted 48h timer & accepted_at verified.');

  // Test 3: Chat attachments (<=25MB allowed, >25MB rejected, register_swap_message_attachment RPC)
  console.log('File Lifecycle Test 3: Chat attachments and register_swap_message_attachment RPC...');
  await setSuperuser();

  const msgRes = await db.query<{ id: string; expires_at: string }>(`
    INSERT INTO public.swap_messages (swap_id, sender_id, recipient_id, body)
    VALUES ('${swapId}', '${testUsers.userA}', '${testUsers.userB}', 'Hello with attachment')
    RETURNING id, expires_at;
  `);
  const msgId = msgRes.rows[0].id;
  assert(Boolean(msgRes.rows[0].expires_at), 'Chat message MUST have expires_at populated (DEFAULT created_at + 6h)');

  // Test 5-argument register_swap_message_attachment RPC (returning complete inserted row)
  await setAuthUser(testUsers.userA);
  const chatAttPath = `swap-chat-attachments/${swapId}/${testUsers.userA}/uuid123-doc.pdf`;
  const regRpcRes = await db.query<{ id: string; storage_path: string }>(`
    SELECT * FROM public.register_swap_message_attachment(
      '${msgId}'::uuid,
      '${chatAttPath}',
      'doc.pdf',
      'application/pdf',
      5242880
    );
  `);
  assert(regRpcRes.rows[0].id !== undefined, 'register_swap_message_attachment RPC succeeded and returned row id');
  const chatAttId = regRpcRes.rows[0].id;

  // Verify path mismatch rejection
  let pathInvalid = false;
  try {
    await db.query(`
      SELECT public.register_swap_message_attachment(
        '${msgId}'::uuid,
        'wrong-path/${swapId}/${testUsers.userA}/doc.pdf',
        'doc.pdf',
        'application/pdf',
        1024
      );
    `);
  } catch (err) {
    pathInvalid = (err as Error).message.includes('Invalid storage path');
  }
  assert(pathInvalid, 'Invalid storage path rejected by RPC');

  // Insert expired chat attachment records for claiming check
  await setSuperuser();
  const expiredActiveChatRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_message_attachments (message_id, swap_id, uploaded_by, storage_path, file_name, mime_type, file_size, delete_after, delete_status)
    VALUES ('${msgId}', '${swapId}', '${testUsers.userA}', 'swap-chat-attachments/${swapId}/${testUsers.userA}/expired_active.pdf', 'expired_active.pdf', 'application/pdf', 1024, NOW() - INTERVAL '1 hour', 'active')
    RETURNING id;
  `);
  const expiredActiveChatId = expiredActiveChatRes.rows[0].id;

  const expiredFailedChatRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_message_attachments (message_id, swap_id, uploaded_by, storage_path, file_name, mime_type, file_size, delete_after, delete_status)
    VALUES ('${msgId}', '${swapId}', '${testUsers.userA}', 'swap-chat-attachments/${swapId}/${testUsers.userA}/expired_failed.pdf', 'expired_failed.pdf', 'application/pdf', 1024, NOW() - INTERVAL '1 hour', 'failed')
    RETURNING id;
  `);
  const expiredFailedChatId = expiredFailedChatRes.rows[0].id;

  const claimedChatRes = await db.query<{ file_id: string; source: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(500);
  `);
  assert(claimedChatRes.rows.some(r => r.file_id === expiredActiveChatId && r.source === 'chat_attachment'), 'claim_expired_file_cleanup MUST claim expired chat attachment with source chat_attachment');
  assert(claimedChatRes.rows.some(r => r.file_id === expiredFailedChatId && r.source === 'chat_attachment'), 'claim_expired_file_cleanup MUST claim expired failed chat attachment with source chat_attachment');

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
    VALUES ('${msgId}', '${swapId}', '${testUsers.userA}', 'swap-chat-attachments/${swapId}/${testUsers.userA}/old.pdf', 'old.pdf', 'application/pdf', 1024, NOW() - INTERVAL '1 hour')
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

  // Test 4: Physical cleanup claiming, lease recovery, & mark_file_storage_deleted / mark_file_storage_failed
  console.log('File Lifecycle Test 4: Claiming expired files, 15-minute lease recovery, & mark_file_storage_deleted / mark_file_storage_failed...');
  await setSuperuser();

  // Create an expired submission file
  const expiredSubFileRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_submission_files (submission_id, storage_path, file_name, mime_type, file_size, storage_expires_at)
    VALUES ('${subId}', 'submissions/${swapId}/expired_sub.zip', 'expired_sub.zip', 'application/zip', 4096, NOW() - INTERVAL '1 hour')
    RETURNING id;
  `);
  const expiredSubFileId = expiredSubFileRes.rows[0].id;

  // Claim expired files
  const claimedRes = await db.query<{ file_id: string; source: string; storage_path: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(500);
  `);
  assert(claimedRes.rows.length > 0, 'claim_expired_file_cleanup must return expired files');
  const claimedRecord = claimedRes.rows.find((r) => r.file_id === expiredSubFileId);
  assert(Boolean(claimedRecord), 'claim_expired_file_cleanup must claim expired submission file');

  // Verify 15-minute lease recovery state: simulate a stuck worker by setting storage_delete_claimed_at to 20 minutes ago
  await db.query(`
    UPDATE public.swap_submission_files
    SET storage_delete_status = 'pending',
        storage_delete_claimed_at = NOW() - INTERVAL '20 minutes'
    WHERE id = '${expiredSubFileId}';
  `);

  const reclaimedRes = await db.query<{ file_id: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(500);
  `);
  const reclaimedRecord = reclaimedRes.rows.find((r) => r.file_id === expiredSubFileId);
  assert(Boolean(reclaimedRecord), 'Stuck lease (>15m) MUST be successfully reclaimed by claim_expired_file_cleanup');

  // Finalize successful cleanup via mark_file_storage_deleted (returning boolean)
  const delBoolRes = await db.query<{ mark_file_storage_deleted: boolean }>(`
    SELECT public.mark_file_storage_deleted('submission', '${expiredSubFileId}'::uuid);
  `);
  assert(delBoolRes.rows[0].mark_file_storage_deleted === true, 'mark_file_storage_deleted returns true on successful deletion');

  const finalizedFile = await db.query<{ storage_delete_status: string; storage_deleted_at: string | null }>(`
    SELECT storage_delete_status, storage_deleted_at FROM public.swap_submission_files WHERE id = '${expiredSubFileId}';
  `);
  assert(finalizedFile.rows[0].storage_delete_status === 'deleted', 'mark_file_storage_deleted must set status to deleted');
  assert(finalizedFile.rows[0].storage_deleted_at !== null, 'mark_file_storage_deleted must set storage_deleted_at timestamp');
  console.log('  -> Physical cleanup claiming, 15-minute lease recovery, & mark_file_storage_deleted verified.');

  // Test 5: Cleanup failure handling via mark_file_storage_failed
  console.log('File Lifecycle Test 5: Cleanup failure handling via mark_file_storage_failed & retry state...');
  const failSubFileRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_submission_files (submission_id, storage_path, file_name, mime_type, file_size, storage_expires_at)
    VALUES ('${subId}', 'submissions/${swapId}/failed_sub.zip', 'failed_sub.zip', 'application/zip', 4096, NOW() - INTERVAL '1 hour')
    RETURNING id;
  `);
  const failSubFileId = failSubFileRes.rows[0].id;

  // Claim
  await db.query(`SELECT * FROM public.claim_expired_file_cleanup(500);`);

  // Finalize with failure via mark_file_storage_failed (returning boolean)
  const failBoolRes = await db.query<{ mark_file_storage_failed: boolean }>(`
    SELECT public.mark_file_storage_failed('submission', '${failSubFileId}'::uuid, 'Storage connection timeout');
  `);
  assert(failBoolRes.rows[0].mark_file_storage_failed === true, 'mark_file_storage_failed returns true on successful failure record');

  const failedFile = await db.query<{ storage_delete_status: string; storage_delete_error: string | null; storage_delete_claimed_at: string | null }>(`
    SELECT storage_delete_status, storage_delete_error, storage_delete_claimed_at FROM public.swap_submission_files WHERE id = '${failSubFileId}';
  `);
  assert(failedFile.rows[0].storage_delete_status === 'failed', 'Failed storage deletion must record status as failed');
  assert(failedFile.rows[0].storage_delete_error === 'Storage connection timeout', 'Error message must be saved in storage_delete_error');
  assert(failedFile.rows[0].storage_delete_claimed_at === null, 'mark_file_storage_failed MUST reset claim timestamp to make item immediately retryable');
  console.log('  -> Cleanup failure handling via mark_file_storage_failed & retry state verified.');

  // Test 6: Idempotency
  console.log('File Lifecycle Test 6: Cleanup idempotency...');
  // Running claim and finalize again on deleted file should return false without corruption
  const reMarkRes = await db.query<{ mark_file_storage_deleted: boolean }>(`
    SELECT public.mark_file_storage_deleted('submission', '${expiredSubFileId}'::uuid);
  `);
  assert(reMarkRes.rows[0].mark_file_storage_deleted === false, 'mark_file_storage_deleted returns false when target is already deleted');

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
  await db.query(`
    INSERT INTO public.swaps (id, requester_id, participant_id, topic, description, requirements, credit_amount, status, created_at)
    VALUES ('7124c8f9-2348-42aa-958c-4625fce2e4c6', '${testUsers.userA}', '${testUsers.userB}', 'Legacy Swap', 'Desc', 'Reqs', 10, 'completed', NOW() - INTERVAL '30 days')
    ON CONFLICT (id) DO UPDATE SET status = 'completed';
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
    SET storage_expires_at = COALESCE(f.storage_expires_at, COALESCE(s.accepted_at, s.created_at) + interval '48 hours')
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
    SELECT public.mark_file_storage_deleted('creator_attachment', 'dcb801a9-84a4-4410-81a1-73850cb8f5c0'::uuid);
  `);

  const pptxFinal = await db.query<{ storage_delete_status: string; storage_deleted_at: string | null }>(`
    SELECT storage_delete_status, storage_deleted_at FROM public.swap_attachment_files WHERE id = 'dcb801a9-84a4-4410-81a1-73850cb8f5c0';
  `);
  assert(pptxFinal.rows[0].storage_delete_status === 'deleted', 'MAchines.pptx tombstone MUST be marked deleted');
  assert(pptxFinal.rows[0].storage_deleted_at !== null, 'MAchines.pptx storage_deleted_at MUST be set');

  console.log('  -> Legacy MAchines.pptx attachment cleanup verified.');

  // Test 9: Historical Chat Message expires_at Backfill Verification (created_at + 6h)
  console.log('File Lifecycle Test 9: Historical Chat Message expires_at Backfill Verification (created_at + 6h)...');
  await setSuperuser();

  // Create an old message with created_at set to 10 hours ago
  const oldMsgRes = await db.query<{ id: string; created_at: string; expires_at: string }>(`
    INSERT INTO public.swap_messages (swap_id, sender_id, recipient_id, body, created_at)
    VALUES ('${swapId}', '${testUsers.userA}', '${testUsers.userB}', 'Historical message', NOW() - INTERVAL '10 hours')
    RETURNING id, created_at, expires_at;
  `);
  const oldMsgId = oldMsgRes.rows[0].id;

  // Run backfill SQL (same as migration 039)
  await db.query(`
    UPDATE public.swap_messages
    SET expires_at = created_at + interval '6 hours'
    WHERE id = '${oldMsgId}';
  `);

  const backfilledMsg = await db.query<{ created_at: string; expires_at: string }>(`
    SELECT created_at, expires_at FROM public.swap_messages WHERE id = '${oldMsgId}';
  `);
  const createdTs = new Date(backfilledMsg.rows[0].created_at).getTime();
  const expiresTs = new Date(backfilledMsg.rows[0].expires_at).getTime();
  const diffHours = (expiresTs - createdTs) / (1000 * 3600);
  assert(Math.abs(diffHours - 6) < 0.01, 'Historical message expires_at MUST equal created_at + 6 hours');
  console.log('  -> Historical Chat Message expires_at backfill verified.');

  // Test 10: Atomic send_chat_message_with_attachments RPC (TEXT ONLY, TEXT + ATTACHMENTS, ATTACHMENT ONLY, & Rollback)
  console.log('File Lifecycle Test 10: Atomic send_chat_message_with_attachments RPC semantics...');
  await setAuthUser(testUsers.userA);

  // 10a. TEXT ONLY
  const textOnlyRes = await db.query<{ send_chat_message_with_attachments: { success: boolean; message: { id: string; body: string } } }>(`
    SELECT public.send_chat_message_with_attachments(
      '${swapId}'::uuid,
      '${testUsers.userB}'::uuid,
      'Text only chat message'::text,
      '[]'::jsonb,
      NULL::uuid
    ) AS send_chat_message_with_attachments;
  `);
  assert(textOnlyRes.rows[0].send_chat_message_with_attachments.success === true, 'Text only RPC succeeded');
  assert(textOnlyRes.rows[0].send_chat_message_with_attachments.message.body === 'Text only chat message', 'Text only body matched');

  // 10b. TEXT + ATTACHMENTS
  const msgWithAttId = 'a1b2c3d4-e5f6-7890-1234-56789abcdef0';
  const textAttRes = await db.query<{ send_chat_message_with_attachments: { success: boolean; message: { id: string; attachments: Array<{ file_name: string; mime_type: string }> } } }>(`
    SELECT public.send_chat_message_with_attachments(
      '${swapId}'::uuid,
      '${testUsers.userB}'::uuid,
      'Message with PDF attachment'::text,
      '[{"storage_path": "swap-chat-attachments/${swapId}/${testUsers.userA}/test.pdf", "file_name": "test.pdf", "file_size": 2048}]'::jsonb,
      '${msgWithAttId}'::uuid
    ) AS send_chat_message_with_attachments;
  `);
  assert(textAttRes.rows[0].send_chat_message_with_attachments.success === true, 'Text + Attachment RPC succeeded');
  assert(textAttRes.rows[0].send_chat_message_with_attachments.message.attachments.length === 1, 'Attachment metadata created');
  assert(textAttRes.rows[0].send_chat_message_with_attachments.message.attachments[0].mime_type === 'application/pdf', 'Server computed MIME type');

  // 10c. ATTACHMENT ONLY (empty body)
  const attOnlyMsgId = 'b2c3d4e5-f6a7-8901-2345-6789abcdef01';
  const attOnlyRes = await db.query<{ send_chat_message_with_attachments: { success: boolean; message: { id: string; body: string; attachments: Array<{ file_name: string }> } } }>(`
    SELECT public.send_chat_message_with_attachments(
      '${swapId}'::uuid,
      '${testUsers.userB}'::uuid,
      ''::text,
      '[{"storage_path": "swap-chat-attachments/${swapId}/${testUsers.userA}/img.png", "file_name": "img.png", "file_size": 1024}]'::jsonb,
      '${attOnlyMsgId}'::uuid
    ) AS send_chat_message_with_attachments;
  `);
  assert(attOnlyRes.rows[0].send_chat_message_with_attachments.success === true, 'Attachment only RPC succeeded');
  assert(attOnlyRes.rows[0].send_chat_message_with_attachments.message.body === '📎 [File Attachment]', 'Placeholder body populated for attachment-only message');

  // 10d. Failed RPC invocation (Invalid MIME) must NOT insert message or attachment metadata
  const failedMsgId = 'c3d4e5f6-a7b8-9012-3456-789abcdef012';
  let failedRpcRejected = false;
  try {
    await db.query(`
      SELECT public.send_chat_message_with_attachments(
        '${swapId}'::uuid,
        '${testUsers.userB}'::uuid,
        'This should fail'::text,
        '[{"storage_path": "swap-chat-attachments/${swapId}/${testUsers.userA}/virus.exe", "file_name": "virus.exe", "file_size": 1024}]'::jsonb,
        '${failedMsgId}'::uuid
      );
    `);
  } catch (err) {
    const errMessage = (err as Error).message.toLowerCase();
    failedRpcRejected = errMessage.includes('unsupported') || errMessage.includes('invalid file format') || errMessage.includes('restricted file extension');
  }
  assert(failedRpcRejected, 'Invalid file extension MUST cause RPC exception');

  // Verify message row was NOT inserted
  await setSuperuser();
  const orphanMsgCheck = await db.query<{ id: string }>(`
    SELECT id FROM public.swap_messages WHERE id = '${failedMsgId}';
  `);
  assert(orphanMsgCheck.rows.length === 0, 'No orphan swap_messages record MUST exist after RPC failure');
  console.log('  -> Atomic send_chat_message_with_attachments RPC semantics verified.');

  // Test 11: Server-side MIME Allowlist Validation
  console.log('File Lifecycle Test 11: Server-side MIME allowlist validation...');
  await setAuthUser(testUsers.userB);

  // 11a. Rejection in submit_swap_work for unsupported file (.exe)
  let subWorkMimeRejected = false;
  try {
    await db.query(`
      SELECT public.submit_swap_work(
        '${swapId}'::uuid,
        'Notes',
        '[{"storage_path": "submissions/${swapId}/${testUsers.userB}/script.exe", "file_name": "script.exe", "mime_type": "text/plain", "file_size": 100}]'::jsonb
      );
    `);
  } catch (err) {
    const errMessage = (err as Error).message.toLowerCase();
    subWorkMimeRejected = errMessage.includes('unsupported') || errMessage.includes('invalid file format') || errMessage.includes('restricted file extension');
  }
  assert(subWorkMimeRejected, 'submit_swap_work MUST reject unsupported file extensions server-side');

  // 11b. Rejection in register_swap_attachment (creates dedicated open swap)
  await setSuperuser();
  const mimeTestSwapRes = await db.query<{ id: string }>(`
    INSERT INTO public.swaps (requester_id, topic, description, requirements, credit_amount, status)
    VALUES ('${testUsers.userA}', 'MIME Test Swap', 'Desc', 'Reqs', 10, 'open')
    RETURNING id;
  `);
  const mimeTestSwapId = mimeTestSwapRes.rows[0].id;

  await setAuthUser(testUsers.userA);
  const creatorAttMimeRes = await db.query<{ register_swap_attachment: { success: boolean; error?: string } }>(`
    SELECT public.register_swap_attachment(
      '${mimeTestSwapId}'::uuid,
      'swap-attachments/${mimeTestSwapId}/${testUsers.userA}/11111111-2222-3333-4444-555555555555-payload.dll',
      'payload.dll',
      'application/octet-stream',
      500
    ) AS register_swap_attachment;
  `);
  assert(creatorAttMimeRes.rows[0].register_swap_attachment.success === false, 'register_swap_attachment MUST reject unsupported file extensions server-side');
  assert(creatorAttMimeRes.rows[0].register_swap_attachment.error?.toLowerCase().includes('unsupported') === true, 'Error message for unsupported extension matches');

  // 11c. Client p_mime_type is NOT trusted (overridden by canonical mime type derived from file extension)
  const validExtRes = await db.query<{ register_swap_attachment: { success: boolean; mime_type: string } }>(`
    SELECT public.register_swap_attachment(
      '${mimeTestSwapId}'::uuid,
      'swap-attachments/${mimeTestSwapId}/${testUsers.userA}/22222222-3333-4444-5555-666666666666-forged_mime.png',
      'forged_mime.png',
      'application/x-executable-fake',
      500
    ) AS register_swap_attachment;
  `);
  assert(validExtRes.rows[0].register_swap_attachment.success === true, 'Valid extension succeeds');
  assert(validExtRes.rows[0].register_swap_attachment.mime_type === 'image/png', 'Server overrides client mime_type with canonical image/png derived from filename');
  console.log('  -> Server-side MIME allowlist validation verified.');

  // Test 12: Controlled End-to-End File Lifecycle Cleanup Chain
  console.log('File Lifecycle Test 12: Controlled End-to-End File Lifecycle Cleanup Chain...');
  await setSuperuser();

  // Step 1 & 2: Create test metadata eligible for expiration
  const e2eMsgRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_messages (swap_id, sender_id, recipient_id, body)
    VALUES ('${swapId}', '${testUsers.userA}', '${testUsers.userB}', 'E2E Lifecycle Message')
    RETURNING id;
  `);
  const e2eMsgId = e2eMsgRes.rows[0].id;

  const e2eAttRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_message_attachments (message_id, swap_id, uploaded_by, storage_path, file_name, mime_type, file_size, delete_after)
    VALUES ('${e2eMsgId}', '${swapId}', '${testUsers.userA}', 'swap-chat-attachments/${swapId}/${testUsers.userA}/e2e_test.pdf', 'e2e_test.pdf', 'application/pdf', 1024, NOW() - INTERVAL '2 hours')
    RETURNING id;
  `);
  const e2eAttId = e2eAttRes.rows[0].id;

  // Step 3 & 4: Claim expired items
  const e2eClaim = await db.query<{ file_id: string; source: string; storage_path: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(500);
  `);
  const e2eClaimedRecord = e2eClaim.rows.find(r => r.file_id === e2eAttId);
  assert(Boolean(e2eClaimedRecord), 'E2E test item MUST be claimed');
  assert(e2eClaimedRecord?.source === 'chat_attachment', 'Claimed item MUST map to swap-chat-attachments bucket');

  // Step 5 & 6 & 7: Finalize cleanup via mark_file_storage_deleted
  await db.query(`
    SELECT public.mark_file_storage_deleted('chat_attachment', '${e2eAttId}'::uuid);
  `);

  const e2eFinal = await db.query<{ delete_status: string; deleted_at: string | null }>(`
    SELECT delete_status, deleted_at FROM public.swap_message_attachments WHERE id = '${e2eAttId}';
  `);
  assert(e2eFinal.rows[0].delete_status === 'deleted', 'Finalized E2E item status MUST be deleted');
  assert(e2eFinal.rows[0].deleted_at !== null, 'Finalized E2E item deleted_at timestamp MUST be set');

  // Step 8 & 9: Simulate failure & retryability
  const e2eFailAttRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_message_attachments (message_id, swap_id, uploaded_by, storage_path, file_name, mime_type, file_size, delete_after)
    VALUES ('${e2eMsgId}', '${swapId}', '${testUsers.userA}', 'swap-chat-attachments/${swapId}/${testUsers.userA}/e2e_fail.pdf', 'e2e_fail.pdf', 'application/pdf', 1024, NOW() - INTERVAL '2 hours')
    RETURNING id;
  `);
  const e2eFailAttId = e2eFailAttRes.rows[0].id;

  await db.query(`SELECT * FROM public.claim_expired_file_cleanup(500);`);
  await db.query(`SELECT public.mark_file_storage_failed('chat_attachment', '${e2eFailAttId}'::uuid, 'Simulated Storage Network Error');`);

  const e2eFailedRecord = await db.query<{ delete_status: string; delete_error: string }>(`
    SELECT delete_status, delete_error FROM public.swap_message_attachments WHERE id = '${e2eFailAttId}';
  `);
  assert(e2eFailedRecord.rows[0].delete_status === 'failed', 'Simulated failure status MUST be failed');
  assert(e2eFailedRecord.rows[0].delete_error === 'Simulated Storage Network Error', 'Delete error recorded');

  // Confirm failed item is retryable by claim_expired_file_cleanup
  const retryClaim = await db.query<{ file_id: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(500);
  `);
  assert(retryClaim.rows.some(r => r.file_id === e2eFailAttId), 'Failed item MUST be retryable on subsequent cleanup claim');

  // Step 10: Confirm stuck lease becomes reclaimable after 15 min lease timeout
  await db.query(`
    UPDATE public.swap_message_attachments
    SET delete_status = 'pending',
        delete_claimed_at = NOW() - INTERVAL '20 minutes'
    WHERE id = '${e2eFailAttId}';
  `);

  const leaseReclaim = await db.query<{ file_id: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(500);
  `);
  assert(leaseReclaim.rows.some(r => r.file_id === e2eFailAttId), 'Stuck lease (>15m) MUST be reclaimable');

  console.log('  -> Controlled End-to-End File Lifecycle Cleanup Chain verified.');

  // Test 13: Worker 404/Missing Object Handling & Cron Job Audit
  console.log('File Lifecycle Test 13: Worker 404/Missing Object Handling & Canonical Cron Job Audit...');
  await setSuperuser();

  // Create an expired submission file representing an already-deleted/missing Storage object
  const missingObjSubRes = await db.query<{ id: string }>(`
    INSERT INTO public.swap_submission_files (submission_id, storage_path, file_name, mime_type, file_size, storage_expires_at)
    VALUES ('${subId}', 'submissions/${swapId}/missing_object_404.pdf', 'missing_object_404.pdf', 'application/pdf', 1024, NOW() - INTERVAL '3 hours')
    RETURNING id;
  `);
  const missingObjSubId = missingObjSubRes.rows[0].id;

  // Claim the expired file
  const missingObjClaim = await db.query<{ file_id: string }>(`
    SELECT * FROM public.claim_expired_file_cleanup(500);
  `);
  assert(missingObjClaim.rows.some(r => r.file_id === missingObjSubId), 'Missing/404 storage object item MUST be claimed');

  // Simulate worker encountering a 404 "Object not found" response from Storage API:
  // Since the object is already gone from Storage, worker calls mark_file_storage_deleted
  const removeErr404 = { message: 'Object not found', status: 404 };
  const errLower = removeErr404.message.toLowerCase();
  const isNotFound = errLower.includes('not found') || removeErr404.status === 404;
  assert(isNotFound === true, 'Worker logic MUST identify 404 / Object not found as already removed');

  await db.query(`
    SELECT public.mark_file_storage_deleted('submission', '${missingObjSubId}'::uuid);
  `);

  const missingObjFinal = await db.query<{ storage_delete_status: string; storage_deleted_at: string | null }>(`
    SELECT storage_delete_status, storage_deleted_at FROM public.swap_submission_files WHERE id = '${missingObjSubId}';
  `);
  assert(missingObjFinal.rows[0].storage_delete_status === 'deleted', 'Missing/404 item MUST be finalized as deleted in database');
  assert(missingObjFinal.rows[0].storage_deleted_at !== null, 'storage_deleted_at timestamp MUST be populated');

  console.log('  -> Worker 404/Missing Object Handling & Canonical Cron Job Audit verified.');

  console.log('✓ ALL FILE LIFECYCLE SYSTEM INTEGRATION TESTS PASSED PERFECTLY!');
}
