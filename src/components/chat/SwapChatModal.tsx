import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import {
  getSwapMessages,
  getSwapById,
  sendSwapMessageWithAttachments,
  getSwapSubmission,
  getSwapAttachments,
  getSubmissionFileSignedUrl,
  getSwapAttachmentSignedUrl,
  getSwapMessageAttachmentSignedUrl,
  downloadFileFromSignedUrl,
  deleteChatAttachmentManual,
  validateChatAttachmentFile,
  type SwapAttachment,
} from '../../lib/supabase/credits';
import { mapSwapRecordToSwap, type Swap, type SwapMessage, type SwapSubmission } from '../../types/swap';
import { getTagLabel } from '../../constants/tags';
import { getFileExpiryStatus } from '../../lib/fileExpiry';
import { TransactionProgress } from '../transaction/TransactionProgress';
import { PendingTransactionVault } from '../transaction/PendingTransactionVault';
import { VerificationBadge } from '../ui/VerificationBadge';
import { FileExpiryIndicator } from '../ui/FileExpiryIndicator';
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
  swap: initialSwap,
  partnerName,
  partnerAvatar,
  onClose,
  onOpenSubmitWork,
  onApproveSwap,
  isApproving = false,
}: SwapChatModalProps) {
  const { user } = useAuth();
  const [currentSwap, setCurrentSwap] = useState<Swap>(initialSwap);
  const [messages, setMessages] = useState<SwapMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [sending, setSending] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Keep currentSwap synchronized if initialSwap changes
  useEffect(() => {
    setCurrentSwap(initialSwap);
  }, [initialSwap]);

  // Fetch fresh database-backed swap object upon mount or when initialSwap.id changes
  useEffect(() => {
    let active = true;
    const fetchFreshSwap = async () => {
      const { data } = await getSwapById(initialSwap.id);
      if (active && data) {
        setCurrentSwap(mapSwapRecordToSwap(data));
      }
    };
    void fetchFreshSwap();
    return () => {
      active = false;
    };
  }, [initialSwap.id]);

  const swap = currentSwap;

  // Mobile active view tab state (for responsive breakpoints <= 768px)
  const [mobileActiveTab, setMobileActiveTab] = useState<'chat' | 'workspace'>('chat');

  // Progressive disclosure state for text fields
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState<boolean>(false);
  const [isRequirementsExpanded, setIsRequirementsExpanded] = useState<boolean>(false);

  // Workspace state: submission & creator attachments
  const [submission, setSubmission] = useState<SwapSubmission | null>(null);
  const [creatorAttachments, setCreatorAttachments] = useState<SwapAttachment[]>([]);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabaseBrowserClient>>['channel']> | null>(null);

  // Explicit source of truth for user role and recipient derivation
  const currentUserId = user?.id || null;
  const isRequester = Boolean(currentUserId && currentUserId === swap.requesterId);
  const isParticipant = Boolean(currentUserId && swap.participantId && currentUserId === swap.participantId);
  const isOpenSwapApplicant = Boolean(currentUserId && swap.status === 'open' && !isRequester);

  // Authorize chatting strictly for valid swap roles
  const canChat = isRequester
    ? Boolean(swap.participantId) || swap.status === 'open'
    : (isParticipant || isOpenSwapApplicant);

  let recipientId: string | null = null;
  if (isRequester) {
    recipientId = swap.participantId;
    // Fallback for open swaps: if participantId is not yet assigned, derive applicant recipient from messages
    if (!recipientId && swap.status === 'open' && messages.length > 0) {
      const applicantMsg = messages.find((m) => m.senderId !== currentUserId);
      if (applicantMsg) {
        recipientId = applicantMsg.senderId;
      }
    }
  } else if (isParticipant) {
    recipientId = swap.requesterId;
  } else if (isOpenSwapApplicant) {
    recipientId = swap.requesterId;
  } else {
    recipientId = null;
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

  // Modal Escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Client-side expiry timer: re-evaluates message/attachment expiry every 10 seconds to update local UI state
  const [, setExpiryTick] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setExpiryTick(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Primary effect: Manage Realtime postgres_changes + Broadcast subscription & database initial fetch / reconnect catch-up
  useEffect(() => {
    setChatError(null);

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !swap.id) return;

    let isMounted = true;

    const initChat = async () => {
      // Direct session check from client to prevent stale React state issues
      const { data: { user: authedUser }, error: sessionErr } = await supabase.auth.getUser();
      if (!isMounted) return;

      if (sessionErr || !authedUser) {
        setChatError('Your session has expired. Please sign in again.');
        return;
      }

      if (!canChat || !recipientId) {
        if (['cancelled', 'declined', 'withdrawn', 'expired'].includes(swap.status)) {
          setChatError('This chat is no longer available because the swap has closed.');
        } else if (!isRequester && !isParticipant && !isOpenSwapApplicant) {
          setChatError('You are not a participant in this swap.');
        } else if (isRequester && swap.status !== 'open' && !swap.participantId) {
          setChatError('This swap does not have an active participant.');
        }
      }

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
      await fetchPersistedMessages();

      // 2. Setup Realtime subscription ONLY if user is an active swap member (requester or participant)
      const isMember = isRequester || isParticipant;
      if (!isMember) {
        return;
      }

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
              expires_at?: string;
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
                expiresAt: raw.expires_at,
                attachments: [],
              };

              setMessages((prev) => mergeAndDeduplicate(prev, [incomingMsg]));
              void fetchPersistedMessages();
            }
          }
        )
        .subscribe((status, err) => {
          if (!isMounted) return;
          if (status === 'SUBSCRIBED') {
            setChatError((prev) => (prev === 'Connection lost. Reconnecting…' ? null : prev));
            void fetchPersistedMessages();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error(`[Realtime Chat] Channel subscription status: ${status}`, err);
            setChatError('Connection lost. Reconnecting…');
          }
        });
    };

    void initChat();

    return () => {
      isMounted = false;
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [swap.id, swap.status, swap.participantId, user, canChat, recipientId, isRequester, isParticipant, isOpenSwapApplicant]);

  // Auto-scroll to bottom on message list update
  useEffect(() => {
    if (messagesEndRef.current && mobileActiveTab === 'chat') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, mobileActiveTab]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const newFiles = Array.from(e.target.files);

    const validFiles: File[] = [];
    for (const f of newFiles) {
      const validation = validateChatAttachmentFile(f);
      if (!validation.valid) {
        setChatError(validation.error || 'Attachment upload failed. Please try again.');
        return;
      }
      validFiles.push(f);
    }

    if (selectedFiles.length + validFiles.length > 5) {
      setChatError('Maximum 5 files allowed per message.');
      return;
    }

    setChatError(null);
    setSelectedFiles((prev) => [...prev, ...validFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = input.trim();
    if ((!cleanText && selectedFiles.length === 0) || sending) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setChatError('Supabase client is unavailable.');
      return;
    }

    const { data: { user: currentUser }, error: sessionErr } = await supabase.auth.getUser();
    if (sessionErr || !currentUser) {
      setChatError('Your session has expired. Please sign in again.');
      return;
    }

    if (!canChat || !recipientId) {
      if (['cancelled', 'declined', 'withdrawn', 'expired'].includes(swap.status)) {
        setChatError('This chat is no longer available because the swap has closed.');
      } else if (!isRequester && !isParticipant && !isOpenSwapApplicant) {
        setChatError('You are not a participant in this swap.');
      } else {
        setChatError("We couldn't send your message. Please try again.");
      }
      return;
    }

    setSending(true);
    setChatError(null);

    // Persist via DB RPC/RLS first with optional attachments
    const dbRes = await sendSwapMessageWithAttachments(swap.id, recipientId, cleanText, selectedFiles);
    if (!dbRes.success || !dbRes.message) {
      setChatError(dbRes.error || 'Failed to send message.');
      setSending(false);
      return;
    }

    const newMessage: SwapMessage = dbRes.message;

    // Optimistically update local message state using the canonical DB message record
    setMessages((prev) => mergeAndDeduplicate(prev, [newMessage]));
    setInput('');
    setSelectedFiles([]);

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

  const handleDownloadFile = async (
    storagePath: string,
    fileName: string,
    fileId: string,
    isSubmission: boolean = true,
    expiresAt?: string | null,
    deleteStatus?: string | null
  ) => {
    const status = getFileExpiryStatus(expiresAt, deleteStatus);
    if (status.isExpired) {
      setChatError(`"${fileName}" is no longer available.`);
      return;
    }

    setDownloadingFileId(fileId);
    try {
      const signedUrl = isSubmission
        ? await getSubmissionFileSignedUrl(storagePath)
        : await getSwapAttachmentSignedUrl(storagePath);

      if (!signedUrl) {
        setChatError(`"${fileName}" is no longer available.`);
        return;
      }

      const res = await downloadFileFromSignedUrl(signedUrl, fileName);
      if (!res.success) {
        setChatError(`"${fileName}" is no longer available.`);
      }
    } catch (err) {
      console.error('Workspace download error:', err);
      setChatError(`"${fileName}" is no longer available.`);
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handleDownloadChatAttachment = async (
    storagePath: string,
    fileName: string,
    fileId: string,
    expiresAt?: string | null,
    deleteStatus?: string | null
  ) => {
    const status = getFileExpiryStatus(expiresAt, deleteStatus);
    if (status.isExpired) {
      setChatError(`"${fileName}" is no longer available.`);
      return;
    }

    setDownloadingFileId(fileId);
    try {
      const signedUrl = await getSwapMessageAttachmentSignedUrl(storagePath);
      if (!signedUrl) {
        setChatError(`"${fileName}" is no longer available.`);
        return;
      }

      const res = await downloadFileFromSignedUrl(signedUrl, fileName);
      if (!res.success) {
        setChatError(`"${fileName}" is no longer available.`);
      }
    } catch (err) {
      console.error('Chat attachment download error:', err);
      setChatError(`"${fileName}" is no longer available.`);
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handleDeleteChatAttachment = async (attachmentId: string) => {
    try {
      const res = await deleteChatAttachmentManual(attachmentId);
      if (res.success) {
        // Refresh messages to reflect pending_deletion tombstone
        const msgsRes = await getSwapMessages(swap.id);
        if (msgsRes.data) {
          setMessages(msgsRes.data);
        }
      } else {
        setChatError(res.error || 'Failed to delete attachment.');
      }
    } catch (err) {
      console.error('Manual chat attachment deletion error:', err);
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
            <div style={{ minWidth: 0, flex: 1 }}>
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

          <div className="chat-modal-header-actions">
            <span className="chat-credits-badge">
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

              {/* SECTION L17: PENDING TRANSACTION VAULT SYSTEM CARD */}
              <PendingTransactionVault
                creditAmount={swap.creditAmount}
                status={swap.status}
              />

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
              {(() => {
                const nowMs = Date.now();
                const activeMessages = messages.filter((m) => {
                  if (!m.expiresAt) return true;
                  return new Date(m.expiresAt).getTime() > nowMs;
                });

                if (activeMessages.length === 0 && !submission && !isCompleted) {
                  return (
                    <p style={{ textAlign: 'center', color: 'var(--text-secondary)', margin: '1.5rem 0' }}>
                      No messages yet. Use this space to discuss exchange terms and deliverables.
                    </p>
                  );
                }

                return activeMessages.map((msg) => {
                  const isUser = user && msg.senderId === user.id;
                  const timeFormatted = new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  // Suppress redundant placeholder text when message has structured attachments
                  const hasAttachments = Boolean(msg.attachments && msg.attachments.length > 0);
                  const showMessageText = Boolean(msg.body && msg.body.trim() !== '[File Attachment]');

                  return (
                    <div
                      key={msg.id}
                      className={`chat-message-bubble ${isUser ? 'chat-message--user' : 'chat-message--other'}`}
                    >
                      {showMessageText && <p className="chat-message-text">{msg.body}</p>}

                      {/* CHAT ATTACHMENTS DISPLAY */}
                      {hasAttachments && (
                        <div className="chat-message-attachments">
                          {msg.attachments!.map((att) => {
                            const expiryStatus = getFileExpiryStatus(att.deleteAfter ?? att.expiresAt, att.deletedAt ?? att.deleteStatus);
                            const isExpired = expiryStatus.isExpired;
                            const isOwner = user && att.uploadedBy === user.id;
                            const sizeKb = att.fileSize ? Math.round(att.fileSize / 1024) : 0;

                            return (
                              <div key={att.id} className="chat-attachment-item">
                                <div className="chat-attachment-info">
                                  <span className="chat-attachment-filename-row">
                                    <span className="chat-attachment-icon" aria-hidden="true">📎</span>
                                    <strong className="chat-attachment-name">{att.fileName}</strong>
                                    {sizeKb > 0 && <span className="chat-attachment-size">({sizeKb} KB)</span>}
                                  </span>
                                  <FileExpiryIndicator
                                    lifecycle={att}
                                    inline
                                  />
                                </div>
                                <div className="chat-attachment-actions">
                                  {isExpired ? (
                                    <button
                                      type="button"
                                      disabled
                                      className="chat-attachment-btn chat-attachment-btn--unavailable"
                                    >
                                      Unavailable
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        className="chat-attachment-btn chat-attachment-btn--download"
                                        disabled={downloadingFileId === att.id}
                                        onClick={() => handleDownloadChatAttachment(att.storagePath, att.fileName, att.id, att.deleteAfter ?? att.expiresAt, att.deletedAt ?? att.deleteStatus)}
                                      >
                                        {downloadingFileId === att.id ? '...' : 'Download'}
                                      </button>
                                      {isOwner && (
                                        <button
                                          type="button"
                                          className="chat-attachment-btn chat-attachment-btn--delete"
                                          title="Delete attachment (6-hour window)"
                                          aria-label={`Delete ${att.fileName}`}
                                          onClick={() => handleDeleteChatAttachment(att.id)}
                                        >
                                          🗑️
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <span className="chat-message-time">{timeFormatted}</span>
                    </div>
                  );
                });
              })()}

              {/* SUBMISSION EVENT CARD (Spatially Contiguous in Chat Timeline) */}
              {submission && (
                <SubmissionEventCard
                  swap={swap}
                  submission={submission}
                  isRequester={isRequester}
                  onApproveSwap={onApproveSwap}
                  isApproving={isApproving}
                  onDownloadFile={(path, name, id, expiresAt, deleteStatus) => handleDownloadFile(path, name, id, true, expiresAt, deleteStatus)}
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
              <div className="chat-error" role="alert" aria-live="assertive">
                {chatError}
              </div>
            )}

            {/* SELECTED FILES PREVIEW CHIPS */}
            {selectedFiles.length > 0 && (
              <div style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', background: 'var(--color-surface-muted, rgba(0,0,0,0.1))', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
                {selectedFiles.map((file, idx) => (
                  <span
                    key={`${file.name}-${idx}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: 'var(--color-surface, #1e293b)',
                      border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      minWidth: 0,
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'min(200px, 50vw)' }}>
                      📎 {file.name}
                    </span>
                    <span style={{ flexShrink: 0, opacity: 0.8 }}>({Math.round(file.size / 1024)} KB)</span>
                    <button
                      type="button"
                      aria-label={`Remove file ${file.name}`}
                      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, marginLeft: '0.2rem', flexShrink: 0, fontSize: '0.9rem', lineHeight: 1 }}
                      onClick={() => handleRemoveFile(idx)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <form onSubmit={handleSendMessage} className="chat-input-form">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileSelect}
                multiple
                accept="image/*,application/pdf,application/zip,text/*,video/*"
              />
              <button
                type="button"
                className="chat-attach-btn"
                title="Attach file (max 25MB, 6h retention)"
                disabled={sending || !recipientId}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.1rem',
                  cursor: 'pointer',
                  padding: '0.4rem',
                  opacity: sending ? 0.5 : 1,
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                📎
              </button>
              <input
                type="text"
                className="chat-input"
                placeholder="Type your message..."
                value={input}
                disabled={sending || !recipientId}
                onChange={(e) => setInput(e.target.value)}
              />
              <button type="submit" className="chat-send-btn" disabled={sending || (!input.trim() && selectedFiles.length === 0) || !recipientId}>
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
                    {submission.files.map((file) => {
                      const isFileExpired = getFileExpiryStatus(
                        file.expiresAt ?? file.storageExpiresAt,
                        file.deletedAt ?? file.storageDeletedAt ?? file.deleteStatus ?? file.storageDeleteStatus
                      ).isExpired;

                      return (
                        <div key={file.id} className="ws-file-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.35rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <span className="ws-file-name">📄 {file.fileName}</span>
                            <button
                              type="button"
                              className="as-btn as-btn--secondary ws-file-dl-btn"
                              disabled={downloadingFileId === file.id || isFileExpired}
                              onClick={() => handleDownloadFile(file.storagePath, file.fileName, file.id, true, file.expiresAt ?? file.storageExpiresAt, file.deletedAt ?? file.storageDeletedAt ?? file.deleteStatus ?? file.storageDeleteStatus)}
                            >
                              {isFileExpired ? 'Unavailable' : downloadingFileId === file.id ? '...' : 'Download'}
                            </button>
                          </div>
                          <FileExpiryIndicator
                            lifecycle={file}
                            inline
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* 7. CREATOR RESOURCES */}
            {creatorAttachments.length > 0 && (
              <section className="ws-section ws-resources-card" aria-label="Creator Resources">
                <h4 className="ws-section-title">Creator Resources ({creatorAttachments.length})</h4>
                <div className="ws-files-list">
                  {creatorAttachments.map((att) => {
                    const isAttExpired = getFileExpiryStatus(
                      att.expiresAt ?? att.storageExpiresAt,
                      att.deletedAt ?? att.storageDeletedAt ?? att.deleteStatus ?? att.storageDeleteStatus
                    ).isExpired;

                    return (
                      <div key={att.id} className="ws-file-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.35rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span className="ws-file-name">📎 {att.fileName}</span>
                          <button
                            type="button"
                            className="as-btn as-btn--secondary ws-file-dl-btn"
                            disabled={downloadingFileId === att.id || isAttExpired}
                            onClick={() => handleDownloadFile(att.storagePath, att.fileName, att.id, false, att.expiresAt ?? att.storageExpiresAt, att.deletedAt ?? att.storageDeletedAt ?? att.deleteStatus ?? att.storageDeleteStatus)}
                          >
                            {isAttExpired ? 'Unavailable' : downloadingFileId === att.id ? '...' : 'Download'}
                          </button>
                        </div>
                        <FileExpiryIndicator
                          lifecycle={att}
                          inline
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
