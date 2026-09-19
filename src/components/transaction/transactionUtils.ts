/**
 * Transaction progress & vault helper utilities.
 * Separated from component files to satisfy React Fast Refresh linting rules.
 */

/**
 * Checks if the user prefers reduced motion via CSS media query.
 */
export function checkPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Normalizes any swap or transaction status string into canonical vault lifecycle states:
 * - 'pending': open, accepted, submitted, pending, reserved
 * - 'completed': completed, settled
 * - 'cancelled': cancelled, declined, withdrawn, expired
 */
export function getVaultState(
  status?: string
): 'pending' | 'completed' | 'cancelled' {
  if (!status) return 'pending';
  const lower = status.toLowerCase();
  if (['completed', 'settled', 'released'].includes(lower)) {
    return 'completed';
  }
  if (['cancelled', 'declined', 'withdrawn', 'expired', 'closed'].includes(lower)) {
    return 'cancelled';
  }
  return 'pending';
}

/**
 * Single Canonical Auto-Release Deadline Utility
 * Calculates remaining time in milliseconds from a backend autoReleaseAt (or submittedAt fallback) timestamp relative to an absolute timestamp.
 */
export function calculateRemainingAutoReleaseMs(
  autoReleaseAtOrSubmittedAt: string | null | undefined,
  submittedAtOrDays?: string | number | null,
  nowMs: number = Date.now()
): number {
  if (!autoReleaseAtOrSubmittedAt) {
    if (typeof submittedAtOrDays === 'string' && submittedAtOrDays) {
      const subMs = new Date(submittedAtOrDays).getTime();
      if (!isNaN(subMs)) {
        return Math.max(0, subMs + 7 * 24 * 60 * 60 * 1000 - nowMs);
      }
    }
    return 0;
  }

  // Case A: Second arg is number (legacy autoReleaseDays parameter e.g. 7)
  if (typeof submittedAtOrDays === 'number') {
    const submittedMs = new Date(autoReleaseAtOrSubmittedAt).getTime();
    if (isNaN(submittedMs)) return 0;
    const targetMs = submittedMs + submittedAtOrDays * 24 * 60 * 60 * 1000;
    return Math.max(0, targetMs - nowMs);
  }

  // Case B: First arg is autoReleaseAt timestamp
  const targetMs = new Date(autoReleaseAtOrSubmittedAt).getTime();
  if (!isNaN(targetMs)) {
    // If first arg and second arg are identical ISO strings, first arg was submittedAt
    if (typeof submittedAtOrDays === 'string' && submittedAtOrDays) {
      const subMs = new Date(submittedAtOrDays).getTime();
      if (!isNaN(subMs) && targetMs === subMs) {
        return Math.max(0, subMs + 7 * 24 * 60 * 60 * 1000 - nowMs);
      }
    }
    return Math.max(0, targetMs - nowMs);
  }

  // Case C: Second arg is submittedAt string fallback
  if (typeof submittedAtOrDays === 'string' && submittedAtOrDays) {
    const subMs = new Date(submittedAtOrDays).getTime();
    if (!isNaN(subMs)) {
      return Math.max(0, subMs + 7 * 24 * 60 * 60 * 1000 - nowMs);
    }
  }

  return 0;
}

/**
 * Formats milliseconds into human-readable time adhering to L10 UX guidelines:
 * - e.g. "Auto-release in 23h 41m", "Auto-release in 3h 18m", "Auto-release in 42m"
 * - for < 1m: "Auto-release soon"
 * - for <= 0ms: "Pending automatic settlement"
 */
export function formatRemainingTime(ms: number): string {
  if (ms <= 0) return 'Pending automatic settlement';

  const totalMinutes = Math.floor(ms / (60 * 1000));
  if (totalMinutes < 1) {
    return 'Auto-release soon';
  }

  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `Auto-release in ${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `Auto-release in ${hours}h ${minutes}m`;
  }
  return `Auto-release in ${minutes}m`;
}

/**
 * Formats remaining seconds into standardized timer display string.
 */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00h 00m 00s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hrs >= 24) {
    const days = Math.floor(hrs / 24);
    const remHrs = hrs % 24;
    return `${days}d ${pad(remHrs)}h ${pad(mins)}m ${pad(secs)}s`;
  }
  return `${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`;
}
