import React, { useState, useEffect } from 'react';
import { getFileExpiryStatus, type FileExpiryStatus } from '../../lib/fileExpiry';
import type { FileLifecycle } from '../../types/swap';

export interface FileExpiryIndicatorProps {
  lifecycle?: FileLifecycle | null;
  expiresAt?: string | null;
  deletedAt?: string | null;
  deleteStatus?: string | null;
  storageExpiresAt?: string | null;
  storageDeletedAt?: string | null;
  storageDeleteStatus?: string | null;
  deleteAfter?: string | null;
  isDeleted?: boolean;
  inline?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const FileExpiryIndicator: React.FC<FileExpiryIndicatorProps> = ({
  lifecycle,
  expiresAt,
  deletedAt,
  deleteStatus,
  storageExpiresAt,
  storageDeletedAt,
  storageDeleteStatus,
  deleteAfter,
  isDeleted,
  inline = false,
  className = '',
  style,
}) => {
  const effectiveExpiresAt = lifecycle?.expiresAt ?? expiresAt ?? storageExpiresAt ?? deleteAfter ?? null;
  const effectiveDeletedAt = lifecycle?.deletedAt ?? deletedAt ?? storageDeletedAt ?? null;
  const effectiveDeleteStatus = lifecycle?.deleteStatus ?? deleteStatus ?? storageDeleteStatus ?? null;

  const isDeletedCombined = Boolean(
    isDeleted ||
    effectiveDeletedAt ||
    (effectiveDeleteStatus && effectiveDeleteStatus !== 'active' && effectiveDeleteStatus !== 'failed')
  );

  const [expiryStatus, setExpiryStatus] = useState<FileExpiryStatus>(() =>
    getFileExpiryStatus(effectiveExpiresAt, isDeletedCombined)
  );

  useEffect(() => {
    // Immediate calculation on prop changes
    const currentStatus = getFileExpiryStatus(effectiveExpiresAt, isDeletedCombined);
    setExpiryStatus(currentStatus);

    if (!effectiveExpiresAt || currentStatus.isExpired) {
      return;
    }

    // Dynamic timer update interval:
    // Every 1s if under 1 minute remaining to capture exact expiry boundary
    // Every 10s if under 1 hour remaining, otherwise every 30s
    const updateIntervalMs =
      currentStatus.remainingMs < 60 * 1000
        ? 1000
        : currentStatus.remainingMs < 60 * 60 * 1000
        ? 10000
        : 30000;

    const timer = setInterval(() => {
      const nextStatus = getFileExpiryStatus(effectiveExpiresAt, isDeletedCombined);
      setExpiryStatus(nextStatus);

      if (nextStatus.isExpired) {
        clearInterval(timer);
      }
    }, updateIntervalMs);

    return () => clearInterval(timer);
  }, [effectiveExpiresAt, isDeletedCombined, effectiveDeleteStatus, effectiveDeletedAt]);

  // Don't render anything if no authoritative expiry timestamp exists and not deleted
  if (!effectiveExpiresAt && !isDeletedCombined) {
    return null;
  }

  const { displayText, subtext, urgency, isExpired } = expiryStatus;

  if (!displayText) {
    return null;
  }

  // Visual token mapping matching SkillSwap design tokens
  let urgencyStyle = 'var(--text-muted, #94a3b8)';
  let badgeBg = 'rgba(148, 163, 184, 0.12)';
  let borderColor = 'rgba(148, 163, 184, 0.25)';

  if (urgency === 'soon') {
    urgencyStyle = 'var(--color-warning, #d6a64a)';
    badgeBg = 'rgba(214, 166, 74, 0.15)';
    borderColor = 'rgba(214, 166, 74, 0.3)';
  } else if (urgency === 'very_soon') {
    urgencyStyle = '#f97316'; // Orange warning
    badgeBg = 'rgba(249, 115, 22, 0.15)';
    borderColor = 'rgba(249, 115, 22, 0.35)';
  } else if (urgency === 'expired' || isExpired) {
    urgencyStyle = 'var(--color-error, #ef4444)';
    badgeBg = 'rgba(239, 68, 68, 0.12)';
    borderColor = 'rgba(239, 68, 68, 0.3)';
  }

  const tooltipText = subtext || displayText;

  if (inline) {
    return (
      <span
        className={`file-expiry-indicator file-expiry-indicator--inline ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          fontSize: '0.75rem',
          fontWeight: 500,
          color: urgencyStyle,
          ...style,
        }}
        role="status"
        aria-live="polite"
        title={tooltipText}
      >
        <span aria-hidden="true">•</span>
        <span>{displayText}</span>
      </span>
    );
  }

  return (
    <div
      className={`file-expiry-indicator file-expiry-indicator--badge ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        padding: '0.15rem 0.45rem',
        borderRadius: '6px',
        fontSize: '0.725rem',
        fontWeight: 600,
        lineHeight: 1.2,
        color: urgencyStyle,
        backgroundColor: badgeBg,
        border: `1px solid ${borderColor}`,
        whiteSpace: 'nowrap',
        ...style,
      }}
      role="status"
      aria-live="polite"
      title={tooltipText}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span>{displayText}</span>
    </div>
  );
};
