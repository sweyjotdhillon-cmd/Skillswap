import React, { useEffect, useState, useRef } from 'react';
import type { SwapStatus } from '../../types/swap';

export interface CompletionConfirmationProps {
  swapId?: string;
  status: SwapStatus;
  creditAmount?: number;
  className?: string;
}

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
 * L11 Completion Confirmation Animation Component
 *
 * Renders a calm, polished 2D checkmark transition when a swap genuinely enters
 * the 'completed' state during the active session.
 *
 * State safety features:
 * - Triggers animation strictly when `status === 'completed'`.
 * - Uses sessionStorage (`skillswap_anim_played_${swapId}`) and internal state
 *   to ensure the motion animation plays exactly once per completed swap per session.
 * - Direct page loads or refreshes on an already-completed swap display the settled,
 *   static confirmation state without replaying motion effects.
 * - Respects `prefers-reduced-motion` settings.
 * - Screen-reader accessible (`role="status"`, `aria-live="polite"`).
 */
export const CompletionConfirmation: React.FC<CompletionConfirmationProps> = ({
  swapId,
  status,
  creditAmount,
  className = '',
}) => {
  const [shouldAnimate, setShouldAnimate] = useState<boolean>(false);
  const [hasSettleCompleted, setHasSettleCompleted] = useState<boolean>(false);
  const prevStatusRef = useRef<SwapStatus | null>(null);

  useEffect(() => {
    if (status !== 'completed') {
      prevStatusRef.current = status;
      setShouldAnimate(false);
      setHasSettleCompleted(false);
      return;
    }

    const storageKey = swapId ? `skillswap_anim_played_${swapId}` : null;
    const hasPlayedBefore = storageKey ? sessionStorage.getItem(storageKey) === 'true' : false;
    const isReducedMotion = checkPrefersReducedMotion();

    // Trigger animation ONLY if:
    // 1. Not already played in this session for this swap ID
    // 2. User does not prefer reduced motion
    // 3. Status is 'completed'
    if (!hasPlayedBefore && !isReducedMotion) {
      setShouldAnimate(true);
      if (storageKey) {
        sessionStorage.setItem(storageKey, 'true');
      }

      const timer = setTimeout(() => {
        setShouldAnimate(false);
        setHasSettleCompleted(true);
      }, 1600); // 1.6 second calm transition duration

      return () => clearTimeout(timer);
    } else {
      // Direct load, refresh, or reduced motion -> static state
      setShouldAnimate(false);
      setHasSettleCompleted(true);
    }

    prevStatusRef.current = status;
  }, [status, swapId]);

  if (status !== 'completed') {
    return null;
  }

  const isReducedMotion = checkPrefersReducedMotion();

  return (
    <div
      className={`tx-completion-confirmation ${shouldAnimate ? 'tx-completion-animating' : ''} ${className}`}
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        background: 'rgba(16, 185, 129, 0.1)',
        border: '1px solid rgba(16, 185, 129, 0.35)',
        borderLeft: '4px solid #10b981',
        padding: '0.75rem 1rem',
        borderRadius: '10px',
        transition: isReducedMotion ? 'none' : 'all 0.3s ease-out',
        boxShadow: shouldAnimate ? '0 0 16px rgba(16, 185, 129, 0.25)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* Calm 2D SVG Checkmark Container */}
        <div
          className={`tx-completion-badge ${shouldAnimate ? 'tx-badge-draw' : ''}`}
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.2)',
            border: '2px solid #10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10b981',
            flexShrink: 0,
            transform: shouldAnimate ? 'scale(1.08)' : 'scale(1)',
            transition: isReducedMotion ? 'none' : 'transform 0.4s ease-out',
          }}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              width: '18px',
              height: '18px',
            }}
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <div>
          <strong
            style={{
              fontSize: '0.925rem',
              color: '#10b981',
              display: 'block',
              fontWeight: 700,
              lineHeight: 1.3,
            }}
          >
            This swap is complete.
          </strong>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #cbd5e1)' }}>
            Escrow settled successfully. Expertise exchange finalized.
          </span>
        </div>
      </div>

      {creditAmount !== undefined && (
        <span
          style={{
            fontSize: '0.875rem',
            fontWeight: 800,
            color: '#10b981',
            background: 'rgba(16, 185, 129, 0.18)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '0.3rem 0.7rem',
            borderRadius: '6px',
            lineHeight: 1.2,
          }}
        >
          +{creditAmount} SkillCredits
        </span>
      )}
    </div>
  );
};
