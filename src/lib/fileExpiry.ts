import { useState, useEffect } from 'react';

export interface FileExpiryStatus {
  isExpired: boolean;
  isDeleted: boolean;
  displayText: string;
  subtext: string;
  remainingMs: number;
  urgency: 'normal' | 'soon' | 'very_soon' | 'expired';
}

/**
 * Formats a remaining duration in milliseconds or explicit expiry timestamp into plain human-readable text.
 * Rules:
 * - <= 0ms -> "File expired"
 * - >= 2 days -> "Expires in X days"
 * - >= 1 day -> "Expires in 1 day"
 * - >= 2 hours -> "Expires in X hours"
 * - >= 1 hour -> "Expires in 1 hour"
 * - < 1 hour -> "Expires in X minutes"
 */
export function formatFileExpiryTime(remainingMs: number): { text: string; urgency: 'normal' | 'soon' | 'very_soon' | 'expired' } {
  if (isNaN(remainingMs) || remainingMs <= 0) {
    return { text: 'File expired', urgency: 'expired' };
  }

  const ONE_MINUTE_MS = 60 * 1000;
  const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
  const ONE_DAY_MS = 24 * ONE_HOUR_MS;

  if (remainingMs >= 2 * ONE_DAY_MS) {
    const days = Math.floor(remainingMs / ONE_DAY_MS);
    return { text: `Expires in ${days} days`, urgency: 'normal' };
  }

  if (remainingMs >= ONE_DAY_MS) {
    return { text: 'Expires in 1 day', urgency: 'normal' };
  }

  if (remainingMs >= 2 * ONE_HOUR_MS) {
    const hours = Math.floor(remainingMs / ONE_HOUR_MS);
    const urgency = hours <= 3 ? 'soon' : 'normal';
    return { text: `Expires in ${hours} hours`, urgency };
  }

  if (remainingMs >= ONE_HOUR_MS) {
    return { text: 'Expires in 1 hour', urgency: 'soon' };
  }

  // Under 1 hour
  const minutes = Math.max(1, Math.floor(remainingMs / ONE_MINUTE_MS));
  return { text: `Expires in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`, urgency: 'very_soon' };
}

/**
 * Computes file expiry status from authoritative timestamp and deletion flags.
 * Canonical public user-facing states:
 * Active: "Expires in X"
 * Expired / Deleted: "File expired", subtext "This file is no longer available."
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
        displayText: 'File expired',
        subtext: 'This file is no longer available.',
        remainingMs: 0,
        urgency: 'expired',
      };
    }
    return {
      isExpired: false,
      isDeleted: false,
      displayText: '',
      subtext: '',
      remainingMs: Infinity,
      urgency: 'normal',
    };
  }

  const targetMs = new Date(expiresAtTimestamp).getTime();
  if (isNaN(targetMs)) {
    return {
      isExpired: isDeleted,
      isDeleted,
      displayText: isDeleted ? 'File expired' : '',
      subtext: isDeleted ? 'This file is no longer available.' : '',
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
      displayText: 'File expired',
      subtext: 'This file is no longer available.',
      remainingMs: Math.max(0, remainingMs),
      urgency: 'expired',
    };
  }

  const { text, urgency } = formatFileExpiryTime(remainingMs);

  return {
    isExpired: false,
    isDeleted: false,
    displayText: text,
    subtext: '',
    remainingMs,
    urgency,
  };
}

/**
 * React hook that subscribes to an attachment's expiry status and automatically
 * updates at exact boundary intervals (1s when < 1 minute left) so that expiry
 * transitions occur immediately without requiring page refresh.
 */
export function useFileExpiry(
  expiresAtTimestamp?: string | null,
  isDeletedFlag?: boolean | string | null
): FileExpiryStatus {
  const [status, setStatus] = useState<FileExpiryStatus>(() =>
    getFileExpiryStatus(expiresAtTimestamp, isDeletedFlag)
  );

  useEffect(() => {
    const current = getFileExpiryStatus(expiresAtTimestamp, isDeletedFlag);
    setStatus(current);

    if (!expiresAtTimestamp || current.isExpired) return;

    // Tick every 1s when remaining time is < 1 minute to catch exact boundary
    const intervalMs = current.remainingMs < 60 * 1000 ? 1000 : current.remainingMs < 3600 * 1000 ? 10000 : 30000;
    const timer = setInterval(() => {
      const next = getFileExpiryStatus(expiresAtTimestamp, isDeletedFlag);
      setStatus(next);
      if (next.isExpired) clearInterval(timer);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [expiresAtTimestamp, isDeletedFlag]);

  return status;
}
