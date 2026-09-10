import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import {
  getSwapMessages,
  sendSwapMessage,
  getSwapSubmission,
  getSwapAttachments,
  getSubmissionFileSignedUrl,
  getSwapAttachmentSignedUrl,
  downloadFileFromSignedUrl,
  type SwapAttachment,
} from '../../lib/supabase/credits';
import type { Swap, SwapMessage, SwapSubmission } from '../../types/swap';
import { getTagLabel } from '../../constants/tags';
import { TransactionProgress } from '../transaction/TransactionProgress';
import { VerificationBadge } from '../ui/VerificationBadge';
import {
  EmbeddedTransactionCard,
  SubmissionEventCard,
  SettlementEventCard,
  StatusChangeEventCard,
} from './TransactionEventCards';

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';

export interface SwapChatModalProps {
  swap: Swap;
  partnerName?: string;
  partnerAvatar?: string;
  onClose: () => void;
  onOpenSubmitWork?: () => void;
  onApproveSwap?: () => Promise<void>;
  isApproving?: boolean;
}

/** Helper to sort messages chronologically by createdAt, with ID as deterministic tie-breaker */
function sortMessages(msgs: SwapMessage[]): SwapMessage[] {
  return [...msgs].sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });
}

/** Helper to merge new messages into state while deduplicating by ID and sorting */
function mergeAndDeduplicate(existing: SwapMessage[], incoming: SwapMessage[]): SwapMessage[] {
  if (incoming.length === 0) return existing;
  const map = new Map<string, SwapMessage>();
  for (const m of existing) {
    if (m && m.id) map.set(m.id, m);
  }
  for (const m of incoming) {
    if (m && m.id) map.set(m.id, m);
  }
  return sortMessages(Array.from(map.values()));
}

