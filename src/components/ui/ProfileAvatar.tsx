import React, { useState, useEffect } from 'react';
import { getInitials } from '../../lib/initials';

export interface ProfileAvatarProps {
  src?: string | null;
  displayName?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | number;
  className?: string;
  style?: React.CSSProperties;
  showRing?: boolean;
}

const SIZE_MAP: Record<string, { dimension: number; fontSize: string }> = {
  xs: { dimension: 24, fontSize: '0.65rem' },
  sm: { dimension: 32, fontSize: '0.75rem' },
  md: { dimension: 40, fontSize: '0.875rem' },
  lg: { dimension: 48, fontSize: '1rem' },
  xl: { dimension: 64, fontSize: '1.35rem' },
  '2xl': { dimension: 84, fontSize: '1.8rem' },
};

export function ProfileAvatar({
  src,
  displayName,
  size,
  className = '',
  style,
  showRing = false,
}: ProfileAvatarProps) {
  const [hasError, setHasError] = useState(false);

  // Reset error state if the src URL changes
  useEffect(() => {
    setHasError(false);
  }, [src]);

  const cleanName = displayName?.trim() || '';
  const initials = getInitials(cleanName);
  const accessibleName = cleanName || 'Member';

  let widthPx: number | undefined;
  let heightPx: number | undefined;
  let computedFontSize: string | undefined;

  if (typeof size === 'number') {
    widthPx = size;
    heightPx = size;
    computedFontSize = `${Math.max(10, Math.floor(size * 0.42))}px`;
  } else if (typeof size === 'string' && SIZE_MAP[size]) {
    widthPx = SIZE_MAP[size].dimension;
    heightPx = SIZE_MAP[size].dimension;
    computedFontSize = SIZE_MAP[size].fontSize;
  }

  const baseStyle: React.CSSProperties = {
    ...(widthPx ? { width: `${widthPx}px`, height: `${heightPx}px` } : {}),
    borderRadius: '50%',
    flexShrink: 0,
    ...style,
  };

  const ringClass = showRing ? 'swap-avatar-ring' : '';
  const combinedClasses = [className, ringClass].filter(Boolean).join(' ');

  const shouldRenderImage = Boolean(src && src.trim()) && !hasError;

  if (shouldRenderImage) {
    return (
      <img
        src={src!}
        alt={`Profile photo of ${accessibleName}`}
        onError={() => setHasError(true)}
        className={combinedClasses || 'swap-avatar'}
        style={{
          ...baseStyle,
          objectFit: 'cover',
        }}
      />
    );
  }

  // Fallback initials container
  const fallbackStyle: React.CSSProperties = {
    ...baseStyle,
    display: 'grid',
    placeItems: 'center',
    fontWeight: 800,
    userSelect: 'none',
    ...(computedFontSize ? { fontSize: computedFontSize } : {}),
  };

  // Default fallback class if none passed
  const fallbackClass = combinedClasses || 'swap-avatar-fallback';

  return (
    <div
      role="img"
      aria-label={`Profile photo unavailable for ${accessibleName}. Initials shown instead.`}
      title={accessibleName}
      className={fallbackClass}
      style={fallbackStyle}
    >
      {initials}
    </div>
  );
}
