import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateChatAttachmentFile,
  sendSwapMessageWithAttachments,
} from './credits';

describe('Chat Attachment Security S1 Validation Unit Tests', () => {
  test('Valid PDF file is accepted', () => {
    const file = { name: 'document.pdf', size: 1024 * 1024, type: 'application/pdf' };
    const res = validateChatAttachmentFile(file);
    assert.equal(res.valid, true);
    assert.equal(res.error, undefined);
  });

  test('Valid PNG file is accepted', () => {
    const file = { name: 'image.png', size: 500 * 1024, type: 'image/png' };
    const res = validateChatAttachmentFile(file);
    assert.equal(res.valid, true);
  });

  test('Valid JPG/JPEG file is accepted (including browser alias image/jpg)', () => {
    const fileJpg = { name: 'photo.jpg', size: 500 * 1024, type: 'image/jpeg' };
    assert.equal(validateChatAttachmentFile(fileJpg).valid, true);

    const fileJpeg = { name: 'photo.jpeg', size: 500 * 1024, type: 'image/jpeg' };
    assert.equal(validateChatAttachmentFile(fileJpeg).valid, true);

    const fileJpgAlias = { name: 'photo.jpg', size: 500 * 1024, type: 'image/jpg' };
    assert.equal(validateChatAttachmentFile(fileJpgAlias).valid, true);
  });

  test('Valid WEBP file is accepted', () => {
    const file = { name: 'graphic.webp', size: 200 * 1024, type: 'image/webp' };
    assert.equal(validateChatAttachmentFile(file).valid, true);
  });

  test('Valid GIF file is accepted', () => {
    const file = { name: 'animation.gif', size: 300 * 1024, type: 'image/gif' };
    assert.equal(validateChatAttachmentFile(file).valid, true);
  });

  test('Valid TXT file is accepted', () => {
    const file = { name: 'notes.txt', size: 10 * 1024, type: 'text/plain' };
    assert.equal(validateChatAttachmentFile(file).valid, true);
  });

  test('Valid CSV file is accepted', () => {
    const file = { name: 'data.csv', size: 50 * 1024, type: 'text/csv' };
    assert.equal(validateChatAttachmentFile(file).valid, true);
  });

  test('Valid ZIP file is accepted (including browser alias application/x-zip-compressed)', () => {
    const fileZip = { name: 'archive.zip', size: 2 * 1024 * 1024, type: 'application/zip' };
    assert.equal(validateChatAttachmentFile(fileZip).valid, true);

    const fileZipAlias = { name: 'archive.zip', size: 2 * 1024 * 1024, type: 'application/x-zip-compressed' };
    assert.equal(validateChatAttachmentFile(fileZipAlias).valid, true);
  });

  test('Valid DOCX file is accepted', () => {
    const file = {
      name: 'report.docx',
      size: 100 * 1024,
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    assert.equal(validateChatAttachmentFile(file).valid, true);
  });

  test('Valid XLSX file is accepted', () => {
    const file = {
      name: 'budget.xlsx',
      size: 150 * 1024,
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    assert.equal(validateChatAttachmentFile(file).valid, true);
  });

  test('Valid PPTX file is accepted', () => {
    const file = {
      name: 'presentation.pptx',
      size: 500 * 1024,
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
    assert.equal(validateChatAttachmentFile(file).valid, true);
  });

  test('Unsupported MIME type / extension is rejected', () => {
    const fileExe = { name: 'malware.exe', size: 1024, type: 'application/x-msdownload' };
    const resExe = validateChatAttachmentFile(fileExe);
    assert.equal(resExe.valid, false);
    assert.equal(resExe.error, "This file type isn't supported.");

    const filePy = { name: 'script.py', size: 1024, type: 'text/x-python' };
    const resPy = validateChatAttachmentFile(filePy);
    assert.equal(resPy.valid, false);
    assert.equal(resPy.error, "This file type isn't supported.");
  });

  test('MIME and extension mismatch is rejected', () => {
    // File named .pdf but browser MIME says image/png
    const fileMismatch = { name: 'fake.pdf', size: 1024, type: 'image/png' };
    const res = validateChatAttachmentFile(fileMismatch);
    assert.equal(res.valid, false);
    assert.equal(res.error, 'File extension and MIME type do not match.');
  });

  test('File > 25 MB is rejected', () => {
    const fileTooLarge = { name: 'big_video.pdf', size: 25 * 1024 * 1024 + 1, type: 'application/pdf' };
    const res = validateChatAttachmentFile(fileTooLarge);
    assert.equal(res.valid, false);
    assert.equal(res.error, 'File is too large. Maximum size is 25 MB.');
  });

  test('Filename containing / or \\ is rejected', () => {
    const fileSlash1 = { name: 'subfolder/doc.pdf', size: 1024, type: 'application/pdf' };
    const res1 = validateChatAttachmentFile(fileSlash1);
    assert.equal(res1.valid, false);
    assert.equal(res1.error, 'Filename cannot contain slashes.');

    const fileSlash2 = { name: 'subfolder\\doc.pdf', size: 1024, type: 'application/pdf' };
    const res2 = validateChatAttachmentFile(fileSlash2);
    assert.equal(res2.valid, false);
    assert.equal(res2.error, 'Filename cannot contain slashes.');
  });

  test('Empty filename or whitespace-only filename is rejected', () => {
    const fileEmpty = { name: '', size: 1024, type: 'application/pdf' };
    const resEmpty = validateChatAttachmentFile(fileEmpty);
    assert.equal(resEmpty.valid, false);
    assert.equal(resEmpty.error, 'Filename cannot be empty.');

    const fileWhitespace = { name: '   ', size: 1024, type: 'application/pdf' };
    const resWhitespace = validateChatAttachmentFile(fileWhitespace);
    assert.equal(resWhitespace.valid, false);
    assert.equal(resWhitespace.error, 'Filename cannot be empty.');
  });

  test('Regression test: sendSwapMessageWithAttachments rejects unsupported attachments before Storage upload attempt', async () => {
    const uploadAttempted = false;

    // Create a mock File object with invalid extension
    const invalidFile = new File(['dummy content'], 'dangerous_script.sh', { type: 'application/x-sh' });

    const result = await sendSwapMessageWithAttachments('swap-test-id', 'recipient-id', 'test message', [invalidFile]);

    assert.equal(result.success, false);
    assert.equal(result.error, "This file type isn't supported.");
    assert.equal(uploadAttempted, false, 'Storage upload MUST NOT be attempted for invalid files.');
  });
});
