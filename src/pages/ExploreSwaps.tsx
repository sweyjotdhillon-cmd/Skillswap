import { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { HeroVisual } from '../components/hero/HeroVisual';
import { useAuth } from '../context/AuthContext';
import {
  getOpenSwaps,
  acceptCreditSwap,
  cancelCreditSwap,
  getUserCompletedSwapsCount,
} from '../lib/supabase/credits';
import { mapSwapRecordToSwap, type Swap } from '../types/swap';
import { SWAP_TAG_OPTIONS, getTagLabel, getTagSlug } from '../constants/tags';
import { SwapChatModal } from '../components/chat/SwapChatModal';

const CATEGORIES = ['All', ...SWAP_TAG_OPTIONS.map((t) => t.label)];

type ExploreSwapsPageProps = {
  onNavigate?: (path: string) => void;
};

export function ExploreSwapsPage({ onNavigate }: ExploreSwapsPageProps) {
  const { user, profile, refreshAccount } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [completedSwapsMap, setCompletedSwapsMap] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  // Modal states
  const [selectedSwapForAccept, setSelectedSwapForAccept] = useState<Swap | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  // Undo Toast state (B3 Behavioral Feedback)
  const [undoToastSwap, setUndoToastSwap] = useState<{ swap: Swap; seconds: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [selectedSwapForChat, setSelectedSwapForChat] = useState<Swap | null>(null);

  const loadRealOpenSwaps = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await getOpenSwaps();
      if (res.error) {
        setFetchError(res.error);
        setSwaps([]);
      } else if (res.data && res.data.length > 0) {
        const mappedReal: Swap[] = res.data.map(mapSwapRecordToSwap);
        setSwaps(mappedReal);

        // Fetch completed swaps counts for all unique requesters
        const requesterIds = Array.from(new Set(mappedReal.map((s) => s.requesterId)));
        const countsPromises = requesterIds.map(async (id) => {
          const count = await getUserCompletedSwapsCount(id);
          return { id, count };
        });
        const countsResults = await Promise.all(countsPromises);
        const map: Record<string, number> = {};
        countsResults.forEach(({ id, count }) => {
          map[id] = count;
        });
        setCompletedSwapsMap(map);
      } else {
        setSwaps([]);
      }
    } catch (err) {
      console.error('Error loading real open swaps:', err);
      setFetchError('Failed to load open swaps.');
      setSwaps([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRealOpenSwaps();
  }, [loadRealOpenSwaps]);

  /**
   * Reputation-Based Ranking Strategy for Explore Swaps:
   * Uses a Bayesian Weighted Average formula to rank open swaps by requester credibility and activity,
   * avoiding unfair penalization/burial of new users while prioritizing proven community members:
   *
   * Weighted Score = (v * R + m * C) / (v + m) + completed_bonus + verified_bonus
   * - R = requester average rating (0 if no reviews)
   * - v = review count
   * - m = 3 (prior weight representing 3 baseline reviews)
   * - C = 4.0 (prior mean rating across community)
   * - completed_bonus = min(completed_swaps * 0.02, 0.30) (activity bonus up to +0.30)
   * - verified_bonus = 0.20 if requester is_verified else 0.0
   *
   * Tiers are sorted descending by Weighted Score; equal scores sort by created_at descending.
   */
  const calculateSwapRankingScore = useCallback((swap: Swap): number => {
    const R = swap.requesterProfile?.averageRating ?? 0;
    const v = swap.requesterProfile?.reviewCount ?? 0;
    const m = 3;
    const C = 4.0;

    const bayesianRating = v > 0 ? (v * R + m * C) / (v + m) : C * 0.85; // 3.4 baseline for new creators
    const completedCount = swap.requesterProfile?.completedSwapsCount ?? completedSwapsMap[swap.requesterId] ?? 0;
    const completedBonus = Math.min(completedCount * 0.02, 0.30);
    const verifiedBonus = swap.requesterProfile?.isVerified ? 0.20 : 0.0;

    return bayesianRating + completedBonus + verifiedBonus;
  }, [completedSwapsMap]);

  const filteredSwaps = swaps
    .filter((swap) => {
      const selectedSlug = getTagSlug(selectedCategory);
      const hasTags = Array.isArray(swap.tags) && swap.tags.length > 0;

      let matchesTag = selectedCategory === 'All';
      if (!matchesTag) {
        matchesTag = hasTags && swap.tags.some((t) => getTagSlug(t) === selectedSlug);
      }

      const query = searchTerm.toLowerCase().trim();
      const requesterName = (swap.requesterProfile?.fullName || swap.requesterProfile?.username || '').toLowerCase();
      const matchesSearch =
        !query ||
        swap.topic.toLowerCase().includes(query) ||
        swap.description.toLowerCase().includes(query) ||
        requesterName.includes(query) ||
        (Array.isArray(swap.tags) &&
          swap.tags.some((t) => t.toLowerCase().includes(query) || getTagLabel(t).toLowerCase().includes(query) || getTagSlug(t).includes(query)));

      return matchesTag && matchesSearch;
    })
    .sort((a, b) => {
      const scoreA = calculateSwapRankingScore(a);
      const scoreB = calculateSwapRankingScore(b);

      if (Math.abs(scoreB - scoreA) > 0.001) {
        return scoreB - scoreA;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const handleOpenChat = (swap: Swap) => {
    setSelectedSwapForChat(swap);
  };

  const getRequesterName = (swap: Swap) => {
    if (swap.requesterProfile?.fullName) return swap.requesterProfile.fullName;
    if (swap.requesterProfile?.username) return `@${swap.requesterProfile.username}`;
    return 'SkillSwap Member';
  };

  const getRequesterAvatar = (swap: Swap) => {
    return swap.requesterProfile?.avatarUrl || undefined;
  };

  const getRequesterInitials = (swap: Swap) => {
    const name = swap.requesterProfile?.fullName || swap.requesterProfile?.username || 'SS';
    return name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'SS';
  };

  return (
    <div className="page-shell explore-page-shell">
      <Navbar onNavigate={onNavigate} ctaLabel="Create Swap" ctaPath="/create-swap" />

      <div className="explore-container">
        {/* LEFT COLUMN: Editorial Heading & Visual Illustration */}
        <div className="explore-left-col">
          <div className="explore-left-heading">
            <h1 className="explore-title">Explore<br />Swaps</h1>
            <p className="explore-subtitle">
              Discover skills people are offering and find an exchange that works for you.
            </p>
          </div>

          <div className="explore-illustration-wrapper">
            <HeroVisual />
          </div>

          <div className="explore-footer-tag">
            <span>01 — Editorial Marketplace</span>
          </div>
        </div>

        {/* RIGHT COLUMN: Search, Categories, Swaps Grid */}
        <div className="explore-right-col">
          {/* Search Field */}
          <div className="explore-search-box">
            <svg
              className="search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="explore-search-input"
              placeholder="Search skills, topics, or swaps..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {/* Category Filter Chips */}
          <div className="explore-categories-wrapper">
            <div className="explore-categories-label" style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
              Filter by Skill Domain
            </div>
            <div className="explore-categories" role="tablist" aria-label="Skill Category Filter Chips">
              {CATEGORIES.map((category) => {
                const isActive = selectedCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`category-pill ${isActive ? 'category-pill--active' : ''}`}
                    onClick={() => setSelectedCategory(category)}
                  >
                    {category === 'All' ? 'All Skill Domains' : category}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Filter Summary Bar (Information Scent & Lowest Effort) */}
          {(searchTerm || selectedCategory !== 'All') && (
            <div className="explore-active-filter-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.6rem 0.9rem', borderRadius: '10px', background: 'var(--card-bg, rgba(17, 22, 28, 0.04))', border: '1px solid var(--border-color, rgba(17, 22, 28, 0.12))', margin: '0.75rem 0' }}>
              <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                Showing <strong>{filteredSwaps.length}</strong> {filteredSwaps.length === 1 ? 'swap' : 'swaps'}
                {selectedCategory !== 'All' ? ` in ${selectedCategory}` : ''}
                {searchTerm ? ` matching "${searchTerm}"` : ''}
              </span>
              <button
                type="button"
                className="reset-filter-btn"
                style={{ marginLeft: 'auto', padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('All');
                }}
              >
                Reset Filters ×
              </button>
            </div>
          )}

          {/* 5-SECOND TRANSACTIONAL UNDO TOAST BANNER (B3 Behavioral Feedback) */}
          {undoToastSwap && (
            <div className="as-toast-banner" role="status" style={{ background: 'rgba(37, 99, 235, 0.12)', borderLeft: '4px solid #2563eb', marginBottom: '1rem' }}>
              <div className="as-toast-icon">⚡</div>
              <span>
                Accepted swap "{undoToastSwap.swap.topic}"! Exchange moves to Active Swaps.
              </span>
              <button
                type="button"
                className="as-btn as-btn--secondary"
                style={{ marginLeft: 'auto', padding: '0.25rem 0.75rem', fontSize: '0.8rem', background: '#2563eb', color: '#ffffff' }}
                onClick={async () => {
                  if (undoTimerRef.current) clearInterval(undoTimerRef.current);
                  const swapToUndo = undoToastSwap.swap;
                  setUndoToastSwap(null);
                  await cancelCreditSwap(swapToUndo.id);
                  await refreshAccount();
                  await loadRealOpenSwaps();
                }}
              >
                Undo ({undoToastSwap.seconds}s)
              </button>
            </div>
          )}

          {/* Available Swaps Header */}
          <div className="explore-section-header">
            <h2 className="available-swaps-title">Available Swaps</h2>
            <p className="available-swaps-subtitle">
              Browse open skill exchange requests across the community.
            </p>
          </div>

          {/* Swaps Grid */}
          {isLoading ? (
            <div className="swaps-empty-state">
              <p>Loading available swaps...</p>
            </div>
          ) : fetchError ? (
            <div className="swaps-empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="empty-icon">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <h3>Unable to load open swaps</h3>
              <p style={{ color: 'var(--error-color, #ef4444)', margin: '0.5rem 0 1rem' }}>{fetchError}</p>
              <button
                type="button"
                className="reset-filter-btn"
                onClick={loadRealOpenSwaps}
              >
                Retry
              </button>
            </div>
          ) : filteredSwaps.length > 0 ? (
            <div className="swaps-grid">
              {filteredSwaps.map((swap) => {
                const requesterName = getRequesterName(swap);
                const requesterAvatar = getRequesterAvatar(swap);
                const requesterInitials = getRequesterInitials(swap);
                const isVerifiedUser = Boolean(swap.requesterProfile?.isVerified);
                const completedCount = swap.requesterProfile?.completedSwapsCount ?? completedSwapsMap[swap.requesterId] ?? 0;
                const reviewCount = swap.requesterProfile?.reviewCount ?? 0;
                const avgRating = swap.requesterProfile?.averageRating ?? null;

                return (
                  <div key={swap.id} className="swap-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                    <div className="swap-card-content" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {/* TOP/MAIN CONTAINER */}
                      <div className="swap-card-main-row" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>

                        {/* LEFT ANCHOR: Creator Identity & Context */}
                        <div className="swap-card-identity-block" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', flex: '1 1 260px', minWidth: 0 }}>
                          <div className="swap-avatar-wrapper" style={{ flexShrink: 0 }}>
                            {requesterAvatar ? (
                              <img
                                src={requesterAvatar}
                                alt={`Profile of ${requesterName}`}
                                className="swap-avatar swap-avatar-ring"
                                style={{ width: '48px', height: '48px', borderRadius: '50%' }}
                              />
                            ) : (
                              <div className="swap-avatar-fallback swap-avatar-ring" style={{ width: '48px', height: '48px', fontSize: '0.95rem' }}>
                                {requesterInitials}
                              </div>
                            )}
                          </div>

                          <div className="swap-context-details" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0, flex: 1 }}>
                            {/* Creator Meta */}
                            <div className="swap-author-meta" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem' }}>
                              <span className="swap-user-name" style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                                {requesterName}
                              </span>
                              {swap.requesterProfile?.username && (
                                <span style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                                  @{swap.requesterProfile.username}
                                </span>
                              )}
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                • {new Date(swap.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                              {isVerifiedUser && (
                                <span className="verification-badge" title="Verified Identity">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11" aria-hidden="true">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  Verified
                                </span>
                              )}
                            </div>

                            {/* Trust & Social Proof Snapshot */}
                            <div className="swap-trust-snapshot-row" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              <span className="trust-rating-text" style={{ color: reviewCount > 0 ? '#d97706' : 'var(--text-muted)', fontWeight: reviewCount > 0 ? 600 : 400 }}>
                                {reviewCount > 0 && avgRating !== null
                                  ? `★ ${avgRating.toFixed(1)} (${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'})`
                                  : 'No reviews yet'}
                              </span>
                              <span style={{ opacity: 0.4 }} aria-hidden="true">•</span>
                              <span className="trust-activity-tag">
                                <strong>{completedCount}</strong> {completedCount === 1 ? 'completed' : 'completed'}
                              </span>
                            </div>

                            {/* Title & Description Control */}
                            <h3 className="swap-need-title" style={{ margin: '0.35rem 0 0.2rem', fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.3 }}>
                              {swap.topic}
                            </h3>
                            <p className="swap-description" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted, rgba(17, 22, 28, 0.65))', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {swap.description}
                            </p>

                            {/* Skill Tags / Chips */}
                            {swap.tags && swap.tags.length > 0 && (
                              <div className="swap-tags-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
                                {swap.tags.map((tag) => {
                                  const label = getTagLabel(tag);
                                  const isSelected = getTagSlug(selectedCategory) === getTagSlug(tag);
                                  return (
                                    <button
                                      key={tag}
                                      type="button"
                                      className={`swap-tag ${isSelected ? 'swap-tag--active' : ''}`}
                                      style={{
                                        cursor: 'pointer',
                                        fontWeight: isSelected ? 700 : 500,
                                        border: 'none',
                                        background: isSelected ? 'rgba(214, 166, 74, 0.2)' : 'rgba(148, 163, 184, 0.12)',
                                        color: isSelected ? '#d97706' : 'var(--text-color)',
                                        padding: '0.2rem 0.55rem',
                                        borderRadius: '6px',
                                        fontSize: '0.75rem',
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedCategory(label);
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

                        {/* RIGHT ANCHOR: Value (SkillCredits) + Action CTA */}
                        <div className="swap-card-action-block" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', gap: '0.75rem', flexShrink: 0, marginLeft: 'auto' }}>
                          {/* Saliency Credit Badge */}
                          <div
                            className="swap-credits-badge-saliency"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.35rem 0.75rem',
                              borderRadius: '10px',
                              background: 'rgba(214, 166, 74, 0.12)',
                              border: '1px solid rgba(214, 166, 74, 0.35)',
                              color: '#d6a64a',
                            }}
                          >
                            <span style={{ fontSize: '0.95rem' }} aria-hidden="true">⚡</span>
                            <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-color, #f8fafc)', lineHeight: 1 }}>
                              {swap.creditAmount}
                            </span>
                            <span style={{ fontSize: '0.725rem', fontWeight: 700, color: '#d6a64a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              SkillCredits
                            </span>
                          </div>

                          {/* Primary CTA Buttons */}
                          <div className="swap-card-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="swap-btn swap-btn--primary"
                              style={{ padding: '0.55rem 1.25rem', fontSize: '0.875rem', fontWeight: 700 }}
                              onClick={() => {
                                if (!user) {
                                  if (onNavigate) onNavigate(`/login?redirectTo=${encodeURIComponent('/explore')}`);
                                  return;
                                }
                                if (!profile || profile.profile_completed === false) {
                                  if (onNavigate) onNavigate(`/onboarding?redirectTo=${encodeURIComponent('/explore')}`);
                                  else window.location.href = `/onboarding?redirectTo=${encodeURIComponent('/explore')}`;
                                  return;
                                }
                                if (user.id === swap.requesterId) {
                                  setSelectedSwapForAccept(swap);
                                  setRequestSent(false);
                                  setAcceptError('You cannot accept your own swap request.');
                                } else {
                                  setSelectedSwapForAccept(swap);
                                  setRequestSent(false);
                                  setAcceptError(null);
                                }
                              }}
                            >
                              Accept Swap
                            </button>
                            <button
                              type="button"
                              className="swap-btn swap-btn--secondary"
                              style={{ padding: '0.55rem 0.9rem', fontSize: '0.875rem' }}
                              onClick={() => handleOpenChat(swap)}
                              aria-label={`Chat with ${requesterName} about ${swap.topic}`}
                            >
                              Chat
                            </button>
                          </div>
                        </div>

                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : swaps.length === 0 ? (
            <div className="swaps-empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="empty-icon">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
              <h3>No open swaps available.</h3>
              <p>Be the first to create a swap request!</p>
            </div>
          ) : (
            <div className="swaps-empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="empty-icon">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
              <h3>No swaps found.</h3>
              <p>Try another search query or category.</p>
              <button
                type="button"
                className="reset-filter-btn"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('All');
                }}
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ACCEPT SWAP CONFIRMATION MODAL */}
      {selectedSwapForAccept && (
        <div className="modal-overlay" onClick={() => setSelectedSwapForAccept(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {!requestSent ? (
              <>
                <h3 className="modal-title">Accept Swap Request</h3>
                <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  As the participant, you agree to fulfill the deliverables below. Upon requester review, SkillCredits will be awarded to your balance.
                </p>
                <div className="modal-swap-details">
                  <div className="modal-detail-row">
                    <span className="modal-label">Skill Topic</span>
                    <strong style={{ fontSize: '1.05rem' }}>{selectedSwapForAccept.topic}</strong>
                  </div>
                  {/* COUNTERPART IDENTITY & CREDIBILITY CHECKPOINT */}
                  <div className="modal-detail-row">
                    <span className="modal-label">Requester &amp; Social Proof</span>
                  </div>
                  <div className="modal-counterpart-card" style={{ background: 'var(--card-bg, rgba(255, 255, 255, 0.03))', border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))', padding: '0.75rem 0.9rem', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {getRequesterAvatar(selectedSwapForAccept) ? (
                      <img
                        src={getRequesterAvatar(selectedSwapForAccept)!}
                        alt={getRequesterName(selectedSwapForAccept)}
                        className="swap-avatar swap-avatar-ring"
                        style={{ width: '44px', height: '44px' }}
                      />
                    ) : (
                      <div className="swap-avatar-fallback swap-avatar-ring" style={{ width: '44px', height: '44px', fontSize: '0.9rem' }}>
                        {getRequesterInitials(selectedSwapForAccept)}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.925rem' }}>{getRequesterName(selectedSwapForAccept)}</strong>
                        {selectedSwapForAccept.requesterProfile?.username && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{selectedSwapForAccept.requesterProfile.username}</span>
                        )}
                        {selectedSwapForAccept.requesterProfile?.isVerified && (
                          <span className="verification-badge">✓ Verified</span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                        <span>
                          {selectedSwapForAccept.requesterProfile?.reviewCount && selectedSwapForAccept.requesterProfile.reviewCount > 0 && selectedSwapForAccept.requesterProfile?.averageRating !== null && selectedSwapForAccept.requesterProfile?.averageRating !== undefined
                            ? `★ ${selectedSwapForAccept.requesterProfile.averageRating.toFixed(1)} (${selectedSwapForAccept.requesterProfile.reviewCount} ${selectedSwapForAccept.requesterProfile.reviewCount === 1 ? 'review' : 'reviews'})`
                            : 'No reviews yet'}
                        </span>
                        <span style={{ margin: '0 0.35rem', opacity: 0.5 }}>•</span>
                        <span>
                          {selectedSwapForAccept.requesterProfile?.completedSwapsCount ?? completedSwapsMap[selectedSwapForAccept.requesterId] ?? 0} swaps completed
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="modal-detail-row">
                    <span className="modal-label">SkillCredits Reward</span>
                    <strong style={{ color: '#d97706' }}>⚡ {selectedSwapForAccept.creditAmount} SkillCredits</strong>
                  </div>
                  {selectedSwapForAccept.requirements && (
                    <div className="modal-detail-row" style={{ borderTop: '1px solid rgba(17, 22, 28, 0.08)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                      <span className="modal-label">Expected Deliverables</span>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.875rem', color: 'var(--text-color)', lineHeight: 1.4 }}>
                        {selectedSwapForAccept.requirements}
                      </p>
                    </div>
                  )}
                </div>

                <div className="modal-next-step-note" style={{ margin: '0.75rem 0 1rem', fontSize: '0.825rem', color: 'var(--text-secondary)', background: 'var(--card-bg, rgba(255, 255, 255, 0.04))', padding: '0.6rem 0.85rem', borderRadius: '8px', borderLeft: '3px solid #d6a64a' }}>
                  <strong>Next step:</strong> This swap will move to your Active Swaps where you can chat with {getRequesterName(selectedSwapForAccept)} and submit completed work.
                </div>

                {acceptError && (
                  <p className="error-message" style={{ margin: '0 0 1rem' }} role="alert">
                    {acceptError}
                  </p>
                )}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="modal-btn modal-btn--cancel"
                    disabled={isAccepting}
                    onClick={() => setSelectedSwapForAccept(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="modal-btn modal-btn--confirm"
                    disabled={isAccepting || Boolean(user && user.id === selectedSwapForAccept.requesterId)}
                    onClick={async () => {
                      if (!user) {
                        setAcceptError('Please log in to accept swaps.');
                        return;
                      }
                      if (user.id === selectedSwapForAccept.requesterId) {
                        setAcceptError('You cannot accept your own swap request.');
                        return;
                      }
                      setIsAccepting(true);
                      setAcceptError(null);
                      const targetSwap = selectedSwapForAccept;
                      const res = await acceptCreditSwap(targetSwap.id);
                      setIsAccepting(false);
                      if (!res.success) {
                        setAcceptError(res.error || 'Failed to accept swap.');
                        return;
                      }
                      setSwaps((prev) => prev.filter((s) => s.id !== targetSwap.id));
                      await refreshAccount();
                      await loadRealOpenSwaps();
                      setRequestSent(true);

                      // Trigger 5-second Undo Toast
                      setUndoToastSwap({ swap: targetSwap, seconds: 5 });
                      if (undoTimerRef.current) clearInterval(undoTimerRef.current);
                      undoTimerRef.current = setInterval(() => {
                        setUndoToastSwap((prev) => {
                          if (!prev || prev.seconds <= 1) {
                            if (undoTimerRef.current) clearInterval(undoTimerRef.current);
                            return null;
                          }
                          return { ...prev, seconds: prev.seconds - 1 };
                        });
                      }, 1000);
                    }}
                  >
                    {isAccepting ? 'Accepting Swap...' : 'Accept Swap & Start Exchange'}
                  </button>
                </div>
              </>
            ) : (
              <div className="modal-success-state">
                <div className="success-icon-badge">✓</div>
                <h3 className="modal-title">Swap Accepted!</h3>
                <p className="modal-subtext">
                  You are now paired with <strong>{getRequesterName(selectedSwapForAccept)}</strong> for this skill exchange.
                </p>
                <button
                  type="button"
                  className="modal-btn modal-btn--confirm"
                  onClick={() => {
                    setSelectedSwapForAccept(null);
                    if (onNavigate) onNavigate('/active-swaps');
                  }}
                >
                  View Active Swaps
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CHAT MODAL */}
      {selectedSwapForChat && (
        <SwapChatModal
          swap={selectedSwapForChat}
          partnerName={getRequesterName(selectedSwapForChat)}
          partnerAvatar={getRequesterAvatar(selectedSwapForChat)}
          onClose={() => setSelectedSwapForChat(null)}
        />
      )}
    </div>
  );
}
