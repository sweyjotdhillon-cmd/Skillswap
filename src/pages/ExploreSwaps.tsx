import { useState, useEffect, useRef, useCallback } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { HeroVisual } from '../components/hero/HeroVisual';
import { useAuth } from '../context/AuthContext';
import { getOpenSwaps, acceptCreditSwap } from '../lib/supabase/credits';
import { mapSwapRecordToSwap, type Swap } from '../types/swap';

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';

const CATEGORIES = [
  'All',
  'Design',
  'Coding',
  'Writing',
  'Photography',
  'Video Editing',
  'Marketing',
  'Music',
  'Languages',
  'Career',
  'Fitness',
];

type ExploreSwapsPageProps = {
  onNavigate?: (path: string) => void;
};

interface ChatMessage {
  id: string;
  sender: 'user' | 'other';
  text: string;
  time: string;
}

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

  const [selectedSwapForChat, setSelectedSwapForChat] = useState<Swap | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');

  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

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

  // Track mounted state and clean up pending timers on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (replyTimerRef.current) {
        clearTimeout(replyTimerRef.current);
      }
    };
  }, []);

  const handleCloseChat = () => {
    if (replyTimerRef.current) {
      clearTimeout(replyTimerRef.current);
    }
    setSelectedSwapForChat(null);
  };

  const filteredSwaps = swaps.filter((swap) => {
    const categoryLower = selectedCategory.toLowerCase();
    const matchesCategory =
      selectedCategory === 'All' ||
      swap.topic.toLowerCase().includes(categoryLower) ||
      swap.description.toLowerCase().includes(categoryLower);

    const query = searchTerm.toLowerCase().trim();
    const requesterName = (swap.requesterProfile?.fullName || swap.requesterProfile?.username || '').toLowerCase();
    const matchesSearch =
      !query ||
      swap.topic.toLowerCase().includes(query) ||
      swap.description.toLowerCase().includes(query) ||
      requesterName.includes(query);

    return matchesCategory && matchesSearch;
  });

  const handleOpenChat = (swap: Swap) => {
    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    setSelectedSwapForChat(swap);
    setChatMessages([
      {
        id: '1',
        sender: 'other',
        text: `Hi! I saw you're interested in my listing for ${swap.topic}. How can I help?`,
        time: 'Just now',
      },
    ]);
    setChatInput('');
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = chatInput.trim();
    if (!cleanText || !selectedSwapForChat) return;

    const currentSwapId = selectedSwapForChat.id;
    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: cleanText,
      time: 'Just now',
    };

    setChatMessages((prev) => [...prev, newMsg]);
    setChatInput('');

    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    replyTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      setSelectedSwapForChat((current) => {
        if (current && current.id === currentSwapId) {
          setChatMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              sender: 'other',
              text: `Sounds great! Let's coordinate details soon.`,
              time: 'Just now',
            },
          ]);
        }
        return current;
      });
    }, 1000);
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

          {/* Category Filter Pills */}
          <div className="explore-categories" role="tablist" aria-label="Category filter">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={selectedCategory === category}
                className={`category-pill ${selectedCategory === category ? 'category-pill--active' : ''}`}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Available Swaps Header */}
          <div className="explore-section-header">
            <h2 className="available-swaps-title">Available Swaps</h2>
            <p className="available-swaps-subtitle">
              Find a skill you need. Exchange it for something you know.
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
                <line x1="12" y1="8" x2="12" y2="12" />
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
                          <h3 className="swap-need-title">{swap.topic}</h3>
                          <p className="swap-description">{swap.description}</p>
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

                    <div className="swap-card-footer">
                      <div className="swap-user-info">
                        <span className="swap-user-name">{requesterName}</span>
                      </div>

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
                <h3 className="modal-title">Accept this swap?</h3>
                <div className="modal-swap-details">
                  <div className="modal-detail-row">
                    <span className="modal-label">You’re accepting:</span>
                    <strong>{selectedSwapForAccept.topic}</strong>
                  </div>
                  <div className="modal-detail-user">
                    <span>Offered by:</span> {getRequesterName(selectedSwapForAccept)} • {selectedSwapForAccept.creditAmount} SkillCredits
                  </div>
                </div>

                {acceptError && (
                  <p className="error-message" style={{ margin: '12px 0 0' }} role="alert">
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
                      const res = await acceptCreditSwap(selectedSwapForAccept.id);
                      setIsAccepting(false);
                      if (!res.success) {
                        setAcceptError(res.error || 'Failed to accept swap.');
                        return;
                      }
                      const acceptedSwapId = selectedSwapForAccept.id;
                      setSwaps((prev) => prev.filter((s) => s.id !== acceptedSwapId));
                      await refreshAccount();
                      await loadRealOpenSwaps();
                      setRequestSent(true);
                    }}
                  >
                    {isAccepting ? 'Accepting...' : 'Confirm Accept Swap'}
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
        <div className="modal-overlay" onClick={handleCloseChat}>
          <div className="modal-content chat-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <div className="chat-user-header-info">
                <img src={getRequesterAvatar(selectedSwapForChat)} alt={getRequesterName(selectedSwapForChat)} className="chat-avatar" />
                <div>
                  <h3 className="chat-title">Chat with {getRequesterName(selectedSwapForChat)}</h3>
                  <p className="chat-subtitle">
                    {selectedSwapForChat.topic}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="chat-close-btn"
                onClick={handleCloseChat}
              >
                ×
              </button>
            </div>

            <div className="chat-messages-container">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`chat-message-bubble ${msg.sender === 'user' ? 'chat-message--user' : 'chat-message--other'}`}
                >
                  <p className="chat-message-text">{msg.text}</p>
                  <span className="chat-message-time">{msg.time}</span>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendMessage} className="chat-input-form">
              <input
                type="text"
                className="chat-input"
                placeholder="Write a message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button type="submit" className="chat-send-btn">
                Send
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
