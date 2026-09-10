import React from 'react';
import { useScaffolding } from '../../hooks/useScaffolding';

export interface ScaffoldingCardProps {
  scaffoldId: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
  icon?: string;
  restoreLabel?: string;
  overrideCompletedSwapsCount?: number;
  className?: string;
}

/**
 * Reusable Scaffolding UI Component for Section H.3 (Visual Scaffolding Fading and Expertise Reversal).
 *
 * Core Rule:
 * - completed_swaps <= 3: Novice user. Guidance is displayed by default to help onboard the user.
 * - completed_swaps > 3: Experienced user. Guidance is automatically suppressed/faded to reduce visual clutter.
 * - Allows persistent dismissal via "Don't show this again" (stored in localStorage).
 * - Provides an accessible "Show guidance again" toggle button in the minimized state to restore guidance on demand.
 */
export const ScaffoldingCard: React.FC<ScaffoldingCardProps> = ({
  scaffoldId,
  title,
  description,
  children,
  icon = '💡',
  restoreLabel,
  overrideCompletedSwapsCount,
  className = '',
}) => {
  const {
    shouldShow,
    dismissScaffold,
    toggleExpanded,
  } = useScaffolding(scaffoldId, overrideCompletedSwapsCount);

  if (shouldShow) {
    return (
      <div
        className={`scaffolding-card ${className}`}
        role="region"
        aria-label={title}
        style={{
          position: 'relative',
          padding: '1rem 1.25rem',
          borderRadius: '12px',
          background: 'var(--color-surface, rgba(30, 41, 59, 0.6))',
          border: '1px solid var(--color-structure-border, rgba(56, 189, 248, 0.25))',
          marginBottom: '1.25rem',
          transition: 'all 0.2s ease-in-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
            <span style={{ fontSize: '1.1rem' }} aria-hidden="true">
              {icon}
            </span>
            <strong style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text-primary, var(--text-color))' }}>
              {title}
            </strong>
          </div>
          <button
            type="button"
            className="scaffolding-dismiss-btn"
            title="Don't show this again"
            aria-label={`Don't show ${title} guidance again`}
            onClick={dismissScaffold}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-structure-border, rgba(148, 163, 184, 0.25))',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--color-text-muted, var(--text-muted))',
              padding: '0.2rem 0.5rem',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >
            Don't show this again
          </button>
        </div>

        {description && (
          <p style={{ margin: '0.35rem 0 0.5rem', fontSize: '0.825rem', color: 'var(--color-text-secondary, var(--text-muted))', lineHeight: 1.45 }}>
            {description}
          </p>
        )}

        {children}
      </div>
    );
  }

  // Minimized state when suppressed or dismissed
  return (
    <div
      className="scaffolding-restore-bar"
      style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}
    >
      <button
        type="button"
        className="reset-filter-btn"
        onClick={toggleExpanded}
        aria-label={`Show ${title} guidance again`}
        style={{
          fontSize: '0.75rem',
          padding: '0.25rem 0.65rem',
          borderRadius: '6px',
          background: 'transparent',
          border: '1px solid var(--color-structure-border, rgba(148, 163, 184, 0.2))',
          color: 'var(--color-text-muted, var(--text-muted))',
          cursor: 'pointer',
        }}
      >
        {restoreLabel || `${icon} Show ${title}`}
      </button>
    </div>
  );
};
