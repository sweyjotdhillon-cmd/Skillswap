import { mapSwapRecordToSwap, type SwapProfile } from '../../types/swap';
import type { SwapRecord } from './credits';

async function runCredibilityVerificationTests() {
  console.log('--- Starting Section I.3 Credibility & Verification Cues Unit Tests ---');

  // Test 1: Verified user mapping
  const verifiedRecord: SwapRecord = {
    id: 'swap-verified-1',
    requester_id: 'user-req-1',
    participant_id: 'user-part-1',
    topic: 'TypeScript Code Review',
    description: 'Review my React component code for best practices.',
    requirements: 'Deliver written feedback',
    additional_message: null,
    credit_amount: 15,
    tags: ['Coding'],
    status: 'open',
    idempotency_key: null,
    submitted_at: null,
    completed_at: null,
    cancelled_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    requester_profile: {
      full_name: 'Alice Verified',
      username: 'alice_v',
      avatar_url: 'https://example.com/alice.jpg',
      profile_completed: true,
      is_verified: true,
      average_rating: 4.8,
      review_count: 12,
      completed_swaps_count: 23,
      created_at: new Date().toISOString(),
    },
    participant_profile: {
      full_name: 'Bob Peer',
      username: 'bob_p',
      avatar_url: undefined,
      profile_completed: true,
      is_verified: false,
      average_rating: null,
      review_count: 0,
      completed_swaps_count: 0,
      created_at: new Date().toISOString(),
    },
  };

  const mappedVerified = mapSwapRecordToSwap(verifiedRecord);

  if (!mappedVerified.requesterProfile?.isVerified) {
    throw new Error('Test 1 Failed: requesterProfile.isVerified should be true for verified profile');
  }
  if (mappedVerified.requesterProfile?.averageRating !== 4.8) {
    throw new Error('Test 1 Failed: requesterProfile.averageRating should preserve 4.8');
  }
  if (mappedVerified.requesterProfile?.reviewCount !== 12) {
    throw new Error('Test 1 Failed: requesterProfile.reviewCount should be 12');
  }
  if (mappedVerified.requesterProfile?.completedSwapsCount !== 23) {
    throw new Error('Test 1 Failed: requesterProfile.completedSwapsCount should be 23');
  }

  // Test 2: Unverified user mapping (no false verification)
  if (mappedVerified.participantProfile?.isVerified) {
    throw new Error('Test 2 Failed: participantProfile.isVerified should be false when database record is_verified is false');
  }
  if (mappedVerified.participantProfile?.averageRating !== null) {
    throw new Error('Test 2 Failed: participantProfile.averageRating should be null when user has no reviews');
  }
  if (mappedVerified.participantProfile?.reviewCount !== 0) {
    throw new Error('Test 2 Failed: participantProfile.reviewCount should be 0');
  }

  // Test 3: Formatting helper for social proof (No reviews yet vs rating display)
  const formatSocialProofText = (profile: SwapProfile | null | undefined): string => {
    const reviewCount = profile?.reviewCount ?? 0;
    const avgRating = profile?.averageRating ?? null;
    if (reviewCount > 0 && avgRating !== null) {
      return `★ ${avgRating.toFixed(1)} (${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'})`;
    }
    return 'No reviews yet';
  };

  const proofVerified = formatSocialProofText(mappedVerified.requesterProfile);
  if (proofVerified !== '★ 4.8 (12 reviews)') {
    throw new Error(`Test 3 Failed: Unexpected social proof text for verified profile: "${proofVerified}"`);
  }

  const proofUnverified = formatSocialProofText(mappedVerified.participantProfile);
  if (proofUnverified !== 'No reviews yet') {
    throw new Error(`Test 3 Failed: Unexpected social proof text for unverified profile: "${proofUnverified}"`);
  }

  // Test 4: Completed swaps count display formatting
  const formatCompletedSwapsText = (profile: SwapProfile | null | undefined): string => {
    const count = profile?.completedSwapsCount ?? 0;
    return `${count} ${count === 1 ? 'completed swap' : 'completed swaps'}`;
  };

  if (formatCompletedSwapsText(mappedVerified.requesterProfile) !== '23 completed swaps') {
    throw new Error('Test 4 Failed: Incorrect completed swaps count text for requester');
  }
  if (formatCompletedSwapsText(mappedVerified.participantProfile) !== '0 completed swaps') {
    throw new Error('Test 4 Failed: Incorrect completed swaps count text for participant');
  }

  console.log('✓ All Section I.3 Credibility & Verification Cues unit tests passed!');
}

runCredibilityVerificationTests().catch((err) => {
  console.error('Section I.3 Unit Test Failure:', err);
  process.exit(1);
});
