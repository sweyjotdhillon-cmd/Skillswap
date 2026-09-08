import React, { useState, useEffect } from 'react';
import type { Swap, SwapSubmission } from '../../types/swap';

export type TransactionEventType =
  | 'SUBMISSION'
  | 'SETTLEMENT'
  | 'STATUS_CHANGE'
  | 'CREDIT_RELEASE'
  | 'AUTO_RELEASE';

export interface TransactionEventProps {
  type: TransactionEventType;
  swap: Swap;
  submission?: SwapSubmission | null;
  timestamp?: string;
  statusLabel?: string;
  isRequester?: boolean;
  onApproveSwap?: () => Promise<void>;
  isApproving?: boolean;
  onDownloadFile?: (storagePath: string, fileName: string, fileId: string) => Promise<void>;
  downloadingFileId?: string | null;
}

/** Formats remaining milliseconds into human-readable auto-release timer display */
function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00h 00m 00s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hrs >= 24) {
    const days = Math.floor(hrs / 24);
    const remHrs = hrs % 24;
    return `${days}d ${pad(remHrs)}h ${pad(mins)}m ${pad(secs)}s`;
  }
  return `${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`;
}

/**
 * 1. SUBMISSION EVENT CARD (Section E.4.3)
 * Displays deliverables, notes, file metadata, auto-release timer, and action CTA inside chat timeline.
 */
