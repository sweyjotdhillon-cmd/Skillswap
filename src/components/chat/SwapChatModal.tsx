import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import type { Swap, SwapMessage } from '../../types/swap';

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

  // Initial load from localStorage (No Postgres database fetch)
  useEffect(() => {
    const initial = loadLocalMessages(swap.id);
    setMessages(initial);
  }, [swap.id]);

  // Periodic expiration cleanup while modal is open (every 30 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      cleanupAndSetMessages();
    }, 30000);

    return () => clearInterval(interval);
  }, [cleanupAndSetMessages]);

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
      void supabase.removeChannel(channel);
    };
  }, [swap.id, cleanupAndSetMessages]);

  // Auto-scroll to bottom on message change
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

    const now = Date.now();
    const createdAtIso = new Date(now).toISOString();
    const expiresAtTimestamp = now + TWENTY_FOUR_HOURS_MS;

    const newMessage: ChatMessagePayload = {
      id: `msg_${crypto.randomUUID()}`,
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

    // Broadcast via Supabase Realtime Channel
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const channelName = `skillswap-chat:${swap.id}`;
      const channel = supabase.channel(channelName);
      await channel.send({
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
