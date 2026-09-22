import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAttachmentFile,
  validateChatAttachmentFile,
  MAX_ATTACHMENT_FILE_SIZE,
  CANONICAL_ATTACHMENT_MIME_TYPES,
} from './fileValidation';

describe('Canonical File Validator Unit Tests (C4 & C5)', () => {
  describe('Valid Files', () => {
    test('Valid PDF file is accepted', () => {
      const file = { name: 'document.pdf', size: 1024 * 1024, type: 'application/pdf' };
      const res = validateAttachmentFile(file);
      assert.equal(res.valid, true);
      assert.equal(res.error, undefined);
    });

    test('Valid PNG file is accepted', () => {
      const file = { name: 'image.png', size: 500 * 1024, type: 'image/png' };
      assert.equal(validateAttachmentFile(file).valid, true);
    });

    test('Valid JPEG/JPG file is accepted (including browser alias image/jpg)', () => {
      const fileJpg = { name: 'photo.jpg', size: 500 * 1024, type: 'image/jpeg' };
      assert.equal(validateAttachmentFile(fileJpg).valid, true);

      const fileJpeg = { name: 'photo.jpeg', size: 500 * 1024, type: 'image/jpeg' };
      assert.equal(validateAttachmentFile(fileJpeg).valid, true);

      const fileJpgAlias = { name: 'photo.jpg', size: 500 * 1024, type: 'image/jpg' };
      assert.equal(validateAttachmentFile(fileJpgAlias).valid, true);
    });

    test('Valid WEBP file is accepted', () => {
      const file = { name: 'graphic.webp', size: 200 * 1024, type: 'image/webp' };
      assert.equal(validateAttachmentFile(file).valid, true);
    });

    test('Valid GIF file is accepted', () => {
      const file = { name: 'animation.gif', size: 300 * 1024, type: 'image/gif' };
      assert.equal(validateAttachmentFile(file).valid, true);
    });

    test('Valid TXT file is accepted', () => {
      const file = { name: 'notes.txt', size: 10 * 1024, type: 'text/plain' };
      assert.equal(validateAttachmentFile(file).valid, true);
    });

    test('Valid CSV file is accepted', () => {
      const file = { name: 'data.csv', size: 50 * 1024, type: 'text/csv' };
      assert.equal(validateAttachmentFile(file).valid, true);
    });

    test('Valid ZIP file is accepted (including browser alias application/x-zip-compressed)', () => {
      const fileZip = { name: 'archive.zip', size: 2 * 1024 * 1024, type: 'application/zip' };
      assert.equal(validateAttachmentFile(fileZip).valid, true);

      const fileZipAlias = { name: 'archive.zip', size: 2 * 1024 * 1024, type: 'application/x-zip-compressed' };
      assert.equal(validateAttachmentFile(fileZipAlias).valid, true);
    });

    test('Valid DOCX file is accepted', () => {
      const file = {
        name: 'report.docx',
        size: 100 * 1024,
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
      assert.equal(validateAttachmentFile(file).valid, true);
    });

    test('Valid XLSX file is accepted', () => {
      const file = {
        name: 'budget.xlsx',
        size: 150 * 1024,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
      assert.equal(validateAttachmentFile(file).valid, true);
    });

    test('Valid PPTX file is accepted', () => {
      const file = {
        name: 'presentation.pptx',
        size: 500 * 1024,
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      };
      assert.equal(validateAttachmentFile(file).valid, true);
    });

    test('File exactly at 25 MiB limit is accepted', () => {
      const fileExact = { name: 'big_archive.zip', size: MAX_ATTACHMENT_FILE_SIZE, type: 'application/zip' };
      assert.equal(validateAttachmentFile(fileExact).valid, true);
    });
  });

  describe('Invalid Files', () => {
    test('Unsupported MIME type or extension is rejected', () => {
      const fileExe = { name: 'malware.exe', size: 1024, type: 'application/x-msdownload' };
      const resExe = validateAttachmentFile(fileExe);
      assert.equal(resExe.valid, false);
      assert.equal(resExe.error, "This file type isn't supported.");

      const filePy = { name: 'script.py', size: 1024, type: 'text/x-python' };
      const resPy = validateAttachmentFile(filePy);
      assert.equal(resPy.valid, false);
      assert.equal(resPy.error, "This file type isn't supported.");
    });

    test('JavaScript and shell files are rejected', () => {
      const fileJs = { name: 'app.js', size: 1024, type: 'text/javascript' };
      assert.equal(validateAttachmentFile(fileJs).valid, false);

      const fileSh = { name: 'run.sh', size: 1024, type: 'application/x-sh' };
      assert.equal(validateAttachmentFile(fileSh).valid, false);
    });

    test('HTML and SVG files are rejected (not in attachment allowlist)', () => {
      const fileHtml = { name: 'index.html', size: 1024, type: 'text/html' };
      assert.equal(validateAttachmentFile(fileHtml).valid, false);

      const fileSvg = { name: 'icon.svg', size: 1024, type: 'image/svg+xml' };
      assert.equal(validateAttachmentFile(fileSvg).valid, false);
    });

    test('MIME and extension mismatch is rejected', () => {
      // File named .pdf but browser MIME says image/png
      const fileMismatch = { name: 'fake.pdf', size: 1024, type: 'image/png' };
      const res = validateAttachmentFile(fileMismatch);
      assert.equal(res.valid, false);
      assert.equal(res.error, 'File extension and MIME type do not match.');
    });

    test('File over 25 MiB is rejected', () => {
      const fileTooLarge = { name: 'huge_document.pdf', size: MAX_ATTACHMENT_FILE_SIZE + 1, type: 'application/pdf' };
      const res = validateAttachmentFile(fileTooLarge);
      assert.equal(res.valid, false);
      assert.equal(res.error, 'File is too large. Maximum size is 25 MB.');
    });

    test('Empty file (0 bytes) is rejected', () => {
      const fileEmpty = { name: 'empty.pdf', size: 0, type: 'application/pdf' };
      const res = validateAttachmentFile(fileEmpty);
      assert.equal(res.valid, false);
      assert.equal(res.error, 'File cannot be empty.');
    });

    test('Filename containing / or \\ is rejected', () => {
      const fileSlash1 = { name: 'subfolder/doc.pdf', size: 1024, type: 'application/pdf' };
      const res1 = validateAttachmentFile(fileSlash1);
      assert.equal(res1.valid, false);
      assert.equal(res1.error, 'Filename cannot contain slashes.');

      const fileSlash2 = { name: 'subfolder\\doc.pdf', size: 1024, type: 'application/pdf' };
      const res2 = validateAttachmentFile(fileSlash2);
      assert.equal(res2.valid, false);
      assert.equal(res2.error, 'Filename cannot contain slashes.');
    });

    test('Empty filename or whitespace-only filename is rejected', () => {
      const fileEmptyName = { name: '', size: 1024, type: 'application/pdf' };
      assert.equal(validateAttachmentFile(fileEmptyName).valid, false);

      const fileWhitespace = { name: '   ', size: 1024, type: 'application/pdf' };
      assert.equal(validateAttachmentFile(fileWhitespace).valid, false);
    });

    test('Filename over 255 characters is rejected', () => {
      const longName = 'a'.repeat(252) + '.pdf'; // 256 chars
      const fileLong = { name: longName, size: 1024, type: 'application/pdf' };
      const res = validateAttachmentFile(fileLong);
      assert.equal(res.valid, false);
      assert.equal(res.error, 'Filename is too long.');
    });

    test('Null / undefined / malformed input is handled gracefully', () => {
      assert.equal(validateAttachmentFile(null as unknown as undefined).valid, false);
      assert.equal(validateAttachmentFile(undefined).valid, false);
      assert.equal(validateAttachmentFile({} as unknown as undefined).valid, false);
    });
  });

  describe('Alias and Export Consistency', () => {
    test('validateChatAttachmentFile is identical alias of validateAttachmentFile', () => {
      assert.equal(validateChatAttachmentFile, validateAttachmentFile);
    });

    test('CANONICAL_ATTACHMENT_MIME_TYPES contains exactly 11 allowed MIME types', () => {
      assert.equal(CANONICAL_ATTACHMENT_MIME_TYPES.size, 11);
    });
  });
});
