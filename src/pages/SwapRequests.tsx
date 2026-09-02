import { useState, useEffect, useCallback } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { useAuth } from '../context/AuthContext';
import {
  getUserSwaps,
  acceptCreditSwap,
  cancelCreditSwap,
  type SwapRecord,
} from '../lib/supabase/credits';
import { mapSwapRecordToSwap, type Swap } from '../types/swap';

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';

export interface UserInfo {
  name: string;
  role: string;
  location: string;
  avatar: string;
}

/** UI presentation view model for received requests tab */
export interface ReceivedRequest {
  id: string;
  user: UserInfo;
  skillWanted: string;
  creditsOffered: number;
  message: string;
  receivedAt: string;
  status: 'Pending' | 'Accepted' | 'Declined' | 'Cancelled';
}

/** UI presentation view model for sent requests tab */
export interface SentRequest {
  id: string;
  user: UserInfo;
  skillWanted: string;
  creditsOffered: number;
  message: string;
  sentAt: string;
  status: 'Pending' | 'Accepted' | 'Declined' | 'Cancelled';
}

type SwapRequestsPageProps = {
  onNavigate?: (path: string) => void;
};

export function SwapRequestsPage({ onNavigate }: SwapRequestsPageProps) {
  const { user, account, refreshAccount } = useAuth();
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
  const [receivedRequests, setReceivedRequests] = useState<ReceivedRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);

  const [actionPendingId, setActionPendingId] = useState<string | null>(null);

  // Modal State for View Profile / View Details
  const [selectedProfile, setSelectedProfile] = useState<UserInfo | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<{
    user: UserInfo;
    skill: string;
    credits: number;
    message: string;
    status: string;
    date: string;
    type: 'Received' | 'Sent';
  } | null>(null);

  // Status notification banners
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const loadRealSwaps = useCallback(async () => {
    if (!user) return;
    try {
      const records: SwapRecord[] = await getUserSwaps(user.id);
      if (records) {
        const canonicalSwaps: Swap[] = records.map(mapSwapRecordToSwap);
        const received: ReceivedRequest[] = [];
        const sent: SentRequest[] = [];

        canonicalSwaps.forEach((swap) => {
          const isSent = swap.requesterId === user.id;
          const isReceived = swap.participantId === user.id;

          const partnerProfile = isSent ? swap.participantProfile : swap.requesterProfile;
          const partnerName = partnerProfile?.fullName || (partnerProfile?.username ? `@${partnerProfile.username}` : (isSent ? 'Open Swap Participant' : 'SkillSwap Member'));
          const partnerRole = partnerProfile?.username ? `@${partnerProfile.username}` : 'SkillSwap Member';
          const partnerAvatar = partnerProfile?.avatarUrl || DEFAULT_AVATAR;

          const formattedDate = new Date(swap.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          });

          const statusMap: Record<string, ReceivedRequest['status']> = {
            open: 'Pending',
            accepted: 'Accepted',
            submitted: 'Accepted',
            completed: 'Accepted',
            cancelled: 'Cancelled',
            declined: 'Declined',
            withdrawn: 'Cancelled',
            expired: 'Cancelled',
          };

          if (isSent) {
            sent.push({
              id: swap.id,
              user: {
                name: partnerName,
                role: partnerRole,
                location: 'SkillSwap Network',
                avatar: partnerAvatar,
              },
              skillWanted: swap.topic,
              creditsOffered: swap.creditAmount,
              message: swap.description,
              sentAt: `Created ${formattedDate}`,
              status: statusMap[swap.status] || 'Pending',
            });
          } else if (isReceived) {
            received.push({
              id: swap.id,
              user: {
                name: partnerName,
                role: partnerRole,
                location: 'SkillSwap Network',
                avatar: partnerAvatar,
              },
              skillWanted: swap.topic,
              creditsOffered: swap.creditAmount,
              message: swap.description,
              receivedAt: `Received ${formattedDate}`,
              status: statusMap[swap.status] || 'Pending',
            });
          }
        });

        setReceivedRequests(received);
        setSentRequests(sent);
      }
    } catch (err) {
      console.error('Error loading real swaps:', err);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void loadRealSwaps();
    }
  }, [user, loadRealSwaps]);

  const handleAcceptReceived = async (id: string) => {
    const target = receivedRequests.find((r) => r.id === id);
    if (!target || actionPendingId) return;

    setActionPendingId(id);
    const res = await acceptCreditSwap(id);
    setActionPendingId(null);

    if (!res.success) {
      showToast(res.error || 'Failed to accept swap request.');
      return;
    }
    await refreshAccount();
    await loadRealSwaps();
    showToast(`Accepted swap request from ${target.user.name}! Swap is now active.`);
  };

  const handleDeclineReceived = async (id: string) => {
    const target = receivedRequests.find((r) => r.id === id);
    if (!target || actionPendingId) return;

    setActionPendingId(id);
    const res = await cancelCreditSwap(id);
    setActionPendingId(null);

    if (!res.success) {
      showToast(res.error || 'Failed to decline request.');
      return;
    }
    await refreshAccount();
    await loadRealSwaps();
    showToast(`Declined swap request from ${target.user.name}.`);
  };

  const handleCancelSent = async (id: string) => {
    const target = sentRequests.find((r) => r.id === id);
    if (!target || actionPendingId) return;

    setActionPendingId(id);
    const res = await cancelCreditSwap(id);
    setActionPendingId(null);

    if (!res.success) {
      showToast(res.error || 'Failed to cancel swap request.');
      return;
    }
    await refreshAccount();
    await loadRealSwaps();
    showToast(`Cancelled swap request sent to ${target.user.name}. Reserved credits released.`);
  };

  const activeReceivedCount = receivedRequests.filter((r) => r.status === 'Pending').length;
  const totalReceivedCount = receivedRequests.length;
  const totalSentCount = sentRequests.length;

  return (
    <div className="page-shell swap-requests-shell">
      <Navbar onNavigate={onNavigate} showUserHeader={false} />

      <div className="swap-requests-page">
        {/* TOP HEADER */}
        <header className="swap-requests-header">
          <div className="header-left">
            <h1 className="sr-title">Swap Requests</h1>
            <p className="sr-subtitle">
              Manage the skill exchanges you’ve received and requested.
            </p>
          </div>

          <div className="header-right">
            {/* Notification Icon */}
            <button
              type="button"
              className="sr-icon-btn"
              aria-label="Notifications"
              onClick={() => showToast('Notification center is active.')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sr-header-icon">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>

            {/* User Avatar */}
            <div className="sr-avatar-wrapper" title="Your Profile">
              <img
                src={DEFAULT_AVATAR}
                alt="Your avatar"
                className="sr-user-avatar"
              />
            </div>

            {/* Credits Card */}
            <div className="sr-credits-card">
              <span className="sr-credits-label">Your Credits</span>
              <span className="sr-credits-value">
                {account ? account.credits_balance : '...'}
              </span>
            </div>
          </div>
        </header>

        {/* TOAST BANNER */}
        {toastMessage && (
          <div className="sr-toast" role="status">
            <span>{toastMessage}</span>
            <button type="button" className="sr-toast-close" onClick={() => setToastMessage(null)}>
              ×
            </button>
          </div>
        )}

        {/* PRIMARY TABS */}
        <div className="sr-tabs-bar" role="tablist" aria-label="Swap Request Tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'received'}
            className={`sr-tab-btn ${activeTab === 'received' ? 'sr-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('received')}
          >
            Received
            {totalReceivedCount > 0 && (
              <span className="sr-tab-badge">{activeReceivedCount > 0 ? activeReceivedCount : totalReceivedCount}</span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'sent'}
            className={`sr-tab-btn ${activeTab === 'sent' ? 'sr-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('sent')}
          >
            Sent
            {totalSentCount > 0 && (
              <span className="sr-tab-badge">{totalSentCount}</span>
            )}
          </button>
        </div>

        {/* TAB CONTENT: RECEIVED REQUESTS */}
        {activeTab === 'received' && (
          <section className="sr-section" aria-labelledby="received-heading">
            <div className="sr-section-header">
              <h2 id="received-heading" className="sr-section-title">
                Received Requests <span className="sr-heading-count">{totalReceivedCount}</span>
              </h2>
            </div>

            <div className="sr-cards-list">
              {receivedRequests.length === 0 ? (
                <div className="sr-empty-state">
                  <p>You haven’t received any swap requests yet.</p>
                </div>
              ) : (
                receivedRequests.map((req) => (
                  <div key={req.id} className={`sr-card ${req.status !== 'Pending' ? 'sr-card--handled' : ''}`}>
                    {/* CARD HEADER */}
                    <div className="sr-card-header">
                      <div className="sr-user-info">
                        <img src={req.user.avatar} alt={req.user.name} className="sr-card-avatar" />
                        <div className="sr-user-meta">
                          <h3 className="sr-user-name">{req.user.name}</h3>
                          <p className="sr-user-role">{req.user.role} • {req.user.location}</p>
                        </div>
                      </div>

                      <div className="sr-header-time-status">
                        <span className="sr-timestamp">{req.receivedAt}</span>
                      </div>
                    </div>

                    {/* EXCHANGE SECTION */}
                    <div className="sr-exchange-grid">
                      <div className="sr-exchange-box">
                        <span className="sr-exchange-label">They want to learn</span>
                        <strong className="sr-exchange-skill">{req.skillWanted}</strong>
                      </div>

                      <div className="sr-exchange-arrow-box" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sr-exchange-arrow-icon">
                          <path d="M7 16V4M7 4L3 8M7 4l4 4" />
                          <path d="M17 8v12M17 20l4-4M17 20l-4-4" />
                        </svg>
                      </div>

                      <div className="sr-exchange-box">
                        <span className="sr-exchange-label">They are offering</span>
                        <strong className="sr-exchange-credits">{req.creditsOffered} Credits</strong>
                      </div>
                    </div>

                    {/* MESSAGE QUOTE CONTAINER */}
                    <div className="sr-quote-container">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="sr-quote-icon" aria-hidden="true">
                        <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                      </svg>
                      <p className="sr-quote-text">“{req.message}”</p>
                    </div>

                    {/* ACTIONS BAR */}
                    <div className="sr-card-footer">
                      <div className="sr-left-actions">
                        {req.status === 'Pending' ? (
                          <>
                            <button
                              type="button"
                              className="sr-btn sr-btn--accept"
                              disabled={actionPendingId === req.id}
                              onClick={() => handleAcceptReceived(req.id)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sr-btn-icon">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              {actionPendingId === req.id ? 'Processing...' : 'Accept'}
                            </button>
                            <button
                              type="button"
                              className="sr-btn sr-btn--decline"
                              disabled={actionPendingId === req.id}
                              onClick={() => handleDeclineReceived(req.id)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sr-btn-icon">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                              {actionPendingId === req.id ? 'Processing...' : 'Decline'}
                            </button>
                          </>
                        ) : (
                          <span className={`sr-status-pill sr-status-pill--${req.status.toLowerCase()}`}>
                            {req.status === 'Accepted' ? '✓ Accepted' : '× Declined'}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="sr-btn sr-btn--link"
                        onClick={() => setSelectedProfile(req.user)}
                      >
                        View Profile
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* TAB CONTENT: SENT REQUESTS */}
        {activeTab === 'sent' && (
          <section className="sr-section" aria-labelledby="sent-heading">
            <div className="sr-section-header">
              <h2 id="sent-heading" className="sr-section-title">
                Sent Requests <span className="sr-heading-count">{totalSentCount}</span>
              </h2>
            </div>

            <div className="sr-cards-list">
              {sentRequests.map((req) => (
                <div key={req.id} className="sr-card">
                  {/* CARD HEADER */}
                  <div className="sr-card-header">
                    <div className="sr-user-info">
                      <img src={req.user.avatar} alt={req.user.name} className="sr-card-avatar" />
                      <div className="sr-user-meta">
                        <h3 className="sr-user-name">{req.user.name}</h3>
                        <p className="sr-user-role">{req.user.role} • {req.user.location}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="sr-btn sr-btn--link"
                      onClick={() => setSelectedProfile(req.user)}
                    >
                      View Profile
                    </button>
                  </div>

                  {/* EXCHANGE SECTION */}
                  <div className="sr-exchange-grid">
                    <div className="sr-exchange-box">
                      <span className="sr-exchange-label">I want to learn</span>
                      <strong className="sr-exchange-skill">{req.skillWanted}</strong>
                    </div>

                    <div className="sr-exchange-arrow-box" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sr-exchange-arrow-icon">
                        <path d="M7 16V4M7 4L3 8M7 4l4 4" />
                        <path d="M17 8v12M17 20l4-4M17 20l-4-4" />
                      </svg>
                    </div>

                    <div className="sr-exchange-box">
                      <span className="sr-exchange-label">I am offering</span>
                      <strong className="sr-exchange-credits">{req.creditsOffered} Credits</strong>
                    </div>
                  </div>

                  {/* MESSAGE QUOTE CONTAINER */}
                  <div className="sr-quote-container">
                    <span className="sr-quote-label">My message</span>
                    <p className="sr-quote-text">“{req.message}”</p>
                  </div>

                  {/* CARD FOOTER WITH STATUS & ACTIONS */}
                  <div className="sr-card-footer sr-card-footer--sent">
                    <div className="sr-sent-meta">
                      <span className="sr-timestamp">{req.sentAt}</span>
                      <span className={`sr-status-pill sr-status-pill--${req.status.toLowerCase()}`}>
                        {req.status}
                      </span>
                    </div>

                    <div className="sr-right-actions">
                      <button
                        type="button"
                        className="sr-btn sr-btn--secondary"
                        onClick={() =>
                          setSelectedDetails({
                            user: req.user,
                            skill: req.skillWanted,
                            credits: req.creditsOffered,
                            message: req.message,
                            status: req.status,
                            date: req.sentAt,
                            type: 'Sent',
                          })
                        }
                      >
                        View Details
                      </button>

                      {req.status === 'Pending' && (
                        <button
                          type="button"
                          className="sr-btn sr-btn--cancel"
                          disabled={actionPendingId === req.id}
                          onClick={() => handleCancelSent(req.id)}
                        >
                          {actionPendingId === req.id ? 'Cancelling...' : 'Cancel Request'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {sentRequests.length === 0 && (
                <div className="sr-empty-state">
                  <p>You haven’t sent any swap requests yet.</p>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* VIEW PROFILE MODAL */}
      {selectedProfile && (
        <div className="modal-overlay" onClick={() => setSelectedProfile(null)}>
          <div className="modal-content sr-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="sr-profile-modal-header">
              <img src={selectedProfile.avatar} alt={selectedProfile.name} className="sr-modal-avatar" />
              <div>
                <h3 className="sr-modal-title">{selectedProfile.name}</h3>
                <p className="sr-modal-subtitle">{selectedProfile.role} • {selectedProfile.location}</p>
              </div>
              <button
                type="button"
                className="chat-close-btn"
                onClick={() => setSelectedProfile(null)}
              >
                ×
              </button>
            </div>

            <div className="sr-modal-body">
              <p className="sr-modal-bio">
                Member of SkillSwap community. Passionate about sharing skills and growing through peer-to-peer exchanges.
              </p>
              <div className="sr-modal-stats">
                <div>
                  <strong>Response Time</strong>
                  <span>&lt; 2 hours</span>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn--confirm"
                onClick={() => setSelectedProfile(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      {selectedDetails && (
        <div className="modal-overlay" onClick={() => setSelectedDetails(null)}>
          <div className="modal-content sr-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <h3 className="chat-title">Request Details</h3>
              <button
                type="button"
                className="chat-close-btn"
                onClick={() => setSelectedDetails(null)}
              >
                ×
              </button>
            </div>

            <div className="sr-details-modal-body">
              <div className="sr-detail-row">
                <span>Recipient:</span>
                <strong>{selectedDetails.user.name} ({selectedDetails.user.role})</strong>
              </div>
              <div className="sr-detail-row">
                <span>Requested Skill:</span>
                <strong>{selectedDetails.skill}</strong>
              </div>
              <div className="sr-detail-row">
                <span>Offered Credits:</span>
                <strong>{selectedDetails.credits} Credits</strong>
              </div>
              <div className="sr-detail-row">
                <span>Current Status:</span>
                <span className={`sr-status-pill sr-status-pill--${selectedDetails.status.toLowerCase()}`}>
                  {selectedDetails.status}
                </span>
              </div>
              <div className="sr-detail-row">
                <span>Timestamp:</span>
                <strong>{selectedDetails.date}</strong>
              </div>
              <div className="sr-detail-message-box">
                <span className="sr-quote-label">Submitted Message</span>
                <p>“{selectedDetails.message}”</p>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn--confirm"
                onClick={() => setSelectedDetails(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
