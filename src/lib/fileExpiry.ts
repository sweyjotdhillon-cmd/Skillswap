export interface FileExpiryStatus {
  isExpired: boolean;
  isDeleted: boolean;
  displayText: string;
  remainingMs: number;
  urgency: 'normal' | 'soon' | 'very_soon' | 'expired';
}

/**
  * Formats a remaining duration in milliseconds or explicit expiry timestamp into plain human-readable text.
  * Rules:
  * - <= 0ms -> "Expired"
  * - >= 2 days -> "X days left"
  * - >= 1 day -> "1 day left"
  * - >= 2 hours -> "X hours left"
  * - >= 1 hour -> "1 hour left"
  * - < 1 hour -> "X minutes left"
  */
export function formatFileExpiryTime(remainingMs: number): { text: string; urgency: 'normal' | 'soon' | 'very_soon' | 'expired' } {
  if (isNaN(remainingMs) || remainingMs <= 0) {
    return { text: 'Expired', urgency: 'expired' };
  }

  const ONE_MINUTE_MS = 60 * 1000;
  const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
  const ONE_DAY_MS = 24 * ONE_HOUR_MS;

  if (remainingMs >= 2 * ONE_DAY_MS) {
    const days = Math.floor(remainingMs / ONE_DAY_MS);
    return { text: `${days} days left`, urgency: 'normal' };
  }

  if (remainingMs >= ONE_DAY_MS) {
    return { text: '1 day left', urgency: 'normal' };
  }

  if (remainingMs >= 2 * ONE_HOUR_MS) {
    const hours = Math.floor(remainingMs / ONE_HOUR_MS);
    const urgency = hours <= 3 ? 'soon' : 'normal';
    return { text: `${hours} hours left`, urgency };
  }

  if (remainingMs >= ONE_HOUR_MS) {
    return { text: '1 hour left', urgency: 'soon' };
  }

  // Under 1 hour
  const minutes = Math.max(1, Math.floor(remainingMs / ONE_MINUTE_MS));
  return { text: `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`, urgency: 'very_soon' };
}

/**
  * Computes file expiry status from authoritative timestamp and deletion flags.
  */
export function getFileExpiryStatus(
  expiresAtTimestamp?: string | null,
  isDeletedFlag?: boolean | string | null
): FileExpiryStatus {
  const isDeleted = Boolean(
    isDeletedFlag === true ||
    isDeletedFlag === 'deleted' ||
    isDeletedFlag === 'pending_deletion' ||
    (typeof isDeletedFlag === 'string' && isDeletedFlag.trim().length > 0 && isDeletedFlag !== 'active' && isDeletedFlag !== 'failed')
  );

  if (!expiresAtTimestamp) {
    if (isDeleted) {
      return {
        isExpired: true,
        isDeleted: true,
        displayText: 'Unavailable',
        remainingMs: 0,
        urgency: 'expired',
      };
    }
    return {
      isExpired: false,
      isDeleted: false,
      displayText: '',
      remainingMs: Infinity,
      urgency: 'normal',
    };
  }

  const targetMs = new Date(expiresAtTimestamp).getTime();
  if (isNaN(targetMs)) {
    return {
      isExpired: isDeleted,
      isDeleted,
      displayText: isDeleted ? 'Unavailable' : '',
      remainingMs: isDeleted ? 0 : Infinity,
      urgency: isDeleted ? 'expired' : 'normal',
    };
  }

  const now = Date.now();
  const remainingMs = targetMs - now;

  if (isDeleted || remainingMs <= 0) {
    return {
      isExpired: true,
      isDeleted,
      displayText: isDeleted ? 'Unavailable' : 'Expired',
      remainingMs: Math.max(0, remainingMs),
      urgency: 'expired',
    };
  }

  const { text, urgency } = formatFileExpiryTime(remainingMs);

  return {
    isExpired: false,
    isDeleted: false,
    displayText: text,
    remainingMs,
    urgency,
  };
}
