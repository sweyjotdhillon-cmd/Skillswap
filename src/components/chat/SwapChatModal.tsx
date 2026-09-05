import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import {
  getChatPermissionStatus,
  requestChatAccess,
  sendSwapMessage,
  type ChatPermissionStatusResult,
} from '../../lib/supabase/credits';
import type { Swap, SwapMessage } from '../../types/swap';
import { generateUUID } from '../../lib/uuid';

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface ChatMessagePayload extends SwapMessage {
  expiresAt: number;
}

export interface SwapChatModalProps {
  swap: Swap;
  partnerName?: string;
  partnerAvatar?: string;
  onClose: () => void;
}

/** Helper to get storage key for a swap */
function getStorageKey(swapId: string): string {
  return `skillswap_chat_${swapId}`;
}

/** Helper to read unexpired chat messages from localStorage */
function loadLocalMessages(swapId: string): ChatMessagePayload[] {
  try {
    const raw = localStorage.getItem(getStorageKey(swapId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessagePayload[];
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    const valid = parsed.filter((m) => typeof m.expiresAt === 'number' && m.expiresAt > now);

    // Save back if any expired messages were dropped
    if (valid.length !== parsed.length) {
      localStorage.setItem(getStorageKey(swapId), JSON.stringify(valid));
    }

    return valid;
  } catch (err) {
    console.error('Error reading local chat messages:', err);
    return [];
  }
}

/** Helper to save messages to localStorage */
function saveLocalMessages(swapId: string, messages: ChatMessagePayload[]): void {
  try {
    const now = Date.now();
    const valid = messages.filter((m) => typeof m.expiresAt === 'number' && m.expiresAt > now);
    localStorage.setItem(getStorageKey(swapId), JSON.stringify(valid));
  } catch (err) {
    console.error('Error saving local chat messages:', err);
  }
}

export function SwapChatModal({
  swap,
  partnerName,
  partnerAvatar,
  onClose,
}: SwapChatModalProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessagePayload[]>([]);
  const [input, setInput] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [permStatus, setPermStatus] = useState<ChatPermissionStatusResult | null>(null);
  const [permLoading, setPermLoading] = useState<boolean>(true);
  const [requestingPerm, setRequestingPerm] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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

  // Cleanup expired messages and update state
  const cleanupAndSetMessages = useCallback((updater?: (prev: ChatMessagePayload[]) => ChatMessagePayload[]) => {
    setMessages((prev) => {
      const next = updater ? updater(prev) : prev;
      const now = Date.now();
      const valid = next.filter((m) => typeof m.expiresAt === 'number' && m.expiresAt > now);
      saveLocalMessages(swap.id, valid);
      return valid;
    });
  }, [swap.id]);

  // Load chat permission status and local messages
  useEffect(() => {
    let active = true;
    setPermLoading(true);
    setChatError(null);

    async function loadPermission() {
      const res = await getChatPermissionStatus(swap.id);
      if (active) {
        setPermStatus(res);
        setPermLoading(false);
      }
    }

    void loadPermission();
    const initial = loadLocalMessages(swap.id);
    setMessages(initial);

    return () => {
      active = false;
    };
  }, [swap.id]);

  // Periodic expiration cleanup while modal is open (every 30 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      cleanupAndSetMessages();
    }, 30000);

    return () => clearInterval(interval);
  }, [cleanupAndSetMessages]);

  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabaseBrowserClient>>['channel']> | null>(null);

  // Supabase Realtime Broadcast Subscription
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channelName = `skillswap-chat:${swap.id}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: true }, // allow client to receive own broadcasts cleanly
      },
    });

    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'chat_message' }, (payload) => {
        const msg = payload.payload as ChatMessagePayload;
        if (!msg || msg.swapId !== swap.id) return;

        // Verify message relevance to user or swap partner
        if (msg.expiresAt <= Date.now()) return;

        cleanupAndSetMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      })
      .subscribe();

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [swap.id, cleanupAndSetMessages]);

  // Auto-scroll to bottom on message change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleRequestAccess = async () => {
    setRequestingPerm(true);
    setChatError(null);
    const res = await requestChatAccess(swap.id);
    setRequestingPerm(false);
    if (!res.success) {
      setChatError(res.error || 'Failed to request chat access.');
      return;
    }
    const updated = await getChatPermissionStatus(swap.id);
    setPermStatus(updated);
  };

  const isAuthorizedToChat =
    permStatus?.status === 'allowed' || permStatus?.status === 'accepted';

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = input.trim();
    if (!cleanText || sending || !user || !recipientId) return;

    if (!isAuthorizedToChat) {
      setChatError('You are not authorized to send messages for this swap.');
      return;
    }

    setSending(true);
    setChatError(null);

    // Persist via DB RPC/RLS
    const dbRes = await sendSwapMessage(swap.id, recipientId, cleanText);
    if (!dbRes.success) {
      setChatError(dbRes.error || 'Failed to send message.');
      setSending(false);
      return;
    }

    const now = Date.now();
    const createdAtIso = new Date(now).toISOString();
    const expiresAtTimestamp = now + TWENTY_FOUR_HOURS_MS;

    const newMessage: ChatMessagePayload = {
      id: dbRes.message?.id || `msg_${generateUUID()}`,
      swapId: swap.id,
      senderId: user.id,
      recipientId: recipientId,
      body: cleanText,
      createdAt: createdAtIso,
      expiresAt: expiresAtTimestamp,
    };

    // Store locally and update UI state immediately
    cleanupAndSetMessages((prev) => {
      if (prev.some((m) => m.id === newMessage.id)) return prev;
      return [...prev, newMessage];
    });

    setInput('');

    // Broadcast via Supabase Realtime Channel using the existing subscribed channel
    if (channelRef.current) {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'chat_message',
        payload: newMessage,
      });
    }

    setSending(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content chat-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="chat-modal-header">
          <div className="chat-user-header-info">
            <img src={displayAvatar} alt={displayName} className="chat-avatar" />
            <div>
              <h3 className="chat-title">Chat with {displayName}</h3>
              <p className="chat-subtitle">{swap.topic}</p>
            </div>
          </div>
          <button type="button" className="chat-close-btn" onClick={onClose} aria-label="Close chat">
            ×
          </button>
        </div>

        <div
          className="chat-messages-container"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            overflowY: 'auto',
            maxHeight: '400px',
            padding: '1rem',
          }}
        >
          {messages.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
              No active messages. Send a message to start conversing! (Messages auto-expire after 24 hours)
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
          <div ref={messagesEndRef} />
        </div>

        {chatError && (
          <div style={{ color: 'var(--error-color, #ef4444)', padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
            {chatError}
          </div>
        )}

        {permLoading ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Checking chat permissions...
          </div>
        ) : !isAuthorizedToChat ? (
          <div style={{ padding: '1rem', textAlign: 'center', background: 'var(--bg-secondary, #f8fafc)', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
            {permStatus?.status === 'required' && (
              <div>
                <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600, color: 'var(--text-primary)' }}>Chat permission required</p>
                <button
                  type="button"
                  className="as-btn as-btn--primary"
                  disabled={requestingPerm}
                  onClick={handleRequestAccess}
                >
                  {requestingPerm ? 'Submitting request...' : 'Request Chat Access'}
                </button>
              </div>
            )}
            {permStatus?.status === 'pending' && (
              <div>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>Chat access requested</p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Waiting for the requester to approve your request.
                </p>
              </div>
            )}
            {permStatus?.status === 'declined' && (
              <div>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--error-color, #ef4444)' }}>Chat access declined</p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  The swap requester declined chat access for this swap.
                </p>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="chat-input-form">
            <input
              type="text"
              className="chat-input"
              placeholder="Write a message..."
              value={input}
              disabled={sending || !recipientId}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" className="chat-send-btn" disabled={sending || !input.trim() || !recipientId}>
              {sending ? 'Sending...' : 'Send'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
