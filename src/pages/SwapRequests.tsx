import { useState } from 'react';
import { Navbar } from '../components/navigation/Navbar';

export interface UserInfo {
  name: string;
  role: string;
  location: string;
  avatar: string;
}

export interface ReceivedRequest {
  id: string;
  user: UserInfo;
  skillWanted: string;
  creditsOffered: number;
  message: string;
  receivedAt: string;
  status: 'Pending' | 'Accepted' | 'Declined';
}

export interface SentRequest {
  id: string;
  user: UserInfo;
  skillWanted: string;
  creditsOffered: number;
  message: string;
  sentAt: string;
  status: 'Pending' | 'Accepted' | 'Declined';
}

const INITIAL_RECEIVED_REQUESTS: ReceivedRequest[] = [
  {
    id: 'rec-1',
    user: {
      name: 'Aarav Sharma',
      role: 'UI Designer',
      location: 'Chandigarh',
      avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
    },
    skillWanted: 'Video Editing',
    creditsOffered: 20,
    message: 'Hey! I’m trying to improve my video editing for my YouTube channel. I can help you learn Python basics in return.',
    receivedAt: 'Received 2 hours ago',
    status: 'Pending',
  },
  {
    id: 'rec-2',
    user: {
      name: 'Mehak Kapoor',
      role: 'Graphic Designer',
      location: 'Mumbai',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    },
    skillWanted: 'Content Writing',
    creditsOffered: 15,
    message: 'I’d love to improve my writing skills while helping you with graphic design.',
    receivedAt: 'Received 5 hours ago',
    status: 'Pending',
  },
  {
    id: 'rec-3',
    user: {
      name: 'Rohan Verma',
      role: 'Photographer',
      location: 'Jaipur',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    },
    skillWanted: 'Public Speaking',
    creditsOffered: 25,
    message: 'I can help you get started with photography while you help me become more confident speaking.',
    receivedAt: 'Received 1 day ago',
    status: 'Pending',
  },
];

const INITIAL_SENT_REQUESTS: SentRequest[] = [
  {
    id: 'sent-1',
    user: {
      name: 'Priya Mehta',
      role: 'Python Developer',
      location: 'Delhi',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    },
    skillWanted: 'Python',
    creditsOffered: 15,
    message: 'I’d love to learn the fundamentals of Python from you. I can help you improve your UI/UX design skills in return.',
    sentAt: 'Sent yesterday',
    status: 'Pending',
  },
  {
    id: 'sent-2',
    user: {
      name: 'Kabir Singh',
      role: 'Photographer',
      location: 'Jaipur',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    },
    skillWanted: 'Photography',
    creditsOffered: 20,
    message: 'I want to improve my photography skills. I can help you grow your social media presence and strategy.',
    sentAt: 'Sent 2 days ago',
    status: 'Accepted',
  },
  {
    id: 'sent-3',
    user: {
      name: 'Ananya Gupta',
      role: 'Musician',
      location: 'Bangalore',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    },
    skillWanted: 'Guitar',
    creditsOffered: 10,
    message: 'I’m excited to learn guitar from you. I can help you with video editing for your projects.',
    sentAt: 'Sent 3 days ago',
    status: 'Declined',
  },
];

type SwapRequestsPageProps = {
  onNavigate?: (path: string) => void;
};

export function SwapRequestsPage({ onNavigate }: SwapRequestsPageProps) {
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
  const [receivedRequests, setReceivedRequests] = useState<ReceivedRequest[]>(INITIAL_RECEIVED_REQUESTS);
  const [sentRequests, setSentRequests] = useState<SentRequest[]>(INITIAL_SENT_REQUESTS);
  const [credits, setCredits] = useState<number>(120);

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

  const handleAcceptReceived = (id: string) => {
    const target = receivedRequests.find((r) => r.id === id);
    if (!target) return;

    setReceivedRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'Accepted' } : r))
    );
    setCredits((prev) => prev + target.creditsOffered);
    showToast(`Accepted swap request from ${target.user.name}! +${target.creditsOffered} Credits added.`);
  };

  const handleDeclineReceived = (id: string) => {
    const target = receivedRequests.find((r) => r.id === id);
    if (!target) return;

    setReceivedRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'Declined' } : r))
    );
    showToast(`Declined swap request from ${target.user.name}.`);
  };

  const handleCancelSent = (id: string) => {
    const target = sentRequests.find((r) => r.id === id);
    if (!target) return;

    setSentRequests((prev) => prev.filter((r) => r.id !== id));
    showToast(`Cancelled swap request sent to ${target.user.name}.`);
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
            {/* Notification Icon with Red Badge */}
            <button
              type="button"
              className="sr-icon-btn"
              aria-label="Notifications"
              onClick={() => showToast('You have 2 unread notifications.')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sr-header-icon">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="sr-notif-badge" aria-hidden="true" />
            </button>

            {/* User Avatar */}
            <div className="sr-avatar-wrapper" title="Your Profile">
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80"
                alt="Your avatar"
                className="sr-user-avatar"
              />
            </div>

            {/* Credits Card */}
            <div className="sr-credits-card">
              <span className="sr-credits-label">Your Credits</span>
              <span className="sr-credits-value">{credits}</span>
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
              {receivedRequests.map((req) => (
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
                            onClick={() => handleAcceptReceived(req.id)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sr-btn-icon">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Accept
                          </button>
                          <button
                            type="button"
                            className="sr-btn sr-btn--decline"
                            onClick={() => handleDeclineReceived(req.id)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sr-btn-icon">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                            Decline
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
              ))}
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
                          onClick={() => handleCancelSent(req.id)}
                        >
                          Cancel Request
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
                  <strong>Rating</strong>
                  <span>★ 4.9 (18 swaps)</span>
                </div>
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
