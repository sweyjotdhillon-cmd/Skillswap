import { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { HeroVisual } from '../components/hero/HeroVisual';
import { useAuth } from '../context/AuthContext';
import {
  getOpenSwaps,
  acceptCreditSwap,
  cancelCreditSwap,
} from '../lib/supabase/credits';
import { mapSwapRecordToSwap, type Swap } from '../types/swap';
import { SWAP_TAG_OPTIONS, getTagLabel, getTagSlug } from '../constants/tags';
import { SwapChatModal } from '../components/chat/SwapChatModal';

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';

const CATEGORIES = ['All', ...SWAP_TAG_OPTIONS.map((t) => t.label)];

type ExploreSwapsPageProps = {
  onNavigate?: (path: string) => void;
};

export function ExploreSwapsPage({ onNavigate }: ExploreSwapsPageProps) {
  const { user, refreshAccount } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const [swaps, setSwaps] = useState<Swap[]>([]);
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

  const filteredSwaps = swaps.filter((swap) => {
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
    return swap.requesterProfile?.avatarUrl || DEFAULT_AVATAR;
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

                return (
                  <div key={swap.id} className="swap-card">
                    <div className="swap-card-main">
                      <div className="swap-card-need-section">
                        <img src={requesterAvatar} alt={requesterName} className="swap-avatar" />
                        <div className="swap-need-details">
                          <div className="swap-author-meta" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.2rem' }}>
                            <span className="swap-user-name" style={{ fontSize: '0.825rem', fontWeight: 600, opacity: 0.85 }}>{requesterName}</span>
                          </div>
                          <h3 className="swap-need-title">{swap.topic}</h3>
                          <p className="swap-description">{swap.description}</p>

                          {swap.tags && swap.tags.length > 0 && (
                            <div className="swap-tags-row" style={{ marginTop: '0.5rem' }}>
                              {swap.tags.map((tag) => {
                                const label = getTagLabel(tag);
                                const isSelected = getTagSlug(selectedCategory) === getTagSlug(tag);
                                return (
                                  <span
                                    key={tag}
                                    className={`swap-tag ${isSelected ? 'swap-tag--active' : ''}`}
                                    style={{
                                      cursor: 'pointer',
                                      fontWeight: isSelected ? 600 : 400,
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedCategory(label);
                                    }}
                                  >
                                    #{label}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="swap-credits-badge">
                        <div className="sc-icon-circle">
                          <span className="sc-symbol">⚡</span>
                          <span className="sc-amount">{swap.creditAmount}</span>
                        </div>
                        <span className="sc-text-label">SkillCredits</span>
                      </div>
                    </div>

                    <div className="swap-card-footer" style={{ justifyContent: 'flex-end' }}>
                      <div className="swap-card-actions">
                        <button
                          type="button"
                          className="swap-btn swap-btn--primary"
                          onClick={() => {
                            if (user && user.id === swap.requesterId) {
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
                          onClick={() => handleOpenChat(swap)}
                        >
                          Chat
                        </button>
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
                  <div className="modal-detail-row">
                    <span className="modal-label">Offered By</span>
                    <span>{getRequesterName(selectedSwapForAccept)}</span>
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
