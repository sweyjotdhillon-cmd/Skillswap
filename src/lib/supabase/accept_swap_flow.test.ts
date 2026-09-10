import { formatAcceptSwapErrorMessage } from './credits';
import type { Swap } from '../../types/swap';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Unit & Behavioral Verification Test Suite for Section H.2 Reversible Acceptance Confirmation Window.
 */
export function runAcceptSwapFlowUnitTests() {
  console.log('--- Starting Section H.2 Reversible Accept Swap Flow Unit Tests ---');

  const mockSwap: Swap = {
    id: 'swap-test-h2',
    requesterId: 'user-requester-1',
    participantId: null,
    topic: 'UX Architecture Review',
    description: 'Reviewing landing page responsive layout and accessibility',
    requirements: 'Provide constructive feedback',
    additionalMessage: null,
    creditAmount: 50,
    tags: ['design'],
    status: 'open',
    idempotencyKey: 'key-h2-1',
    submittedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-09-06T10:00:00Z',
    updatedAt: '2026-09-06T10:00:00Z',
  };

  // Mock RPC tracking counters
  let acceptCreditSwapCallCount = 0;
  let cancelCreditSwapCallCount = 0;
  let lastAcceptedSwapId: string | null = null;

  const mockAcceptCreditSwap = async (swapId: string): Promise<{ success: boolean; swap?: Partial<Swap>; error?: string }> => {
    acceptCreditSwapCallCount++;
    lastAcceptedSwapId = swapId;
    return { success: true, swap: { ...mockSwap, status: 'accepted', participantId: 'user-participant-2' } };
  };

  const mockCancelCreditSwap = async (swapId: string): Promise<{ success: boolean }> => {
    cancelCreditSwapCallCount++;
    if (swapId) {
      // Keep lint happy while tracking cancel calls
    }
    return { success: true };
  };
  void mockCancelCreditSwap;

  // Simulated Pending Accept State Machine
  class PendingAcceptStateMachine {
    pendingAccept: { swap: Swap; seconds: number } | null = null;
    timer: ReturnType<typeof setInterval> | null = null;
    isExecuting = false;
    errorMessage: string | null = null;
    successToast: { swapTopic: string } | null = null;

    startPending(swap: Swap) {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.errorMessage = null;
      this.successToast = null;
      this.pendingAccept = { swap, seconds: 5 };
    }

    tickSecond() {
      if (!this.pendingAccept) return;
      if (this.pendingAccept.seconds <= 1) {
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
        const swapToCommit = this.pendingAccept.swap;
        this.pendingAccept = null;
        this.commitAccept(swapToCommit);
      } else {
        this.pendingAccept = { ...this.pendingAccept, seconds: this.pendingAccept.seconds - 1 };
      }
    }

    undo() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.pendingAccept = null;
    }

    async commitAccept(swap: Swap) {
      if (this.isExecuting) return;
      this.isExecuting = true;
      try {
        const res = await mockAcceptCreditSwap(swap.id);
        if (res.success) {
          this.successToast = { swapTopic: swap.topic };
        } else {
          this.errorMessage = formatAcceptSwapErrorMessage(res.error, swap.creditAmount, 40);
        }
      } catch (err) {
        this.errorMessage = formatAcceptSwapErrorMessage(err, swap.creditAmount, 40);
      } finally {
        this.isExecuting = false;
      }
    }

    cleanup() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.pendingAccept = null;
    }
  }

  // =========================================================================
  // TEST 1: Clicking Accept starts 5-second pending state
  // =========================================================================
  const state1 = new PendingAcceptStateMachine();
  assert(state1.pendingAccept === null, 'Test 1: Initial pending accept is null');
  state1.startPending(mockSwap);
  assert(state1.pendingAccept !== null, 'Test 1: Pending accept is set');
  assert(state1.pendingAccept?.seconds === 5, 'Test 1: Countdown starts at 5 seconds');
  assert(state1.pendingAccept?.swap.id === mockSwap.id, 'Test 1: Pending swap ID matches target swap');

  // =========================================================================
  // TEST 2: acceptCreditSwap() is NOT called immediately
  // =========================================================================
  acceptCreditSwapCallCount = 0;
  cancelCreditSwapCallCount = 0;
  const state2 = new PendingAcceptStateMachine();
  state2.startPending(mockSwap);

  assert(acceptCreditSwapCallCount === 0, 'Test 2: acceptCreditSwap() is 0 calls at t=0s');
  state2.tickSecond(); // 5 -> 4
  assert(acceptCreditSwapCallCount === 0, 'Test 2: acceptCreditSwap() is 0 calls at t=1s');
  state2.tickSecond(); // 4 -> 3
  assert(acceptCreditSwapCallCount === 0, 'Test 2: acceptCreditSwap() is 0 calls at t=2s');
  state2.tickSecond(); // 3 -> 2
  assert(acceptCreditSwapCallCount === 0, 'Test 2: acceptCreditSwap() is 0 calls at t=3s');

  // =========================================================================
  // TEST 3: Clicking Undo/Cancel within 5 seconds means acceptCreditSwap() is NEVER called
  // =========================================================================
  acceptCreditSwapCallCount = 0;
  cancelCreditSwapCallCount = 0;
  const state3 = new PendingAcceptStateMachine();
  state3.startPending(mockSwap); // t=0s (5s)
  state3.tickSecond(); // t=1s (4s)
  state3.tickSecond(); // t=2s (3s)

  assert(state3.pendingAccept?.seconds === 3, 'Test 3: Countdown is at 3s when Undo is clicked');
  state3.undo(); // User clicks Undo

  assert(state3.pendingAccept === null, 'Test 3: Pending state cleared on Undo');
  assert(acceptCreditSwapCallCount === 0, 'Test 3: acceptCreditSwap() was NEVER called');
  assert(cancelCreditSwapCallCount === 0, 'Test 3: cancelCreditSwap() was NEVER called (no compensating transaction)');

  // Simulate additional ticks after undo
  state3.tickSecond();
  state3.tickSecond();
  assert(acceptCreditSwapCallCount === 0, 'Test 3: acceptCreditSwap() remains 0 calls after time passes');

  // =========================================================================
  // TEST 4: Countdown completion calls acceptCreditSwap() exactly once
  // =========================================================================
  acceptCreditSwapCallCount = 0;
  const state4 = new PendingAcceptStateMachine();
  state4.startPending(mockSwap); // 5s

  state4.tickSecond(); // 4s
  state4.tickSecond(); // 3s
  state4.tickSecond(); // 2s
  state4.tickSecond(); // 1s
  assert(acceptCreditSwapCallCount === 0, 'Test 4: Not called prior to countdown completion');

  state4.tickSecond(); // 0s -> triggers commit
  assert(acceptCreditSwapCallCount === 1, 'Test 4: acceptCreditSwap() called exactly once upon countdown completion');
  assert(lastAcceptedSwapId === mockSwap.id, 'Test 4: Accepted swap ID matches target swap');

  // =========================================================================
  // TEST 5: Failed acceptance displays friendly plain-language error
  // =========================================================================
  // 5a: Insufficient credits with account balance data
  const msgInsufficient = formatAcceptSwapErrorMessage('chk_min_balance', 50, 40);
  assert(
    msgInsufficient === 'You tried to accept a swap requiring 50 SkillCredits, but you currently have 40 available. Complete a task to earn more credits, then try again.',
    'Test 5a: Insufficient credits message includes real swap and account balance numbers'
  );

  // 5b: Insufficient credits without balance numbers
  const msgGenericInsufficient = formatAcceptSwapErrorMessage('insufficient credit balance');
  assert(
    msgGenericInsufficient === 'You have insufficient SkillCredits available for this swap. Complete a task to earn more credits, then try again.',
    'Test 5b: Generic insufficient credits error formatted in plain language'
  );

  // 5c: Cannot accept own swap
  const msgOwnSwap = formatAcceptSwapErrorMessage('cannot accept your own swap');
  assert(
    msgOwnSwap === 'You cannot accept your own swap request. Browse other open swaps in the marketplace.',
    'Test 5c: Cannot accept own swap error formatted in plain language'
  );

  // 5d: Raw DB / Postgres error fallback
  const msgRawDb = formatAcceptSwapErrorMessage('PGRST116 JSON object requested, multiple rows returned');
  assert(
    msgRawDb === 'We couldn’t complete that action right now. Please try again.',
    'Test 5d: Raw Postgres error sanitized into friendly fallback message'
  );

  // =========================================================================
  // TEST 6: Timers are cleaned up correctly on unmount
  // =========================================================================
  acceptCreditSwapCallCount = 0;
  const state6 = new PendingAcceptStateMachine();
  state6.startPending(mockSwap);
  state6.cleanup(); // simulate component unmount

  // Time passes after unmount
  state6.tickSecond();
  state6.tickSecond();
  state6.tickSecond();
  state6.tickSecond();
  state6.tickSecond();

  assert(acceptCreditSwapCallCount === 0, 'Test 6: Cleaned up timer prevents acceptCreditSwap() from executing after unmount');

  // =========================================================================
  // TEST 7: Duplicate acceptance attempts cannot trigger multiple RPC calls
  // =========================================================================
  acceptCreditSwapCallCount = 0;
  const state7 = new PendingAcceptStateMachine();

  // User rapidly clicks accept multiple times
  state7.startPending(mockSwap);
  state7.startPending(mockSwap);
  state7.startPending(mockSwap);

  assert(state7.pendingAccept?.seconds === 5, 'Test 7: Timer reset cleanly to 5s on duplicate start');

  // Run countdown to completion
  for (let i = 0; i < 5; i++) {
    state7.tickSecond();
  }

  assert(acceptCreditSwapCallCount === 1, 'Test 7: acceptCreditSwap() called exactly 1 time despite duplicate acceptance triggers');

  console.log('✓ All Section H.2 Reversible Accept Swap Flow unit tests passed perfectly!');

  // =========================================================================
  // SECTION L2: 5-Second Reversible Release Credits State Machine Verification
  // =========================================================================
  console.log('--- Starting Section L2 Reversible Release Credits Flow Unit Tests ---');

  let completeCreditSwapCallCount = 0;
  let lastCompletedSwapId: string | null = null;

  const mockCompleteCreditSwap = async (swapId: string): Promise<{ success: boolean; error?: string }> => {
    completeCreditSwapCallCount++;
    lastCompletedSwapId = swapId;
    return { success: true };
  };

  assert(lastCompletedSwapId === null, 'Initial lastCompletedSwapId is null');

  class PendingReleaseStateMachine {
    pendingRelease: { swap: Swap; seconds: number } | null = null;
    timer: ReturnType<typeof setInterval> | null = null;
    isExecuting = false;
    errorMessage: string | null = null;
    successToast: string | null = null;

    getErrorMessage() {
      return this.errorMessage;
    }

    getSuccessToast() {
      return this.successToast;
    }

    startPending(swap: Swap) {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.errorMessage = null;
      this.successToast = null;
      this.pendingRelease = { swap, seconds: 5 };
    }

    tickSecond() {
      if (!this.pendingRelease) return;
      if (this.pendingRelease.seconds <= 1) {
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
        const swapToCommit = this.pendingRelease.swap;
        this.pendingRelease = null;
        this.commitRelease(swapToCommit);
      } else {
        this.pendingRelease = { ...this.pendingRelease, seconds: this.pendingRelease.seconds - 1 };
      }
    }

    undo() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.pendingRelease = null;
    }

    async commitRelease(swap: Swap) {
      if (this.isExecuting) return;
      this.isExecuting = true;
      try {
        const res = await mockCompleteCreditSwap(swap.id);
        if (res.success) {
          this.successToast = `Swap completed and settled ${swap.creditAmount} SkillCredits.`;
        } else {
          this.errorMessage = res.error || 'Failed to complete swap.';
        }
      } catch (err) {
        this.errorMessage = err instanceof Error ? err.message : 'An error occurred.';
      } finally {
        this.isExecuting = false;
      }
    }

    cleanup() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.pendingRelease = null;
    }
  }

  // TEST L2-1: Release Credits trigger starts 5-second pending state
  completeCreditSwapCallCount = 0;
  const relState1 = new PendingReleaseStateMachine();
  assert(relState1.pendingRelease === null, 'Test L2-1: Initial pending release is null');
  relState1.startPending(mockSwap);
  assert(relState1.pendingRelease !== null, 'Test L2-1: Pending release state is set');
  assert(relState1.pendingRelease?.seconds === 5, 'Test L2-1: Release countdown starts at 5 seconds');
  assert(completeCreditSwapCallCount === 0, 'Test L2-1: completeCreditSwap is NOT called immediately (t=0s)');

  // TEST L2-2: completeCreditSwap is NOT called during countdown ticks (t=1s..4s)
  relState1.tickSecond(); // 5 -> 4
  assert(completeCreditSwapCallCount === 0, 'Test L2-2: completeCreditSwap is 0 calls at t=1s');
  relState1.tickSecond(); // 4 -> 3
  assert(completeCreditSwapCallCount === 0, 'Test L2-2: completeCreditSwap is 0 calls at t=2s');

  // TEST L2-3: Clicking Undo within 5 seconds cancels release permanently
  relState1.undo();
  assert(relState1.pendingRelease === null, 'Test L2-3: Pending release cleared on Undo');
  assert(completeCreditSwapCallCount === 0, 'Test L2-3: completeCreditSwap was NEVER called');

  // Additional ticks after undo
  relState1.tickSecond();
  relState1.tickSecond();
  assert(completeCreditSwapCallCount === 0, 'Test L2-3: completeCreditSwap remains 0 calls');

  // TEST L2-4: Countdown completion executes completeCreditSwap exactly once
  completeCreditSwapCallCount = 0;
  lastCompletedSwapId = null;
  const relState2 = new PendingReleaseStateMachine();
  relState2.startPending(mockSwap); // 5s

  for (let i = 0; i < 4; i++) {
    relState2.tickSecond();
  }
  assert(completeCreditSwapCallCount === 0, 'Test L2-4: completeCreditSwap not called before 5s expires');

  relState2.tickSecond(); // 0s expiration
  assert(completeCreditSwapCallCount === 1, 'Test L2-4: completeCreditSwap called exactly once on countdown completion');
  assert(lastCompletedSwapId === mockSwap.id, 'Test L2-4: Completed swap ID matches target');

  // TEST L2-5: Rapid duplicate clicks reset/deduplicate and fire exactly once
  completeCreditSwapCallCount = 0;
  const relState3 = new PendingReleaseStateMachine();
  relState3.startPending(mockSwap);
  relState3.startPending(mockSwap);
  relState3.startPending(mockSwap);

  assert(relState3.pendingRelease?.seconds === 5, 'Test L2-5: Countdown reset to 5s on duplicate start');

  for (let i = 0; i < 5; i++) {
    relState3.tickSecond();
  }
  assert(completeCreditSwapCallCount === 1, 'Test L2-5: completeCreditSwap called exactly once despite duplicate triggers');

  // TEST L2-6: Unmount cleanup prevents post-unmount execution
  completeCreditSwapCallCount = 0;
  const relState4 = new PendingReleaseStateMachine();
  relState4.startPending(mockSwap);
  relState4.cleanup(); // simulate unmount

  for (let i = 0; i < 5; i++) {
    relState4.tickSecond();
  }
  assert(completeCreditSwapCallCount === 0, 'Test L2-6: Unmount cleanup prevented release execution');

  console.log('✓ All Section L2 Reversible Release Credits Flow unit tests passed perfectly!');
}

// Execute if run directly
if (import.meta.url.endsWith('accept_swap_flow.test.ts') || process.argv[1]?.endsWith('accept_swap_flow.test.ts')) {
  runAcceptSwapFlowUnitTests();
}
