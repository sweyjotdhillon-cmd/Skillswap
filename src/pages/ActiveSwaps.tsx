import { useState, useEffect, useRef } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { useAuth } from '../context/AuthContext';
import { addUserCredits } from '../lib/supabase/credits';

export interface SwapParticipant {
  name: string;
  location: string;
  avatar: string;
  rating?: string;
  swapsCompleted?: number;
  bio?: string;
}

export interface AcceptedSwap {
  id: string;
  participant: SwapParticipant;
  title: string;
  description: string;
  credits: number;
  startedOn: string;
  deadline: string;
  progress: number;
  status: 'In Progress' | 'Review' | 'Submitted' | 'Completed';
  aboutSwap: string;
  nextStep: string;
  timeAgo: string;
  submittedWorkNotes?: string;
  submittedFiles?: string[];
}

export interface GivenSwap {
  id: string;
  participant: SwapParticipant;
  title: string;
  description: string;
  creditsOffered: number;
  acceptedOn: string;
  expectedBy: string;
  submissionStatus: 'Not submitted yet' | 'Submitted for Review' | 'Completed';
  statusBadge: 'Waiting for Submission' | 'In Review' | 'Completed';
  aboutSwap: string;
  whatHappensNext: string;
  timeAgo: string;
}

const INITIAL_ACCEPTED_SWAPS: AcceptedSwap[] = [
  {
    id: 'acc-1',
    participant: {
      name: 'Alex Sharma',
      location: 'Mumbai, India',
      avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
      rating: '4.9',
      swapsCompleted: 14,
      bio: 'Senior Video Producer & Editor with over 5 years of experience in Premiere Pro and After Effects.',
    },
    title: 'Advanced Video Editing',
    description: 'Learn cinematic editing, transitions, color grading & effects using Premiere Pro.',
    credits: 20,
    startedOn: 'May 20, 2025',
    deadline: 'May 28, 2025',
    progress: 65,
    status: 'In Progress',
    aboutSwap: 'In this swap, Alex is guiding you through multi-cam editing, audio leveling, speed ramping, and color correction workflows for cinematic storytelling.',
    nextStep: 'Complete Module 3 exercise on color grading and submit your project timeline export for review.',
    timeAgo: '2 days ago',
  },
  {
    id: 'acc-2',
    participant: {
      name: 'Neha Verma',
      location: 'Bengaluru, India',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      rating: '5.0',
      swapsCompleted: 22,
      bio: 'Lead Product Designer passionate about design systems, accessibility, and interactive Figma prototypes.',
    },
    title: 'UI/UX Design Fundamentals',
    description: 'Master wireframing, component design, auto-layout and interactive prototyping in Figma.',
    credits: 15,
    startedOn: 'May 22, 2025',
    deadline: 'Jun 2, 2025',
    progress: 40,
    status: 'In Progress',
    aboutSwap: 'Covering user research synthesis, wireframing, design system component creation, and interactive click-through prototyping.',
    nextStep: 'Submit your initial low-fidelity mobile app wireframes before moving on to auto-layout components.',
    timeAgo: '3 hours ago',
  },
  {
    id: 'acc-3',
    participant: {
      name: 'Rohit Patel',
      location: 'Delhi, India',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      rating: '4.8',
      swapsCompleted: 9,
      bio: 'SEO Strategist & Organic Growth Consultant helping creators and SaaS platforms scale search traffic.',
    },
    title: 'SEO Strategy Basics',
    description: 'Learn keyword research, on-page optimization, and technical SEO audit fundamentals.',
    credits: 10,
    startedOn: 'May 18, 2025',
    deadline: 'May 25, 2025',
    progress: 90,
    status: 'Review',
    aboutSwap: 'Practical SEO teardown covering keyword intent, meta tags structure, internal linking, and site performance audits.',
    nextStep: 'Your submitted keyword audit matrix is currently under final review by Rohit.',
    timeAgo: '1 day ago',
  },
];

