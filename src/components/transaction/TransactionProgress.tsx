import React, { useState, useEffect } from 'react';
import type { SwapStatus } from '../../types/swap';

export interface TransactionProgressProps {
  status: SwapStatus;
  autoReleaseAt?: string | null;
  submittedAt?: string | null;
  completedAt?: string | null;
  creditAmount?: number;
  autoReleaseDays?: number;
  className?: string;
}

const LIFECYCLE_STAGES: Array<{ key: SwapStatus; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'completed', label: 'Completed' },
];

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
 * Formats milliseconds into human-readable time (e.g., "6d 23h 59m" or "47h 18m 32s").
 */
export function formatRemainingTime(ms: number): string {
  if (ms <= 0) return '0m 0s';

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
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

export const TransactionProgress: React.FC<TransactionProgressProps> = ({
  status,
  autoReleaseAt,
  submittedAt,
  creditAmount,
  autoReleaseDays = 7,
  className = '',
}) => {
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    if (status !== 'submitted' || (!autoReleaseAt && !submittedAt)) return;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [status, autoReleaseAt, submittedAt]);

  const getStageIndex = (s: SwapStatus): number => {
    switch (s) {
      case 'open':
        return 0;
      case 'accepted':
        return 1;
      case 'submitted':
        return 2;
      case 'completed':
        return 3;
      case 'cancelled':
      case 'declined':
      case 'withdrawn':
      case 'expired':
        return -1;
      default:
        return 0;
    }
  };

  const currentIndex = getStageIndex(status);
  const isTerminated = currentIndex === -1;

  const remainingMs = status === 'submitted'
    ? calculateRemainingAutoReleaseMs(autoReleaseAt, submittedAt || autoReleaseDays, now)
    : 0;
  const isAutoReleaseExpired = status === 'submitted' && remainingMs === 0;

  const getStatusAnnouncement = (): string => {
    switch (status) {
      case 'open':
        return 'Status: Open. Listing is active and waiting for community acceptance.';
      case 'accepted':
        return 'Status: Accepted. Swap is in progress.';
      case 'submitted':
        return 'Status: Submitted. Deliverables are submitted and awaiting review.';
      case 'completed':
        return 'Status: Completed. Swap is finalized and credits are released.';
      case 'cancelled':
        return 'Status: Cancelled. This swap has been cancelled.';
      case 'declined':
        return 'Status: Declined. This swap proposal was declined.';
      case 'withdrawn':
        return 'Status: Withdrawn. This swap offer was withdrawn.';
      case 'expired':
        return 'Status: Expired. This swap request has expired.';
      default:
        return `Status: ${status}`;
    }
  };

  return (
    <section
      className={`tx-progress-container ${className}`}
      style={{
        background: 'var(--card-bg, rgba(30, 41, 59, 0.6))',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1rem',
      }}
      aria-label="Transaction Lifecycle Progress"
    >
      <div className="sr-only" role="status" aria-live="polite">
        {getStatusAnnouncement()}
      </div>

      {/* LIFECYCLE STEPPER HEADER */}
      <ol
        className="tx-progress-stepper"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          gap: '0.25rem',
          margin: 0,
          padding: 0,
          listStyle: 'none',
        }}
        aria-label="Transaction Stages"
      >
        {LIFECYCLE_STAGES.map((stage, idx) => {
          const isCompleted = !isTerminated && idx < currentIndex;
          const isCurrent = !isTerminated && idx === currentIndex;
          const isFinalGoal = idx === LIFECYCLE_STAGES.length - 1;

          let badgeIcon = '○';
          let badgeClass = 'tx-step--future';
          let color = 'var(--text-muted, #94a3b8)';
          let bgColor = 'rgba(148, 163, 184, 0.1)';
          let borderColor = 'rgba(148, 163, 184, 0.3)';
          let stateText = 'upcoming';

          if (isCompleted) {
            badgeIcon = '✓';
            badgeClass = 'tx-step--completed';
            color = '#10b981';
            bgColor = 'rgba(16, 185, 129, 0.2)';
            borderColor = '#10b981';
            stateText = 'completed';
          } else if (isCurrent) {
            badgeIcon = isFinalGoal ? '★' : '●';
            badgeClass = 'tx-step--current';
            color = status === 'completed' ? '#10b981' : '#38bdf8';
            bgColor = status === 'completed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.2)';
            borderColor = status === 'completed' ? '#10b981' : '#38bdf8';
            stateText = 'current stage';
          } else if (isTerminated) {
            color = 'var(--text-muted, #64748b)';
            bgColor = 'rgba(100, 116, 139, 0.1)';
            borderColor = 'rgba(100, 116, 139, 0.25)';
            stateText = 'inactive due to cancellation';
          } else if (isFinalGoal) {
            badgeIcon = '🏁';
            color = 'var(--color-warning, #d6a64a)';
            bgColor = 'rgba(214, 166, 74, 0.1)';
            borderColor = 'rgba(214, 166, 74, 0.4)';
            stateText = 'destination goal';
          }

          return (
            <React.Fragment key={stage.key}>
              <li
                className={`tx-step ${badgeClass}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.35rem',
                  flex: 1,
                  textAlign: 'center',
                  zIndex: 2,
                  minWidth: 0,
                }}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <div
                  className="tx-step-icon"
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    background: bgColor,
                    border: `2px solid ${borderColor}`,
                    color: color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    boxShadow: isCurrent ? `0 0 8px ${borderColor}` : 'none',
                    transition: 'all 0.2s ease-in-out',
                  }}
                  title={`${stage.label} stage: ${stateText}`}
                >
                  <span aria-hidden="true">{badgeIcon}</span>
                  <span className="sr-only">{`${stage.label} (${stateText})`}</span>
                </div>
                <span
                  className="tx-step-label"
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: isCurrent ? 700 : isCompleted ? 600 : 500,
                    color: isCurrent
                      ? 'var(--text-color, #f8fafc)'
                      : isCompleted
                      ? color
                      : 'var(--text-muted, #94a3b8)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                  }}
                >
                  {stage.label}
                </span>
              </li>

              {idx < LIFECYCLE_STAGES.length - 1 && (
                <div
                  className="tx-step-line"
                  style={{
                    flex: 1,
                    height: '3px',
                    background: isCompleted ? '#10b981' : 'rgba(148, 163, 184, 0.2)',
                    marginTop: '-1.25rem',
                    borderRadius: '2px',
                    transition: 'background 0.2s ease-in-out',
                  }}
                  aria-hidden="true"
                />
              )}
            </React.Fragment>
          );
        })}
      </ol>

      {/* DYNAMIC CONTEXTUAL DETAILS & COUNTDOWN / CLOSURE BANNER */}
      <div className="tx-progress-details" style={{ marginTop: '0.85rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '0.75rem' }}>
        {status === 'open' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span style={{ color: '#38bdf8' }} aria-hidden="true">●</span>
            <span>Listing is open for community acceptance. Reserved credits remain held in escrow.</span>
          </div>
        )}

        {status === 'accepted' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span style={{ color: '#38bdf8' }} aria-hidden="true">●</span>
            <span>Swap in progress. Participant is fulfilling deliverables before submitting work for review.</span>
          </div>
        )}

        {status === 'submitted' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              background: 'rgba(217, 119, 6, 0.08)',
              borderLeft: '4px solid #d97706',
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f59e0b' }}>
                ● Deliverables Submitted for Requester Review
              </span>
              <span style={{ fontSize: '0.825rem', fontFamily: 'monospace', fontWeight: 700, color: '#f59e0b', background: 'rgba(217, 119, 6, 0.15)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                {!isAutoReleaseExpired
                  ? `Auto-release in: ${formatRemainingTime(remainingMs)}`
                  : 'Auto-release window reached (Pending automatic settlement)'}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary, #cbd5e1)', lineHeight: 1.4 }}>
              {!isAutoReleaseExpired
                ? 'The requester has time to review submitted deliverables before credits auto-release to participant.'
                : 'The review window has passed. The backend scheduler or next action will finalize credit settlement.'}
            </p>
          </div>
        )}

        {status === 'completed' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
              background: 'rgba(16, 185, 129, 0.08)',
              borderLeft: '4px solid #10b981',
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: '#10b981', fontSize: '1rem', fontWeight: 800 }} aria-hidden="true">✓</span>
              <div>
                <strong style={{ fontSize: '0.875rem', color: '#10b981', display: 'block' }}>Swap Completed</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #cbd5e1)' }}>
                  Escrow settled successfully.
                </span>
              </div>
            </div>
            {creditAmount !== undefined && (
              <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#10b981', background: 'rgba(16, 185, 129, 0.15)', padding: '0.25rem 0.6rem', borderRadius: '6px' }}>
                +{creditAmount} SkillCredits
              </span>
            )}
          </div>
        )}

        {isTerminated && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'rgba(239, 68, 68, 0.08)',
              borderLeft: '4px solid #ef4444',
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              color: 'var(--error-color, #ef4444)',
              fontWeight: 600,
            }}
          >
            <span aria-hidden="true">✕</span>
            <span>This swap has been {status}. No further progress required.</span>
          </div>
        )}
      </div>
    </section>
  );
};
