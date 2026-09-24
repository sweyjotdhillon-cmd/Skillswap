import React from 'react';
import type { Swap } from '../../types/swap';
import { getTagLabel, getTagSlug } from '../../constants/tags';
import { VerificationBadge } from '../ui/VerificationBadge';
import { ProfileAvatar } from '../ui/ProfileAvatar';

export interface MarketplaceCardProps {
  swap: Swap;
  completedCount?: number;
  selectedCategory?: string;
  onAccept: (swap: Swap) => void;
  onChat: (swap: Swap) => void;
  onSelectCategory?: (categoryLabel: string) => void;
}

/**
 * Render simple 2D / slight 3/4-perspective geon icon silhouettes
 * for canonical skill categories.
 */
function CategoryGeonIcon({ slug }: { slug: string }) {
  const canonicalSlug = getTagSlug(slug);

  switch (canonicalSlug) {
    case 'coding':
      return (
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-structure)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M16 18l6-6-6-6" />
          <path d="M8 6l-6 6 6 6" />
          <path d="M14 4l-4 16" />
        </svg>
      );
    case 'design':
      return (
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-structure)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2l9 4.9-9 4.9-9-4.9L12 2z" />
          <path d="M3 11.8l9 4.9 9-4.9" />
          <path d="M3 16.7l9 4.9 9-4.9" />
        </svg>
      );
    case 'writing':
      return (
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-structure)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case 'video-editing':
      return (
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-structure)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="2" y="4" width="20" height="16" rx="2.18" ry="2.18" />
          <line x1="7" y1="4" x2="11" y2="20" />
          <polygon points="12 10 17 12.5 12 15 12 10" fill="currentColor" fillOpacity="0.3" />
        </svg>
      );
    case 'marketing':
      return (
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-structure)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case 'languages':
      return (
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-structure)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'career':
      return (
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-structure)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      );
    case 'photography':
      return (
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-structure)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      );
    case 'music':
      return (
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-structure)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    case 'fitness':
      return (
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-structure)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6.5 6.5h11M6.5 17.5h11M4 9v6M20 9v6M1 11v2M23 11v2M9 12h6" />
        </svg>
      );
    default:
      return (
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-structure)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
  }
}

