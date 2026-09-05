import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import {
  getSwapMessages,
  sendSwapMessage,
} from '../../lib/supabase/credits';
import type { Swap, SwapMessage } from '../../types/swap';

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';

export interface SwapChatModalProps {
  swap: Swap;
  partnerName?: string;
  partnerAvatar?: string;
  onClose: () => void;
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
}: SwapChatModalProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<SwapMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);

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
      // Low-latency broadcast listener
      .on('broadcast', { event: 'chat_message' }, (payload) => {
        if (!isMounted) return;
        const msg = payload.payload as SwapMessage;
        if (!msg || !msg.id || msg.swapId !== swap.id) return;

        setMessages((prev) => mergeAndDeduplicate(prev, [msg]));
      })
      // Canonical database INSERT listener via postgres_changes
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
          // Catch-up / race condition prevention: refetch persisted DB messages when channel confirms active status
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

    // Broadcast via Supabase Realtime Channel using active subscribed channel for instant delivery
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
              No messages yet. Send a message to start conversing!
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
      </div>
    </div>
  );
}
