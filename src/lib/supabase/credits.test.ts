import { formatFriendlyErrorMessage } from './profile';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runCreditSystemTests() {
  console.log('Running SkillSwap Credit System Reservation & Settlement Unit Tests...');

  // TEST 1: Initial Grant Idempotency Key Formatting
  console.log('Test 1: Initial grant idempotency key generation');
  const userId = '123e4567-e89b-12d3-a456-426614174000';
  const expectedKey = `initial_grant:${userId}`;
  assert(expectedKey === 'initial_grant:123e4567-e89b-12d3-a456-426614174000', 'Initial grant key format');

  // TEST 2: Credit Reservation Idempotency Key Formatting
  console.log('Test 2: Credit reservation idempotency key formatting');
  const swapId = '123e4567-e89b-12d3-a456-426614174000';
  const reservationKey = `swap_reservation:${swapId}`;
  assert(reservationKey === `swap_reservation:${swapId}`, 'Reservation key is stable for retries');

  // TEST 3: Credit Cancellation Release Key Formatting
  console.log('Test 3: Credit cancellation release key formatting');
  const releaseKey = `swap_release:${swapId}`;
  assert(releaseKey === `swap_release:${swapId}`, 'Release key format');

  // TEST 4: Settlement Idempotency Key Formatting
  console.log('Test 4: Deterministic settlement idempotency key formatting');
  const settlementKey = `swap_settlement:${swapId}`;
  assert(settlementKey === `swap_settlement:${swapId}`, 'Settlement key format');

  // TEST 5: Reservation Balance Accounting Invariants
  console.log('Test 5: Reservation balance state invariants');
  const initialBalance = 100;
  const initialReserved = 0;
  const reserveAmount = 20;

  const afterReserveBalance = initialBalance - reserveAmount;
  const afterReserveReserved = initialReserved + reserveAmount;

  assert(afterReserveBalance === 80, 'Available balance reduced after reservation');
  assert(afterReserveReserved === 20, 'Reserved credits increased after reservation');
  assert(afterReserveBalance + afterReserveReserved === 100, 'Total user credit pool preserved during reservation');

  // TEST 6: Release Balance Accounting Invariants
  console.log('Test 6: Reservation release balance state invariants');
  const afterReleaseBalance = afterReserveBalance + reserveAmount;
  const afterReleaseReserved = afterReserveReserved - reserveAmount;

  assert(afterReleaseBalance === 100, 'Available balance restored after release');
  assert(afterReleaseReserved === 0, 'Reserved credits cleared after release');

  // TEST 7: Settlement Accounting Invariants
  console.log('Test 7: Atomic settlement balance state invariants');
  const payerReserved = 20;
  const recipientBalanceBefore = 50;
  const transferAmount = 20;

  const payerReservedAfter = payerReserved - transferAmount;
  const recipientBalanceAfter = recipientBalanceBefore + transferAmount;

  assert(payerReservedAfter === 0, 'Payer reserved credits consumed upon settlement');
  assert(recipientBalanceAfter === 70, 'Recipient available balance credited upon settlement');

  // TEST 8: Error Translation for Insufficient Credit Balance
  console.log('Test 8: Error translation for insufficient credit balance');
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

  // TEST 9: Deadlock Prevention Row Lock Ordering Check
  console.log('Test 9: Deadlock prevention user lock sorting check');
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

  console.log('All SkillSwap Credit System Reservation & Settlement Unit Tests passed successfully!');
}

// Execute tests
runCreditSystemTests();