export const MarketplaceCard: React.FC<MarketplaceCardProps> = ({
  swap,
  completedCount = 0,
  selectedCategory = 'All',
  onAccept,
  onChat,
  onSelectCategory,
}) => {
  const requesterProfile = swap.requesterProfile;
  const requesterName = requesterProfile?.fullName || (requesterProfile?.username ? `@${requesterProfile.username}` : 'SkillSwap Member');
  const requesterAvatar = requesterProfile?.avatarUrl;
  const isVerifiedUser = Boolean(requesterProfile?.isVerified);
  const reviewCount = requesterProfile?.reviewCount ?? 0;
  const avgRating = requesterProfile?.averageRating ?? null;
  const displayCompletedCount = requesterProfile?.completedSwapsCount ?? completedCount;

  const formattedDate = new Date(swap.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  const displayCredits = typeof swap.creditAmount === 'number' && !isNaN(swap.creditAmount) ? swap.creditAmount : 0;

  return (
    <div className="swap-card w-full bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-structure-border)] rounded-xl p-4 sm:p-5 transition-all duration-200 shadow-sm hover:shadow-md flex flex-col gap-3.5 box-border text-[var(--color-text-primary)]">
      {/* 1. USER PROFILE SECTION */}
      <div className="flex items-start gap-3 w-full min-w-0">
        <div className="relative flex-shrink-0 mt-0.5">
          <ProfileAvatar
            src={requesterAvatar}
            displayName={requesterName}
            size={48}
            className="w-11 h-11 sm:w-12 sm:h-12 shadow-sm"
            showRing
          />
          {/* Active Presence Dot */}
          <span
            className="absolute bottom-0 right-0 w-3 h-3 bg-[var(--status-success)] border-2 border-[var(--color-surface)] rounded-full"
            title="Active Community Member"
            aria-label="Active presence"
          />
        </div>

        {/* User Identity Text & Metadata */}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center flex-wrap gap-1.5 min-w-0">
            {requesterProfile?.username ? (
              <a
                href={`/@${requesterProfile.username}`}
                className="font-bold text-sm sm:text-base text-[var(--color-text-primary)] hover:text-[var(--color-structure)] transition-colors truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {requesterName}
              </a>
            ) : (
              <span className="font-bold text-sm sm:text-base text-[var(--color-text-primary)] truncate">
                {requesterName}
              </span>
            )}
            <VerificationBadge isVerified={isVerifiedUser} size="sm" />
          </div>

          {requesterProfile?.username && (
            <a
              href={`/@${requesterProfile.username}`}
              className="text-[var(--color-text-muted)] font-mono text-xs hover:text-[var(--color-structure)] transition-colors truncate"
              onClick={(e) => e.stopPropagation()}
            >
              @{requesterProfile.username}
            </a>
          )}

          <div className="flex items-center flex-wrap gap-2 text-xs text-[var(--color-text-muted)] mt-1">
            <span>• {formattedDate}</span>
            <span className="opacity-40">•</span>
            <span className={reviewCount > 0 ? 'text-[var(--color-accent)] font-semibold' : 'text-[var(--color-text-muted)]'}>
              {reviewCount > 0 && avgRating !== null
                ? `★ ${avgRating.toFixed(1)} (${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'})`
                : 'No reviews yet'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. SWAP INFORMATION (Topic & Description) */}
      <div className="flex flex-col gap-1 w-full min-w-0">
        <h3 className="text-base sm:text-lg font-bold text-[var(--color-text-primary)] tracking-tight leading-snug break-words">
          {swap.topic}
        </h3>
        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed line-clamp-3 break-words">
          {swap.description}
        </p>
      </div>

      {/* 3. CATEGORY / SKILL CHIPS */}
      {swap.tags && swap.tags.length > 0 && (
        <div className="flex items-center flex-wrap gap-1.5 w-full">
          {swap.tags.map((tag) => {
            const label = getTagLabel(tag);
            const isSelected = getTagSlug(selectedCategory) === getTagSlug(tag);
            return (
              <button
                key={tag}
                type="button"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full transition-colors border ${
                  isSelected
                    ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)] border-[var(--color-accent)]/50 font-bold'
                    : 'bg-[var(--color-structure-muted)] text-[var(--color-structure)] border-[var(--color-structure-border)] hover:border-[var(--color-structure)]'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSelectCategory) onSelectCategory(label);
                }}
                aria-label={`Filter by ${label}`}
              >
                <CategoryGeonIcon slug={tag} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 4. SKILLCREDITS SECTION (Distinct inner box) */}
      <div
        className="w-full rounded-lg bg-[var(--color-accent-muted)] border border-[var(--color-accent)]/30 p-2.5 sm:p-3 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap"
        aria-label={`${displayCredits} SkillCredits`}
        title={`${displayCredits} SkillCredits`}
      >
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[var(--color-accent)] font-black text-xl" aria-hidden="true">⚡</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-extrabold text-[var(--color-accent)] leading-none">
              {displayCredits}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-accent)]/90">
              SkillCredits
            </span>
          </div>
        </div>
        <div className="text-xs font-medium text-[var(--color-text-secondary)] text-left sm:text-right flex-shrink-0">
          <strong className="text-[var(--color-text-primary)] font-bold">{displayCompletedCount}</strong> {displayCompletedCount === 1 ? 'swap completed' : 'swaps completed'}
        </div>
      </div>

      {/* 5. PRIMARY ACTION BUTTONS */}
      <div className="flex items-center gap-2 w-full pt-0.5">
        <button
          type="button"
          className="flex-1 min-h-[44px] px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-bold text-[#11161c] bg-[var(--color-transactional,#d6a64a)] hover:bg-[var(--color-transactional-hover,#e4af48)] active:scale-98 rounded-lg shadow-sm hover:shadow-md transition-all duration-150 flex items-center justify-center text-center"
          onClick={() => onAccept(swap)}
        >
          Accept Swap
        </button>
        <button
          type="button"
          className="min-h-[44px] px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold text-[var(--color-text-primary)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)] border border-[var(--color-border)] active:scale-98 rounded-lg transition-all duration-150 flex items-center justify-center text-center"
          onClick={() => onChat(swap)}
          aria-label={`Chat with ${requesterName} about ${swap.topic}`}
        >
          Chat
        </button>
      </div>
    </div>
  );
};