const INITIAL_GIVEN_SWAPS: GivenSwap[] = [
  {
    id: 'giv-1',
    participant: {
      name: 'Priya Singh',
      location: 'Pune, India',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
      rating: '4.9',
      swapsCompleted: 11,
      bio: 'Full-stack enthusiast expanding skills in backend development and data structures.',
    },
    title: 'Python Basics For Beginners',
    description: 'Learn core Python concepts, data types, loops, functions and build small real-world programs.',
    creditsOffered: 15,
    acceptedOn: 'May 22, 2025',
    expectedBy: 'Jun 5, 2025',
    submissionStatus: 'Not submitted yet',
    statusBadge: 'Waiting for Submission',
    aboutSwap: 'You are teaching Priya core Python programming, control flow, functions, file I/O, and basic script automation.',
    whatHappensNext: 'Once Priya completes and submits the agreed assignments, you will review her code and mark the swap as completed to transfer SkillCredits.',
    timeAgo: 'Yesterday',
  },
  {
    id: 'giv-2',
    participant: {
      name: 'Arjun Mehta',
      location: 'Hyderabad, India',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      rating: '4.7',
      swapsCompleted: 7,
      bio: 'Growth Marketer specializing in organic social media management and community building.',
    },
    title: 'Social Media Marketing',
    description: 'Create content calendars, target audiences, and run conversion ad campaigns.',
    creditsOffered: 20,
    acceptedOn: 'May 24, 2025',
    expectedBy: 'Jun 8, 2025',
    submissionStatus: 'Not submitted yet',
    statusBadge: 'Waiting for Submission',
    aboutSwap: 'You are providing Arjun with social media strategy templates, content matrix guidelines, and distribution tactics.',
    whatHappensNext: 'Arjun is currently reviewing your strategy workbook and preparing his practice campaign draft for your review.',
    timeAgo: '3 days ago',
  },
];

interface ChatMessage {
  id: string;
  sender: 'user' | 'other';
  text: string;
  time: string;
}

type ActiveSwapsPageProps = {
  onNavigate?: (path: string) => void;
};

