import { useEffect } from 'react';

let lockCount = 0;
let originalOverflow: string | null = null;

/**
 * Acquire a re-entrant body scroll lock.
 * Captures document.body.style.overflow on the initial lock (lockCount 0 -> 1)
 * and sets body overflow to 'hidden'.
 */
export function acquireBodyScrollLock(): void {
  if (typeof document === 'undefined') return;

  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;
}

/**
 * Release a body scroll lock.
 * Decrements active lock counter. Only when all active locks are released
 * (lockCount reaches 0) is original body overflow restored.
 */
export function releaseBodyScrollLock(): void {
  if (typeof document === 'undefined') return;

  if (lockCount > 0) {
    lockCount -= 1;
    if (lockCount === 0) {
      document.body.style.overflow = originalOverflow ?? '';
      originalOverflow = null;
    }
  }
}

/**
 * Helper to inspect active lock count (useful for contract/unit tests).
 */
export function getBodyScrollLockCount(): number {
  return lockCount;
}

/**
 * Helper to reset lock state in test environments if needed.
 */
export function resetBodyScrollLockState(): void {
  lockCount = 0;
  originalOverflow = null;
}

/**
 * React hook to manage re-entrant body scroll locking.
 * Safe for simultaneous/nested modals, React Strict Mode, dynamic prop changes, and unmounts.
 *
 * @param isLocked Whether the current component/modal requires body scroll to be locked.
 */
export function useBodyScrollLock(isLocked: boolean = true): void {
  useEffect(() => {
    if (!isLocked) return;

    acquireBodyScrollLock();

    return () => {
      releaseBodyScrollLock();
    };
  }, [isLocked]);
}