export function SwapChatModal({
  swap,
  partnerName,
  partnerAvatar,
  onClose,
  onOpenSubmitWork,
  onApproveSwap,
  isApproving = false,
}: SwapChatModalProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<SwapMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Mobile active view tab state (for responsive breakpoints <= 768px)
  const [mobileActiveTab, setMobileActiveTab] = useState<'chat' | 'workspace'>('chat');

  // Progressive disclosure state for text fields
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState<boolean>(false);
  const [isRequirementsExpanded, setIsRequirementsExpanded] = useState<boolean>(false);

  // Workspace state: submission & creator attachments
  const [submission, setSubmission] = useState<SwapSubmission | null>(null);
  const [creatorAttachments, setCreatorAttachments] = useState<SwapAttachment[]>([]);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabaseBrowserClient>>['channel']> | null>(null);

  // Derive recipient ID strictly from swap record
  const isRequester = user ? user.id === swap.requesterId : false;
  const isParticipant = user && swap.participantId ? user.id === swap.participantId : false;

  let recipientId: string | null = null;
  if (isRequester) {
    recipientId = swap.participantId;
  } else if (isParticipant) {
    recipientId = swap.requesterId;
  } else {
    // Open swap chat where current user is applicant/visitor chatting with requester
    recipientId = swap.requesterId;
  }

  // Partner profile metadata
  const partnerProfile = isRequester ? swap.participantProfile : swap.requesterProfile;

  const displayName =
    partnerName ||
    (partnerProfile?.fullName || (partnerProfile?.username ? `@${partnerProfile.username}` : (isRequester ? 'Participant' : 'Creator')));

  const displayAvatar =
    partnerAvatar ||
    partnerProfile?.avatarUrl ||
    DEFAULT_AVATAR;

  const isPartnerVerified = Boolean(partnerProfile?.isVerified);

  // Load persisted submission and attachments for context
  useEffect(() => {
    let active = true;
    const fetchWorkspaceDetails = async () => {
      const [subRes, attRes] = await Promise.all([
        getSwapSubmission(swap.id),
        getSwapAttachments(swap.id),
      ]);
      if (!active) return;
      if (subRes.data) setSubmission(subRes.data);
      if (attRes.data) setCreatorAttachments(attRes.data);
    };

    void fetchWorkspaceDetails();
    return () => {
      active = false;
    };
  }, [swap.id, swap.status]);

  // Primary effect: Manage Realtime postgres_changes + Broadcast subscription & database initial fetch / reconnect catch-up
  useEffect(() => {
    setChatError(null);

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !swap.id || !user) return;

    let isMounted = true;

    // Helper to fetch latest persisted messages from PostgreSQL
    const fetchPersistedMessages = async () => {
      const res = await getSwapMessages(swap.id);
      if (!isMounted) return;

      if (res.error) {
        setChatError(res.error);
      } else {
        setMessages((prev) => mergeAndDeduplicate(prev, res.data));
      }
    };

    // 1. Initial database SELECT
    void fetchPersistedMessages();

    // 2. Setup Realtime subscription
    const channelName = `skillswap-chat:${swap.id}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: true },
      },
    });

    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'chat_message' }, (payload) => {
        if (!isMounted) return;
        const msg = payload.payload as SwapMessage;
        if (!msg || !msg.id || msg.swapId !== swap.id) return;

        setMessages((prev) => mergeAndDeduplicate(prev, [msg]));
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'swap_messages',
          filter: `swap_id=eq.${swap.id}`,
        },
        (payload) => {
          if (!isMounted) return;
          const raw = payload.new as {
            id: string;
            swap_id: string;
            sender_id: string;
            recipient_id: string;
            body: string;
            read_at?: string | null;
            created_at: string;
          };

          if (raw && raw.id && raw.swap_id === swap.id) {
            const incomingMsg: SwapMessage = {
              id: raw.id,
              swapId: raw.swap_id,
              senderId: raw.sender_id,
              recipientId: raw.recipient_id,
              body: raw.body,
              readAt: raw.read_at ?? null,
              createdAt: raw.created_at,
            };

            setMessages((prev) => mergeAndDeduplicate(prev, [incomingMsg]));
          }
        }
      )
      .subscribe((status, err) => {
        if (!isMounted) return;
        if (status === 'SUBSCRIBED') {
          void fetchPersistedMessages();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`[Realtime Chat] Channel subscription status: ${status}`, err);
        }
      });

    return () => {
      isMounted = false;
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [swap.id, user]);

  // Auto-scroll to bottom on message list update
  useEffect(() => {
    if (messagesEndRef.current && mobileActiveTab === 'chat') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, mobileActiveTab]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = input.trim();
    if (!cleanText || sending || !user || !recipientId) return;

    setSending(true);
    setChatError(null);

    // Persist via DB RPC/RLS first
    const dbRes = await sendSwapMessage(swap.id, recipientId, cleanText);
    if (!dbRes.success || !dbRes.message) {
      setChatError(dbRes.error || 'Failed to send message.');
      setSending(false);
      return;
    }

    const newMessage: SwapMessage = dbRes.message;

    // Optimistically update local message state using the canonical DB message record
    setMessages((prev) => mergeAndDeduplicate(prev, [newMessage]));
    setInput('');

    if (channelRef.current) {
      try {
        await channelRef.current.send({
          type: 'broadcast',
          event: 'chat_message',
          payload: newMessage,
        });
      } catch (broadcastErr) {
        console.warn('[Realtime Chat] Broadcast failed, message persisted in DB:', broadcastErr);
      }
    }

    setSending(false);
  };

  const handleDownloadFile = async (storagePath: string, fileName: string, fileId: string, isSubmission: boolean = true) => {
    setDownloadingFileId(fileId);
    try {
      const signedUrl = isSubmission
        ? await getSubmissionFileSignedUrl(storagePath)
        : await getSwapAttachmentSignedUrl(storagePath);
      if (signedUrl) {
        await downloadFileFromSignedUrl(signedUrl, fileName);
      }
    } catch (err) {
      console.error('Workspace download error:', err);
    } finally {
      setDownloadingFileId(null);
    }
  };

  // Determine lifecycle step
  const isCompleted = swap.status === 'completed';
  const isSubmitted = swap.status === 'submitted' || isCompleted;
  const isAccepted = swap.status === 'accepted' || isSubmitted;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content chat-workspace-content" onClick={(e) => e.stopPropagation()}>
        {/* WORKSPACE HEADER */}
        <div className="chat-modal-header">
          <div className="chat-user-header-info">
            <img src={displayAvatar} alt={`Profile photo of ${displayName}`} className="chat-avatar swap-avatar-ring" />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <h3 className="chat-title" style={{ margin: 0 }}>
                  Swap Workspace with {displayName}
                </h3>
                {partnerProfile?.username && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    @{partnerProfile.username}
                  </span>
                )}
                <VerificationBadge isVerified={isPartnerVerified} size="sm" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.15rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: (partnerProfile?.reviewCount ?? 0) > 0 ? 600 : 400, color: (partnerProfile?.reviewCount ?? 0) > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
                  {partnerProfile?.reviewCount && partnerProfile.reviewCount > 0 && partnerProfile?.averageRating !== null && partnerProfile?.averageRating !== undefined
                    ? `★ ${partnerProfile.averageRating.toFixed(1)} (${partnerProfile.reviewCount} ${partnerProfile.reviewCount === 1 ? 'review' : 'reviews'})`
                    : 'No reviews yet'}
                </span>
                <span style={{ opacity: 0.4 }} aria-hidden="true">•</span>
                <span>
                  <strong>{partnerProfile?.completedSwapsCount ?? 0}</strong> {(partnerProfile?.completedSwapsCount ?? 0) === 1 ? 'completed swap' : 'completed swaps'}
                </span>
              </div>
              <p className="chat-subtitle" style={{ marginTop: '0.2rem' }}>{swap.topic}</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontWeight: 700, color: 'var(--color-warning)', fontSize: '0.9rem', background: 'var(--color-accent-muted)', padding: '0.25rem 0.65rem', borderRadius: '999px' }}>
              ⚡ {swap.creditAmount} SkillCredits
            </span>
            <span className={`as-status-badge as-status-badge--${swap.status}`}>
              ● {swap.status}
            </span>
            <button type="button" className="chat-close-btn" onClick={onClose} aria-label="Close workspace">
              ×
            </button>
          </div>
        </div>

        {/* MOBILE VIEWPORT TAB SWITCHER (<= 768px BREAKPOINT) */}
        <div className="chat-mobile-nav-tabs" role="tablist" aria-label="Workspace view modes">
          <button
            type="button"
            role="tab"
            id="tab-chat"
            aria-selected={mobileActiveTab === 'chat'}
            aria-controls="chat-workspace-main-panel"
            className={`chat-mobile-tab ${mobileActiveTab === 'chat' ? 'chat-mobile-tab--active' : ''}`}
            onClick={() => setMobileActiveTab('chat')}
          >
            💬 Chat Timeline
          </button>
          <button
            type="button"
            role="tab"
            id="tab-workspace"
            aria-selected={mobileActiveTab === 'workspace'}
            aria-controls="chat-workspace-sidebar-panel"
            className={`chat-mobile-tab ${mobileActiveTab === 'workspace' ? 'chat-mobile-tab--active' : ''}`}
            onClick={() => setMobileActiveTab('workspace')}
          >
            ⚡ Workspace Context
          </button>
        </div>

        {/* WORKSPACE GRID: CONVERSATION TIMELINE + CONSOLIDATED WORKSPACE SIDEBAR */}
        <div className="chat-workspace-grid">
          {/* MAIN / LEFT AREA: CHAT TIMELINE WITH EMBEDDED SYSTEM CARDS */}
          <div
            id="chat-workspace-main-panel"
            className={`chat-workspace-main ${mobileActiveTab === 'chat' ? 'chat-workspace-main--mobile-active' : ''}`}
            role="region"
            aria-label="Conversation timeline"
          >
            <div className="chat-messages-container">
              {/* SECTION L13: EMBEDDED TRANSACTION / STATUS CARD INSIDE CHAT */}
              <EmbeddedTransactionCard
                swap={swap}
                currentUserId={user?.id}
                onOpenSubmitWork={onOpenSubmitWork}
                onApproveSwap={onApproveSwap}
                isApproving={isApproving}
              />

              {/* SYSTEM CARD 1: ESCROW ALLOCATION INITIALIZATION */}
              <div className="chat-system-card chat-system-card--reserved">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
                  <span>⚡ Escrow Allocation Active</span>
                </div>
                <span>
                  {swap.creditAmount} SkillCredits are held safely in escrow ledger for this swap agreement.
                </span>
              </div>

              {/* STATUS CHANGE: ACCEPTED */}
              {isAccepted && (
                <StatusChangeEventCard
                  title="Swap Agreement Active"
                  description="Participant joined the swap. Escrow locked."
                  timestamp={swap.updatedAt}
                  iconType="accepted"
                />
              )}

              {/* MESSAGES & INTERLEAVED EVENTS */}
              {messages.length === 0 && !submission && !isCompleted ? (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', margin: '1.5rem 0' }}>
                  No messages yet. Use this space to discuss exchange terms and deliverables.
                </p>
              ) : (
                messages.map((msg) => {
                  const isUser = user && msg.senderId === user.id;
                  const timeFormatted = new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <div
                      key={msg.id}
                      className={`chat-message-bubble ${isUser ? 'chat-message--user' : 'chat-message--other'}`}
                    >
                      <p className="chat-message-text">{msg.body}</p>
                      <span className="chat-message-time">{timeFormatted}</span>
                    </div>
                  );
                })
              )}

              {/* SUBMISSION EVENT CARD (Spatially Contiguous in Chat Timeline) */}
              {submission && (
                <SubmissionEventCard
                  swap={swap}
                  submission={submission}
                  isRequester={isRequester}
                  onApproveSwap={onApproveSwap}
                  isApproving={isApproving}
                  onDownloadFile={(path, name, id) => handleDownloadFile(path, name, id, true)}
                  downloadingFileId={downloadingFileId}
                />
              )}

              {/* SETTLEMENT EVENT CARD (Spatially Contiguous in Chat Timeline) */}
              {isCompleted && (
                <SettlementEventCard
                  swap={swap}
                  timestamp={swap.completedAt || undefined}
                />
              )}

              <div ref={messagesEndRef} />
            </div>

            {chatError && (
              <div style={{ color: 'var(--color-error)', padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                {chatError}
              </div>
            )}

            <form onSubmit={handleSendMessage} className="chat-input-form">
              <input
                type="text"
                className="chat-input"
                placeholder="Type your message..."
                value={input}
                disabled={sending || !recipientId}
                onChange={(e) => setInput(e.target.value)}
              />
              <button type="submit" className="chat-send-btn" disabled={sending || !input.trim() || !recipientId}>
                {sending ? 'Sending...' : 'Send'}
              </button>
            </form>
          </div>

          {/* SECTION L15: CONSOLIDATED WORKSPACE SIDEBAR */}
          <aside
            id="chat-workspace-sidebar-panel"
            className={`chat-workspace-sidebar ${mobileActiveTab === 'workspace' ? 'chat-workspace-sidebar--mobile-active' : ''}`}
            role="region"
            aria-label="Swap Context Workspace"
          >
            {/* 1. PARTNER IDENTITY & ROLE CONTEXT CARD */}
            <section className="ws-section ws-partner-card" aria-label="Participant Identity Context">
              <div className="ws-partner-card-header">
                <img src={displayAvatar} alt={`Profile photo of ${displayName}`} className="chat-avatar swap-avatar-ring" />
                <div className="ws-partner-card-info">
                  <div className="ws-partner-name-row">
                    <h4 className="ws-partner-name">{displayName}</h4>
                    <VerificationBadge isVerified={isPartnerVerified} size="sm" />
                  </div>
                  {partnerProfile?.username && (
                    <span className="ws-partner-username">@{partnerProfile.username}</span>
                  )}
                  <div className="ws-partner-role-badge">
                    {isRequester ? 'Participant (Providing Skill)' : 'Requester (Offering Swap)'}
                  </div>
                </div>
              </div>
              <div className="ws-partner-metrics">
                <span className="ws-metric-rating">
                  {partnerProfile?.reviewCount && partnerProfile.reviewCount > 0 && partnerProfile?.averageRating !== null && partnerProfile?.averageRating !== undefined
                    ? `★ ${partnerProfile.averageRating.toFixed(1)} (${partnerProfile.reviewCount} ${partnerProfile.reviewCount === 1 ? 'review' : 'reviews'})`
                    : 'No reviews yet'}
                </span>
                <span className="ws-metric-divider" aria-hidden="true">•</span>
                <span className="ws-metric-swaps">
                  <strong>{partnerProfile?.completedSwapsCount ?? 0}</strong> {(partnerProfile?.completedSwapsCount ?? 0) === 1 ? 'completed swap' : 'completed swaps'}
                </span>
              </div>
            </section>

            {/* 2. EXCHANGE LIFECYCLE PROGRESS */}
            <section className="ws-section ws-lifecycle-card" aria-label="Exchange Lifecycle">
              <h4 className="ws-section-title">Exchange Lifecycle</h4>
              <TransactionProgress
                swapId={swap.id}
                status={swap.status}
                autoReleaseAt={swap.autoReleaseAt}
                submittedAt={swap.submittedAt}
                completedAt={swap.completedAt}
                creditAmount={swap.creditAmount}
              />
            </section>

            {/* 3. NEXT REQUIRED ACTION BANNER & DOMINANT CTA */}
            <section className="ws-section ws-next-action-card" aria-label="Next Required Action">
              <h4 className="ws-section-title">Next Required Action</h4>

              {isParticipant && swap.status === 'accepted' && (
                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(214, 166, 74, 0.12)', border: '1px solid rgba(214, 166, 74, 0.3)', color: 'var(--color-warning)' }}>
                  <div style={{ fontSize: '0.825rem', fontWeight: 700, marginBottom: '0.35rem' }}>⚡ Action Required</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-color)', marginBottom: '0.65rem' }}>
                    Complete the agreed work and upload deliverables for review.
                  </div>
                  {onOpenSubmitWork && (
                    <button
                      type="button"
                      className="as-btn as-btn--primary"
                      style={{ width: '100%', padding: '0.65rem', fontSize: '0.85rem' }}
                      onClick={onOpenSubmitWork}
                    >
                      Submit Deliverables
                    </button>
                  )}
                </div>
              )}

              {isRequester && swap.status === 'accepted' && (
                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', color: 'var(--color-structure)' }}>
                  <div style={{ fontSize: '0.825rem', fontWeight: 700, marginBottom: '0.2rem' }}>⏳ In Progress</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Waiting for partner to complete work and upload deliverables.
                  </div>
                </div>
              )}

              {isRequester && swap.status === 'submitted' && (
                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(214, 166, 74, 0.15)', border: '1px solid #d6a64a', color: 'var(--text-color)' }}>
                  <div style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--color-warning)', marginBottom: '0.35rem' }}>
                    ⚡ Action Required: Review Deliverables
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.65rem' }}>
                    Deliverables uploaded. Review the work and approve to release {swap.creditAmount} SkillCredits.
                  </div>
                  {onApproveSwap && (
                    <button
                      type="button"
                      className="as-btn as-btn--primary"
                      style={{ width: '100%', padding: '0.65rem', fontSize: '0.85rem' }}
                      disabled={isApproving}
                      onClick={onApproveSwap}
                    >
                      {isApproving ? 'Settling Escrow...' : `Approve & Release ${swap.creditAmount} Credits`}
                    </button>
                  )}
                </div>
              )}

              {isParticipant && swap.status === 'submitted' && (
                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', color: 'var(--color-structure)' }}>
                  <div style={{ fontSize: '0.825rem', fontWeight: 700, marginBottom: '0.2rem' }}>⏳ Deliverables Under Review</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Your work has been submitted. Waiting for requester to review and approve credits.
                  </div>
                </div>
              )}

              {swap.status === 'completed' && (
                <div
                  style={{
                    padding: '0.75rem',
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: 'var(--color-success)',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    textAlign: 'center',
                  }}
                >
                  ✓ Swap Complete &amp; Settled
                </div>
              )}

              {swap.status === 'open' && (
                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.2)', color: 'var(--color-structure)' }}>
                  <div style={{ fontSize: '0.825rem', fontWeight: 700, marginBottom: '0.2rem' }}>⚡ Open Swap Listing</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Negotiating terms for open swap proposal.
                  </div>
                </div>
              )}

              {['cancelled', 'declined', 'withdrawn', 'expired'].includes(swap.status) && (
                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: 'var(--color-error)' }}>
                  <div style={{ fontSize: '0.825rem', fontWeight: 700, marginBottom: '0.2rem' }}>⚠️ Swap Inactive</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    This swap agreement is no longer active ({swap.status}).
                  </div>
                </div>
              )}
            </section>

            {/* 4. EXCHANGE DETAILS */}
            <section className="ws-section ws-details-card" aria-label="Exchange Details">
              <div className="ws-details-header">
                <h4 className="ws-section-title">Exchange Details</h4>
                <span className="ws-credits-badge">⚡ {swap.creditAmount} SkillCredits</span>
              </div>
              <div className="ws-topic-text">{swap.topic}</div>

              {swap.tags && swap.tags.length > 0 && (
                <div className="ws-tags-list">
                  {swap.tags.map((t) => (
                    <span key={t} className="ws-tag-chip">
                      #{getTagLabel(t)}
                    </span>
                  ))}
                </div>
              )}

              <p className="ws-description-text">
                {swap.description && swap.description.length > 150 && !isDescriptionExpanded ? (
                  <>
                    {swap.description.slice(0, 150)}...
                    <button
                      type="button"
                      className="ws-toggle-btn"
                      onClick={() => setIsDescriptionExpanded(true)}
                    >
                      Show more
                    </button>
                  </>
                ) : (
                  <>
                    {swap.description}
                    {swap.description && swap.description.length > 150 && isDescriptionExpanded && (
                      <button
                        type="button"
                        className="ws-toggle-btn"
                        onClick={() => setIsDescriptionExpanded(false)}
                      >
                        Show less
                      </button>
                    )}
                  </>
                )}
              </p>
            </section>

            {/* 5. REQUIREMENTS & TERMS */}
            {swap.requirements && (
              <section className="ws-section ws-requirements-card" aria-label="Requirements and Terms">
                <h4 className="ws-section-title">Requirements &amp; Terms</h4>
                <p className="ws-requirements-text">
                  {swap.requirements.length > 150 && !isRequirementsExpanded ? (
                    <>
                      {swap.requirements.slice(0, 150)}...
                      <button
                        type="button"
                        className="ws-toggle-btn"
                        onClick={() => setIsRequirementsExpanded(true)}
                      >
                        Show more
                      </button>
                    </>
                  ) : (
                    <>
                      {swap.requirements}
                      {swap.requirements.length > 150 && isRequirementsExpanded && (
                        <button
                          type="button"
                          className="ws-toggle-btn"
                          onClick={() => setIsRequirementsExpanded(false)}
                        >
                          Show less
                        </button>
                      )}
                    </>
                  )}
                </p>
              </section>
            )}

            {/* 6. DELIVERABLES & SUBMISSION WORK STATE */}
            {submission && (
              <section className="ws-section ws-submission-card" aria-label="Submitted Deliverables">
                <h4 className="ws-section-title">Submitted Deliverables</h4>
                {submission.notes && (
                  <p className="ws-submission-notes">
                    &ldquo;{submission.notes}&rdquo;
                  </p>
                )}
                {submission.files && submission.files.length > 0 && (
                  <div className="ws-files-list">
                    {submission.files.map((file) => (
                      <div key={file.id} className="ws-file-item">
                        <span className="ws-file-name">📄 {file.fileName}</span>
                        <button
                          type="button"
                          className="as-btn as-btn--secondary ws-file-dl-btn"
                          disabled={downloadingFileId === file.id}
                          onClick={() => handleDownloadFile(file.storagePath, file.fileName, file.id, true)}
                        >
                          {downloadingFileId === file.id ? '...' : 'Download'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* 7. CREATOR RESOURCES */}
            {creatorAttachments.length > 0 && (
              <section className="ws-section ws-resources-card" aria-label="Creator Resources">
                <h4 className="ws-section-title">Creator Resources ({creatorAttachments.length})</h4>
                <div className="ws-files-list">
                  {creatorAttachments.map((att) => (
                    <div key={att.id} className="ws-file-item">
                      <span className="ws-file-name">📎 {att.fileName}</span>
                      <button
                        type="button"
                        className="as-btn as-btn--secondary ws-file-dl-btn"
                        disabled={downloadingFileId === att.id}
                        onClick={() => handleDownloadFile(att.storagePath, att.fileName, att.id, false)}
                      >
                        {downloadingFileId === att.id ? '...' : 'Download'}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