export function ActiveSwapsPage({ onNavigate }: ActiveSwapsPageProps) {
  const { user, refreshAccount } = useAuth();
  const [activeTab, setActiveTab] = useState<'accepted' | 'given'>('accepted');

  const [acceptedSwaps, setAcceptedSwaps] = useState<AcceptedSwap[]>(INITIAL_ACCEPTED_SWAPS);
  const [givenSwaps, setGivenSwaps] = useState<GivenSwap[]>(INITIAL_GIVEN_SWAPS);

  const [selectedAcceptedId, setSelectedAcceptedId] = useState<string>(INITIAL_ACCEPTED_SWAPS[0].id);
  const [selectedGivenId, setSelectedGivenId] = useState<string>(INITIAL_GIVEN_SWAPS[0].id);

  // Modals state
  const [isSubmitWorkModalOpen, setIsSubmitWorkModalOpen] = useState(false);
  const [submitWorkNotes, setSubmitWorkNotes] = useState('');
  const [submitWorkFiles, setSubmitWorkFiles] = useState<File[]>([]);
  const [submitSuccessToast, setSubmitSuccessToast] = useState<string | null>(null);

  const [selectedProfileModal, setSelectedProfileModal] = useState<SwapParticipant | null>(null);
  const [selectedGivenDetailsModal, setSelectedGivenDetailsModal] = useState<GivenSwap | null>(null);

  // Chat Modal state
  const [activeChatUser, setActiveChatUser] = useState<{ name: string; avatar: string; topic: string } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');

  const chatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (chatTimerRef.current) clearTimeout(chatTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleCloseChatModal = () => {
    if (chatTimerRef.current) clearTimeout(chatTimerRef.current);
    setActiveChatUser(null);
  };

  // Selected swap getters with safe null fallback
  const currentAcceptedSwap = acceptedSwaps.find((s) => s.id === selectedAcceptedId) || acceptedSwaps[0] || null;
  const currentGivenSwap = givenSwaps.find((s) => s.id === selectedGivenId) || givenSwaps[0] || null;

  const handleOpenChat = (participant: SwapParticipant, title: string) => {
    if (chatTimerRef.current) clearTimeout(chatTimerRef.current);
    setActiveChatUser({
      name: participant.name,
      avatar: participant.avatar,
      topic: title,
    });
    setChatMessages([
      {
        id: '1',
        sender: 'other',
        text: `Hi there! Looking forward to working together on ${title}. Let me know if you have any questions!`,
        time: 'Just now',
      },
    ]);
    setChatInput('');
  };

  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = chatInput.trim();
    if (!cleanText) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: cleanText,
      time: 'Just now',
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');

    if (chatTimerRef.current) clearTimeout(chatTimerRef.current);
    chatTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      setActiveChatUser((current) => {
        if (current) {
          setChatMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              sender: 'other',
              text: `Received! I'm on it and will follow up shortly.`,
              time: 'Just now',
            },
          ]);
        }
        return current;
      });
    }, 1000);
  };

  const handleFileDrop = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setSubmitWorkFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSubmitWorkFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAcceptedSwap) return;

    const fileNames = submitWorkFiles.map((f) => f.name);

    // Only mutate database credits for real persisted backend swap records (non-mock IDs)
    const isRealBackendSwap = Boolean(user && currentAcceptedSwap.id && !currentAcceptedSwap.id.startsWith('acc-'));

    if (isRealBackendSwap && user) {
      const idempotencyKey = `swap_completion_${currentAcceptedSwap.id}_${Date.now()}`;
      await addUserCredits(
        user.id,
        currentAcceptedSwap.credits,
        `Swap completion reward: ${currentAcceptedSwap.title}`,
        idempotencyKey,
        currentAcceptedSwap.id
      );
      await refreshAccount();
    }

    setAcceptedSwaps((prev) =>
      prev.map((s) =>
        s.id === currentAcceptedSwap.id
          ? {
              ...s,
              progress: 100,
              status: 'Completed',
              nextStep: 'Work submitted and completed!',
              submittedWorkNotes: submitWorkNotes,
              submittedFiles: fileNames,
            }
          : s
      )
    );

    setIsSubmitWorkModalOpen(false);
    setSubmitWorkNotes('');
    setSubmitWorkFiles([]);

    setSubmitSuccessToast(`Successfully submitted work for "${currentAcceptedSwap.title}"!`);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setSubmitSuccessToast(null);
    }, 4000);
  };

  return (
    <div className="page-shell active-swaps-shell">
      <Navbar onNavigate={onNavigate} showUserHeader={true} currentPath="/active-swaps" />

      <main className="active-swaps-page">
        {/* PAGE HEADER */}
        <header className="active-swaps-header">
          <h1 className="active-swaps-title">Active Swaps</h1>
          <p className="active-swaps-subtitle">Manage your ongoing skill exchanges.</p>
        </header>

        {/* TOAST NOTIFICATION */}
        {submitSuccessToast && (
          <div className="as-toast-banner" role="status">
            <div className="as-toast-icon">✓</div>
            <span>{submitSuccessToast}</span>
            <button
              type="button"
              className="as-toast-close"
              onClick={() => setSubmitSuccessToast(null)}
            >
              ×
            </button>
          </div>
        )}

        {/* MAIN WORKSPACE LAYOUT */}
        <div className="active-swaps-workspace">
          {/* LEFT PANEL: TAB LIST */}
          <section className="as-left-panel" aria-label="Swaps navigation list">
            {/* TABS HEADER */}
            <div className="as-tabs-header" role="tablist" aria-label="Active Swap Categories">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'accepted'}
                className={`as-tab-btn ${activeTab === 'accepted' ? 'as-tab-btn--active' : ''}`}
                onClick={() => setActiveTab('accepted')}
              >
                Accepted Swaps <span className="as-tab-count">{acceptedSwaps.length}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'given'}
                className={`as-tab-btn ${activeTab === 'given' ? 'as-tab-btn--active' : ''}`}
                onClick={() => setActiveTab('given')}
              >
                Given Swaps <span className="as-tab-count">{givenSwaps.length}</span>
              </button>
            </div>

            {/* SWAP CARDS LIST */}
            <div className="as-list-container">
              {activeTab === 'accepted' ? (
                acceptedSwaps.length === 0 ? (
                  <div className="sr-empty-state"><p>No accepted swaps found.</p></div>
                ) : (
                  acceptedSwaps.map((swap) => {
                    const isSelected = swap.id === selectedAcceptedId;
                    return (
                      <div
                        key={swap.id}
                        tabIndex={0}
                        role="button"
                        aria-pressed={isSelected}
                        className={`as-list-card ${isSelected ? 'as-list-card--selected' : ''}`}
                        onClick={() => setSelectedAcceptedId(swap.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedAcceptedId(swap.id);
                          }
                        }}
                      >
                        <div className="as-card-header-row">
                          <div className="as-card-user">
                            <img src={swap.participant.avatar} alt={swap.participant.name} className="as-card-avatar" />
                            <div className="as-card-user-meta">
                              <span className="as-card-user-name">{swap.participant.name}</span>
                              <span className="as-card-time">{swap.timeAgo}</span>
                            </div>
                          </div>
                          <span className={`as-status-badge as-status-badge--${swap.status.toLowerCase().replace(' ', '-')}`}>
                            ● {swap.status}
                          </span>
                        </div>

                        <div className="as-card-body">
                          <h3 className="as-card-title">{swap.title}</h3>
                          <div className="as-card-meta-row">
                            <span className="as-card-credits">{swap.credits} Credits</span>
                            <span className="as-card-progress">{swap.progress}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                givenSwaps.length === 0 ? (
                  <div className="sr-empty-state"><p>No given swaps found.</p></div>
                ) : (
                  givenSwaps.map((swap) => {
                    const isSelected = swap.id === selectedGivenId;
                    return (
                      <div
                        key={swap.id}
                        tabIndex={0}
                        role="button"
                        aria-pressed={isSelected}
                        className={`as-list-card ${isSelected ? 'as-list-card--selected' : ''}`}
                        onClick={() => setSelectedGivenId(swap.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedGivenId(swap.id);
                          }
                        }}
                      >
                        <div className="as-card-header-row">
                          <div className="as-card-user">
                            <img src={swap.participant.avatar} alt={swap.participant.name} className="as-card-avatar" />
                            <div className="as-card-user-meta">
                              <span className="as-card-user-name">{swap.participant.name}</span>
                              <span className="as-card-time">{swap.timeAgo}</span>
                            </div>
                          </div>
                          <span className="as-card-arrow-icon" aria-hidden="true">→</span>
                        </div>

                        <div className="as-card-body">
                          <h3 className="as-card-title">{swap.title}</h3>
                          <div className="as-card-meta-row">
                            <span className="as-card-credits">{swap.creditsOffered} Credits</span>
                            <span className="as-status-badge as-status-badge--waiting">
                              ● {swap.submissionStatus}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )
              )}
            </div>
          </section>

          {/* RIGHT PANEL: SELECTED SWAP DETAILS */}
          <section className="as-right-panel" aria-label="Selected swap details">
            {activeTab === 'accepted' && currentAcceptedSwap && (
              <div className="as-detail-card">
                {/* PARTICIPANT HEADER */}
                <div className="as-detail-participant-header">
                  <div className="as-detail-user-group">
                    <img
                      src={currentAcceptedSwap.participant.avatar}
                      alt={currentAcceptedSwap.participant.name}
                      className="as-detail-avatar"
                    />
                    <div className="as-detail-user-info">
                      <div className="as-detail-name-row">
                        <h2 className="as-detail-user-name">{currentAcceptedSwap.participant.name}</h2>
                        <button
                          type="button"
                          className="as-view-profile-link"
                          onClick={() => setSelectedProfileModal(currentAcceptedSwap.participant)}
                        >
                          View Profile
                        </button>
                      </div>
                      <p className="as-detail-user-location">{currentAcceptedSwap.participant.location}</p>
                    </div>
                  </div>

                  <span className={`as-status-badge as-status-badge--large as-status-badge--${currentAcceptedSwap.status.toLowerCase().replace(' ', '-')}`}>
                    ● {currentAcceptedSwap.status}
                  </span>
                </div>

                {/* SWAP TITLE & DESCRIPTION */}
                <div className="as-detail-title-section">
                  <h3 className="as-detail-swap-title">{currentAcceptedSwap.title}</h3>
                  <p className="as-detail-swap-desc">{currentAcceptedSwap.description}</p>
                </div>

                {/* HORIZONTAL STATS ROW */}
                <div className="as-stats-row">
                  <div className="as-stat-item">
                    <span className="as-stat-label">Credits</span>
                    <strong className="as-stat-value">{currentAcceptedSwap.credits} SC</strong>
                  </div>
                  <div className="as-stat-item">
                    <span className="as-stat-label">Started On</span>
                    <strong className="as-stat-value">{currentAcceptedSwap.startedOn}</strong>
                  </div>
                  <div className="as-stat-item">
                    <span className="as-stat-label">Deadline</span>
                    <strong className="as-stat-value">{currentAcceptedSwap.deadline}</strong>
                  </div>
                  <div className="as-stat-item as-stat-item--progress">
                    <div className="as-progress-label-row">
                      <span className="as-stat-label">Progress</span>
                      <strong className="as-progress-percent">{currentAcceptedSwap.progress}%</strong>
                    </div>
                    <div className="as-progress-track">
                      <div
                        className="as-progress-fill"
                        style={{ width: `${currentAcceptedSwap.progress}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* ABOUT THIS SWAP */}
                <div className="as-detail-section">
                  <h4 className="as-section-subheading">About this Swap</h4>
                  <p className="as-section-body-text">{currentAcceptedSwap.aboutSwap}</p>
                </div>

                {/* YOUR NEXT STEP */}
                <div className="as-detail-section">
                  <h4 className="as-section-subheading">Your Next Step</h4>
                  <p className="as-section-body-text">{currentAcceptedSwap.nextStep}</p>

                  {currentAcceptedSwap.submittedWorkNotes && (
                    <div className="as-submitted-summary-box">
                      <strong>Submitted Notes:</strong>
                      <p>“{currentAcceptedSwap.submittedWorkNotes}”</p>
                      {currentAcceptedSwap.submittedFiles && currentAcceptedSwap.submittedFiles.length > 0 && (
                        <div className="as-submitted-files-list">
                          {currentAcceptedSwap.submittedFiles.map((file, idx) => (
                            <span key={idx} className="as-file-chip">
                              📎 {file}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* MAJOR ACTION BUTTONS */}
                <div className="as-detail-actions-row">
                  <button
                    type="button"
                    className="as-btn as-btn--primary"
                    onClick={() => setIsSubmitWorkModalOpen(true)}
                  >
                    Submit Work
                  </button>

                  <button
                    type="button"
                    className="as-btn as-btn--secondary"
                    onClick={() => handleOpenChat(currentAcceptedSwap.participant, currentAcceptedSwap.title)}
                  >
                    Start Chat
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'given' && currentGivenSwap && (
              <div className="as-detail-card">
                {/* PARTICIPANT HEADER */}
                <div className="as-detail-participant-header">
                  <div className="as-detail-user-group">
                    <img
                      src={currentGivenSwap.participant.avatar}
                      alt={currentGivenSwap.participant.name}
                      className="as-detail-avatar"
                    />
                    <div className="as-detail-user-info">
                      <div className="as-detail-name-row">
                        <h2 className="as-detail-user-name">{currentGivenSwap.participant.name}</h2>
                        <button
                          type="button"
                          className="as-view-profile-link"
                          onClick={() => setSelectedProfileModal(currentGivenSwap.participant)}
                        >
                          View Profile
                        </button>
                      </div>
                      <p className="as-detail-user-location">{currentGivenSwap.participant.location}</p>
                    </div>
                  </div>

                  <span className="as-status-badge as-status-badge--large as-status-badge--waiting">
                    ● {currentGivenSwap.statusBadge}
                  </span>
                </div>

                {/* SWAP TITLE & DESCRIPTION */}
                <div className="as-detail-title-section">
                  <h3 className="as-detail-swap-title">{currentGivenSwap.title}</h3>
                  <p className="as-detail-swap-desc">{currentGivenSwap.description}</p>
                </div>

                {/* HORIZONTAL STATS ROW */}
                <div className="as-stats-row">
                  <div className="as-stat-item">
                    <span className="as-stat-label">Credits Offered</span>
                    <strong className="as-stat-value">{currentGivenSwap.creditsOffered} SC</strong>
                  </div>
                  <div className="as-stat-item">
                    <span className="as-stat-label">Accepted On</span>
                    <strong className="as-stat-value">{currentGivenSwap.acceptedOn}</strong>
                  </div>
                  <div className="as-stat-item">
                    <span className="as-stat-label">Expected By</span>
                    <strong className="as-stat-value">{currentGivenSwap.expectedBy}</strong>
                  </div>
                  <div className="as-stat-item">
                    <span className="as-stat-label">Submission Status</span>
                    <strong className="as-stat-value as-status-text--waiting">
                      ● {currentGivenSwap.submissionStatus}
                    </strong>
                  </div>
                </div>

                {/* HIGHLIGHTED CALLOUT BOX */}
                <div className="as-callout-box">
                  <div className="as-callout-title">Waiting for submission</div>
                  <p className="as-callout-text">
                    “{currentGivenSwap.participant.name} has accepted your swap. You’re waiting for her to submit the agreed work.”
                  </p>
                </div>

                {/* ABOUT THIS SWAP */}
                <div className="as-detail-section">
                  <h4 className="as-section-subheading">About This Swap</h4>
                  <p className="as-section-body-text">{currentGivenSwap.aboutSwap}</p>
                </div>

                {/* WHAT HAPPENS NEXT */}
                <div className="as-detail-section">
                  <h4 className="as-section-subheading">What Happens Next?</h4>
                  <p className="as-section-body-text">{currentGivenSwap.whatHappensNext}</p>
                </div>

                {/* MAJOR ACTION BUTTONS */}
                <div className="as-detail-actions-row">
                  <button
                    type="button"
                    className="as-btn as-btn--secondary"
                    onClick={() => handleOpenChat(currentGivenSwap.participant, currentGivenSwap.title)}
                  >
                    Start Chat
                  </button>

                  <button
                    type="button"
                    className="as-btn as-btn--outline"
                    onClick={() => setSelectedGivenDetailsModal(currentGivenSwap)}
                  >
                    View Details
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* SUBMIT WORK MODAL */}
      {isSubmitWorkModalOpen && currentAcceptedSwap && (
        <div className="modal-overlay" onClick={() => setIsSubmitWorkModalOpen(false)}>
          <div className="modal-content as-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <h3 className="chat-title">Submit Work for {currentAcceptedSwap.title}</h3>
              <button
                type="button"
                className="chat-close-btn"
                onClick={() => setIsSubmitWorkModalOpen(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmitWork} className="as-modal-form">
              <div className="form-group">
                <label className="form-label" htmlFor="submit-notes">
                  Submission Notes & Deliverable Links
                </label>
                <textarea
                  id="submit-notes"
                  className="form-textarea"
                  placeholder="Describe your completed work, share links to Figma, GitHub, Google Drive, or notes for review..."
                  value={submitWorkNotes}
                  onChange={(e) => setSubmitWorkNotes(e.target.value)}
                  rows={4}
                  required
                />
              </div>

              <div className="form-group">
                <span className="form-label">Attach Files (Optional)</span>
                <label className="dropzone" htmlFor="submit-file-input">
                  <input
                    id="submit-file-input"
                    type="file"
                    multiple
                    className="hidden-file-input"
                    onChange={handleFileDrop}
                  />
                  <div className="dropzone-content">
                    <span className="dropzone-add-text">Drag & drop files or browse</span>
                    <span className="dropzone-subtext">PDF, ZIP, PNG, JPG up to 25MB</span>
                  </div>
                </label>

                {submitWorkFiles.length > 0 && (
                  <div className="as-modal-file-list">
                    {submitWorkFiles.map((file, i) => (
                      <div key={i} className="attachment-card">
                        <div className="attachment-info">
                          <span className="attachment-name">{file.name}</span>
                          <span className="attachment-size">({(file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        <button
                          type="button"
                          className="attachment-remove-btn"
                          onClick={() => handleRemoveFile(i)}
                          aria-label="Remove file"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn modal-btn--cancel"
                  onClick={() => setIsSubmitWorkModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="modal-btn modal-btn--confirm">
                  Confirm Submission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHAT MODAL */}
      {activeChatUser && (
        <div className="modal-overlay" onClick={handleCloseChatModal}>
          <div className="modal-content chat-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <div className="chat-user-header-info">
                <img src={activeChatUser.avatar} alt={activeChatUser.name} className="chat-avatar" />
                <div>
                  <h3 className="chat-title">Chat with {activeChatUser.name}</h3>
                  <p className="chat-subtitle">{activeChatUser.topic}</p>
                </div>
              </div>
              <button
                type="button"
                className="chat-close-btn"
                onClick={handleCloseChatModal}
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

            <form onSubmit={handleSendChatMessage} className="chat-input-form">
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

      {/* VIEW PROFILE MODAL */}
      {selectedProfileModal && (
        <div className="modal-overlay" onClick={() => setSelectedProfileModal(null)}>
          <div className="modal-content sr-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="sr-profile-modal-header">
              <img src={selectedProfileModal.avatar} alt={selectedProfileModal.name} className="sr-modal-avatar" />
              <div>
                <h3 className="sr-modal-title">{selectedProfileModal.name}</h3>
                <p className="sr-modal-subtitle">{selectedProfileModal.location}</p>
              </div>
              <button
                type="button"
                className="chat-close-btn"
                onClick={() => setSelectedProfileModal(null)}
              >
                ×
              </button>
            </div>

            <div className="sr-modal-body">
              <p className="sr-modal-bio">{selectedProfileModal.bio || 'Active SkillSwap participant.'}</p>
              <div className="sr-modal-stats">
                <div>
                  <strong>Rating</strong>
                  <span>★ {selectedProfileModal.rating || '4.9'}</span>
                </div>
                <div>
                  <strong>Swaps Completed</strong>
                  <span>{selectedProfileModal.swapsCompleted || 10}+ exchanges</span>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn--confirm"
                onClick={() => setSelectedProfileModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL FOR GIVEN SWAP */}
      {selectedGivenDetailsModal && (
        <div className="modal-overlay" onClick={() => setSelectedGivenDetailsModal(null)}>
          <div className="modal-content sr-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <h3 className="chat-title">Given Swap Details</h3>
              <button
                type="button"
                className="chat-close-btn"
                onClick={() => setSelectedGivenDetailsModal(null)}
              >
                ×
              </button>
            </div>

            <div className="sr-details-modal-body">
              <div className="sr-detail-row">
                <span>Participant:</span>
                <strong>{selectedGivenDetailsModal.participant.name} ({selectedGivenDetailsModal.participant.location})</strong>
              </div>
              <div className="sr-detail-row">
                <span>Skill Title:</span>
                <strong>{selectedGivenDetailsModal.title}</strong>
              </div>
              <div className="sr-detail-row">
                <span>Credits Offered:</span>
                <strong>{selectedGivenDetailsModal.creditsOffered} SC</strong>
              </div>
              <div className="sr-detail-row">
                <span>Accepted Date:</span>
                <strong>{selectedGivenDetailsModal.acceptedOn}</strong>
              </div>
              <div className="sr-detail-row">
                <span>Expected By:</span>
                <strong>{selectedGivenDetailsModal.expectedBy}</strong>
              </div>
              <div className="sr-detail-row">
                <span>Current Status:</span>
                <span className="as-status-badge as-status-badge--waiting">
                  ● {selectedGivenDetailsModal.submissionStatus}
                </span>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn--confirm"
                onClick={() => setSelectedGivenDetailsModal(null)}
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
