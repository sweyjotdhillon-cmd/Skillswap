import React from 'react';
import type { SwapStatus } from '../../types/swap';

export interface PendingTransactionVaultProps {
  creditAmount?: number;
  status?: SwapStatus | 'pending' | 'reserved' | 'completed' | 'cancelled' | string;
  compact?: boolean;
  className?: string;
  showDetails?: boolean;
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
 * L17 Pending Transaction Vault Component
 * Renders a lightweight 2D isometric vault illustration at the canonical ~30° perspective.
 * Visualizes held transaction escrow credits with low-frequency ambient motion,
 * full reduced-motion accessibility, and 60-30-10 design system alignment.
 */
export const PendingTransactionVault: React.FC<PendingTransactionVaultProps> = React.memo(
  ({ creditAmount = 0, status = 'pending', compact = false, className = '', showDetails = true }) => {
    const vaultState = getVaultState(status);

    // Color definitions according to 60-30-10 palette
    let accentColor = 'var(--color-transactional, #d6a64a)';
    let accentBg = 'rgba(214, 166, 74, 0.12)';
    let accentBorder = 'rgba(214, 166, 74, 0.35)';
    let statusLabel = `${creditAmount} SkillCredits Held`;
    let titleText = 'Pending Transaction Vault';
    let descriptionText = 'Your credits are safely committed to this transaction and are waiting for the swap to reach its completion state.';

    if (vaultState === 'completed') {
      accentColor = 'var(--color-success, #10b981)';
      accentBg = 'rgba(16, 185, 129, 0.12)';
      accentBorder = 'rgba(16, 185, 129, 0.35)';
      statusLabel = `${creditAmount} SkillCredits Released`;
      titleText = 'Escrow Vault Settled';
      descriptionText = 'Transaction completed. Reserved SkillCredits have been released to the participant.';
    } else if (vaultState === 'cancelled') {
      accentColor = 'var(--text-muted, #64748b)';
      accentBg = 'rgba(100, 116, 139, 0.1)';
      accentBorder = 'rgba(100, 116, 139, 0.25)';
      statusLabel = 'Credits Refunded';
      titleText = 'Transaction Closed';
      descriptionText = 'Transaction closed. Reserved SkillCredits have been unreserved and returned to available balance.';
    }

    return (
      <div
        className={`tx-vault-container ${compact ? 'tx-vault-container--compact' : ''} ${className}`}
        style={{
          background: 'var(--card-bg, #1E293B)',
          border: `1px solid ${accentBorder}`,
          borderRadius: '12px',
          padding: compact ? '0.65rem 0.85rem' : '1rem',
          display: 'flex',
          flexDirection: compact ? 'row' : 'column',
          alignItems: compact ? 'center' : 'stretch',
          gap: '0.85rem',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          transition: 'border-color 0.3s ease, background 0.3s ease',
          margin: '0.5rem 0',
        }}
        role="region"
        aria-label="Pending Transaction Vault"
      >
        <span className="sr-only">
          {titleText}: {descriptionText} Amount: {creditAmount} SkillCredits. State: {vaultState}.
        </span>

        {/* TOP / MAIN HEADER ROW (VISUAL + TEXT) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem',
            width: '100%',
          }}
        >
          {/* CANONICAL 30° ISOMETRIC VAULT SVG ILLUSTRATION */}
          <div
            className="tx-vault-illustration-wrapper"
            style={{
              position: 'relative',
              width: compact ? '48px' : '64px',
              height: compact ? '48px' : '64px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              viewBox="0 0 120 120"
              width={compact ? 48 : 64}
              height={compact ? 48 : 64}
              aria-hidden="true"
              style={{ overflow: 'visible' }}
            >
              <defs>
                {/* 30-degree isometric gradients */}
                <linearGradient id="vaultTopGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#334155" />
                  <stop offset="100%" stopColor="#1E293B" />
                </linearGradient>
                <linearGradient id="vaultFrontGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#1E293B" />
                  <stop offset="100%" stopColor="#0F172A" />
                </linearGradient>
                <linearGradient id="vaultSideGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#0F172A" />
                  <stop offset="100%" stopColor="#020617" />
                </linearGradient>

                {/* Status glow filters */}
                <filter id="amberGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <filter id="emeraldGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* ISOMETRIC BASE SHADOW (PERSPECTIVE TILT) */}
              <ellipse cx="60" cy="100" rx="42" ry="14" fill="rgba(0, 0, 0, 0.4)" />

              {/* ISOMETRIC 30° VAULT BODY */}
              {/* Top Face (Tilted at 30 degrees) */}
              <polygon points="60,18 100,38 60,58 20,38" fill="url(#vaultTopGrad)" stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.4" />

              {/* Left Front Face */}
              <polygon points="20,38 60,58 60,94 20,74" fill="url(#vaultFrontGrad)" stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.3" />

              {/* Right Side Face */}
              <polygon points="60,58 100,38 100,74 60,94" fill="url(#vaultSideGrad)" stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.2" />

              {/* 30° ISOMETRIC DOOR & LOCK DIAL ON FRONT FACE */}
              {/* Outer Door Frame */}
              <polygon points="28,47 52,59 52,85 28,73" fill="rgba(30, 41, 59, 0.9)" stroke={accentColor} strokeWidth="1.5" />

              {/* Circular Dial Plate in Isometric Projection */}
              <g transform="translate(40, 66) scale(1, 0.6) rotate(-30)">
                <circle cx="0" cy="0" r="13" fill="#0F172A" stroke="#38BDF8" strokeWidth="1.5" />
                <circle cx="0" cy="0" r="8" fill="none" stroke={accentColor} strokeWidth="1" strokeDasharray="2,2" />

                {/* Central Lock Handle & Indicator Light */}
                <circle
                  cx="0"
                  cy="0"
                  r="4"
                  fill={accentColor}
                  className={vaultState === 'pending' ? 'tx-vault-ambient-pulse' : ''}
                  filter={vaultState === 'pending' ? 'url(#amberGlow)' : vaultState === 'completed' ? 'url(#emeraldGlow)' : undefined}
                />
              </g>

              {/* ESCROW STATUS ICON / SYMBOL HOVERING AT TOP RIGHT */}
              {vaultState === 'pending' && (
                <g transform="translate(85, 25)" className="tx-vault-ambient-pulse">
                  <circle cx="0" cy="0" r="10" fill="#d6a64a" />
                  <path d="M-2,-5 L3,-1 L0,0 L2,5 L-3,1 L0,0 Z" fill="#0F172A" />
                </g>
              )}

              {vaultState === 'completed' && (
                <g transform="translate(85, 25)">
                  <circle cx="0" cy="0" r="10" fill="#10b981" />
                  <path d="M-4,0 L-1,3 L4,-2" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              )}

              {vaultState === 'cancelled' && (
                <g transform="translate(85, 25)">
                  <circle cx="0" cy="0" r="10" fill="#64748b" />
                  <path d="M-3,-3 L3,3 M3,-3 L-3,3" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                </g>
              )}
            </svg>
          </div>

          {/* TEXT & CONTEXT CONTENT */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary, #f8fafc)' }}>
                {titleText}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: accentColor,
                  background: accentBg,
                  padding: '0.15rem 0.5rem',
                  borderRadius: '999px',
                  border: `1px solid ${accentBorder}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {statusLabel}
              </span>
            </div>

            {showDetails && !compact && (
              <p
                style={{
                  margin: '0.35rem 0 0 0',
                  fontSize: '0.8rem',
                  color: 'var(--color-text-secondary, #94a3b8)',
                  lineHeight: 1.4,
                }}
              >
                {descriptionText}
              </p>
            )}
          </div>
        </div>

        {/* CSS KEYFRAMES FOR LOW-FREQUENCY AMBIENT MOTION & REDUCED MOTION */}
        <style>{`
          @keyframes vaultLockPulse {
            0%, 100% {
              opacity: 1;
              transform: scale(1);
            }
            50% {
              opacity: 0.65;
              transform: scale(1.15);
            }
          }

          .tx-vault-ambient-pulse {
            animation: vaultLockPulse 3.5s ease-in-out infinite;
            transform-origin: center;
          }

          @media (prefers-reduced-motion: reduce) {
            .tx-vault-ambient-pulse {
              animation: none !important;
            }
            .tx-vault-container {
              transition: none !important;
            }
          }
        `}</style>
      </div>
    );
  }
);

PendingTransactionVault.displayName = 'PendingTransactionVault';
