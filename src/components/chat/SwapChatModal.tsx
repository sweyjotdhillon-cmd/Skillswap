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

  // Fallback names & avatar
  const displayName =
    partnerName ||
    (isRequester
      ? swap.participantProfile?.fullName || (swap.participantProfile?.username ? `@${swap.participantProfile.username}` : 'Participant')
      : swap.requesterProfile?.fullName || (swap.requesterProfile?.username ? `@${swap.requesterProfile.username}` : 'Creator'));

  const displayAvatar =
    partnerAvatar ||
    (isRequester
      ? swap.participantProfile?.avatarUrl
      : swap.requesterProfile?.avatarUrl) ||
    DEFAULT_AVATAR;

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
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

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
            <img src={displayAvatar} alt={displayName} className="chat-avatar" />
            <div>
              <h3 className="chat-title">
                Swap Workspace with {displayName}
              </h3>
              <p className="chat-subtitle">{swap.topic}</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontWeight: 700, color: '#d97706', fontSize: '0.9rem', background: 'rgba(214, 166, 74, 0.12)', padding: '0.25rem 0.65rem', borderRadius: '999px' }}>
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

        {/* WORKSPACE GRID: CONVERSATION TIMELINE + SIDEBAR */}
        <div className="chat-workspace-grid">
          {/* MAIN / LEFT AREA: CHAT TIMELINE WITH EMBEDDED SYSTEM CARDS */}
          <div className="chat-workspace-main">
            <div className="chat-messages-container">
              {/* SYSTEM CARD 1: ESCROW ALLOCATION */}
              <div className="chat-system-card chat-system-card--reserved">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
                  <span>⚡ Escrow Allocation Active</span>
                </div>
                <span>
                  {swap.creditAmount} SkillCredits are held safely in escrow ledger for this swap agreement.
                </span>
              </div>

              {/* MESSAGES LIST */}
              {messages.length === 0 ? (
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

              {/* SYSTEM CARD 2: WORK SUBMISSION EVENT */}
              {submission && (
                <div className="chat-system-card chat-system-card--submission">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', fontWeight: 700 }}>
                    <span>📎 Work Submitted for Review</span>
                    <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                      {new Date(submission.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {submission.notes && <p style={{ margin: '0.2rem 0 0', fontStyle: 'italic' }}>“{submission.notes}”</p>}

                  {submission.files && submission.files.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.35rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Attached Deliverables:</span>
                      {submission.files.map((f) => (
                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.15)', padding: '0.3rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, paddingRight: '0.5rem' }}>
                            {f.fileName}
                          </span>
                          <button
                            type="button"
                            className="as-btn as-btn--secondary"
                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.7rem' }}
                            disabled={downloadingFileId === f.id}
                            onClick={() => handleDownloadFile(f.storagePath, f.fileName, f.id, true)}
                          >
                            {downloadingFileId === f.id ? '...' : 'Download'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ACTION CTA INSIDE TIMELINE FOR REQUESTER */}
                  {isRequester && swap.status === 'submitted' && onApproveSwap && (
                    <button
                      type="button"
                      className="as-btn as-btn--primary"
                      style={{ marginTop: '0.5rem', width: '100%', fontSize: '0.85rem' }}
                      disabled={isApproving}
                      onClick={onApproveSwap}
                    >
                      {isApproving ? 'Settling...' : 'Approve Work & Transfer Credits'}
                    </button>
                  )}
                </div>
              )}

              {/* SYSTEM CARD 3: SWAP COMPLETED SETTLEMENT */}
              {isCompleted && (
                <div className="chat-system-card chat-system-card--completed">
                  <div style={{ fontWeight: 700 }}>✓ Swap Completed &amp; Settled</div>
                  <span>
                    Work approved! {swap.creditAmount} SkillCredits transferred to the participant.
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {chatError && (
              <div style={{ color: 'var(--error-color, #ef4444)', padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
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

          {/* SIDEBAR / SECONDARY AREA: REQUIREMENTS, PROGRESS BAR & PRIMARY ACTION */}
          <div className="chat-workspace-sidebar">
            {/* LIFECYCLE PROGRESS BAR */}
            <div>
              <span style={{ fontSize: '0.785rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Exchange Lifecycle
              </span>
              <div className="ws-lifecycle-stepper">
                <div className={`ws-lifecycle-step ${swap.status === 'open' ? 'ws-lifecycle-step--active' : 'ws-lifecycle-step--completed'}`}>
                  <span className="ws-lifecycle-dot">{swap.status === 'open' ? '1' : '✓'}</span>
                  <span className="ws-lifecycle-label">Open</span>
                </div>

                <div className={`ws-lifecycle-step ${swap.status === 'accepted' ? 'ws-lifecycle-step--active' : isAccepted ? 'ws-lifecycle-step--completed' : ''}`}>
                  <span className="ws-lifecycle-dot">{isAccepted && swap.status !== 'accepted' ? '✓' : '2'}</span>
                  <span className="ws-lifecycle-label">Accepted</span>
                </div>

                <div className={`ws-lifecycle-step ${swap.status === 'submitted' ? 'ws-lifecycle-step--active' : isSubmitted ? 'ws-lifecycle-step--completed' : ''}`}>
                  <span className="ws-lifecycle-dot">{isSubmitted && swap.status !== 'submitted' ? '✓' : '3'}</span>
                  <span className="ws-lifecycle-label">Submitted</span>
                </div>

                <div className={`ws-lifecycle-step ${swap.status === 'completed' ? 'ws-lifecycle-step--active ws-lifecycle-step--completed' : ''}`}>
                  <span className="ws-lifecycle-dot">4</span>
                  <span className="ws-lifecycle-label">Completed</span>
                </div>
              </div>
            </div>

            {/* DOMINANT SINGLE PRIMARY ACTION CTA */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {isParticipant && swap.status === 'accepted' && onOpenSubmitWork && (
                <button
                  type="button"
                  className="as-btn as-btn--primary"
                  style={{ width: '100%', padding: '0.85rem' }}
                  onClick={onOpenSubmitWork}
                >
                  Submit Deliverables
                </button>
              )}

              {isRequester && swap.status === 'submitted' && onApproveSwap && (
                <button
                  type="button"
                  className="as-btn as-btn--primary"
                  style={{ width: '100%', padding: '0.85rem' }}
                  disabled={isApproving}
                  onClick={onApproveSwap}
                >
                  {isApproving ? 'Settling...' : 'Approve Work & Transfer Credits'}
                </button>
              )}

              {swap.status === 'completed' && (
                <div
                  style={{
                    padding: '0.75rem',
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    color: '#10b981',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    textAlign: 'center',
                  }}
                >
                  ✓ Swap Complete &amp; Settled
                </div>
              )}
            </div>

            {/* REQUIREMENTS & GUIDELINES */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-color)' }}>
                Requirements &amp; Terms
              </span>
              <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                {swap.requirements || swap.description}
              </p>
            </div>

            {/* CREATOR ATTACHMENTS (if present) */}
            {creatorAttachments.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-color)' }}>
                  Creator Resources ({creatorAttachments.length})
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {creatorAttachments.map((att) => (
                    <div
                      key={att.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.4rem 0.65rem',
                        borderRadius: '8px',
                        background: 'rgba(17, 22, 28, 0.04)',
                        fontSize: '0.8rem',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, paddingRight: '0.5rem' }}>
                        📎 {att.fileName}
                      </span>
                      <button
                        type="button"
                        className="as-btn as-btn--secondary"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.725rem' }}
                        disabled={downloadingFileId === att.id}
                        onClick={() => handleDownloadFile(att.storagePath, att.fileName, att.id, false)}
                      >
                        {downloadingFileId === att.id ? '...' : 'Download'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
