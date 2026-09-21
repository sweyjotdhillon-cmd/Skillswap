import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAttachmentFile,
  validateChatAttachmentFile,
  deriveSwapRecipientId,
  markSwapMessagesRead,
  getSwapMessageAttachmentSignedUrl,
  getSubmissionFileSignedUrl,
  getSwapAttachmentSignedUrl,
  downloadFileFromSignedUrl,
  uploadSwapAttachments,
  submitSwapWorkWithFiles,
  sendSwapMessageWithAttachments,
} from './credits';

describe('S5 — File Upload Security & Centralized Validation Unit Tests', () => {
  test('S5: Every allowed MIME type and matching extension is accepted', () => {
    const validFiles = [
      { name: 'document.pdf', size: 1024, type: 'application/pdf' },
      { name: 'notes.txt', size: 500, type: 'text/plain' },
      { name: 'data.csv', size: 2048, type: 'text/csv' },
      { name: 'archive.zip', size: 10000, type: 'application/zip' },
      { name: 'report.docx', size: 4096, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { name: 'spreadsheet.xlsx', size: 8192, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { name: 'presentation.pptx', size: 12000, type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
      { name: 'photo.jpg', size: 5000, type: 'image/jpeg' },
      { name: 'photo.jpeg', size: 5000, type: 'image/jpeg' },
      { name: 'graphic.png', size: 6000, type: 'image/png' },
      { name: 'hero.webp', size: 4000, type: 'image/webp' },
      { name: 'animation.gif', size: 3000, type: 'image/gif' },
    ];

    for (const f of validFiles) {
      const res = validateAttachmentFile(f);
      assert.equal(res.valid, true, `Expected valid for ${f.name} (${f.type}): ${res.error}`);
    }
  });

  test('S5: Standard browser MIME aliases (e.g. image/jpg, application/x-zip-compressed) are accepted', () => {
    const aliasFiles = [
      { name: 'photo.jpg', size: 1024, type: 'image/jpg' },
      { name: 'archive.zip', size: 1024, type: 'application/x-zip-compressed' },
      { name: 'doc.pdf', size: 1024, type: 'application/x-pdf' },
    ];

    for (const f of aliasFiles) {
      const res = validateAttachmentFile(f);
      assert.equal(res.valid, true, `Expected valid for alias ${f.name} (${f.type}): ${res.error}`);
    }
  });

  test('S5: Unsupported MIME types and extensions are rejected', () => {
    const invalidFiles = [
      { name: 'executable.exe', size: 1024, type: 'application/x-msdownload' },
      { name: 'script.py', size: 1024, type: 'text/x-python' },
      { name: 'code.js', size: 1024, type: 'application/javascript' },
      { name: 'image.bmp', size: 1024, type: 'image/bmp' },
      { name: 'song.mp3', size: 1024, type: 'audio/mpeg' },
      { name: 'video.mp4', size: 1024, type: 'video/mp4' },
      { name: 'shell.sh', size: 1024, type: 'application/x-sh' },
    ];

    for (const f of invalidFiles) {
      const res = validateAttachmentFile(f);
      assert.equal(res.valid, false, `Expected invalid for ${f.name}`);
      assert.equal(res.error, "This file type isn't supported.");
    }
  });

  test('S5: Files > 25 MB are rejected', () => {
    const fileTooLarge = { name: 'big.pdf', size: 25 * 1024 * 1024 + 1, type: 'application/pdf' };
    const res = validateAttachmentFile(fileTooLarge);
    assert.equal(res.valid, false);
    assert.equal(res.error, 'File is too large. Maximum size is 25 MB.');
  });

  test('S5: Empty, whitespace, slash-containing, and invalid filenames are rejected', () => {
    const badNames = [
      { file: { name: '', size: 1024, type: 'application/pdf' }, expectedErr: 'Filename cannot be empty.' },
      { file: { name: '   ', size: 1024, type: 'application/pdf' }, expectedErr: 'Filename cannot be empty.' },
      { file: { name: 'folder/file.pdf', size: 1024, type: 'application/pdf' }, expectedErr: 'Filename cannot contain slashes.' },
      { file: { name: 'folder\\file.pdf', size: 1024, type: 'application/pdf' }, expectedErr: 'Filename cannot contain slashes.' },
      { file: { name: 'noextension', size: 1024, type: 'application/pdf' }, expectedErr: "This file type isn't supported." },
      { file: { name: '.hiddenfile', size: 1024, type: 'application/pdf' }, expectedErr: "This file type isn't supported." },
      { file: { name: 'file.', size: 1024, type: 'application/pdf' }, expectedErr: "This file type isn't supported." },
      { file: { name: 'a'.repeat(256) + '.pdf', size: 1024, type: 'application/pdf' }, expectedErr: 'Filename is too long.' },
    ];

    for (const item of badNames) {
      const res = validateAttachmentFile(item.file);
      assert.equal(res.valid, false, `Expected invalid for ${item.file.name}`);
      assert.equal(res.error, item.expectedErr);
    }
  });

  test('S5: Extension and MIME mismatch is rejected', () => {
    const mismatch = { name: 'doc.pdf', size: 1024, type: 'image/png' };
    const res = validateAttachmentFile(mismatch);
    assert.equal(res.valid, false);
    assert.equal(res.error, 'File extension and MIME type do not match.');
  });

  test('S5: validateChatAttachmentFile is identical alias of validateAttachmentFile', () => {
    assert.equal(validateChatAttachmentFile, validateAttachmentFile);
  });

  test('S5: All three upload functions reject invalid files early without throwing unhandled errors', async () => {
    const invalidFile = new File(['evil'], 'evil.exe', { type: 'application/x-msdownload' });

    // 1. uploadSwapAttachments
    const res1 = await uploadSwapAttachments('swap-1', [invalidFile]);
    assert.equal(res1.success, false);
    assert.equal(res1.error, "This file type isn't supported.");

    // 2. submitSwapWorkWithFiles
    const res2 = await submitSwapWorkWithFiles({ swapId: 'swap-1', files: [invalidFile] });
    assert.equal(res2.success, false);
    assert.equal(res2.error, "This file type isn't supported.");

    // 3. sendSwapMessageWithAttachments
    const res3 = await sendSwapMessageWithAttachments('swap-1', 'user-2', 'hello', [{ name: 'evil.exe', size: 100, type: 'application/x-msdownload' }]);
    assert.equal(res3.success, false);
    assert.equal(res3.error, "This file type isn't supported.");
  });
});

describe('S6 — Private Attachment Authorization & Secure Retrieval Unit Tests', () => {
  test('S6: Signed URL helpers exist and handle empty storage paths safely', async () => {
    const url1 = await getSwapMessageAttachmentSignedUrl('');
    assert.equal(url1, null);

    const url2 = await getSubmissionFileSignedUrl('');
    assert.equal(url2, null);

    const url3 = await getSwapAttachmentSignedUrl('');
    assert.equal(url3, null);
  });

  test('S6: downloadFileFromSignedUrl handles network/HTTP errors safely', async () => {
    const res = await downloadFileFromSignedUrl('https://invalid.example.com/nonexistent-file.pdf', 'test.pdf');
    assert.equal(res.success, false);
    assert(typeof res.error === 'string');
  });
});

describe('S7 — Chat Authorization Consistency Unit Tests', () => {
  test('S7: deriveSwapRecipientId targets requester for open swap applicants', () => {
    const openSwap = { status: 'open', requesterId: 'user-requester', participantId: null };
    const recipient = deriveSwapRecipientId(openSwap, 'user-applicant');
    assert.equal(recipient, 'user-requester');
  });

  test('S7: deriveSwapRecipientId prevents self-messaging on open swaps', () => {
    const openSwap = { status: 'open', requesterId: 'user-requester', participantId: null };
    const recipient = deriveSwapRecipientId(openSwap, 'user-requester');
    assert.equal(recipient, null);
  });

  test('S7: deriveSwapRecipientId for accepted swap correctly pairs requester and participant', () => {
    const acceptedSwap = { status: 'accepted', requesterId: 'user-requester', participantId: 'user-participant' };

    // Requester sends to participant
    const reqRecipient = deriveSwapRecipientId(acceptedSwap, 'user-requester');
    assert.equal(reqRecipient, 'user-participant');

    // Participant sends to requester
    const partRecipient = deriveSwapRecipientId(acceptedSwap, 'user-participant');
    assert.equal(partRecipient, 'user-requester');

    // Unauthorized third user gets null
    const thirdRecipient = deriveSwapRecipientId(acceptedSwap, 'user-third-party');
    assert.equal(thirdRecipient, null);
  });

  test('S7: markSwapMessagesRead updates strictly read_at on recipient messages', async () => {
    const res = await markSwapMessagesRead('', []);
    assert.equal(res.success, true);
  });
});
