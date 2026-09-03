import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import { getSwapMessages, sendSwapMessage } from '../../lib/supabase/credits';
import type { Swap, SwapMessage } from '../../types/swap';

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';

export interface SwapChatModalProps {
  swap: Swap;
  partnerName?: string;
  partnerAvatar?: string;
  onClose: () => void;
}

export function SwapChatModal({
  swap,
  partnerName,
  partnerAvatar,
  onClose,
}: SwapChatModalProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<SwapMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
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
    // Open swap chat where current user is applicant/visitor
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

  // Initial load of messages
  useEffect(() => {
    let active = true;
    async function loadMessages() {
      setLoading(true);
      setError(null);
      const res = await getSwapMessages(swap.id);
      if (!active) return;
      if (res.error) {
        setError(res.error);
      } else {
        setMessages(res.data);
      }
      setLoading(false);
    }

    void loadMessages();
    return () => {
      active = false;
    };
  }, [swap.id]);

  // Realtime subscription for INSERT events
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`chat_modal_${swap.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'swap_messages',
          filter: `swap_id=eq.${swap.id}`,
        },
        (payload) => {
          const raw = payload.new as {
            id: string;
            swap_id: string;
            sender_id: string;
            recipient_id: string;
            body: string;
            read_at?: string | null;
            created_at: string;
          };

          const newMsg: SwapMessage = {
            id: raw.id,
            swapId: raw.swap_id,
            senderId: raw.sender_id,
            recipientId: raw.recipient_id,
            body: raw.body,
            readAt: raw.read_at,
            createdAt: raw.created_at,
          };

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [swap.id]);

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
    setError(null);

    const res = await sendSwapMessage(swap.id, recipientId, cleanText);
    setSending(false);

    if (!res.success) {
      setError(res.error || 'Failed to send message.');
      return;
    }

    setInput('');
    if (res.message) {
      const sentMsg = res.message;
      setMessages((prev) => {
        if (prev.some((m) => m.id === sentMsg.id)) return prev;
        return [...prev, sentMsg];
      });
    }
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
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading messages...</p>
          ) : error ? (
            <p style={{ textAlign: 'center', color: 'var(--error-color, #ef4444)' }}>{error}</p>
          ) : messages.length === 0 ? (
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
