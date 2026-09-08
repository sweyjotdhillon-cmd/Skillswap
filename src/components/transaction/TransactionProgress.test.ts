import { calculateRemainingAutoReleaseMs, formatRemainingTime } from './TransactionProgress';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runTransactionProgressUnitTests() {
  console.log('--- Starting TransactionProgress E.2 Unit Tests ---');

  const nowMs = 1700000000000;
  const submittedAt = new Date(nowMs).toISOString();

  // Test 1: Calculate remaining time exactly 7 days out
  const remaining7Days = calculateRemainingAutoReleaseMs(submittedAt, 7, nowMs);
  const expected7DaysMs = 7 * 24 * 60 * 60 * 1000;
  assert(remaining7Days === expected7DaysMs, '7 days auto-release remaining time calculated correctly');

  // Test 2: Calculate remaining time after 3 days elapsed
  const elapsed3DaysMs = nowMs + 3 * 24 * 60 * 60 * 1000;
  const remaining3Days = calculateRemainingAutoReleaseMs(submittedAt, 7, elapsed3DaysMs);
  assert(remaining3Days === 4 * 24 * 60 * 60 * 1000, '3 days elapsed leaves 4 days remaining');

  // Test 3: Calculate remaining time after 7 days elapsed (0 remaining, non-negative)
  const elapsed7DaysMs = nowMs + 7 * 24 * 60 * 60 * 1000 + 1000;
  const remainingExpired = calculateRemainingAutoReleaseMs(submittedAt, 7, elapsed7DaysMs);
  assert(remainingExpired === 0, 'Expired countdown returns 0ms without negative values');

  // Test 4: Null / undefined submittedAt returns 0ms
  assert(calculateRemainingAutoReleaseMs(null, 7, nowMs) === 0, 'Null submittedAt returns 0');
  assert(calculateRemainingAutoReleaseMs(undefined, 7, nowMs) === 0, 'Undefined submittedAt returns 0');

  // Test 5: Time formatting
  assert(formatRemainingTime(0) === '0m 0s', '0ms formats as 0m 0s');
  assert(formatRemainingTime(60000) === '1m 0s', '60000ms formats as 1m 0s');
  assert(formatRemainingTime(3600000) === '1h 0m 0s', '3600000ms formats as 1h 0m 0s');
  assert(formatRemainingTime(86400000 * 2 + 3600000 * 3 + 60000 * 15) === '2d 3h 15m', '2d 3h 15m formatted correctly');

  console.log('✓ All TransactionProgress E.2 unit tests passed!');
}

if (import.meta.url.endsWith('TransactionProgress.test.ts') || process.argv[1]?.endsWith('TransactionProgress.test.ts')) {
  runTransactionProgressUnitTests();
}
