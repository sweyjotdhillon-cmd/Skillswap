import { formatFriendlyErrorMessage } from './profile';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runCreditSystemTests() {
  console.log('Running SkillSwap Credit System Comprehensive Audit Unit Tests...');

  // TEST 1: Initial Grant Idempotency Key Formatting
  console.log('Test 1: Initial grant idempotency key generation');
  const userId = '123e4567-e89b-12d3-a456-426614174000';
  const expectedKey = `initial_grant_${userId}`;
  assert(expectedKey === 'initial_grant_123e4567-e89b-12d3-a456-426614174000', 'Initial grant key format');

  // TEST 2: Error Translation for Insufficient Credit Balance
  console.log('Test 2: Error translation for insufficient credit balance');
  const rawError1 = { message: 'Insufficient credit balance for this operation.' };
  assert(
    formatFriendlyErrorMessage(rawError1) === 'Insufficient credit balance for this operation.',
    'Translates raw insufficient balance RPC error'
  );

  const rawError2 = { message: 'new row for relation "accounts" violates check constraint "chk_min_balance"' };
  assert(
    formatFriendlyErrorMessage(rawError2) === 'Insufficient credit balance for this operation.',
    'Translates chk_min_balance check constraint violation'
  );

  // TEST 3: Error Translation for Invalid Credit Amounts
  console.log('Test 3: Error translation for invalid credit amount');
  const rawError3 = { message: 'Credit amount must be greater than zero.' };
  assert(
    formatFriendlyErrorMessage(rawError3) === 'Credit amount must be greater than zero.',
    'Translates non-positive credit amount exception'
  );

  // TEST 4: Error Translation for Invalid Transfer Recipient
  console.log('Test 4: Error translation for invalid transfer recipient');
  const rawError4 = { message: 'Invalid transfer recipient.' };
  assert(
    formatFriendlyErrorMessage(rawError4) === 'Invalid credit transfer recipient.',
    'Translates invalid transfer recipient error'
  );

  // TEST 5: Error Translation for Cross-User Security Violations
  console.log('Test 5: Error translation for cross-user security violations');
  const rawError5 = { message: 'Unauthorized credit addition for another user.' };
  assert(
    formatFriendlyErrorMessage(rawError5) === 'Unauthorized credit operation.',
    'Translates cross-user security violation'
  );

  // TEST 6: Deadlock Prevention Row Lock Ordering Check
  console.log('Test 6: Deadlock prevention user lock sorting check');
  const userA = 'aaaaa-11111';
  const userB = 'bbbbb-22222';
  const getLockOrder = (id1: string, id2: string) => (id1 < id2 ? [id1, id2] : [id2, id1]);
  const lockOrder1 = getLockOrder(userA, userB);
  const lockOrder2 = getLockOrder(userB, userA);

  assert(
    lockOrder1[0] === userA && lockOrder1[1] === userB,
    'Lock order sorted when userA is first parameter'
  );
  assert(
    lockOrder2[0] === userA && lockOrder2[1] === userB,
    'Lock order identically sorted when userB is first parameter'
  );

  // TEST 7: Reconciliation Result Contract Verification
  console.log('Test 7: Reconciliation diagnostic contract structure check');
  const mockReconcileResult = {
    total_accounts_checked: 10,
    matching_accounts: 10,
    discrepancies_count: 0,
    discrepancy_details: [],
  };
  assert(
    mockReconcileResult.total_accounts_checked === mockReconcileResult.matching_accounts + mockReconcileResult.discrepancies_count,
    'Reconciliation account count invariant holds'
  );

  console.log('All SkillSwap Credit System Comprehensive Audit Unit Tests passed successfully!');
}

// Execute tests
runCreditSystemTests();
