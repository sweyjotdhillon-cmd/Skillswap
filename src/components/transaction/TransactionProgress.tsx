import React, { useState, useEffect } from 'react';
import type { SwapStatus } from '../../types/swap';
import { CompletionConfirmation } from './CompletionConfirmation';
import { PendingTransactionVault } from './PendingTransactionVault';
import {
  calculateRemainingAutoReleaseMs,
  formatRemainingTime,
} from './transactionUtils';

export interface TransactionProgressProps {
  swapId?: string;
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

export const TransactionProgress: React.FC<TransactionProgressProps> = ({
  swapId,
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
        background: 'var(--card-bg, var(--color-surface, #ffffff))',
        border: '1px solid var(--border-color, var(--color-border, rgba(15, 23, 42, 0.12)))',
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
          let color = 'var(--text-muted, #64748b)';
          let bgColor = 'rgba(100, 116, 139, 0.1)';
          let borderColor = 'rgba(100, 116, 139, 0.3)';
          let stateText = 'upcoming';

          if (isCompleted) {
            badgeIcon = '✓';
            badgeClass = 'tx-step--completed';
            color = '#10b981';
            bgColor = 'rgba(16, 185, 129, 0.15)';
            borderColor = '#10b981';
            stateText = 'completed';
          } else if (isCurrent) {
            badgeIcon = isFinalGoal ? '★' : '●';
            badgeClass = 'tx-step--current';
            color = status === 'completed' ? '#10b981' : 'var(--color-structure, #0284c7)';
            bgColor = status === 'completed' ? 'rgba(16, 185, 129, 0.15)' : 'var(--color-structure-muted, rgba(2, 132, 199, 0.1))';
            borderColor = status === 'completed' ? '#10b981' : 'var(--color-structure, #0284c7)';
            stateText = 'current stage';
          } else if (isTerminated) {
            color = 'var(--text-muted, #64748b)';
            bgColor = 'rgba(100, 116, 139, 0.1)';
            borderColor = 'rgba(100, 116, 139, 0.25)';
            stateText = 'inactive due to cancellation';
          } else if (isFinalGoal) {
            badgeIcon = '🏁';
            color = 'var(--color-accent, #d6a64a)';
            bgColor = 'var(--color-accent-muted, rgba(214, 166, 74, 0.15))';
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
                      ? 'var(--text-color, #0f172a)'
                      : isCompleted
                      ? color
                      : 'var(--text-muted, #64748b)',
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
                    background: isCompleted ? '#10b981' : 'rgba(148, 163, 184, 0.25)',
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

      {/* L17 PENDING TRANSACTION VAULT INDICATOR */}
      {typeof creditAmount === 'number' && creditAmount > 0 && (
        <PendingTransactionVault
          creditAmount={creditAmount}
          status={status}
          compact
        />
      )}

      {/* DYNAMIC CONTEXTUAL DETAILS & COUNTDOWN / CLOSURE BANNER */}
      <div className="tx-progress-details" style={{ marginTop: '0.85rem', borderTop: '1px solid rgba(15, 23, 42, 0.08)', paddingTop: '0.75rem' }}>
        {status === 'open' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary, #475569)' }}>
            <span style={{ color: 'var(--color-structure, #0284c7)' }} aria-hidden="true">●</span>
            <span>Listing is open for community acceptance. Reserved credits remain held in escrow.</span>
          </div>
        )}

        {status === 'accepted' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary, #475569)' }}>
            <span style={{ color: 'var(--color-structure, #0284c7)' }} aria-hidden="true">●</span>
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
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#b45309' }}>
                ● Deliverables Submitted for Requester Review
              </span>
              <span style={{ fontSize: '0.825rem', fontFamily: 'monospace', fontWeight: 700, color: '#b45309', background: 'rgba(217, 119, 6, 0.15)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                {!isAutoReleaseExpired
                  ? formatRemainingTime(remainingMs)
                  : 'Auto-release window reached (Pending automatic settlement)'}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary, #475569)', lineHeight: 1.4 }}>
              {!isAutoReleaseExpired
                ? 'The requester has time to review submitted deliverables before credits auto-release to participant.'
                : 'The review window has passed. The backend scheduler or next action will finalize credit settlement.'}
            </p>
          </div>
        )}

        {status === 'completed' && (
          <CompletionConfirmation
            swapId={swapId}
            status={status}
            creditAmount={creditAmount}
          />
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
              color: 'var(--status-error, #dc2626)',
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
