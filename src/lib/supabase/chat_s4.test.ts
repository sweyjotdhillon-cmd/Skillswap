import {
  sendSwapMessage,
  sendSwapMessageWithAttachments,
  getSwapMessages,
  validateChatAttachmentFile,
  deriveSwapRecipientId,
} from './credits';
import type { Swap } from '../../types/swap';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runChatS4RegressionTests() {
  console.log('--- Starting S4 Open-Swap Recipient Authorization Regression Tests ---');

  const openSwap: Swap = {
    id: 'open-swap-1',
    requesterId: 'requester-alice-100',
    participantId: null,
    topic: 'Web Design Consultation',
    description: 'Looking for expert web design feedback',
    requirements: 'Figma review',
    additionalMessage: null,
    creditAmount: 20,
    tags: ['design'],
    status: 'open',
    submittedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const activeSwap: Swap = {
    id: 'active-swap-2',
    requesterId: 'requester-alice-100',
    participantId: 'participant-bob-200',
    topic: 'Full-Stack Code Review',
    description: 'Code review for React and Supabase',
    requirements: 'GitHub PR review',
    additionalMessage: null,
    creditAmount: 30,
    tags: ['coding'],
    status: 'accepted',
    submittedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 1. OPEN SWAP RECIPIENT DERIVATION TESTS
  // Open swap visitor/applicant always targets the swap requester
  const applicantUserId = 'applicant-charlie-300';
  const openSwapRecipientForApplicant = deriveSwapRecipientId(openSwap, applicantUserId);
  assert(
    openSwapRecipientForApplicant === 'requester-alice-100',
    'Open swap applicant recipient is strictly the swap requester'
  );

  // Open swap requester targeting themselves (no applicant message yet) gets null
  const openSwapRecipientForRequesterSelf = deriveSwapRecipientId(openSwap, 'requester-alice-100');
  assert(
    openSwapRecipientForRequesterSelf === null,
    'Open swap requester cannot self-message when no applicant message exists'
  );

  // Open swap requester responding to an applicant message targets that applicant
  const openSwapRecipientForRequesterResponse = deriveSwapRecipientId(
    openSwap,
    'requester-alice-100',
    'applicant-charlie-300'
  );
  assert(
    openSwapRecipientForRequesterResponse === 'applicant-charlie-300',
    'Open swap requester correctly targets applicant when applicant message exists'
  );

  // Arbitrary third-party user on active swap is blocked from deriving a recipient
  const arbitraryThirdPartyUser = 'unrelated-user-999';
  const thirdPartyRecipient = deriveSwapRecipientId(activeSwap, arbitraryThirdPartyUser);
  assert(
    thirdPartyRecipient === null,
    'Arbitrary third-party user cannot select recipient on active swap'
  );

  // 2. ACCEPTED / SUBMITTED / COMPLETED SWAP RECIPIENT DERIVATION TESTS
  // Accepted swap requester targets participant
  const requesterRecipient = deriveSwapRecipientId(activeSwap, 'requester-alice-100');
  assert(
    requesterRecipient === 'participant-bob-200',
    'Accepted swap requester recipient is strictly the participant'
  );

  // Accepted swap participant targets requester
  const participantRecipient = deriveSwapRecipientId(activeSwap, 'participant-bob-200');
  assert(
    participantRecipient === 'requester-alice-100',
    'Accepted swap participant recipient is strictly the requester'
  );

  // Self-recipient prevention check
  const selfTargetTest = deriveSwapRecipientId(activeSwap, 'requester-alice-100');
  const selfBlocked = selfTargetTest === 'requester-alice-100' ? null : selfTargetTest;
  assert(
    selfBlocked === 'participant-bob-200',
    'Self-messaging is strictly prevented'
  );

  // 3. CANONICAL RPC ROUTING & ATTACHMENT FUNCTIONALITY
  assert(typeof sendSwapMessage === 'function', 'sendSwapMessage is exported');
  assert(typeof sendSwapMessageWithAttachments === 'function', 'sendSwapMessageWithAttachments is exported');
  assert(typeof getSwapMessages === 'function', 'getSwapMessages is exported');

  // Verify attachment file pre-validation
  const validFile = { name: 'design_brief.pdf', size: 1024 * 1024, type: 'application/pdf' };
  const validation = validateChatAttachmentFile(validFile);
  assert(validation.valid === true, 'Valid PDF attachment passes pre-upload validation');

  const invalidFile = { name: 'malicious.exe', size: 1024, type: 'application/x-msdownload' };
  const invalidValidation = validateChatAttachmentFile(invalidFile);
  assert(invalidValidation.valid === false, 'Invalid file extension is rejected');

  console.log('✓ All S4 Open-Swap Recipient Authorization regression tests passed!');
}

// Run if executed directly
if (import.meta.url.endsWith('chat_s4.test.ts') || process.argv[1]?.endsWith('chat_s4.test.ts')) {
  runChatS4RegressionTests();
}
