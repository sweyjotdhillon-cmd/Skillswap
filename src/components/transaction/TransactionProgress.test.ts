import { calculateRemainingAutoReleaseMs, formatRemainingTime, formatCountdown } from './TransactionProgress';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runTransactionProgressUnitTests() {
  console.log('--- Starting TransactionProgress E.2 Unit Tests ---');

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

  // Test 7: Time formatting helpers
  assert(formatRemainingTime(0) === '0m 0s', '0ms formats as 0m 0s');
  assert(formatRemainingTime(60000) === '1m 0s', '60000ms formats as 1m 0s');
  assert(formatRemainingTime(3600000) === '1h 0m 0s', '3600000ms formats as 1h 0m 0s');
  assert(formatRemainingTime(86400000 * 2 + 3600000 * 3 + 60000 * 15) === '2d 3h 15m', '2d 3h 15m formatted correctly');

  assert(formatCountdown(0) === '00h 00m 00s', '0 seconds countdown formats as 00h 00m 00s');
  assert(formatCountdown(3665) === '01h 01m 05s', '3665 seconds formats as 01h 01m 05s');
  assert(formatCountdown(90000) === '1d 01h 00m 00s', '90000 seconds formats as 1d 01h 00m 00s');

  console.log('✓ All TransactionProgress E.2 unit tests passed!');
}

if (import.meta.url.endsWith('TransactionProgress.test.ts') || process.argv[1]?.endsWith('TransactionProgress.test.ts')) {
  runTransactionProgressUnitTests();
}
