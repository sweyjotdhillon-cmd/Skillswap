import { getVaultState } from './PendingTransactionVault';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runPendingTransactionVaultUnitTests() {
  console.log('--- Starting L17 Pending Transaction Vault Unit Tests ---');

  // Test 1: getVaultState mapping for pending/held statuses
  assert(getVaultState('open') === 'pending', 'open maps to pending vault state');
  assert(getVaultState('accepted') === 'pending', 'accepted maps to pending vault state');
  assert(getVaultState('submitted') === 'pending', 'submitted maps to pending vault state');
  assert(getVaultState('pending') === 'pending', 'pending maps to pending vault state');
  assert(getVaultState('reserved') === 'pending', 'reserved maps to pending vault state');

  // Test 2: getVaultState mapping for completed/released statuses
  assert(getVaultState('completed') === 'completed', 'completed maps to completed vault state');
  assert(getVaultState('settled') === 'completed', 'settled maps to completed vault state');
  assert(getVaultState('released') === 'completed', 'released maps to completed vault state');

  // Test 3: getVaultState mapping for cancelled/refunded statuses
  assert(getVaultState('cancelled') === 'cancelled', 'cancelled maps to cancelled vault state');
  assert(getVaultState('declined') === 'cancelled', 'declined maps to cancelled vault state');
  assert(getVaultState('withdrawn') === 'cancelled', 'withdrawn maps to cancelled vault state');
  assert(getVaultState('expired') === 'cancelled', 'expired maps to cancelled vault state');
  assert(getVaultState('closed') === 'cancelled', 'closed maps to cancelled vault state');

  // Test 4: Null and undefined fallback
  assert(getVaultState(undefined) === 'pending', 'undefined status defaults to pending');
  assert(getVaultState(null as unknown as string) === 'pending', 'null status defaults to pending');
  assert(getVaultState('') === 'pending', 'empty string status defaults to pending');

  console.log('✓ All L17 Pending Transaction Vault unit tests passed perfectly!');
}

if (import.meta.url.endsWith('PendingTransactionVault.test.ts') || process.argv[1]?.endsWith('PendingTransactionVault.test.ts')) {
  runPendingTransactionVaultUnitTests();
}
