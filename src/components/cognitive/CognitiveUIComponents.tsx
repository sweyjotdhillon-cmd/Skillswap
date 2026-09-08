import React, { useState, useEffect } from 'react';

// ==========================================
// 1. PROTOTYPICAL MARKETPLACE CARD (SPOTTED PATTERN - SECTION K.1)
// ==========================================

export interface MarketplaceCardProps {
  title: string;
  description: string;
  category: string;
  credits: number;
  creatorName: string;
  creatorAvatar: string;
  timeAgo: string;
  onAccept: () => void;
}

export const MarketplaceCard: React.FC<MarketplaceCardProps> = ({
  title,
  description,
  category,
  credits,
  creatorName,
  creatorAvatar,
  timeAgo,
  onAccept,
}) => {
  return (
    <div className="w-full bg-[#1E293B] border border-slate-700 hover:border-slate-500 rounded-xl p-5 transition-all duration-300 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      {/* Left Anchor: Identity & Context (Gestalt Proximity) */}
      <div className="flex items-start gap-4 flex-1">
        <div className="relative">
          <img
            src={creatorAvatar}
            alt={creatorName}
            className="w-12 h-12 rounded-full object-cover ring-2 ring-[#38BDF8]"
          />
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#1E293B] rounded-full"></span>
        </div>
        {/* Text Details (Left-aligned reading anchors to prevent eye fatigue) */}
        <div className="flex flex-col gap-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-300">{creatorName}</span>
            <span className="text-xs text-slate-500">• {timeAgo}</span>
          </div>
          <h3 className="text-lg font-bold text-slate-100 tracking-tight">{title}</h3>
          <p className="text-sm text-slate-400 line-clamp-2 max-w-2xl">{description}</p>
          {/* Metadata Row */}
          <div className="flex items-center gap-2 mt-2">
            <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-slate-800 text-[#38BDF8] border border-slate-700">
              {category}
            </span>
          </div>
        </div>
      </div>

      {/* Right Anchor: Saliency, Value & Action (Von Restorff Effect) */}
      <div className="flex md:flex-col items-end justify-between md:justify-center gap-3 w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-slate-800">
        {/* High-Contrast Numerals Badge (Ticks visual attention instantly in 50ms) */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-sm shadow-amber-500/5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="8"/>
            <line x1="3" x2="21" y1="12" y2="12"/>
            <line x1="12" x2="12" y1="3" y2="21"/>
          </svg>
          <span className="text-lg font-extrabold tracking-tight">{credits}</span>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-500/80">Credits</span>
        </div>
        <button
          onClick={onAccept}
          className="w-full md:w-auto px-5 py-2 text-sm font-bold text-slate-950 bg-[#d6a64a] hover:bg-[#e4af48] active:scale-95 rounded-lg shadow-md hover:shadow-[#d6a64a]/25 transition-all duration-150"
        >
          Accept Swap
        </button>
      </div>
    </div>
  );
};

// ==========================================
// 2. MULTI-MODAL CHAT & TRANSACTION FEEDS (TEMPORAL CONTIGUITY - SECTION K.2)
// ==========================================

export interface ChatMessagePayload {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  isSystemEvent?: boolean;
  systemEventType?: 'SUBMISSION' | 'SETTLEMENT';
  systemEventDetails?: {
    fileName?: string;
    fileSize?: string;
    creditsTransferred?: number;
    timerSecondsRemaining?: number;
  };
}

export const MultiModalChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessagePayload[]>([
    {
      id: '1',
      senderId: 'user_a',
      senderName: 'Sohan',
      text: "Hey! I've completed the responsive design layouts for your landing page. Let me know if you need any adjustments in the viewport media queries.",
      timestamp: '10:14 AM',
    },
    {
      id: '2',
      senderId: 'system',
      senderName: 'Skillswap Ledger',
      text: 'Sohan submitted deliverables for review.',
      timestamp: '10:15 AM',
      isSystemEvent: true,
      systemEventType: 'SUBMISSION',
      systemEventDetails: {
        fileName: 'skillswap-responsive-v2.zip',
        fileSize: '4.2 MB',
        timerSecondsRemaining: 172800, // 48 Hours
      },
    },
  ]);

  const [inputText, setInputText] = useState('');
  const [countdown, setCountdown] = useState(172800);

  // Simulating countdown timers inline to relieve the Zeigarnik "Open Loop" anxiety
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimer = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}h ${mins}m ${secs}s`;
  };

  const handleSendMessage = () => {
    if (!inputText.trim()) return;
    const newMsg: ChatMessagePayload = {
      id: Date.now().toString(),
      senderId: 'user_b',
      senderName: 'You',
      text: inputText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, newMsg]);
    setInputText('');
  };

  const handleReleaseCredits = () => {
    const settlementMsg: ChatMessagePayload = {
      id: Date.now().toString(),
      senderId: 'system',
      senderName: 'Skillswap Ledger',
      text: 'Credits successfully transferred from escrow.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSystemEvent: true,
      systemEventType: 'SETTLEMENT',
      systemEventDetails: {
        creditsTransferred: 30,
      },
    };
    setMessages((prev) => [...prev, settlementMsg]);
  };

  return (
    <div className="flex flex-col h-[500px] w-full max-w-xl bg-[#0F172A] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="px-4 py-3 bg-[#1E293B] border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></div>
          <div>
            <h4 className="text-sm font-bold text-slate-100">Swap Room: Landing Page Refactor</h4>
            <p className="text-xs text-slate-400">Collaborating with @sohan</p>
          </div>
        </div>
      </div>

      {/* Messages / Multi-Modal Payloads Container */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.map((msg) => {
          if (msg.isSystemEvent) {
            // Render Inline Temporal Status Cards instead of segregating details (Spatial Contiguity)
            if (msg.systemEventType === 'SUBMISSION') {
              return (
                <div key={msg.id} className="w-full bg-slate-900 border border-slate-700/80 rounded-xl p-4 my-2 text-left shadow-inner flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-amber-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm font-bold tracking-tight">Deliverables Submitted</span>
                  </div>
                  {/* File Metadata */}
                  <div className="flex items-center justify-between p-2.5 bg-slate-950/50 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                      </svg>
                      <span className="text-xs font-semibold text-slate-300 truncate max-w-[180px]">{msg.systemEventDetails?.fileName}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">{msg.systemEventDetails?.fileSize}</span>
                  </div>
                  {/* Zeigarnik Resolution Countdown */}
                  <div className="flex items-center justify-between text-xs border-t border-slate-800 pt-2.5">
                    <div className="text-slate-400">
                      Auto-release Timer:{' '}
                      <span className="font-mono font-bold text-amber-500">{formatTimer(countdown)}</span>
                    </div>
                    <button
                      onClick={handleReleaseCredits}
                      className="px-3 py-1.5 text-xs font-extrabold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-all duration-150"
                    >
                      Release 30 Credits
                    </button>
                  </div>
                </div>
              );
            }
            if (msg.systemEventType === 'SETTLEMENT') {
              return (
                <div key={msg.id} className="w-full bg-emerald-950/25 border border-emerald-500/20 rounded-xl p-4 my-1 flex items-center justify-between text-left">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-full text-emerald-400">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <h5 className="text-sm font-bold text-slate-100">Swap Transacted Successfully</h5>
                      <p className="text-xs text-slate-400">Escrow funds settled and balances updated.</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-extrabold text-emerald-400">+{msg.systemEventDetails?.creditsTransferred} credits</span>
                  </div>
                </div>
              );
            }
          }

          const isMe = msg.senderId === 'user_b';
          return (
            <div key={msg.id} className={`flex flex-col max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
              <span className="text-[10px] text-slate-500 mb-0.5">{msg.senderName} • {msg.timestamp}</span>
              <div className={`p-3 rounded-2xl text-sm ${isMe ? 'bg-[#38BDF8] text-slate-900 rounded-tr-none text-right font-medium' : 'bg-[#1E293B] text-slate-100 rounded-tl-none text-left'}`}>
                {msg.text}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input controls */}
      <div className="p-3 bg-[#1E293B] border-t border-slate-800 flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Collaborate securely..."
          className="flex-1 bg-slate-900 border border-slate-700 text-sm text-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:border-[#38BDF8]"
        />
        <button
          onClick={handleSendMessage}
          className="p-2 bg-[#38BDF8] hover:bg-[#7DD3FC] text-slate-900 rounded-lg transition-colors duration-150"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// ==========================================
