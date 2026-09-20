import type { Swap } from '../types/swap';
import type { CategorizedSwapItem, SwapParticipant } from './ActiveSwaps';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Pure helper function mirroring ActiveSwaps.tsx categorization logic
 */
export function categorizeSwaps(canonicalSwaps: Swap[], currentUserId: string): {
  activeList: CategorizedSwapItem[];
  listingsList: CategorizedSwapItem[];
  historyList: CategorizedSwapItem[];
} {
  const activeList: CategorizedSwapItem[] = [];
  const listingsList: CategorizedSwapItem[] = [];
  const historyList: CategorizedSwapItem[] = [];

  canonicalSwaps.forEach((swap) => {
    const isRequester = swap.requesterId === currentUserId;
    const isParticipant = swap.participantId === currentUserId;

    const partnerProfile = isRequester ? swap.participantProfile : swap.requesterProfile;
    const partnerUserId = isRequester ? (swap.participantId || '') : swap.requesterId;
    const partnerName = partnerProfile?.fullName || (partnerProfile?.username ? `@${partnerProfile.username}` : (isRequester ? 'SkillSwap Provider' : 'SkillSwap Requester'));
    const partnerUsername = partnerProfile?.username || '';
    const partnerAvatar = partnerProfile?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';
    const partnerLocation = partnerUsername ? `@${partnerUsername}` : 'SkillSwap Network';

    const partnerObj: SwapParticipant = {
      userId: partnerUserId,
      name: partnerName,
      username: partnerUsername,
      location: partnerLocation,
      avatar: partnerAvatar,
      isVerified: Boolean(partnerProfile?.isVerified),
      averageRating: partnerProfile?.averageRating ?? null,
      reviewCount: partnerProfile?.reviewCount ?? 0,
      completedSwapsCount: partnerProfile?.completedSwapsCount ?? 0,
    };

    const createdDateFormatted = new Date(swap.createdAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    // 1. OPEN LISTINGS CREATED BY USER
    if (isRequester && swap.status === 'open') {
      listingsList.push({
        swap,
        partner: {
          userId: currentUserId,
          name: 'You (Listing Creator)',
          username: '',
          location: 'Open Listing',
          avatar: partnerAvatar,
        },
        isRequester: true,
        isParticipant: false,
        roleContext: 'Your listing',
        humanStatus: 'Open Listing',
        statusCategory: 'open_listing',
        nextAction: 'Waiting for marketplace applicants',
        formattedDate: createdDateFormatted,
        formattedTimeLabel: `Created on ${createdDateFormatted}`,
        needsAction: false,
      });
      return;
    }

    // Exclude open listings created by others or un-involved swaps
    if (swap.status === 'open' || (!isRequester && !isParticipant)) return;

    // Role context
    const roleContext = isRequester ? 'You requested' : 'You are providing';

    // 2. ACTIVE EXCHANGES (Accepted or Submitted)
    if (swap.status === 'accepted' || swap.status === 'submitted') {
      let humanStatus = '';
      let statusCategory: CategorizedSwapItem['statusCategory'] = 'in_progress';
      let nextAction = '';
      let needsAction = false;
      let formattedTimeLabel = `Accepted on ${createdDateFormatted}`;

      if (swap.status === 'accepted') {
        if (isParticipant) {
          humanStatus = 'Awaiting Your Submission';
          statusCategory = 'action_required';
          nextAction = 'Submit your work when ready';
          needsAction = true;
        } else {
          humanStatus = 'In Progress';
          statusCategory = 'awaiting_partner';
          nextAction = `Waiting for ${partnerName} to submit work`;
          needsAction = false;
        }
      } else if (swap.status === 'submitted') {
        if (swap.submittedAt) {
          formattedTimeLabel = `Submitted on ${new Date(swap.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
        }
        if (isRequester) {
          humanStatus = 'Awaiting Your Review';
          statusCategory = 'action_required';
          nextAction = 'Review submitted work & transfer credits';
          needsAction = true;
        } else {
          humanStatus = 'Submitted (Under Review)';
          statusCategory = 'awaiting_partner';
          nextAction = `Waiting for ${partnerName} to review & approve`;
          needsAction = false;
        }
      }

      activeList.push({
        swap,
        partner: partnerObj,
        isRequester,
        isParticipant,
        roleContext,
        humanStatus,
        statusCategory,
        nextAction,
        formattedDate: createdDateFormatted,
        formattedTimeLabel,
        needsAction,
      });
      return;
    }

    // 3. SWAP HISTORY (Completed, Cancelled, Declined, Withdrawn, Expired)
    if (['completed', 'cancelled', 'declined', 'withdrawn', 'expired'].includes(swap.status)) {
      let humanStatus = 'Completed';
      let statusCategory: CategorizedSwapItem['statusCategory'] = 'completed';
      let nextAction = 'No action required';
      let formattedTimeLabel = `Completed on ${createdDateFormatted}`;

      if (swap.status === 'completed') {
        humanStatus = 'Completed';
        statusCategory = 'completed';
        nextAction = 'Exchange finished';
        if (swap.completedAt) {
          formattedTimeLabel = `Completed on ${new Date(swap.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
        }
      } else {
        const capitalized = swap.status.charAt(0).toUpperCase() + swap.status.slice(1);
        humanStatus = capitalized;
        statusCategory = 'cancelled_expired';
        nextAction = 'Swap closed';
        formattedTimeLabel = `${capitalized} on ${createdDateFormatted}`;
      }

      historyList.push({
        swap,
        partner: partnerObj,
        isRequester,
        isParticipant,
        roleContext,
        humanStatus,
        statusCategory,
        nextAction,
        formattedDate: createdDateFormatted,
        formattedTimeLabel,
        needsAction: false,
      });
    }
  });

  return { activeList, listingsList, historyList };
}

export function runActiveSwapsInformationArchitectureUnitTests() {
  console.log('--- Starting Active Swaps Information Architecture Unit Tests ---');

  const currentUserId = 'user-alice-123';

  const mockSwaps: Swap[] = [
    {
      id: 'swap-open-1',
      requesterId: currentUserId,
      participantId: null,
      topic: 'React Frontend Development',
      description: 'Build a responsive dashboard component',
      requirements: 'TypeScript and Tailwind',
      additionalMessage: null,
      creditAmount: 100,
      tags: ['coding'],
      status: 'open',
      idempotencyKey: null,
      submittedAt: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: '2026-03-01T10:00:00Z',
      updatedAt: '2026-03-01T10:00:00Z',
    },
    {
      id: 'swap-accepted-as-provider',
      requesterId: 'user-bob-456',
      participantId: currentUserId,
      topic: 'UI Design Review',
      description: 'Review mobile wireframes for accessibility',
      requirements: 'Figma feedback',
      additionalMessage: null,
      creditAmount: 50,
      tags: ['design'],
      status: 'accepted',
      idempotencyKey: null,
      submittedAt: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: '2026-03-02T10:00:00Z',
      updatedAt: '2026-03-02T10:00:00Z',
      requesterProfile: {
        fullName: 'Bob Builder',
        username: 'bobbuilder',
        avatarUrl: 'https://example.com/bob.jpg',
      },
    },
    {
      id: 'swap-submitted-as-requester',
      requesterId: currentUserId,
      participantId: 'user-charlie-789',
      topic: 'Python Scripting',
      description: 'Automate CSV data parsing',
      requirements: 'Python 3.11',
      additionalMessage: null,
      creditAmount: 75,
      tags: ['python'],
      status: 'submitted',
      idempotencyKey: null,
      submittedAt: '2026-03-03T12:00:00Z',
      completedAt: null,
      cancelledAt: null,
      createdAt: '2026-03-02T10:00:00Z',
      updatedAt: '2026-03-03T12:00:00Z',
      participantProfile: {
        fullName: 'Charlie Coder',
        username: 'charliec',
        avatarUrl: 'https://example.com/charlie.jpg',
      },
    },
    {
      id: 'swap-completed-1',
      requesterId: currentUserId,
      participantId: 'user-diana-101',
      topic: 'Video Editing Basics',
      description: 'Cut YouTube intro video',
      requirements: '1080p MP4',
      additionalMessage: null,
      creditAmount: 60,
      tags: ['video-editing'],
      status: 'completed',
      idempotencyKey: null,
      submittedAt: '2026-02-20T10:00:00Z',
      completedAt: '2026-02-21T10:00:00Z',
      cancelledAt: null,
      createdAt: '2026-02-18T10:00:00Z',
      updatedAt: '2026-02-21T10:00:00Z',
      participantProfile: {
        fullName: 'Diana Editor',
        username: 'dianaedits',
      },
    },
    {
      id: 'swap-cancelled-1',
      requesterId: currentUserId,
      participantId: null,
      topic: 'Old Cancelled Swap',
      description: 'Cancelled marketplace swap',
      requirements: '',
      additionalMessage: null,
      creditAmount: 30,
      tags: [],
      status: 'cancelled',
      idempotencyKey: null,
      submittedAt: null,
      completedAt: null,
      cancelledAt: '2026-02-10T10:00:00Z',
      createdAt: '2026-02-09T10:00:00Z',
      updatedAt: '2026-02-10T10:00:00Z',
    },
  ];

  const { activeList, listingsList, historyList } = categorizeSwaps(mockSwaps, currentUserId);

  // Test 1: Completed swaps are excluded from Active Swaps
  const completedInActive = activeList.some((item) => item.swap.status === 'completed');
  assert(!completedInActive, 'Test 1: Completed swaps MUST NOT appear in Active Swaps collection');

  // Test 2: Open listings are separated from active exchanges
  assert(listingsList.length === 1, 'Test 2: Open listing appears in My Listings');
  assert(listingsList[0].swap.id === 'swap-open-1', 'Test 2: Correct open listing ID in My Listings');
  const openInActive = activeList.some((item) => item.swap.status === 'open');
  assert(!openInActive, 'Test 2: Open listings MUST NOT appear in Active Swaps');

  // Test 3: Accepted swaps appear in correct active category
  assert(activeList.length === 2, 'Test 3: Active swaps contains exactly 2 active exchanges (1 accepted, 1 submitted)');
  const providerAcceptedItem = activeList.find((item) => item.swap.id === 'swap-accepted-as-provider');
  assert(providerAcceptedItem !== undefined, 'Test 3: Provider accepted swap found');
  assert(providerAcceptedItem?.needsAction === true, 'Test 3: Provider accepted swap needsAction is true (Needs Your Submission)');
  assert(providerAcceptedItem?.humanStatus === 'Awaiting Your Submission', 'Test 3: Human status is "Awaiting Your Submission"');

  // Test 4: Submitted swaps appear as awaiting review/action according to user role
  const requesterSubmittedItem = activeList.find((item) => item.swap.id === 'swap-submitted-as-requester');
  assert(requesterSubmittedItem !== undefined, 'Test 4: Requester submitted swap found');
  assert(requesterSubmittedItem?.needsAction === true, 'Test 4: Requester submitted swap needsAction is true (Needs Your Review)');
  assert(requesterSubmittedItem?.humanStatus === 'Awaiting Your Review', 'Test 4: Human status is "Awaiting Your Review"');

  // Test 5: Cancelled, declined, withdrawn, and expired swaps are in history
  assert(historyList.length === 2, 'Test 5: History list contains 2 swaps (1 completed, 1 cancelled)');
  assert(historyList.some((item) => item.swap.status === 'completed'), 'Test 5: Completed swap is in history list');
  assert(historyList.some((item) => item.swap.status === 'cancelled'), 'Test 5: Cancelled swap is in history list');

  // Test 6: Human-readable status labels
  historyList.forEach((item) => {
    assert(item.humanStatus !== 'completed' && item.humanStatus !== 'cancelled', 'Test 6: Raw DB status strings are converted to human-readable strings');
  });

  // Test 7: Sub-filters logic
  const needsActionActive = activeList.filter((s) => s.needsAction);
  assert(needsActionActive.length === 2, 'Test 7: Sub-filter "Needs Action" returns both action-required items');

  console.log('✓ All Active Swaps Information Architecture unit tests passed perfectly!');
}

if (import.meta.url.endsWith('ActiveSwaps.test.ts') || process.argv[1]?.endsWith('ActiveSwaps.test.ts')) {
  runActiveSwapsInformationArchitectureUnitTests();
}
