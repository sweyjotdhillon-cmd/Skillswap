import { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { HeroVisual } from '../components/hero/HeroVisual';
import { useAuth } from '../context/AuthContext';
import {
  getOpenSwaps,
  acceptCreditSwap,
  getUserCompletedSwapsCount,
  formatAcceptSwapErrorMessage,
} from '../lib/supabase/credits';
import { getSkillsCatalog } from '../lib/supabase/profile';
import { mapSwapRecordToSwap, type Swap } from '../types/swap';
import { getTagLabel, getTagSlug } from '../constants/tags';
import { SwapChatModal } from '../components/chat/SwapChatModal';
import { MarketplaceCard } from '../components/credits/MarketplaceCard';
import { Footer } from '../components/navigation/Footer';
import { ScaffoldingCard } from '../components/ui/ScaffoldingCard';

const SEEDED_19_CATEGORIES: readonly string[] = [
  'Programming',
  'Web Development',
  'Mobile Development',
  'AI & Machine Learning',
  'Data & Analytics',
  'Design',
  'Video & Media',
  'Marketing',
  'Business',
  'Finance',
  'Writing',
  'Communication',
  'Languages',
  'Education',
  'Music',
  'Photography',
  'Productivity',
  'Career',
  'Other',
] as const;

const SAMPLE_OPEN_SWAPS: Swap[] = [
  {
    id: 'sample-swap-1',
    requesterId: 'user_sample_1',
    participantId: null,
    topic: 'React & TypeScript Frontend Architecture Review',
    description: 'Looking for an experienced engineer to review custom React hooks, component architecture, and state management for a responsive web application.',
    requirements: 'Provide feedback on component modularity, state flow, and performance.',
    additionalMessage: null,
    creditAmount: 30,
    tags: ['coding', 'design'],
    status: 'open',
    submittedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    updatedAt: new Date().toISOString(),
    requesterProfile: {
      fullName: 'Alex Rivera',
      username: 'alex_frontend',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
      isVerified: true,
      averageRating: 4.9,
      reviewCount: 14,
      completedSwapsCount: 8,
    },
  },
  {
    id: 'sample-swap-2',
    requesterId: 'user_sample_2',
    participantId: null,
    topic: 'Logo Design & Brand Identity Package',
    description: 'Need a vector logo lockup and brand color palette for a high-growth tech platform.',
    requirements: 'SVG logo files, dark/light mode icon variations, and brand style guide.',
    additionalMessage: null,
    creditAmount: 25,
    tags: ['design'],
    status: 'open',
    submittedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    updatedAt: new Date().toISOString(),
    requesterProfile: {
      fullName: 'Sophia Chen',
      username: 'sophiadesign',
      avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80',
      isVerified: true,
      averageRating: 4.8,
      reviewCount: 9,
      completedSwapsCount: 5,
    },
  },
];

type ExploreSwapsPageProps = {
  onNavigate?: (path: string) => void;
};

export function ExploreSwapsPage({ onNavigate }: ExploreSwapsPageProps) {
  const { user, profile, account, refreshAccount } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [categories, setCategories] = useState<string[]>(['All', ...SEEDED_19_CATEGORIES]);

  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [completedSwapsMap, setCompletedSwapsMap] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  // Modal states
  const [selectedSwapForAccept, setSelectedSwapForAccept] = useState<Swap | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  // Section H.2 Reversible Acceptance Confirmation Window State
  const [pendingAcceptSwap, setPendingAcceptSwap] = useState<{ swap: Swap; seconds: number } | null>(null);
  const pendingAcceptTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isExecutingAcceptRef = useRef<boolean>(false);
  const [acceptSuccessToast, setAcceptSuccessToast] = useState<{ swapTopic: string } | null>(null);
  const [acceptErrorMessage, setAcceptErrorMessage] = useState<string | null>(null);

  const [selectedSwapForChat, setSelectedSwapForChat] = useState<Swap | null>(null);

  const loadRealOpenSwaps = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await getOpenSwaps();
      if (res.error) {
        setFetchError(res.error);
        setSwaps(SAMPLE_OPEN_SWAPS);
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
        setSwaps(SAMPLE_OPEN_SWAPS);
      }
    } catch (err) {
      console.error('Error loading real open swaps:', err);
      setFetchError(null);
      setSwaps(SAMPLE_OPEN_SWAPS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRealOpenSwaps();
  }, [loadRealOpenSwaps]);

  useEffect(() => {
    let isMounted = true;
    async function loadCategories() {
      try {
        const catalog = await getSkillsCatalog();
        if (isMounted && catalog && catalog.length > 0) {
          const uniqueCats = Array.from(new Set(catalog.map((s) => s.category))).filter(Boolean);
          if (uniqueCats.length > 0) {
            // Keep canonical ordering or sort if needed, ensuring All is first
            const sortedCats = SEEDED_19_CATEGORIES.filter((cat) => uniqueCats.includes(cat));
            const remainingCats = uniqueCats.filter((cat) => !SEEDED_19_CATEGORIES.includes(cat));
            setCategories(['All', ...sortedCats, ...remainingCats]);
          }
        }
      } catch (err) {
        console.error('Error fetching skills catalog categories:', err);
      }
    }
    loadCategories();
    return () => {
      isMounted = false;
    };
  }, []);

  // Clean up pending accept timer on unmount to prevent stale execution
  useEffect(() => {
    return () => {
      if (pendingAcceptTimerRef.current) {
        clearInterval(pendingAcceptTimerRef.current);
        pendingAcceptTimerRef.current = null;
      }
    };
  }, []);

  const commitAcceptSwap = useCallback(
    async (targetSwap: Swap) => {
      if (isExecutingAcceptRef.current) return;
      isExecutingAcceptRef.current = true;
      setIsAccepting(true);
      setAcceptErrorMessage(null);

      try {
        const res = await acceptCreditSwap(targetSwap.id);
        setIsAccepting(false);

        if (res.success) {
          setSwaps((prev) => prev.filter((s) => s.id !== targetSwap.id));
          await refreshAccount();
          await loadRealOpenSwaps();
          setAcceptSuccessToast({ swapTopic: targetSwap.topic });
          setTimeout(() => {
            setAcceptSuccessToast(null);
          }, 6000);
        } else {
          const userBal = account?.credits_balance;
          const formattedErr = formatAcceptSwapErrorMessage(res.error, targetSwap.creditAmount, userBal);
          setAcceptErrorMessage(formattedErr);
        }
      } catch (err) {
        setIsAccepting(false);
        const userBal = account?.credits_balance;
        const formattedErr = formatAcceptSwapErrorMessage(err, targetSwap.creditAmount, userBal);
        setAcceptErrorMessage(formattedErr);
      } finally {
        isExecutingAcceptRef.current = false;
      }
    },
    [account?.credits_balance, loadRealOpenSwaps, refreshAccount]
  );

  const startPendingAccept = useCallback(
    (swap: Swap) => {
      // Clear any existing timer to prevent duplicate timers / simultaneous accepts
      if (pendingAcceptTimerRef.current) {
        clearInterval(pendingAcceptTimerRef.current);
        pendingAcceptTimerRef.current = null;
      }

      setAcceptErrorMessage(null);
      setAcceptSuccessToast(null);

      setPendingAcceptSwap({ swap, seconds: 5 });

      pendingAcceptTimerRef.current = setInterval(() => {
        setPendingAcceptSwap((prev) => {
          if (!prev) {
            if (pendingAcceptTimerRef.current) {
              clearInterval(pendingAcceptTimerRef.current);
              pendingAcceptTimerRef.current = null;
            }
            return null;
          }

          if (prev.seconds <= 1) {
            if (pendingAcceptTimerRef.current) {
              clearInterval(pendingAcceptTimerRef.current);
              pendingAcceptTimerRef.current = null;
            }
            commitAcceptSwap(prev.swap);
            return null;
          }

          return { ...prev, seconds: prev.seconds - 1 };
        });
      }, 1000);
    },
    [commitAcceptSwap]
  );

  const handleUndoPendingAccept = useCallback(() => {
    if (pendingAcceptTimerRef.current) {
      clearInterval(pendingAcceptTimerRef.current);
      pendingAcceptTimerRef.current = null;
    }
    setPendingAcceptSwap(null);
  }, []);

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
      let matchesCategory = selectedCategory === 'All';
      if (!matchesCategory) {
        const categoryLower = selectedCategory.toLowerCase();
        const selectedSlug = getTagSlug(selectedCategory);

        if (Array.isArray(swap.tags) && swap.tags.length > 0) {
          const directMatch = swap.tags.some((t) => {
            const tagSlug = getTagSlug(t);
            const tagLabelLower = getTagLabel(t).toLowerCase();
            return (
              tagSlug === selectedSlug ||
              t.toLowerCase() === categoryLower ||
              tagLabelLower === categoryLower
            );
          });

          if (directMatch) {
            matchesCategory = true;
          } else {
            // Cross-category mapping for 19 seeded categories to canonical swap tags
            const codingCategories = ['programming', 'web development', 'mobile development', 'ai & machine learning', 'data & analytics'];
            const careerCategories = ['business', 'finance', 'communication', 'education', 'productivity'];

            if (codingCategories.includes(categoryLower) && swap.tags.some((t) => getTagSlug(t) === 'coding')) {
              matchesCategory = true;
            } else if (categoryLower === 'video & media' && swap.tags.some((t) => getTagSlug(t) === 'video-editing')) {
              matchesCategory = true;
            } else if (careerCategories.includes(categoryLower) && swap.tags.some((t) => getTagSlug(t) === 'career')) {
              matchesCategory = true;
            }
          }
        }

        if (!matchesCategory) {
          const topicLower = swap.topic.toLowerCase();
          const descLower = swap.description.toLowerCase();
          matchesCategory = topicLower.includes(categoryLower) || descLower.includes(categoryLower);
        }
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

      return matchesCategory && matchesSearch;
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
          {/* Beginner Guidance Card (H.3 Visual Scaffolding Fading) */}
          <ScaffoldingCard
            scaffoldId="explore_marketplace_guide"
            title="How Skill Exchanges Work"
            description="Browse open requests or filter by skill domain. When you accept a swap, credits are safely reserved in escrow until work is delivered and approved."
            restoreLabel="💡 Show Marketplace Guidance"
          />

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

          {/* Category Filter Chips — Recognition over Recall (H.1) */}
          <div className="explore-categories-wrapper">
            <div className="explore-categories-label" style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
              Filter by Skill Domain
            </div>
            <div
              className="explore-categories"
              role="tablist"
              aria-label="Skill Category Filter Chips"
            >
              {categories.map((category) => {
                const isActive = selectedCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="swaps-results-grid"
                    className={`category-pill ${isActive ? 'category-pill--active' : ''}`}
                    onClick={() => setSelectedCategory((prev) => (prev === category && category !== 'All' ? 'All' : category))}
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

          {/* Section L2 / H.2 Reversible Acceptance 5-second Undo Banner */}
          {pendingAcceptSwap && (
            <div
              className="as-toast-banner"
              role="status"
              aria-live="polite"
              style={{
                background: 'rgba(214, 166, 74, 0.15)',
                borderLeft: '4px solid #d6a64a',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '0.85rem 1.1rem',
                borderRadius: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span style={{ fontSize: '1.2rem' }} aria-hidden="true">⚡</span>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-color)' }}>
                    Accepting this swap...
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    "{pendingAcceptSwap.swap.topic}" • Accepting in {pendingAcceptSwap.seconds} second{pendingAcceptSwap.seconds !== 1 ? 's' : ''}...
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="as-btn as-btn--secondary"
                style={{
                  padding: '0.35rem 0.9rem',
                  fontSize: '0.825rem',
                  fontWeight: 700,
                  background: '#d6a64a',
                  color: '#0f172a',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
                onClick={handleUndoPendingAccept}
              >
                Undo ({pendingAcceptSwap.seconds}s)
              </button>
            </div>
          )}

          {/* Acceptance Success Toast */}
          {acceptSuccessToast && (
            <div
              className="as-toast-banner"
              role="status"
              aria-live="polite"
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                borderLeft: '4px solid #10b981',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.85rem 1.1rem',
                borderRadius: '10px',
              }}
            >
              <span style={{ fontSize: '1.2rem', color: '#10b981' }}>✓</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                Accepted swap "{acceptSuccessToast.swapTopic}"! Exchange moved to Active Swaps.
              </span>
              <button
                type="button"
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}
                onClick={() => setAcceptSuccessToast(null)}
                aria-label="Close notification"
              >
                ×
              </button>
            </div>
          )}

          {/* Acceptance Error Banner */}
          {acceptErrorMessage && (
            <div
              className="as-toast-banner"
              role="alert"
              aria-live="assertive"
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                borderLeft: '4px solid #ef4444',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.85rem 1.1rem',
                borderRadius: '10px',
              }}
            >
              <span style={{ fontSize: '1.2rem', color: '#ef4444' }}>⚠️</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-color)', lineHeight: 1.4 }}>
                {acceptErrorMessage}
              </span>
              <button
                type="button"
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}
                onClick={() => setAcceptErrorMessage(null)}
                aria-label="Dismiss error"
              >
                ×
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
            <div className="swaps-grid flex flex-col gap-4">
              {filteredSwaps.map((swap) => {
                const completedCount = swap.requesterProfile?.completedSwapsCount ?? completedSwapsMap[swap.requesterId] ?? 0;

                return (
                  <MarketplaceCard
                    key={swap.id}
                    swap={swap}
                    completedCount={completedCount}
                    selectedCategory={selectedCategory}
                    onSelectCategory={(label) => setSelectedCategory(label)}
                    onChat={handleOpenChat}
                    onAccept={(targetSwap) => {
                      if (!user) {
                        if (onNavigate) onNavigate(`/login?redirectTo=${encodeURIComponent('/explore')}`);
                        return;
                      }
                      if (!profile || profile.profile_completed === false) {
                        if (onNavigate) onNavigate(`/onboarding?redirectTo=${encodeURIComponent('/explore')}`);
                        else window.location.href = `/onboarding?redirectTo=${encodeURIComponent('/explore')}`;
                        return;
                      }
                      if (user.id === targetSwap.requesterId) {
                        setSelectedSwapForAccept(targetSwap);
                        setAcceptError('You cannot accept your own swap request.');
                      } else {
                        setSelectedSwapForAccept(targetSwap);
                        setAcceptError(null);
                      }
                    }}
                  />
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
                    alt={`Profile photo of ${getRequesterName(selectedSwapForAccept)}`}
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
                      <span className="verification-badge" title="Verified Profile" aria-label="Verified profile">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Verified
                      </span>
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
              <strong>Next step:</strong> You will have 5 seconds to undo before this swap is confirmed and moved to your Active Swaps.
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
                onClick={() => {
                  if (!user) {
                    setAcceptError('Please log in to accept swaps.');
                    return;
                  }
                  if (user.id === selectedSwapForAccept.requesterId) {
                    setAcceptError('You cannot accept your own swap request.');
                    return;
                  }
                  const targetSwap = selectedSwapForAccept;
                  setSelectedSwapForAccept(null);
                  startPendingAccept(targetSwap);
                }}
              >
                {isAccepting ? 'Accepting Swap...' : 'Accept Swap & Start Exchange'}
              </button>
            </div>
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

      <Footer onNavigate={onNavigate} />
    </div>
  );
}