export const SubmissionEventCard: React.FC<{
  swap: Swap;
  submission: SwapSubmission;
  isRequester?: boolean;
  onApproveSwap?: () => Promise<void>;
  isApproving?: boolean;
  onDownloadFile?: (storagePath: string, fileName: string, fileId: string) => Promise<void>;
  downloadingFileId?: string | null;
}> = ({
  swap,
  submission,
  isRequester = false,
  onApproveSwap,
  isApproving = false,
  onDownloadFile,
  downloadingFileId = null,
}) => {
  // Calculate remaining seconds for auto-release (48h / 7d default)
  const submittedMs = new Date(submission.createdAt || swap.submittedAt || Date.now()).getTime();
  const autoReleaseMs = submittedMs + 48 * 3600 * 1000;
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    Math.max(0, Math.floor((autoReleaseMs - Date.now()) / 1000))
  );

  useEffect(() => {
    if (swap.status !== 'submitted') return;
    const timer = setInterval(() => {
      const rem = Math.max(0, Math.floor((autoReleaseMs - Date.now()) / 1000));
      setSecondsLeft(rem);
    }, 1000);
    return () => clearInterval(timer);
  }, [swap.status, autoReleaseMs]);

  const formattedTime = new Date(submission.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className="chat-system-card chat-system-card--submission border-l-4 border-amber-500 bg-slate-900/90 text-slate-100 p-4 rounded-xl my-2 shadow-md w-full max-w-lg"
      role="region"
      aria-label="Submission Event"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5 text-amber-400 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span className="tracking-tight">📄 Deliverables Submitted</span>
        </div>
        <span className="text-xs text-slate-400 font-mono">{formattedTime}</span>
      </div>

      {/* Submission Notes */}
      {submission.notes ? (
        <div className="mb-3 text-sm text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 italic">
          &ldquo;{submission.notes}&rdquo;
        </div>
      ) : null}

      {/* Submission Files */}
      {submission.files && submission.files.length > 0 ? (
        <div className="flex flex-col gap-2 mb-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Attachments ({submission.files.length})
          </span>
          <div className="flex flex-col gap-1.5">
            {submission.files.map((file) => {
              const formattedSize = file.fileSize
                ? file.fileSize > 1024 * 1024
                  ? `${(file.fileSize / (1024 * 1024)).toFixed(1)} MB`
                  : `${Math.round(file.fileSize / 1024)} KB`
                : '';

              return (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-2 bg-slate-950/70 rounded-lg border border-slate-800 gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-4 h-4 text-slate-400 flex-shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span className="text-xs font-semibold text-slate-200 truncate">
                      {file.fileName}
                    </span>
                    {formattedSize ? (
                      <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">
                        ({formattedSize})
                      </span>
                    ) : null}
                  </div>

                  {onDownloadFile ? (
                    <button
                      type="button"
                      className="px-2.5 py-1 text-xs font-bold text-slate-900 bg-slate-200 hover:bg-white rounded transition-colors duration-150 flex-shrink-0 disabled:opacity-50"
                      disabled={downloadingFileId === file.id}
                      onClick={() => onDownloadFile(file.storagePath, file.fileName, file.id)}
                    >
                      {downloadingFileId === file.id ? '...' : 'Download'}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Auto-release Timer & Primary CTA */}
      <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="text-xs text-slate-400 flex items-center gap-1.5">
          <span>Auto-release:</span>
          <span className="font-mono font-bold text-amber-400">
            {secondsLeft > 0 ? formatCountdown(secondsLeft) : 'Ready for release'}
          </span>
        </div>

        {isRequester && swap.status === 'submitted' && onApproveSwap ? (
          <button
            type="button"
            className="w-full sm:w-auto px-4 py-1.5 text-xs font-extrabold text-slate-950 bg-[#d6a64a] hover:bg-[#e4af48] active:scale-95 rounded-lg shadow-sm transition-all duration-150 disabled:opacity-60"
            disabled={isApproving}
            onClick={onApproveSwap}
          >
            {isApproving ? 'Settling Escrow...' : `Approve & Release ${swap.creditAmount} Credits`}
          </button>
        ) : null}
      </div>
    </div>
  );
};

/**
 * 2. SETTLEMENT EVENT CARD (Section E.4.4)
 * Inline settlement confirmation with actual credit amount transferred.
 */
export const SettlementEventCard: React.FC<{
  swap: Swap;
  timestamp?: string;
}> = ({ swap, timestamp }) => {
  const formattedTime = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : swap.completedAt
    ? new Date(swap.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      className="chat-system-card chat-system-card--completed border-l-4 border-emerald-500 bg-emerald-950/20 text-slate-100 p-4 rounded-xl my-2 shadow-md w-full max-w-lg flex items-center justify-between gap-3"
      role="region"
      aria-label="Settlement Event"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 bg-emerald-500/15 rounded-full text-emerald-400 flex-shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h5 className="text-sm font-bold text-slate-100 tracking-tight">✓ Swap Completed</h5>
          <p className="text-xs text-slate-400">Escrow settled successfully</p>
          {formattedTime ? <span className="text-[10px] text-slate-500 font-mono">{formattedTime}</span> : null}
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <span className="inline-block px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-sm font-extrabold text-emerald-400">
          +{swap.creditAmount} SkillCredits
        </span>
      </div>
    </div>
  );
};

/**
 * 3. STATUS CHANGE EVENT CARD (Section E.4.5)
 * Compact lifecycle transition events embedded inside the conversation timeline.
 */
export const StatusChangeEventCard: React.FC<{
  title: string;
  description?: string;
  timestamp?: string;
  iconType?: 'accepted' | 'cancelled' | 'open' | 'info';
}> = ({ title, description, timestamp, iconType = 'info' }) => {
  let badgeColor = 'text-sky-400 border-sky-500/30 bg-sky-500/10';
  let icon = '⚡';

  if (iconType === 'accepted') {
    badgeColor = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    icon = '✓';
  } else if (iconType === 'cancelled') {
    badgeColor = 'text-red-400 border-red-500/30 bg-red-500/10';
    icon = '✕';
  }

  const formattedTime = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      className={`chat-system-card mx-auto p-3 rounded-lg border text-xs text-slate-300 flex items-center justify-between gap-2 max-w-md my-1.5 ${badgeColor}`}
      role="status"
    >
      <div className="flex items-center gap-2">
        <span className="font-extrabold">{icon}</span>
        <div className="flex flex-col">
          <span className="font-bold">{title}</span>
          {description ? <span className="text-[11px] opacity-80">{description}</span> : null}
        </div>
      </div>
      {formattedTime ? <span className="text-[10px] opacity-60 font-mono">{formattedTime}</span> : null}
    </div>
  );
};

/**
 * 4. CREDIT RELEASE EVENT CARD (Section E.4.2)
 * Highlighting credit release and escrow allocation transitions.
 */
export const CreditReleaseEventCard: React.FC<{
  amount: number;
  recipientName?: string;
  timestamp?: string;
}> = ({ amount, recipientName, timestamp }) => {
  const formattedTime = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      className="chat-system-card mx-auto p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-slate-200 flex items-center justify-between gap-2 max-w-md my-1.5"
      role="status"
    >
      <div className="flex items-center gap-2">
        <span className="text-amber-400 font-extrabold text-sm">⚡</span>
        <div>
          <span className="font-bold text-amber-300">
            {amount} SkillCredits Released
          </span>
          {recipientName ? (
            <span className="block text-[11px] text-slate-400">
              Transferred to @{recipientName}
            </span>
          ) : null}
        </div>
      </div>
      {formattedTime ? <span className="text-[10px] text-slate-500 font-mono">{formattedTime}</span> : null}
    </div>
  );
};

/**
 * Unified Transaction Event component router
 */
export const TransactionEventCard: React.FC<TransactionEventProps> = (props) => {
  const { type, swap, submission, timestamp, statusLabel, isRequester, onApproveSwap, isApproving, onDownloadFile, downloadingFileId } = props;

  switch (type) {
    case 'SUBMISSION':
      if (!submission) return null;
      return (
        <SubmissionEventCard
          swap={swap}
          submission={submission}
          isRequester={isRequester}
          onApproveSwap={onApproveSwap}
          isApproving={isApproving}
          onDownloadFile={onDownloadFile}
          downloadingFileId={downloadingFileId}
        />
      );

    case 'SETTLEMENT':
      return <SettlementEventCard swap={swap} timestamp={timestamp} />;

    case 'CREDIT_RELEASE':
      return (
        <CreditReleaseEventCard
          amount={swap.creditAmount}
          recipientName={swap.participantProfile?.username}
          timestamp={timestamp}
        />
      );

    case 'STATUS_CHANGE':
      return (
        <StatusChangeEventCard
          title={statusLabel || `Swap status: ${swap.status}`}
          timestamp={timestamp}
          iconType={swap.status === 'accepted' ? 'accepted' : swap.status === 'cancelled' ? 'cancelled' : 'info'}
        />
      );

    case 'AUTO_RELEASE':
      return (
        <StatusChangeEventCard
          title="Auto-release Window Active"
          description={`Credits will automatically transfer if unreviewed after 48 hours.`}
          timestamp={timestamp}
          iconType="info"
        />
      );

    default:
      return null;
  }
};
