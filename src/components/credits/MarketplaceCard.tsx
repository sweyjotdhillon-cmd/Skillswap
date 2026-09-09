import React from 'react';
import type { Swap } from '../../types/swap';
import { getTagLabel, getTagSlug } from '../../constants/tags';

export interface MarketplaceCardProps {
  swap: Swap;
  completedCount?: number;
  selectedCategory?: string;
  onAccept: (swap: Swap) => void;
  onChat: (swap: Swap) => void;
  onSelectCategory?: (categoryLabel: string) => void;
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

  const requesterInitials = (requesterProfile?.fullName || requesterProfile?.username || 'SS')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'SS';

  const formattedDate = new Date(swap.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="swap-card w-full bg-[#1E293B] border border-slate-700/80 hover:border-slate-500/80 rounded-xl p-5 transition-all duration-200 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      {/* LEFT ANCHOR: Identity & Context (Gestalt Proximity) */}
      <div className="flex items-start gap-3.5 flex-1 min-w-0 w-full">
        <div className="relative flex-shrink-0">
          {requesterAvatar ? (
            <img
              src={requesterAvatar}
              alt={`Profile photo of ${requesterName}`}
              className="w-12 h-12 rounded-full object-cover ring-2 ring-[#38BDF8] shadow-sm"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-slate-800 ring-2 ring-[#38BDF8] text-[#38BDF8] flex items-center justify-center font-bold text-sm shadow-sm">
              {requesterInitials}
            </div>
          )}
          {/* Presence Indicator Dot */}
          <span
            className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#1E293B] rounded-full"
            title="Active Community Member"
            aria-label="Active presence"
          />
        </div>

        {/* Text Details (Left-aligned reading anchors for processing fluency) */}
        <div className="flex flex-col gap-1 text-left min-w-0 flex-1">
          {/* Creator & Trust Meta */}
          <div className="flex items-center flex-wrap gap-2 text-xs">
            <span className="font-semibold text-slate-200 hover:text-white transition-colors">
              {requesterName}
            </span>
            {requesterProfile?.username && (
              <span className="text-slate-400 font-mono text-[11px]">
                @{requesterProfile.username}
              </span>
            )}
            <span className="text-slate-500">• {formattedDate}</span>

            {isVerifiedUser && (
              <span className="verification-badge inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/30" title="Verified Profile" aria-label="Verified profile">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="10" height="10" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Verified
              </span>
            )}
          </div>

          {/* Social Proof Snapshot */}
          <div className="flex items-center flex-wrap gap-2 text-xs text-slate-400">
            <span className={reviewCount > 0 ? 'text-amber-400 font-semibold' : 'text-slate-500'}>
              {reviewCount > 0 && avgRating !== null
                ? `★ ${avgRating.toFixed(1)} (${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'})`
                : 'No reviews yet'}
            </span>
            <span className="opacity-40">•</span>
            <span>
              <strong className="text-slate-300">{displayCompletedCount}</strong> {displayCompletedCount === 1 ? 'swap completed' : 'swaps completed'}
            </span>
          </div>

          {/* Prominent Title & 2-line Description */}
          <h3 className="text-lg font-bold text-slate-100 tracking-tight leading-snug mt-1 break-words">
            {swap.topic}
          </h3>
          <p className="text-sm text-slate-300/80 leading-relaxed line-clamp-2 max-w-2xl break-words">
            {swap.description}
          </p>

          {/* Skill Tag / Category Chips */}
          {swap.tags && swap.tags.length > 0 && (
            <div className="flex items-center flex-wrap gap-1.5 mt-2">
              {swap.tags.map((tag) => {
                const label = getTagLabel(tag);
                const isSelected = getTagSlug(selectedCategory) === getTagSlug(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`px-2.5 py-0.5 text-xs font-medium rounded-full transition-colors border ${
                      isSelected
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                        : 'bg-slate-800 text-[#38BDF8] border-slate-700 hover:border-slate-500'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSelectCategory) onSelectCategory(label);
                    }}
                    aria-label={`Filter by ${label}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT ANCHOR: Value & Action (Von Restorff Effect) */}
      <div className="flex md:flex-col items-end justify-between md:justify-center gap-3 w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-slate-800/80 flex-shrink-0">
        {/* High-Contrast Numerals Badge (Ticks visual attention in 50ms) */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-sm shadow-amber-500/5">
          <span className="text-amber-400 font-bold text-base" aria-hidden="true">⚡</span>
          <span className="text-lg font-extrabold tracking-tight text-slate-100 leading-none">
            {swap.creditAmount}
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400/90">
            SkillCredits
          </span>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <button
            type="button"
            className="w-full md:w-auto px-5 py-2 text-sm font-bold text-slate-900 bg-[#38BDF8] hover:bg-[#7DD3FC] active:scale-95 rounded-lg shadow-md hover:shadow-[#38BDF8]/20 transition-all duration-150"
            onClick={() => onAccept(swap)}
          >
            Accept Swap
          </button>
          <button
            type="button"
            className="px-3.5 py-2 text-sm font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 active:scale-95 rounded-lg transition-all duration-150"
            onClick={() => onChat(swap)}
            aria-label={`Chat with ${requesterName} about ${swap.topic}`}
          >
            Chat
          </button>
        </div>
      </div>
    </div>
  );
};
