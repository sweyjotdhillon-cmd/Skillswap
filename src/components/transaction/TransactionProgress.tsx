import React, { useState, useEffect } from 'react';
import type { SwapStatus } from '../../types/swap';

export interface TransactionProgressProps {
  status: SwapStatus;
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
 * Calculates remaining time in milliseconds from a submittedAt ISO timestamp and autoReleaseDays.
 */
export function calculateRemainingAutoReleaseMs(
  submittedAt: string | null | undefined,
  autoReleaseDays: number = 7,
  nowMs: number = Date.now()
): number {
  if (!submittedAt) return 0;
  const submittedMs = new Date(submittedAt).getTime();
  if (isNaN(submittedMs)) return 0;

  const targetMs = submittedMs + autoReleaseDays * 24 * 60 * 60 * 1000;
  return Math.max(0, targetMs - nowMs);
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

export const TransactionProgress: React.FC<TransactionProgressProps> = ({
  status,
  submittedAt,
  creditAmount,
  autoReleaseDays = 7,
  className = '',
}) => {
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    if (status !== 'submitted' || !submittedAt) return;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [status, submittedAt]);

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

  const remainingMs = status === 'submitted' ? calculateRemainingAutoReleaseMs(submittedAt, autoReleaseDays, now) : 0;
  const isAutoReleaseExpired = status === 'submitted' && remainingMs === 0;

  return (
    <div
      className={`tx-progress-container ${className}`}
      style={{
        background: 'var(--card-bg, rgba(30, 41, 59, 0.6))',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1rem',
      }}
      aria-label="Transaction Lifecycle Progress"
    >
      {/* LIFECYCLE STEPPER HEADER */}
      <div
        className="tx-progress-stepper"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          gap: '0.5rem',
        }}
        role="navigation"
        aria-label="Transaction Stages"
      >
        {LIFECYCLE_STAGES.map((stage, idx) => {
          const isCompleted = !isTerminated && idx < currentIndex;
          const isCurrent = !isTerminated && idx === currentIndex;
          const isFuture = isTerminated || idx > currentIndex;

          let badgeIcon = '○';
          let badgeClass = 'tx-step--future';
          let color = 'var(--text-muted, #94a3b8)';
          let bgColor = 'rgba(148, 163, 184, 0.1)';
          let borderColor = 'rgba(148, 163, 184, 0.3)';

          if (isCompleted) {
            badgeIcon = '✓';
            badgeClass = 'tx-step--completed';
            color = '#10b981';
            bgColor = 'rgba(16, 185, 129, 0.15)';
            borderColor = '#10b981';
          } else if (isCurrent) {
            badgeIcon = '●';
            badgeClass = 'tx-step--current';
            color = status === 'completed' ? '#10b981' : '#38bdf8';
            bgColor = status === 'completed' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)';
            borderColor = status === 'completed' ? '#10b981' : '#38bdf8';
          }

          return (
            <React.Fragment key={stage.key}>
              <div
                className={`tx-step ${badgeClass}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.35rem',
                  flex: 1,
                  textAlign: 'center',
                  zIndex: 2,
                }}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <div
                  className="tx-step-icon"
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: bgColor,
                    border: `2px solid ${borderColor}`,
                    color: color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.825rem',
                    fontWeight: 700,
                  }}
                >
                  <span aria-hidden="true">{badgeIcon}</span>
                </div>
                <span
                  className="tx-step-label"
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: isCurrent ? 700 : isCompleted ? 600 : 400,
                    color: isCurrent ? 'var(--text-color, #f8fafc)' : isCompleted ? color : 'var(--text-muted, #94a3b8)',
                  }}
                >
                  {stage.label}
                </span>
              </div>

              {idx < LIFECYCLE_STAGES.length - 1 && (
                <div
                  className="tx-step-line"
                  style={{
                    flex: 1,
                    height: '2px',
                    background: isCompleted ? '#10b981' : 'rgba(148, 163, 184, 0.2)',
                    marginTop: '-1.25rem',
                  }}
                  aria-hidden="true"
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* DYNAMIC CONTEXTUAL DETAILS & COUNTDOWN / CLOSURE BANNER */}
      <div className="tx-progress-details" style={{ marginTop: '0.85rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '0.75rem' }}>
        {status === 'open' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span style={{ color: '#38bdf8' }}>●</span>
            <span>Listing is open for community acceptance. Reserved credits remain held in escrow.</span>
          </div>
        )}

        {status === 'accepted' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span style={{ color: '#38bdf8' }}>●</span>
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
                ? `The requester has ${autoReleaseDays} days to review submitted deliverables. If unreviewed, credits auto-release to participant.`
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
              <span style={{ color: '#10b981', fontSize: '1rem', fontWeight: 800 }}>✓</span>
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
          <div style={{ fontSize: '0.85rem', color: 'var(--error-color, #ef4444)' }}>
            This swap has been {status}.
          </div>
        )}
      </div>
    </div>
  );
};
