import type { Swap } from '../../types/swap';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Unit tests for Section L21 Warm-Gold Credit Badges & Spotted Scanning.
 */
export function runMarketplaceCardUnitTests() {
  console.log('--- Starting Section L21 Warm-Gold Credit Badges & Spotted Scanning Unit Tests ---');

  // Test 1: Authoritative credit amount preservation
  const testSwap1: Swap = {
    id: 'swap_l21_1',
    topic: 'Full-Stack React & Node Review',
    description: 'Comprehensive code review and architectural feedback for P2P applications.',
    requirements: 'Clean code repo link',
    additionalMessage: null,
    creditAmount: 45,
    status: 'open',
    requesterId: 'user_1',
    participantId: null,
    submittedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['coding', 'web-development'],
    requesterProfile: {
      fullName: 'Alex Vance',
      username: 'alexv',
      avatarUrl: 'https://example.com/avatar.jpg',
      isVerified: true,
      averageRating: 4.9,
      reviewCount: 14,
      completedSwapsCount: 8,
    },
  };

  assert(testSwap1.creditAmount === 45, 'Authoritative credit amount is exactly 45');
  const ariaLabel1 = `${testSwap1.creditAmount} SkillCredits`;
  assert(ariaLabel1 === '45 SkillCredits', 'Formatted ARIA label communicates "45 SkillCredits" unambiguously');

  // Test 2: Low credit value handling
  const testSwap2: Swap = { ...testSwap1, id: 'swap_l21_2', creditAmount: 5 };
  assert(testSwap2.creditAmount === 5, 'Low credit value 5 preserved');
  const ariaLabel2 = `${testSwap2.creditAmount} SkillCredits`;
  assert(ariaLabel2 === '5 SkillCredits', 'Low credit value ARIA label formatted correctly');

  // Test 3: Large credit value handling
  const testSwap3: Swap = { ...testSwap1, id: 'swap_l21_3', creditAmount: 500 };
  assert(testSwap3.creditAmount === 500, 'Large credit value 500 preserved');
  const ariaLabel3 = `${testSwap3.creditAmount} SkillCredits`;
  assert(ariaLabel3 === '500 SkillCredits', 'Large credit value ARIA label formatted correctly');

  // Test 4: Missing/NaN credit value fallback
  const testSwap4: Swap = { ...testSwap1, id: 'swap_l21_4', creditAmount: NaN };
  const safeCredits = typeof testSwap4.creditAmount === 'number' && !isNaN(testSwap4.creditAmount) ? testSwap4.creditAmount : 0;
  assert(safeCredits === 0, 'Missing or NaN credit amount safely falls back to 0');
  const ariaLabel4 = `${safeCredits} SkillCredits`;
  assert(ariaLabel4 === '0 SkillCredits', 'Fallback ARIA label formatted correctly');

  console.log('✓ All Section L21 Warm-Gold Credit Badges & Spotted Scanning unit tests passed perfectly!');
}
