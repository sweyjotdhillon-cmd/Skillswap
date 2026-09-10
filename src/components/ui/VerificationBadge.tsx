import React from 'react';

export interface VerificationBadgeProps {
  isVerified?: boolean;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showText?: boolean;
}

/**
 * L16 Reusable Verification Badge Component
 * Strictly renders only when `isVerified === true`.
 * Communicates verification with accessible text label and tooltip.
 * Uses Skillswap's structural blue/teal semantic tokens.
 */
export const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  isVerified,
  label = 'Verified',
  size = 'sm',
  className = '',
  showText = true,
}) => {
  if (!isVerified) {
    return null;
  }

  const iconSizes = {
    sm: { width: 10, height: 10 },
    md: { width: 12, height: 12 },
    lg: { width: 14, height: 14 },
  };

  const { width, height } = iconSizes[size] || iconSizes.sm;

  return (
    <span
      className={`verification-badge ${className}`.trim()}
      title="Verified Profile"
      aria-label="Verified profile"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        width={width}
        height={height}
        aria-hidden="true"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      {showText && <span>{label}</span>}
    </span>
  );
};
