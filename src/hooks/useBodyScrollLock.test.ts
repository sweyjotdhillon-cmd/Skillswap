import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  acquireBodyScrollLock,
  releaseBodyScrollLock,
  getBodyScrollLockCount,
  resetBodyScrollLockState,
} from './useBodyScrollLock.js';

describe('useBodyScrollLock Unit & Contract Tests', () => {
  beforeEach(() => {
    resetBodyScrollLockState();
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  });

  it('1. Opening a modal acquires a lock and sets document.body.style.overflow to hidden', () => {
    // Setup mock document if in Node environment
    if (typeof document === 'undefined') {
      (global as unknown as { document: { body: { style: { overflow: string } } } }).document = {
        body: { style: { overflow: '' } },
      };
    }

    assert.equal(getBodyScrollLockCount(), 0);
    assert.equal(document.body.style.overflow, '');

    acquireBodyScrollLock();

    assert.equal(getBodyScrollLockCount(), 1);
    assert.equal(document.body.style.overflow, 'hidden');
  });

  it('2. Closing the modal releases its lock and restores original body overflow', () => {
    if (typeof document === 'undefined') {
      (global as unknown as { document: { body: { style: { overflow: string } } } }).document = {
        body: { style: { overflow: '' } },
      };
    }

    document.body.style.overflow = '';
    acquireBodyScrollLock();
    assert.equal(document.body.style.overflow, 'hidden');

    releaseBodyScrollLock();
    assert.equal(getBodyScrollLockCount(), 0);
    assert.equal(document.body.style.overflow, '');
  });

  it('3. Simultaneous/nested modal locks preserve overflow: hidden when child closes while parent lock exists', () => {
    if (typeof document === 'undefined') {
      (global as unknown as { document: { body: { style: { overflow: string } } } }).document = {
        body: { style: { overflow: '' } },
      };
    }

    // Parent modal (e.g. ActiveSwaps) opens
    acquireBodyScrollLock(); // lockCount = 1
    assert.equal(getBodyScrollLockCount(), 1);
    assert.equal(document.body.style.overflow, 'hidden');

    // Child modal (e.g. SwapChatModal) opens inside ActiveSwaps
    acquireBodyScrollLock(); // lockCount = 2
    assert.equal(getBodyScrollLockCount(), 2);
    assert.equal(document.body.style.overflow, 'hidden');

    // Child modal closes (SwapChatModal unmounts)
    releaseBodyScrollLock(); // lockCount = 1
    assert.equal(getBodyScrollLockCount(), 1);
    // Body MUST REMAIN locked because parent modal lock is still active!
    assert.equal(document.body.style.overflow, 'hidden');

    // Parent modal closes
    releaseBodyScrollLock(); // lockCount = 0
    assert.equal(getBodyScrollLockCount(), 0);
    // Body is now restored to original overflow state!
    assert.equal(document.body.style.overflow, '');
  });

  it('4. Preserves non-empty initial overflow style across multiple locks', () => {
    if (typeof document === 'undefined') {
      (global as unknown as { document: { body: { style: { overflow: string } } } }).document = {
        body: { style: { overflow: 'visible' } },
      };
    } else {
      document.body.style.overflow = 'visible';
    }

    acquireBodyScrollLock(); // lockCount = 1
    assert.equal(document.body.style.overflow, 'hidden');

    acquireBodyScrollLock(); // lockCount = 2
    assert.equal(document.body.style.overflow, 'hidden');

    releaseBodyScrollLock(); // lockCount = 1
    assert.equal(document.body.style.overflow, 'hidden');

    releaseBodyScrollLock(); // lockCount = 0
    assert.equal(document.body.style.overflow, 'visible');
  });

  it('5. Safe across duplicate releases or reset calls', () => {
    if (typeof document === 'undefined') {
      (global as unknown as { document: { body: { style: { overflow: string } } } }).document = {
        body: { style: { overflow: '' } },
      };
    }

    acquireBodyScrollLock();
    releaseBodyScrollLock();
    // Extra release when count is 0
    releaseBodyScrollLock();

    assert.equal(getBodyScrollLockCount(), 0);
    assert.equal(document.body.style.overflow, '');
  });
});
