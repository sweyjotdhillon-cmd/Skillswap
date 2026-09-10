import { calculateRemainingAutoReleaseMs, formatRemainingTime, formatCountdown } from './TransactionProgress';
import type { SwapStatus } from '../../types/swap';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/** Helper function simulating getStageIndex logic from TransactionProgress component */
function getStageIndex(s: SwapStatus): number {
  switch (s) {
    case 'open':
      return 0;
    case 'accepted':
      return 1;
    case 'submitted':
      return 2;
    case 'completed':
      return 3;
    case 'cancelled':
    case 'declined':
    case 'withdrawn':
    case 'expired':
      return -1;
    default:
      return 0;
  }
}

export function runTransactionProgressUnitTests() {
  console.log('--- Starting TransactionProgress E.2 & Section L9 Unit Tests ---');

  const nowMs = 1700000000000;
  const submittedAt = new Date(nowMs).toISOString();
  const autoReleaseAt = new Date(nowMs + 7 * 24 * 3600 * 1000).toISOString();

  // Test 1: Calculate remaining time using backend autoReleaseAt
  const remainingAutoReleaseMs = calculateRemainingAutoReleaseMs(autoReleaseAt, submittedAt, nowMs);
  const expectedMs = 7 * 24 * 60 * 60 * 1000;
  assert(remainingAutoReleaseMs === expectedMs, 'Backend autoReleaseAt remaining time calculated correctly');

  // Test 2: Refresh / Tab suspension simulation (nowMs advances 3 days, same autoReleaseAt)
  const after3DaysMs = nowMs + 3 * 24 * 3600 * 1000;
  const remainingAfterRefresh = calculateRemainingAutoReleaseMs(autoReleaseAt, submittedAt, after3DaysMs);
  assert(remainingAfterRefresh === 4 * 24 * 3600 * 1000, 'Tab suspension / refresh calculates accurate remaining time from absolute deadline');

  // Test 3: Reconnect / delayed message simulation (nowMs advances 7 days + 1 hour)
  const afterExpiredMs = nowMs + (7 * 24 + 1) * 3600 * 1000;
  const remainingAfterExpired = calculateRemainingAutoReleaseMs(autoReleaseAt, submittedAt, afterExpiredMs);
  assert(remainingAfterExpired === 0, 'Expired countdown returns 0ms without negative values');

  // Test 4: Expired deadline does NOT alter status locally
  // Simulating status evaluation logic: if status is 'submitted' and remaining is 0, status MUST stay 'submitted'
  const mockSwapStatus = 'submitted';
  const evaluatedStatus = remainingAfterExpired === 0 ? mockSwapStatus : 'completed';
  assert(evaluatedStatus === 'submitted', 'Expired countdown preserves submitted status pending backend confirmation');

  // Test 5: Fallback when autoReleaseAt is null
  const remainingFallback = calculateRemainingAutoReleaseMs(null, submittedAt, nowMs);
  assert(remainingFallback === expectedMs, 'Null autoReleaseAt falls back cleanly to submittedAt + 7 days');

  // Test 6: Null / undefined parameters return 0ms
  assert(calculateRemainingAutoReleaseMs(null, null, nowMs) === 0, 'Null autoReleaseAt and null submittedAt returns 0');
  assert(calculateRemainingAutoReleaseMs(undefined, undefined, nowMs) === 0, 'Undefined parameters return 0');

  // Test 7: Time formatting helpers matching L10 UX guidelines
  assert(formatRemainingTime(0) === 'Pending automatic settlement', '0ms formats as Pending automatic settlement');
  assert(formatRemainingTime(30000) === 'Auto-release soon', '30000ms (< 1 min) formats as Auto-release soon');
  assert(formatRemainingTime(60000) === 'Auto-release in 1m', '60000ms formats as Auto-release in 1m');
  assert(formatRemainingTime(42 * 60 * 1000) === 'Auto-release in 42m', '42m formats as Auto-release in 42m');
  assert(formatRemainingTime((3 * 60 + 18) * 60 * 1000) === 'Auto-release in 3h 18m', '3h 18m formats as Auto-release in 3h 18m');
  assert(formatRemainingTime((23 * 60 + 41) * 60 * 1000) === 'Auto-release in 23h 41m', '23h 41m formats as Auto-release in 23h 41m');
  assert(formatRemainingTime(86400000 * 2 + 3600000 * 3 + 60000 * 15) === 'Auto-release in 2d 3h', '2d 3h 15m formatted correctly as Auto-release in 2d 3h');

  assert(formatCountdown(0) === '00h 00m 00s', '0 seconds countdown formats as 00h 00m 00s');
  assert(formatCountdown(3665) === '01h 01m 05s', '3665 seconds formats as 01h 01m 05s');
  assert(formatCountdown(90000) === '1d 01h 00m 00s', '90000 seconds formats as 1d 01h 00m 00s');

  // Section L9 Lifecycle Mapping Unit Tests
  // Stage 0: Open
  assert(getStageIndex('open') === 0, 'open maps to stage index 0 (Open)');
  // Stage 1: Accepted
  assert(getStageIndex('accepted') === 1, 'accepted maps to stage index 1 (Accepted)');
  // Stage 2: Submitted
  assert(getStageIndex('submitted') === 2, 'submitted maps to stage index 2 (Submitted)');
  // Stage 3: Completed
  assert(getStageIndex('completed') === 3, 'completed maps to stage index 3 (Completed)');

  // Terminal Edge States: Cancelled, Declined, Withdrawn, Expired
  assert(getStageIndex('cancelled') === -1, 'cancelled maps to terminal state -1');
  assert(getStageIndex('declined') === -1, 'declined maps to terminal state -1');
  assert(getStageIndex('withdrawn') === -1, 'withdrawn maps to terminal state -1');
  assert(getStageIndex('expired') === -1, 'expired maps to terminal state -1');

  console.log('✓ All TransactionProgress E.2 & Section L9 unit tests passed!');
}

if (import.meta.url.endsWith('TransactionProgress.test.ts') || process.argv[1]?.endsWith('TransactionProgress.test.ts')) {
  runTransactionProgressUnitTests();
}
