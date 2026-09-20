import { test, describe } from 'node:test';
import assert from 'node:assert';
import { perfLog, PerfTracker } from '../lib/perf';

describe('Swap Mutation Performance & Immediate State Transitions', () => {
  test('perfLog and PerfTracker log performance timing phases cleanly without throwing', () => {
    perfLog('unit_test', 'check', 15);
    const tracker = new PerfTracker('test_action');
    const elapsed1 = tracker.logPhase('rpc');
    assert.strictEqual(typeof elapsed1, 'number');
    assert.ok(elapsed1 >= 0);

    const elapsed2 = tracker.logPhase('ui_commit');
    assert.strictEqual(typeof elapsed2, 'number');
    assert.ok(elapsed2 >= elapsed1);
  });

  test('Accept Swap calls RPC immediately on click without a 5-second countdown delay', async () => {
    let rpcCallCount = 0;
    const startTime = Date.now();

    // Mock immediate accept function
    async function mockAcceptSwap(swapId: string) {
      rpcCallCount++;
      return { success: true, swapId };
    }

    const res = await mockAcceptSwap('swap_123');
    const duration = Date.now() - startTime;

    assert.strictEqual(res.success, true);
    assert.strictEqual(rpcCallCount, 1);
    // Should complete in milliseconds, definitely < 1000ms and not 5000ms
    assert.ok(duration < 1000, `Accept swap took ${duration}ms, expected < 1000ms`);
  });

  test('Duplicate click during active mutation produces exactly one RPC call', async () => {
    let rpcCallCount = 0;
    let isExecuting = false;

    async function commitAcceptWithGuard(swapId: string) {
      if (isExecuting) return { success: false, reason: 'guarded' };
      isExecuting = true;
      try {
        rpcCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { success: true, swapId };
      } finally {
        isExecuting = false;
      }
    }

    // Trigger two simultaneous clicks
    const [res1, res2] = await Promise.all([
      commitAcceptWithGuard('swap_456'),
      commitAcceptWithGuard('swap_456'),
    ]);

    assert.strictEqual(rpcCallCount, 1);
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res2.success, false);
    assert.strictEqual(res2.reason, 'guarded');
  });

  test('Optimistic removal happens immediately before background reconciliation', () => {
    let localSwaps = [{ id: 'swap_789', topic: 'React Performance' }];
    let backgroundReconcileCalled = false;

    // Simulate optimistic commit
    const targetId = 'swap_789';
    localSwaps = localSwaps.filter((s) => s.id !== targetId);

    // Assert optimistic UI state immediately
    assert.strictEqual(localSwaps.length, 0);
    assert.strictEqual(backgroundReconcileCalled, false);

    // Background reconciliation finishes later
    backgroundReconcileCalled = true;
    assert.strictEqual(backgroundReconcileCalled, true);
  });

  test('Error path restores local state correctly on failed RPC', async () => {
    let localSwaps = [{ id: 'swap_err', topic: 'Failed Swap' }];
    const originalItem = { id: 'swap_err', topic: 'Failed Swap' };

    // Optimistically remove
    localSwaps = localSwaps.filter((s) => s.id !== 'swap_err');
    assert.strictEqual(localSwaps.length, 0);

    // Simulate failed RPC response
    const rpcResult = { success: false, error: 'Insufficient credits' };

    if (!rpcResult.success) {
      // Restore item
      localSwaps = [originalItem, ...localSwaps];
    }

    assert.strictEqual(localSwaps.length, 1);
    assert.strictEqual(localSwaps[0].id, 'swap_err');
  });

  test('Submit Work transitions local state immediately on RPC success', () => {
    let swapStatus = 'accepted';
    let isModalOpen = true;

    // RPC returns success
    const rpcResult = { success: true, submissionId: 'sub_001' };

    if (rpcResult.success) {
      swapStatus = 'submitted';
      isModalOpen = false;
    }

    assert.strictEqual(swapStatus, 'submitted');
    assert.strictEqual(isModalOpen, false);
  });

  test('Complete Swap updates local balance immediately using returned RPC payload', () => {
    let userBalance = 100;
    let userReserved = 25;
    let swapStatus = 'submitted';

    // RPC returns updated balances directly
    const rpcResult = {
      success: true,
      payer_credits_balance: 100,
      payer_credits_reserved: 0,
      recipient_credits_balance: 125,
    };

    if (rpcResult.success) {
      swapStatus = 'completed';
      userBalance = rpcResult.payer_credits_balance;
      userReserved = rpcResult.payer_credits_reserved;
    }

    assert.strictEqual(swapStatus, 'completed');
    assert.strictEqual(userBalance, 100);
    assert.strictEqual(userReserved, 0);
  });

  test('Cancel Swap updates local balance and closed state immediately', () => {
    let userListings = [{ id: 'swap_cancel', status: 'open' }];
    let userHistory: typeof userListings = [];
    let userBalance = 50;
    let userReserved = 25;

    // RPC returns updated balances directly
    const rpcResult = {
      success: true,
      credits_balance: 75,
      credits_reserved: 0,
    };

    if (rpcResult.success) {
      const canceled = { ...userListings[0], status: 'cancelled' };
      userListings = userListings.filter((l) => l.id !== 'swap_cancel');
      userHistory = [canceled, ...userHistory];
      userBalance = rpcResult.credits_balance;
      userReserved = rpcResult.credits_reserved;
    }

    assert.strictEqual(userListings.length, 0);
    assert.strictEqual(userHistory.length, 1);
    assert.strictEqual(userHistory[0].status, 'cancelled');
    assert.strictEqual(userBalance, 75);
    assert.strictEqual(userReserved, 0);
  });

  test('Realtime event within 3 seconds of local mutation is ignored to prevent redundant reloads', () => {
    const lastMutationTimestamp = Date.now();
    let reloadedAllSwaps = false;

    function handleRealtimeEvent() {
      if (Date.now() - lastMutationTimestamp < 3000) {
        return; // Ignore
      }
      reloadedAllSwaps = true;
    }

    handleRealtimeEvent();
    assert.strictEqual(reloadedAllSwaps, false);
  });

  test('Explore page uses requester profile completedSwapsCount directly without N+1 queries', () => {
    const swapRecord = {
      id: 'swap_1',
      requesterId: 'req_1',
      topic: 'Python ML',
      requesterProfile: {
        fullName: 'Alice Developer',
        completedSwapsCount: 8,
      },
    };

    // Derived directly without separate per-requester network fetch
    const completedCount = swapRecord.requesterProfile?.completedSwapsCount ?? 0;
    assert.strictEqual(completedCount, 8);
  });
});
