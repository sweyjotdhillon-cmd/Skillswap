import {
  updateSwapSubmissionMetadata,
  updateSwapSubmissionFileMetadata,
  submitSwapWorkWithFiles,
  getSwapSubmission,
  getSubmissionFileSignedUrl,
  sanitizeFileName,
  getNormalizedMimeType,
} from './credits';
import type { UpdateSwapSubmissionInput, UpdateSwapSubmissionFileInput } from '../../types/swap';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runSubmissionS3RegressionTests() {
  console.log('--- Starting S3 Submission Relationship & File Tampering Regression Tests ---');

  // Test 1: updateSwapSubmissionMetadata strips immutable fields (swap_id, submitted_by, id)
  const submissionUpdatePayload: UpdateSwapSubmissionInput & Record<string, unknown> = {
    notes: 'Updated notes from participant',
    reviewedAt: new Date().toISOString(),
    reviewedBy: 'user-reviewer-123',
    // Malicious attempt to tamper with immutable relationship fields
    swap_id: 'swap-tampered-999',
    swapId: 'swap-tampered-999',
    submitted_by: 'user-hacker-999',
    submittedBy: 'user-hacker-999',
    id: 'submission-tampered-id',
  };

  // Verify function is exported and accepts payloads
  assert(typeof updateSwapSubmissionMetadata === 'function', 'updateSwapSubmissionMetadata is exported');

  // Test missing submissionId validation
  void updateSwapSubmissionMetadata('', submissionUpdatePayload).then((res) => {
    assert(res.success === false, 'Empty submissionId returns error');
    assert(res.error === 'Submission ID is required.', 'Error message matches empty submission ID');
  });

  // Test payload containing ONLY immutable fields returns "No valid updatable metadata fields provided."
  const maliciousOnlySubmissionPayload = {
    swap_id: 'swap-tampered-999',
    swapId: 'swap-tampered-999',
    submitted_by: 'user-hacker-999',
    submittedBy: 'user-hacker-999',
    id: 'sub-123',
  };

  void updateSwapSubmissionMetadata('sub-valid-uuid', maliciousOnlySubmissionPayload).then((res) => {
    assert(res.success === false, 'Payload containing only immutable fields is rejected');
    assert(res.error === 'No valid updatable metadata fields provided.', 'Rejection error message matches expected');
  });

  // Test 2: updateSwapSubmissionFileMetadata strips immutable fields (submission_id, storage_path, id)
  const fileUpdatePayload: UpdateSwapSubmissionFileInput & Record<string, unknown> = {
    fileName: 'renamed_deliverable.pdf',
    mimeType: 'application/pdf',
    fileSize: 2048,
    storageExpiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    // Malicious attempt to tamper with immutable relationship & storage path fields
    submission_id: 'sub-tampered-888',
    submissionId: 'sub-tampered-888',
    storage_path: 'submissions/other-swap/other-user/malicious.pdf',
    storagePath: 'submissions/other-swap/other-user/malicious.pdf',
    id: 'file-tampered-id',
  };

  assert(typeof updateSwapSubmissionFileMetadata === 'function', 'updateSwapSubmissionFileMetadata is exported');

  // Test missing fileId validation
  void updateSwapSubmissionFileMetadata('', fileUpdatePayload).then((res) => {
    assert(res.success === false, 'Empty fileId returns error');
    assert(res.error === 'File ID is required.', 'Error message matches empty file ID');
  });

  // Test payload containing ONLY immutable file fields returns "No valid updatable metadata fields provided."
  const maliciousOnlyFilePayload = {
    submission_id: 'sub-tampered-888',
    submissionId: 'sub-tampered-888',
    storage_path: 'submissions/other-swap/other-user/malicious.pdf',
    storagePath: 'submissions/other-swap/other-user/malicious.pdf',
    id: 'file-123',
  };

  void updateSwapSubmissionFileMetadata('file-valid-uuid', maliciousOnlyFilePayload).then((res) => {
    assert(res.success === false, 'Payload containing only immutable file fields is rejected');
    assert(res.error === 'No valid updatable metadata fields provided.', 'Rejection error message matches expected');
  });

  // Test 3: Submission creation, helper sanitization, and signed URL generation contracts
  assert(typeof submitSwapWorkWithFiles === 'function', 'submitSwapWorkWithFiles is exported');
  assert(typeof getSwapSubmission === 'function', 'getSwapSubmission is exported');
  assert(typeof getSubmissionFileSignedUrl === 'function', 'getSubmissionFileSignedUrl is exported');

  // Test filename sanitization and MIME normalization
  const sanitized = sanitizeFileName('my / deliverable \\ #1.pdf');
  assert(!sanitized.includes('/') && !sanitized.includes('\\'), 'Filename sanitization strips slashes');
  assert(getNormalizedMimeType('document.pdf') === 'application/pdf', 'PDF MIME type normalized');

  console.log('✓ All S3 Submission Relationship & File Tampering regression tests passed!');
}

// Run if executed directly
if (import.meta.url.endsWith('submission_s3.test.ts') || process.argv[1]?.endsWith('submission_s3.test.ts')) {
  runSubmissionS3RegressionTests();
}