// 3. EMPOWERED PROGRESS ONBOARDING BAR (SECTION K.3)
// ==========================================

export const OnboardingProgressBar: React.FC = () => {
  return (
    <div className="w-full max-w-xl bg-[#1E293B] border border-slate-700 rounded-2xl p-6 shadow-xl text-left flex flex-col gap-5">
      {/* Dynamic Header incorporating the Empowered Progress Effect */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-extrabold uppercase tracking-widest text-[#38BDF8]">Your Journey Is Underway</span>
          <span className="text-sm font-extrabold text-[#38BDF8]">25% Completed</span>
        </div>
        {/* Pre-filled Progress Bar representing the welcome grant */}
        <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
          <div
            className="h-full bg-gradient-to-r from-[#38BDF8] to-emerald-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: '25%' }}
          ></div>
        </div>
      </div>

      {/* Loss Aversion Callout */}
      <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-4 flex items-start gap-3">
        <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 2 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <h5 className="text-sm font-bold text-slate-100">100 SkillCredits Already Claimed!</h5>
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
            Your welcome balance has been securely reserved in your escrow ledger. Complete the quick steps below to activate your account and start trading skills immediately.
          </p>
        </div>
      </div>

      {/* Step Checklist */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 opacity-100">
          <div className="w-6 h-6 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center text-xs font-bold">
            ✓
          </div>
          <span className="text-sm font-semibold text-slate-200 line-through decoration-slate-600">
            Account Created & 100 Credits Granted (Endowed)
          </span>
        </div>
        <div className="flex items-center gap-3 opacity-90">
          <div className="w-6 h-6 rounded-full bg-slate-800 border-2 border-[#38BDF8] text-[#38BDF8] flex items-center justify-center text-xs font-bold animate-pulse">
            2
          </div>
          <span className="text-sm font-bold text-slate-100">
            Choose Your @username & Skills Profiling (Category Setup)
          </span>
        </div>
        <div className="flex items-center gap-3 opacity-55">
          <div className="w-6 h-6 rounded-full bg-slate-800 border-2 border-slate-700 text-slate-500 flex items-center justify-center text-xs font-bold">
            3
          </div>
          <span className="text-sm font-semibold text-slate-400">
            Activate Wallet & Begin Swapping
          </span>
        </div>
      </div>
    </div>
  );
};
