import { useState, useEffect, useRef, useCallback } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { useAuth } from '../context/AuthContext';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import {
  getUserSwaps,
  getSwapSubmission,
  getSwapAttachments,
  submitSwapWorkWithFiles,
  completeCreditSwap,
  cancelCreditSwap,
  createCreditSwap,
  getSubmissionFileSignedUrl,
  getSwapAttachmentSignedUrl,
  downloadFileFromSignedUrl,
  submitSwapReview,
  hasUserReviewedSwap,
  type SwapRecord,
  type SwapAttachment,
} from '../lib/supabase/credits';
import { getTagLabel } from '../constants/tags';
import { mapSwapRecordToSwap, type Swap, type SwapSubmission } from '../types/swap';
import { SwapChatModal } from '../components/chat/SwapChatModal';
import { TransactionProgress } from '../components/transaction/TransactionProgress';

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';

export interface SwapParticipant {
  userId: string;
  name: string;
  username: string;
  location: string;
  avatar: string;
  bio?: string;
}

export interface ActiveSwapItem {
  swap: Swap;
  partner: SwapParticipant;
  isRequester: boolean;
  isParticipant: boolean;
  formattedDate: string;
}

type ActiveSwapsPageProps = {
  onNavigate?: (path: string) => void;
};

export function ActiveSwapsPage({ onNavigate }: ActiveSwapsPageProps) {
  const { user, account, refreshAccount } = useAuth();
  const [activeTab, setActiveTab] = useState<'accepted' | 'given' | 'open'>('accepted');

  const [acceptedSwaps, setAcceptedSwaps] = useState<ActiveSwapItem[]>([]);
  const [givenSwaps, setGivenSwaps] = useState<ActiveSwapItem[]>([]);
  const [openSwaps, setOpenSwaps] = useState<ActiveSwapItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [selectedAcceptedId, setSelectedAcceptedId] = useState<string>('');
  const [selectedGivenId, setSelectedGivenId] = useState<string>('');
  const [selectedOpenId, setSelectedOpenId] = useState<string>('');

  const [isMutating, setIsMutating] = useState(false);

  // Selected swap submission & creator attachment state
  const [currentSubmission, setCurrentSubmission] = useState<SwapSubmission | null>(null);
  const [submissionLoading, setSubmissionLoading] = useState(false);
  const [creatorAttachments, setCreatorAttachments] = useState<SwapAttachment[]>([]);
  const [creatorAttachmentsLoading, setCreatorAttachmentsLoading] = useState(false);
  const [showCreatorAttachments, setShowCreatorAttachments] = useState(true);

  // Download state
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Submit Work Modal state
  const [isSubmitWorkModalOpen, setIsSubmitWorkModalOpen] = useState(false);
  const [submitWorkNotes, setSubmitWorkNotes] = useState('');
  const [submitWorkFiles, setSubmitWorkFiles] = useState<File[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccessToast, setSubmitSuccessToast] = useState<string | null>(null);

  // Profile Modal state
  const [selectedProfileModal, setSelectedProfileModal] = useState<SwapParticipant | null>(null);
  const [selectedGivenDetailsModal, setSelectedGivenDetailsModal] = useState<ActiveSwapItem | null>(null);

  // Review Modal state
  const [selectedSwapForReview, setSelectedSwapForReview] = useState<ActiveSwapItem | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewText, setReviewText] = useState<string>('');
  const [isReviewSubmitting, setIsReviewSubmitting] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewedSwaps, setReviewedSwaps] = useState<Record<string, boolean>>({});

  // Chat Modal state
  const [activeChatSwap, setActiveChatSwap] = useState<ActiveSwapItem | null>(null);

  const isMountedRef = useRef(true);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadRealActiveSwaps = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await getUserSwaps(user.id);
      if (res.error) {
        setFetchError(res.error);
        setAcceptedSwaps([]);
        setGivenSwaps([]);
        return;
      }
      const records: SwapRecord[] = res.data || [];
      const canonicalSwaps: Swap[] = records.map(mapSwapRecordToSwap);

      const accepted: ActiveSwapItem[] = [];
      const given: ActiveSwapItem[] = [];
      const open: ActiveSwapItem[] = [];

      canonicalSwaps.forEach((swap) => {
        const isRequester = swap.requesterId === user.id;
        const isParticipant = swap.participantId === user.id;

        const createdDate = new Date(swap.createdAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

        // Open swaps created by the current user
        if (isRequester && swap.status === 'open') {
          open.push({
            swap,
            partner: {
              userId: user.id,
              name: 'You (Creator)',
              username: '',
              location: 'Open Listing',
              avatar: DEFAULT_AVATAR,
            },
            isRequester: true,
            isParticipant: false,
            formattedDate: createdDate,
          });
          return;
        }

        if (['open', 'cancelled', 'declined', 'withdrawn', 'expired'].includes(swap.status)) return;
        if (!isRequester && !isParticipant) return;

        const partnerProfile = isRequester ? swap.participantProfile : swap.requesterProfile;
        const partnerUserId = isRequester ? (swap.participantId || '') : swap.requesterId;
        const partnerName = partnerProfile?.fullName || (partnerProfile?.username ? `@${partnerProfile.username}` : 'SkillSwap Member');
        const partnerUsername = partnerProfile?.username || '';
        const partnerAvatar = partnerProfile?.avatarUrl || DEFAULT_AVATAR;
        const partnerLocation = partnerUsername ? `@${partnerUsername}` : 'SkillSwap Network';

        const item: ActiveSwapItem = {
          swap,
          partner: {
            userId: partnerUserId,
            name: partnerName,
            username: partnerUsername,
            location: partnerLocation,
            avatar: partnerAvatar,
          },
          isRequester,
          isParticipant,
          formattedDate: createdDate,
        };

        if (isParticipant) {
          accepted.push(item);
        }
        if (isRequester) {
          given.push(item);
        }
      });

      setAcceptedSwaps(accepted);
      setSelectedAcceptedId((prev) => (prev && accepted.some((a) => a.swap.id === prev) ? prev : accepted[0]?.swap.id || ''));

      setGivenSwaps(given);
      setSelectedGivenId((prev) => (prev && given.some((g) => g.swap.id === prev) ? prev : given[0]?.swap.id || ''));

      setOpenSwaps(open);
      setSelectedOpenId((prev) => (prev && open.some((o) => o.swap.id === prev) ? prev : open[0]?.swap.id || ''));

      // Check review status for completed swaps
      const completedList = [...accepted, ...given].filter((i) => i.swap.status === 'completed');
      for (const item of completedList) {
        hasUserReviewedSwap(item.swap.id, user.id).then((alreadyReviewed) => {
          if (alreadyReviewed) {
            setReviewedSwaps((prev) => ({ ...prev, [item.swap.id]: true }));
          }
        });
      }
    } catch (err) {
      console.error('Error loading real active swaps:', err);
      setFetchError('Failed to load active swaps.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void loadRealActiveSwaps();
    }
  }, [user, loadRealActiveSwaps]);

  // Realtime subscription for Swaps & Submissions updates
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`active_swaps_realtime_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swaps' }, () => {
        void loadRealActiveSwaps();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swap_submissions' }, () => {
        void loadRealActiveSwaps();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swap_attachment_files' }, () => {
        void loadRealActiveSwaps();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, loadRealActiveSwaps]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Currently selected item getters
  const currentAcceptedItem = acceptedSwaps.find((s) => s.swap.id === selectedAcceptedId) || acceptedSwaps[0] || null;
  const currentGivenItem = givenSwaps.find((s) => s.swap.id === selectedGivenId) || givenSwaps[0] || null;
  const currentOpenItem = openSwaps.find((s) => s.swap.id === selectedOpenId) || openSwaps[0] || null;
  const currentSelectedItem = activeTab === 'accepted' ? currentAcceptedItem : activeTab === 'given' ? currentGivenItem : currentOpenItem;

  const currentSelectedSwapId = currentSelectedItem?.swap.id;
  const currentSelectedSwapStatus = currentSelectedItem?.swap.status;

  // Load submission and creator attachments whenever the selected swap ID or status changes
  useEffect(() => {
    let active = true;
    setCurrentSubmission(null);
    setCreatorAttachments([]);
    setDownloadError(null);

    if (!currentSelectedSwapId) return;

    const fetchDetailsData = async () => {
      setSubmissionLoading(true);
      setCreatorAttachmentsLoading(true);

      const [subRes, attRes] = await Promise.all([
        getSwapSubmission(currentSelectedSwapId),
        getSwapAttachments(currentSelectedSwapId),
      ]);

      if (!active) return;

      setSubmissionLoading(false);
      setCreatorAttachmentsLoading(false);

      if (subRes.data) {
        setCurrentSubmission(subRes.data);
      } else {
        setCurrentSubmission(null);
      }

      if (attRes.data) {
        setCreatorAttachments(attRes.data);
      } else {
        setCreatorAttachments([]);
      }
    };

    void fetchDetailsData();
    return () => {
      active = false;
    };
  }, [currentSelectedSwapId, currentSelectedSwapStatus]);

  const handleOpenChat = (item: ActiveSwapItem) => {
    setActiveChatSwap(item);
  };

  // ==========================================
  // DOWNLOAD LOGIC (Blob-based Forced Download)
  // ==========================================

  const handleDownloadFile = async (
    storagePath: string,
    fileName: string,
    fileId: string,
    isSubmission: boolean = true
  ) => {
    setDownloadingFileId(fileId);
    setDownloadError(null);

    try {
      const signedUrl = isSubmission
        ? await getSubmissionFileSignedUrl(storagePath)
        : await getSwapAttachmentSignedUrl(storagePath);

      if (!signedUrl) {
        setDownloadError(`Unable to generate secure download link for "${fileName}".`);
        setDownloadingFileId(null);
        return;
      }

      const res = await downloadFileFromSignedUrl(signedUrl, fileName);
      if (!res.success) {
        setDownloadError(res.error || `Failed to download "${fileName}".`);
      }
    } catch (err) {
      console.error('Download exception:', err);
      setDownloadError(`Error downloading "${fileName}".`);
    } finally {
      setDownloadingFileId(null);
    }
  };

  // ==========================================
  // SUBMISSION LOGIC & FILE INPUT ISOLATION
  // ==========================================

  const processSelectedFiles = (newFiles: File[]) => {
    setSubmitError(null);
    const validToAdd: File[] = [];

    for (const file of newFiles) {
      if (file.size > 25 * 1024 * 1024) {
        setSubmitError(`File "${file.name}" exceeds 25MB size limit.`);
        continue;
      }
      validToAdd.push(file);
    }

    if (submitWorkFiles.length + validToAdd.length > 5) {
      setSubmitError('Maximum 5 files allowed per submission.');
      return;
    }

    if (validToAdd.length > 0) {
      setSubmitWorkFiles((prev) => [...prev, ...validToAdd]);
    }
  };

  const handleFileSelectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      processSelectedFiles(filesArray);
    }
    // Clear input value so same file can be selected again
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files) {
      const filesArray = Array.from(e.dataTransfer.files);
      processSelectedFiles(filesArray);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSubmitWorkFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAcceptedItem || isMutating) return;

    const trimmedNotes = submitWorkNotes.trim();
    if (trimmedNotes.length === 0 && submitWorkFiles.length === 0) {
      setSubmitError('Add an explanation or attach at least one file.');
      return;
    }

    setSubmitError(null);
    setIsMutating(true);

    let submitSuccess = false;
    try {
      const res = await submitSwapWorkWithFiles({
        swapId: currentAcceptedItem.swap.id,
        notes: trimmedNotes,
        files: submitWorkFiles,
      });

      if (!res.success) {
        setSubmitError(res.error || 'Failed to submit work.');
        return;
      }

      submitSuccess = true;

      setIsSubmitWorkModalOpen(false);
      setSubmitWorkNotes('');
      setSubmitWorkFiles([]);
      setSubmitError(null);

      setSubmitSuccessToast(`Work submitted for "${currentAcceptedItem.swap.topic}"! Your contribution is ready for requester review.`);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) setSubmitSuccessToast(null);
      }, 5000);
    } catch (err) {
      console.error('[SUBMISSION] unexpected error in handleSubmitWork', err);
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred while submitting work.';
      setSubmitError(errorMessage);
    } finally {
      setIsMutating(false);
    }

    if (submitSuccess) {
      try {
        await refreshAccount();
        await loadRealActiveSwaps();
      } catch (refreshErr) {
        console.warn('[SUBMISSION] Best-effort post-submission UI refresh failed:', refreshErr);
      }
    }
  };

  const handleApproveGivenSwap = async (item: ActiveSwapItem) => {
    if (isMutating) return;

    setIsMutating(true);
    const res = await completeCreditSwap(item.swap.id);
    setIsMutating(false);

    if (!res.success) {
      setSubmitSuccessToast(res.error || 'Failed to complete swap and settle credits.');
      return;
    }

    await refreshAccount();
    await loadRealActiveSwaps();
    setSubmitSuccessToast(`Swap completed! You exchanged expertise on "${item.swap.topic}" with ${item.partner.name} and settled ${item.swap.creditAmount} SkillCredits.`);

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setSubmitSuccessToast(null);
    }, 5000);
  };

  // Undo state for listing cancellation (B3 Behavioral Feedback)
  const [undoCancelItem, setUndoCancelItem] = useState<{ item: ActiveSwapItem; seconds: number } | null>(null);
  const undoCancelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleCancelOpenSwap = async (item: ActiveSwapItem) => {
    if (isMutating) return;

    setIsMutating(true);
    const res = await cancelCreditSwap(item.swap.id);
    setIsMutating(false);

    if (!res.success) {
      setSubmitSuccessToast(res.error || 'Failed to cancel swap listing.');
      return;
    }

    await refreshAccount();
    await loadRealActiveSwaps();

    // Start 5-second Undo Toast Timer
    setUndoCancelItem({ item, seconds: 5 });
    if (undoCancelTimerRef.current) clearInterval(undoCancelTimerRef.current);
    undoCancelTimerRef.current = setInterval(() => {
      setUndoCancelItem((prev) => {
        if (!prev || prev.seconds <= 1) {
          if (undoCancelTimerRef.current) clearInterval(undoCancelTimerRef.current);
          return null;
        }
        return { ...prev, seconds: prev.seconds - 1 };
      });
    }, 1000);
  };

  return (
    <div className="page-shell active-swaps-shell">
      <Navbar onNavigate={onNavigate} showUserHeader={true} currentPath="/active-swaps" />

      <main className="active-swaps-page">
        {/* PAGE HEADER */}
        <header className="active-swaps-header">
          <h1 className="active-swaps-title">Active Swaps</h1>
          <p className="active-swaps-subtitle">Manage your ongoing skill exchanges and active escrow allocations.</p>
        </header>

        {/* EMPOWERED JOURNEY CAPITAL SUMMARY BANNER (B1) */}
        <div className="as-journey-banner">
          <div className="as-journey-icon" aria-hidden="true">⚡</div>
          <div className="as-journey-text-group">
            <span className="as-journey-label">YOUR SKILLSWAP JOURNEY IS UNDERWAY</span>
            <strong className="as-journey-balance">
              Available Trading Capital: {account?.credits_balance ?? 0} SkillCredits
            </strong>
            <p className="as-journey-subtext">
              Your exchange capital is active in your ledger. You have already started — request new expertise or complete active swaps to build your skills portfolio.
            </p>
          </div>
        </div>

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

        {/* 5-SECOND TRANSACTIONAL UNDO TOAST FOR LISTING CANCELLATION (B3 Behavioral Feedback) */}
        {undoCancelItem && (
          <div className="as-toast-banner" role="status" style={{ background: 'var(--color-accent-muted)', borderLeft: '4px solid var(--color-warning)' }}>
            <div className="as-toast-icon">↩️</div>
            <span>
              Cancelled listing "{undoCancelItem.item.swap.topic}". Reserved credits refunded.
            </span>
            <button
              type="button"
              className="as-btn as-btn--secondary"
              style={{ marginLeft: 'auto', padding: '0.25rem 0.75rem', fontSize: '0.8rem', background: 'var(--color-warning)', color: '#ffffff' }}
              onClick={async () => {
                if (undoCancelTimerRef.current) clearInterval(undoCancelTimerRef.current);
                const restoredSwap = undoCancelItem.item.swap;
                setUndoCancelItem(null);

                // Re-create the swap listing
                await createCreditSwap({
                  topic: restoredSwap.topic,
                  description: restoredSwap.description,
                  requirements: restoredSwap.requirements || '',
                  creditAmount: restoredSwap.creditAmount,
                  tags: restoredSwap.tags,
                });
                await refreshAccount();
                await loadRealActiveSwaps();
              }}
            >
              Undo ({undoCancelItem.seconds}s)
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

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'open'}
                className={`as-tab-btn ${activeTab === 'open' ? 'as-tab-btn--active' : ''}`}
                onClick={() => setActiveTab('open')}
              >
                My Open Swaps <span className="as-tab-count">{openSwaps.length}</span>
              </button>
            </div>

            {/* SWAP CARDS LIST */}
            <div className="as-list-container">
              {isLoading ? (
                <div className="as-empty-state"><p>Loading active swaps...</p></div>
              ) : fetchError ? (
                <div className="as-empty-state">
                  <p style={{ color: 'var(--color-error)' }}>{fetchError}</p>
                  <button type="button" className="as-btn as-btn--secondary" onClick={loadRealActiveSwaps} style={{ marginTop: '0.5rem' }}>
                    Retry
                  </button>
                </div>
              ) : activeTab === 'accepted' ? (
                acceptedSwaps.length === 0 ? (
                  <div className="as-empty-state"><p>No accepted swaps found.</p></div>
                ) : (
                  acceptedSwaps.map((item) => {
                    const isSelected = item.swap.id === selectedAcceptedId;
                    const statusLabel = item.swap.status === 'submitted' ? 'Submitted' : item.swap.status === 'completed' ? 'Completed' : 'Accepted';

                    return (
                      <div
                        key={item.swap.id}
                        tabIndex={0}
                        role="button"
                        aria-pressed={isSelected}
                        className={`as-list-card ${isSelected ? 'as-list-card--selected' : ''}`}
                        onClick={() => setSelectedAcceptedId(item.swap.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedAcceptedId(item.swap.id);
                          }
                        }}
                      >
                        <div className="as-card-header-row">
                          <div className="as-card-user">
                            <img src={item.partner.avatar} alt={item.partner.name} className="as-card-avatar" />
                            <div className="as-card-user-meta">
                              <span className="as-card-user-name">{item.partner.name}</span>
                              <span className="as-card-time">{item.formattedDate}</span>
                            </div>
                          </div>
                          <span className={`as-status-badge as-status-badge--${item.swap.status}`}>
                            ● {statusLabel}
                          </span>
                        </div>

                        <div className="as-card-body">
                          <h3 className="as-card-title">{item.swap.topic}</h3>
                          <div className="as-card-meta-row">
                            <span className="as-card-credits">{item.swap.creditAmount} SkillCredits</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )
              ) : activeTab === 'given' ? (
                givenSwaps.length === 0 ? (
                  <div className="as-empty-state"><p>No given swaps found.</p></div>
                ) : (
                  givenSwaps.map((item) => {
                    const isSelected = item.swap.id === selectedGivenId;
                    const submissionStatus = item.swap.status === 'submitted' ? 'Submitted for Review' : item.swap.status === 'completed' ? 'Completed' : 'Not submitted yet';

                    return (
                      <div
                        key={item.swap.id}
                        tabIndex={0}
                        role="button"
                        aria-pressed={isSelected}
                        className={`as-list-card ${isSelected ? 'as-list-card--selected' : ''}`}
                        onClick={() => setSelectedGivenId(item.swap.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedGivenId(item.swap.id);
                          }
                        }}
                      >
                        <div className="as-card-header-row">
                          <div className="as-card-user">
                            <img src={item.partner.avatar} alt={item.partner.name} className="as-card-avatar" />
                            <div className="as-card-user-meta">
                              <span className="as-card-user-name">{item.partner.name}</span>
                              <span className="as-card-time">{item.formattedDate}</span>
                            </div>
                          </div>
                          <span className="as-card-arrow-icon" aria-hidden="true">→</span>
                        </div>

                        <div className="as-card-body">
                          <h3 className="as-card-title">{item.swap.topic}</h3>
                          <div className="as-card-meta-row">
                            <span className="as-card-credits">{item.swap.creditAmount} SkillCredits</span>
                            <span className="as-status-badge as-status-badge--waiting">
                              ● {submissionStatus}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                openSwaps.length === 0 ? (
                  <div className="as-empty-state"><p>No open swap listings created.</p></div>
                ) : (
                  openSwaps.map((item) => {
                    const isSelected = item.swap.id === selectedOpenId;

                    return (
                      <div
                        key={item.swap.id}
                        tabIndex={0}
                        role="button"
                        aria-pressed={isSelected}
                        className={`as-list-card ${isSelected ? 'as-list-card--selected' : ''}`}
                        onClick={() => setSelectedOpenId(item.swap.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedOpenId(item.swap.id);
                          }
                        }}
                      >
                        <div className="as-card-header-row">
                          <div className="as-card-user">
                            <div className="as-card-user-meta">
                              <span className="as-card-user-name">{item.swap.topic}</span>
                              <span className="as-card-time">{item.formattedDate}</span>
                            </div>
                          </div>
                          <span className="as-status-badge as-status-badge--open">
                            ● Open
                          </span>
                        </div>

                        <div className="as-card-body">
                          <div className="as-card-meta-row">
                            <span className="as-card-credits">{item.swap.creditAmount} SkillCredits</span>
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
            {downloadError && (
              <div className="error-alert" style={{ color: 'var(--color-error)', padding: '0.75rem 1rem', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.08)', marginBottom: '1rem' }}>
                {downloadError}
              </div>
            )}

            {activeTab === 'accepted' ? (
              currentAcceptedItem ? (
                <div className="as-detail-card">
                  {/* PARTICIPANT HEADER */}
                  <div className="as-detail-participant-header">
                    <div className="as-detail-user-group">
                      <img
                        src={currentAcceptedItem.partner.avatar}
                        alt={currentAcceptedItem.partner.name}
                        className="as-detail-avatar"
                      />
                      <div className="as-detail-user-info">
                        <div className="as-detail-name-row">
                          <h2 className="as-detail-user-name">{currentAcceptedItem.partner.name}</h2>
                          <button
                            type="button"
                            className="as-view-profile-link"
                            onClick={() => setSelectedProfileModal(currentAcceptedItem.partner)}
                          >
                            View Profile
                          </button>
                        </div>
                        <p className="as-detail-user-location">{currentAcceptedItem.partner.location}</p>
                      </div>
                    </div>

                    <span className={`as-status-badge as-status-badge--large as-status-badge--${currentAcceptedItem.swap.status}`}>
                      ● {currentAcceptedItem.swap.status === 'submitted' ? 'Submitted for Review' : currentAcceptedItem.swap.status === 'completed' ? 'Completed' : 'In Progress'}
                    </span>
                  </div>

                  {/* SWAP TITLE & DESCRIPTION */}
                  <div className="as-detail-title-section">
                    <h3 className="as-detail-swap-title">{currentAcceptedItem.swap.topic}</h3>
                    <p className="as-detail-swap-desc">{currentAcceptedItem.swap.description}</p>
                  </div>

                  {/* HORIZONTAL STATS ROW */}
                  <div className="as-stats-row">
                    <div className="as-stat-item">
                      <span className="as-stat-label">SkillCredits Reward</span>
                      <strong className="as-stat-value">{currentAcceptedItem.swap.creditAmount} SkillCredits</strong>
                    </div>
                    <div className="as-stat-item">
                      <span className="as-stat-label">Accepted On</span>
                      <strong className="as-stat-value">{currentAcceptedItem.formattedDate}</strong>
                    </div>
                    <div className="as-stat-item">
                      <span className="as-stat-label">Submission Status</span>
                      <strong className="as-stat-value">
                        {currentAcceptedItem.swap.status === 'submitted'
                          ? 'Submitted for Review'
                          : currentAcceptedItem.swap.status === 'completed'
                          ? 'Approved & Completed'
                          : 'Waiting for Submission'}
                      </strong>
                    </div>
                  </div>

                  {/* ABOUT THIS SWAP */}
                  <div className="as-detail-section">
                    <h4 className="as-section-subheading">Requirements & Guidelines</h4>
                    <p className="as-section-body-text">{currentAcceptedItem.swap.requirements || currentAcceptedItem.swap.description}</p>
                  </div>

                  {/* CREATOR ATTACHMENTS (if present) */}
                  {creatorAttachmentsLoading ? (
                    <div className="as-detail-section">
                      <h4 className="as-section-subheading">Creator Attachments</h4>
                      <p className="as-section-body-text">Loading creator attachments...</p>
                    </div>
                  ) : creatorAttachments.length > 0 ? (
                    <div className="as-detail-section">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <h4 className="as-section-subheading" style={{ margin: 0 }}>
                          Attachments from Swap Creator ({creatorAttachments.length})
                        </h4>
                        <button
                          type="button"
                          className="as-btn as-btn--secondary"
                          style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                          onClick={() => setShowCreatorAttachments((prev) => !prev)}
                        >
                          {showCreatorAttachments ? 'Hide Attachments ▲' : 'Show Attachments ▼'}
                        </button>
                      </div>
                      {showCreatorAttachments && (
                        <div className="attachment-list" style={{ marginTop: '0.5rem' }}>
                          {creatorAttachments.map((att) => {
                            const isDownloading = downloadingFileId === att.id;
                            return (
                              <div key={att.id} className="attachment-card" style={{ flexWrap: 'wrap' }}>
                                <div className="attachment-info">
                                  <span style={{ fontSize: '1.2rem', marginRight: '0.25rem' }}>📎</span>
                                  <div className="attachment-details">
                                    <span className="attachment-name" title={att.fileName}>{att.fileName}</span>
                                    {att.fileSize ? (
                                      <span className="attachment-size">{(att.fileSize / 1024).toFixed(1)} KB</span>
                                    ) : null}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="as-btn as-btn--secondary"
                                  style={{ padding: '0.35rem 0.85rem', fontSize: '0.825rem' }}
                                  disabled={isDownloading}
                                  onClick={() => handleDownloadFile(att.storagePath, att.fileName, att.id, false)}
                                >
                                  {isDownloading ? 'Downloading...' : 'Download'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* CANONICAL TRANSACTION LIFECYCLE PROGRESS & AUTO-RELEASE COUNTDOWN */}
                  <TransactionProgress
                    status={currentAcceptedItem.swap.status}
                    autoReleaseAt={currentAcceptedItem.swap.autoReleaseAt}
                    submittedAt={currentAcceptedItem.swap.submittedAt}
                    completedAt={currentAcceptedItem.swap.completedAt}
                    creditAmount={currentAcceptedItem.swap.creditAmount}
                    autoReleaseDays={7}
                  />

                  {/* YOUR SUBMISSION / NEXT STEP */}
                  <div className="as-detail-section">
                    <h4 className="as-section-subheading">Submitted Work &amp; Deliverables</h4>
                    {submissionLoading ? (
                      <p className="as-section-body-text">Loading submission details...</p>
                    ) : currentSubmission ? (
                      <div className="as-submitted-summary-box">
                        <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                          Submitted on {new Date(currentSubmission.createdAt).toLocaleDateString()}
                        </p>
                        {currentSubmission.notes && <p style={{ marginTop: '0.25rem' }}>“{currentSubmission.notes}”</p>}
                        {currentSubmission.files && currentSubmission.files.length > 0 && (
                          <div className="as-submitted-files-list" style={{ marginTop: '0.75rem' }}>
                            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Submitted Deliverables:</strong>
                            <div className="attachment-list">
                              {currentSubmission.files.map((file) => {
                                const isDownloading = downloadingFileId === file.id;
                                return (
                                  <div key={file.id} className="attachment-card" style={{ flexWrap: 'wrap' }}>
                                    <div className="attachment-info">
                                      <span style={{ fontSize: '1.2rem', marginRight: '0.25rem' }}>📎</span>
                                      <div className="attachment-details">
                                        <span className="attachment-name" title={file.fileName}>{file.fileName}</span>
                                        {file.fileSize ? (
                                          <span className="attachment-size">{(file.fileSize / 1024).toFixed(1)} KB</span>
                                        ) : null}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      className="as-btn as-btn--secondary"
                                      style={{ padding: '0.35rem 0.85rem', fontSize: '0.825rem' }}
                                      disabled={isDownloading}
                                      onClick={() => handleDownloadFile(file.storagePath, file.fileName, file.id, true)}
                                    >
                                      {isDownloading ? 'Downloading...' : 'Download'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                          {currentAcceptedItem.swap.status === 'completed'
                            ? '✓ Work approved by requester. SkillCredits added to your balance.'
                            : 'Waiting for requester to review your work.'}
                        </p>
                      </div>
                    ) : (
                      <p className="as-section-body-text">
                        Submit your notes or files when your work is ready for review.
                      </p>
                    )}
                  </div>

                  {/* MAJOR ACTION BUTTONS */}
                  <div className="as-detail-actions-row">
                    {currentAcceptedItem.swap.status === 'accepted' && (
                      <button
                        type="button"
                        className="as-btn as-btn--primary"
                        onClick={() => {
                          setSubmitError(null);
                          setIsSubmitWorkModalOpen(true);
                        }}
                      >
                        Submit Work
                      </button>
                    )}

                    {currentAcceptedItem.swap.status === 'submitted' && (
                      <span className="as-status-badge as-status-badge--large as-status-badge--waiting">
                        Submitted for Review
                      </span>
                    )}

                    {currentAcceptedItem.swap.status === 'completed' && (
                      <span className="as-status-badge as-status-badge--large as-status-badge--completed">
                        ✓ Completed & Credits Received
                      </span>
                    )}

                    <button
                      type="button"
                      className="as-btn as-btn--secondary"
                      onClick={() => handleOpenChat(currentAcceptedItem)}
                    >
                      Chat
                    </button>
                  </div>
                </div>
              ) : (
                <div className="as-detail-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
                  <p style={{ color: 'var(--text-secondary)' }}>No accepted swaps available.</p>
                </div>
              )
            ) : activeTab === 'given' ? (
              currentGivenItem ? (
                <div className="as-detail-card">
                  {/* PARTICIPANT HEADER */}
                  <div className="as-detail-participant-header">
                    <div className="as-detail-user-group">
                      <img
                        src={currentGivenItem.partner.avatar}
                        alt={currentGivenItem.partner.name}
                        className="as-detail-avatar"
                      />
                      <div className="as-detail-user-info">
                        <div className="as-detail-name-row">
                          <h2 className="as-detail-user-name">{currentGivenItem.partner.name}</h2>
                          <button
                            type="button"
                            className="as-view-profile-link"
                            onClick={() => setSelectedProfileModal(currentGivenItem.partner)}
                          >
                            View Profile
                          </button>
                        </div>
                        <p className="as-detail-user-location">{currentGivenItem.partner.location}</p>
                      </div>
                    </div>

                    <span className={`as-status-badge as-status-badge--large as-status-badge--${currentGivenItem.swap.status}`}>
                      ● {currentGivenItem.swap.status === 'submitted' ? 'Submission Ready for Review' : currentGivenItem.swap.status === 'completed' ? 'Completed' : 'Waiting for Submission'}
                    </span>
                  </div>

                  {/* SWAP TITLE & DESCRIPTION */}
                  <div className="as-detail-title-section">
                    <h3 className="as-detail-swap-title">{currentGivenItem.swap.topic}</h3>
                    <p className="as-detail-swap-desc">{currentGivenItem.swap.description}</p>
                  </div>

                  {/* HORIZONTAL STATS ROW */}
                  <div className="as-stats-row">
                    <div className="as-stat-item">
                      <span className="as-stat-label">SkillCredits Reserved</span>
                      <strong className="as-stat-value">{currentGivenItem.swap.creditAmount} SkillCredits</strong>
                    </div>
                    <div className="as-stat-item">
                      <span className="as-stat-label">Accepted On</span>
                      <strong className="as-stat-value">{currentGivenItem.formattedDate}</strong>
                    </div>
                    <div className="as-stat-item">
                      <span className="as-stat-label">Submission Status</span>
                      <strong className="as-stat-value">
                        {currentGivenItem.swap.status === 'submitted' ? 'Submitted for Review' : currentGivenItem.swap.status === 'completed' ? 'Completed' : 'Not submitted yet'}
                      </strong>
                    </div>
                  </div>

                  {/* CREATOR ATTACHMENTS (if present) */}
                  {creatorAttachmentsLoading ? (
                    <div className="as-detail-section">
                      <h4 className="as-section-subheading">Your Created Attachments</h4>
                      <p className="as-section-body-text">Loading attachments...</p>
                    </div>
                  ) : creatorAttachments.length > 0 ? (
                    <div className="as-detail-section">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <h4 className="as-section-subheading" style={{ margin: 0 }}>
                          Your Attachments for this Swap ({creatorAttachments.length})
                        </h4>
                        <button
                          type="button"
                          className="as-btn as-btn--secondary"
                          style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                          onClick={() => setShowCreatorAttachments((prev) => !prev)}
                        >
                          {showCreatorAttachments ? 'Hide Attachments ▲' : 'Show Attachments ▼'}
                        </button>
                      </div>
                      {showCreatorAttachments && (
                        <div className="attachment-list" style={{ marginTop: '0.5rem' }}>
                          {creatorAttachments.map((att) => {
                            const isDownloading = downloadingFileId === att.id;
                            return (
                              <div key={att.id} className="attachment-card" style={{ flexWrap: 'wrap' }}>
                                <div className="attachment-info">
                                  <span style={{ fontSize: '1.2rem', marginRight: '0.25rem' }}>📎</span>
                                  <div className="attachment-details">
                                    <span className="attachment-name" title={att.fileName}>{att.fileName}</span>
                                    {att.fileSize ? (
                                      <span className="attachment-size">{(att.fileSize / 1024).toFixed(1)} KB</span>
                                    ) : null}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="as-btn as-btn--secondary"
                                  style={{ padding: '0.35rem 0.85rem', fontSize: '0.825rem' }}
                                  disabled={isDownloading}
                                  onClick={() => handleDownloadFile(att.storagePath, att.fileName, att.id, false)}
                                >
                                  {isDownloading ? 'Downloading...' : 'Download'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* CANONICAL TRANSACTION LIFECYCLE PROGRESS & AUTO-RELEASE COUNTDOWN FOR GIVEN SWAP */}
                  <TransactionProgress
                    status={currentGivenItem.swap.status}
                    autoReleaseAt={currentGivenItem.swap.autoReleaseAt}
                    submittedAt={currentGivenItem.swap.submittedAt}
                    completedAt={currentGivenItem.swap.completedAt}
                    creditAmount={currentGivenItem.swap.creditAmount}
                    autoReleaseDays={7}
                  />

                  {/* SUBMISSION DETAILS */}
                  <div className="as-detail-section">
                    {currentGivenItem.swap.status === 'accepted' ? (
                      <p className="as-section-body-text">
                        No work submitted yet. You will receive a notification here once deliverables are uploaded.
                      </p>
                    ) : submissionLoading ? (
                      <p className="as-section-body-text">Loading submitted work...</p>
                    ) : currentSubmission ? (
                      <div className="as-submitted-summary-box" style={{ borderColor: 'var(--color-structure)' }}>
                        <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>
                          Submitted Deliverables (Review Required)
                        </h4>
                        {currentSubmission.notes && <p style={{ margin: '0 0 0.5rem 0', fontStyle: 'italic' }}>“{currentSubmission.notes}”</p>}
                        {currentSubmission.files && currentSubmission.files.length > 0 && (
                          <div className="as-submitted-files-list">
                            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Submitted Deliverables:</strong>
                            <div className="attachment-list">
                              {currentSubmission.files.map((file) => {
                                const isDownloading = downloadingFileId === file.id;
                                return (
                                  <div key={file.id} className="attachment-card" style={{ flexWrap: 'wrap' }}>
                                    <div className="attachment-info">
                                      <span style={{ fontSize: '1.2rem', marginRight: '0.25rem' }}>📎</span>
                                      <div className="attachment-details">
                                        <span className="attachment-name" title={file.fileName}>{file.fileName}</span>
                                        {file.fileSize ? (
                                          <span className="attachment-size">{(file.fileSize / 1024).toFixed(1)} KB</span>
                                        ) : null}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      className="as-btn as-btn--secondary"
                                      style={{ padding: '0.35rem 0.85rem', fontSize: '0.825rem' }}
                                      disabled={isDownloading}
                                      onClick={() => handleDownloadFile(file.storagePath, file.fileName, file.id, true)}
                                    >
                                      {isDownloading ? 'Downloading...' : 'Download'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="as-section-body-text">No submission record found.</p>
                    )}
                  </div>

                  {/* ABOUT THIS SWAP */}
                  <div className="as-detail-section">
                    <h4 className="as-section-subheading">Your Requirements</h4>
                    <p className="as-section-body-text">{currentGivenItem.swap.requirements || currentGivenItem.swap.description}</p>
                  </div>

                  {/* MAJOR ACTION BUTTONS */}
                  <div className="as-detail-actions-row">
                    {currentGivenItem.swap.status === 'submitted' && (
                      <button
                        type="button"
                        className="as-btn as-btn--primary"
                        disabled={isMutating || submissionLoading || !currentSubmission}
                        onClick={() => handleApproveGivenSwap(currentGivenItem)}
                      >
                        {isMutating ? 'Settling...' : 'Approve Work & Transfer Credits'}
                      </button>
                    )}

                    {currentGivenItem.swap.status === 'accepted' && (
                      <button
                        type="button"
                        className="as-btn as-btn--outline"
                        disabled
                        title="Waiting for participant to submit work first"
                      >
                        Waiting for Submission
                      </button>
                    )}

                    {currentGivenItem.swap.status === 'completed' && (
                      <>
                        <span className="as-status-badge as-status-badge--large as-status-badge--completed">
                          ✓ Swap Completed & Credits Settled
                        </span>
                        {reviewedSwaps[currentGivenItem.swap.id] ? (
                          <span className="as-status-badge as-status-badge--completed" style={{ background: 'rgba(214, 166, 74, 0.12)', color: '#a8781d' }}>
                            ★ Review Submitted
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="as-btn as-btn--primary"
                            style={{ background: '#a8781d', borderColor: '#a8781d' }}
                            onClick={() => {
                              setSelectedSwapForReview(currentGivenItem);
                              setReviewRating(5);
                              setReviewText('');
                              setReviewError(null);
                            }}
                          >
                            ★ Leave a Review
                          </button>
                        )}
                      </>
                    )}

                    <button
                      type="button"
                      className="as-btn as-btn--secondary"
                      onClick={() => handleOpenChat(currentGivenItem)}
                    >
                      Chat
                    </button>

                    <button
                      type="button"
                      className="as-btn as-btn--outline"
                      onClick={() => setSelectedGivenDetailsModal(currentGivenItem)}
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ) : (
                <div className="as-detail-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
                  <p style={{ color: 'var(--text-secondary)' }}>No given swaps available.</p>
                </div>
              )
            ) : (
              currentOpenItem ? (
                <div className="as-detail-card">
                  {/* OPEN SWAP HEADER */}
                  <div className="as-detail-participant-header">
                    <div>
                      <h2 className="as-detail-user-name" style={{ fontSize: '1.4rem' }}>{currentOpenItem.swap.topic}</h2>
                      <p className="as-detail-user-location">Created on {currentOpenItem.formattedDate}</p>
                    </div>

                    <span className="as-status-badge as-status-badge--large as-status-badge--open">
                      ● Open Listing
                    </span>
                  </div>

                  {/* SWAP DESCRIPTION */}
                  <div className="as-detail-title-section">
                    <p className="as-detail-swap-desc">{currentOpenItem.swap.description}</p>
                  </div>

                  {/* TAGS */}
                  {currentOpenItem.swap.tags.length > 0 && (
                    <div className="as-detail-section" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                      <h4 className="as-section-subheading">Tags</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                        {currentOpenItem.swap.tags.map((tag) => (
                          <span key={tag} className="swap-tag" style={{ cursor: 'default' }}>
                            {getTagLabel(tag)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* HORIZONTAL STATS ROW */}
                  <div className="as-stats-row">
                    <div className="as-stat-item">
                      <span className="as-stat-label">SkillCredits Reserved</span>
                      <strong className="as-stat-value">{currentOpenItem.swap.creditAmount} SkillCredits</strong>
                    </div>
                    <div className="as-stat-item">
                      <span className="as-stat-label">Created Date</span>
                      <strong className="as-stat-value">{currentOpenItem.formattedDate}</strong>
                    </div>
                    <div className="as-stat-item">
                      <span className="as-stat-label">Status</span>
                      <strong className="as-stat-value">Available on Explore</strong>
                    </div>
                  </div>

                  {/* CANONICAL TRANSACTION LIFECYCLE PROGRESS FOR MY OPEN SWAPS */}
                  <TransactionProgress
                    status={currentOpenItem.swap.status}
                    autoReleaseAt={currentOpenItem.swap.autoReleaseAt}
                    submittedAt={currentOpenItem.swap.submittedAt}
                    completedAt={currentOpenItem.swap.completedAt}
                    creditAmount={currentOpenItem.swap.creditAmount}
                    autoReleaseDays={7}
                  />

                  {/* REQUIREMENTS */}
                  {currentOpenItem.swap.requirements && (
                    <div className="as-detail-section">
                      <h4 className="as-section-subheading">Requirements & Guidelines</h4>
                      <p className="as-section-body-text">{currentOpenItem.swap.requirements}</p>
                    </div>
                  )}

                  {/* CREATOR ATTACHMENTS (if present) */}
                  {creatorAttachmentsLoading ? (
                    <div className="as-detail-section">
                      <h4 className="as-section-subheading">Listing Attachments</h4>
                      <p className="as-section-body-text">Loading attachments...</p>
                    </div>
                  ) : creatorAttachments.length > 0 ? (
                    <div className="as-detail-section">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <h4 className="as-section-subheading" style={{ margin: 0 }}>
                          Your Attachments ({creatorAttachments.length})
                        </h4>
                        <button
                          type="button"
                          className="as-btn as-btn--secondary"
                          style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                          onClick={() => setShowCreatorAttachments((prev) => !prev)}
                        >
                          {showCreatorAttachments ? 'Hide Attachments ▲' : 'Show Attachments ▼'}
                        </button>
                      </div>
                      {showCreatorAttachments && (
                        <div className="attachment-list" style={{ marginTop: '0.5rem' }}>
                          {creatorAttachments.map((att) => {
                            const isDownloading = downloadingFileId === att.id;
                            return (
                              <div key={att.id} className="attachment-card" style={{ flexWrap: 'wrap' }}>
                                <div className="attachment-info">
                                  <span style={{ fontSize: '1.2rem', marginRight: '0.25rem' }}>📎</span>
                                  <div className="attachment-details">
                                    <span className="attachment-name" title={att.fileName}>{att.fileName}</span>
                                    {att.fileSize ? (
                                      <span className="attachment-size">{(att.fileSize / 1024).toFixed(1)} KB</span>
                                    ) : null}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="as-btn as-btn--secondary"
                                  style={{ padding: '0.35rem 0.85rem', fontSize: '0.825rem' }}
                                  disabled={isDownloading}
                                  onClick={() => handleDownloadFile(att.storagePath, att.fileName, att.id, false)}
                                >
                                  {isDownloading ? 'Downloading...' : 'Download'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* MAJOR ACTION BUTTONS */}
                  <div className="as-detail-actions-row">
                    <button
                      type="button"
                      className="as-btn as-btn--secondary"
                      disabled={isMutating}
                      style={{ color: 'var(--color-error)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                      onClick={() => handleCancelOpenSwap(currentOpenItem)}
                    >
                      {isMutating ? 'Cancelling...' : 'Cancel Listing'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="as-detail-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
                  <p style={{ color: 'var(--text-secondary)' }}>No open swaps available.</p>
                </div>
              )
            )}
          </section>
        </div>
      </main>

      {/* SUBMIT WORK MODAL */}
      {isSubmitWorkModalOpen && currentAcceptedItem && (
        <div className="modal-overlay" onClick={() => !isMutating && setIsSubmitWorkModalOpen(false)}>
          <div className="modal-content as-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <div>
                <h3 className="chat-title">Submit Work for {currentAcceptedItem.swap.topic}</h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                  Provide notes, external deliverable links, or file attachments for the requester to review.
                </p>
              </div>
              <button
                type="button"
                className="chat-close-btn"
                disabled={isMutating}
                onClick={() => setIsSubmitWorkModalOpen(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmitWork} className="as-modal-form">
              {submitError && (
                <div className="error-alert" style={{ color: 'var(--color-error)', padding: '0.5rem', marginBottom: '0.5rem' }}>
                  {submitError}
                </div>
              )}

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
                />
              </div>

              <div className="form-group">
                <span className="form-label">Attach Files (Optional if notes provided, up to 25MB each)</span>

                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  id="submit-file-input"
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileSelectChange}
                  onClick={(e) => e.stopPropagation()}
                />

                {/* Dropzone with Isolated Browse Button */}
                <div
                  className="dropzone"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <div className="dropzone-content">
                    <button
                      type="button"
                      className="as-btn as-btn--secondary"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      style={{ marginBottom: '0.5rem' }}
                    >
                      📁 Browse / Select Files
                    </button>
                    <span className="dropzone-add-text">Drag & drop files here or click browse</span>
                    <span className="dropzone-subtext">Any file type up to 25MB</span>
                  </div>
                </div>

                {submitWorkFiles.length > 0 && (
                  <div className="as-modal-file-list" style={{ marginTop: '0.75rem' }}>
                    {submitWorkFiles.map((file, i) => (
                      <div key={i} className="attachment-card">
                        <div className="attachment-info">
                          <span className="attachment-name" title={file.name}>{file.name}</span>
                          <span className="attachment-size">({(file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        <button
                          type="button"
                          className="attachment-remove-btn"
                          disabled={isMutating}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleRemoveFile(i);
                          }}
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
                  disabled={isMutating}
                  onClick={() => setIsSubmitWorkModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="modal-btn modal-btn--confirm" disabled={isMutating}>
                  {isMutating ? 'Uploading & Submitting Work...' : 'Submit Work for Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHAT MODAL / CONSOLIDATED WORKSPACE */}
      {activeChatSwap && (
        <SwapChatModal
          swap={activeChatSwap.swap}
          partnerName={activeChatSwap.partner.name}
          partnerAvatar={activeChatSwap.partner.avatar}
          onClose={() => setActiveChatSwap(null)}
          onOpenSubmitWork={() => {
            setActiveChatSwap(null);
            setSubmitError(null);
            setIsSubmitWorkModalOpen(true);
          }}
          onApproveSwap={async () => {
            await handleApproveGivenSwap(activeChatSwap);
          }}
          isApproving={isMutating}
        />
      )}

      {/* VIEW PROFILE MODAL */}
      {selectedProfileModal && (
        <div className="modal-overlay" onClick={() => setSelectedProfileModal(null)}>
          <div className="modal-content as-profile-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="as-profile-modal-header">
              <img src={selectedProfileModal.avatar} alt={selectedProfileModal.name} className="as-modal-avatar" />
              <div>
                <h3 className="as-modal-title">{selectedProfileModal.name}</h3>
                <p className="as-modal-subtitle">{selectedProfileModal.location}</p>
              </div>
              <button
                type="button"
                className="chat-close-btn"
                onClick={() => setSelectedProfileModal(null)}
              >
                ×
              </button>
            </div>

            <div className="as-modal-body">
              <p className="as-modal-bio">{selectedProfileModal.bio || 'Active SkillSwap participant.'}</p>
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
          <div className="modal-content as-profile-modal-content" onClick={(e) => e.stopPropagation()}>
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

            <div className="as-details-modal-body">
              <div className="as-detail-row">
                <span>Participant:</span>
                <strong>{selectedGivenDetailsModal.partner.name} ({selectedGivenDetailsModal.partner.location})</strong>
              </div>
              <div className="as-detail-row">
                <span>Skill Topic:</span>
                <strong>{selectedGivenDetailsModal.swap.topic}</strong>
              </div>
              <div className="as-detail-row">
                <span>SkillCredits Offered:</span>
                <strong>{selectedGivenDetailsModal.swap.creditAmount} SkillCredits</strong>
              </div>
              <div className="as-detail-row">
                <span>Accepted Date:</span>
                <strong>{selectedGivenDetailsModal.formattedDate}</strong>
              </div>
              <div className="as-detail-row">
                <span>Current Status:</span>
                <span className={`as-status-badge as-status-badge--${selectedGivenDetailsModal.swap.status}`}>
                  ● {selectedGivenDetailsModal.swap.status}
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

      {/* SUBMIT REVIEW MODAL */}
      {selectedSwapForReview && (
        <div className="modal-overlay" onClick={() => !isReviewSubmitting && setSelectedSwapForReview(null)}>
          <div className="modal-content as-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <div>
                <h3 className="chat-title">Leave a Review for {selectedSwapForReview.partner.name}</h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                  Rate your skill exchange experience for "{selectedSwapForReview.swap.topic}".
                </p>
              </div>
              <button
                type="button"
                className="chat-close-btn"
                disabled={isReviewSubmitting}
                onClick={() => setSelectedSwapForReview(null)}
              >
                ×
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (isReviewSubmitting) return;

                setIsReviewSubmitting(true);
                setReviewError(null);

                const res = await submitSwapReview(
                  selectedSwapForReview.swap.id,
                  reviewRating,
                  reviewText
                );

                setIsReviewSubmitting(false);

                if (!res.success) {
                  setReviewError(res.error || 'Failed to submit review.');
                  return;
                }

                const targetSwapId = selectedSwapForReview.swap.id;
                setReviewedSwaps((prev) => ({ ...prev, [targetSwapId]: true }));
                setSelectedSwapForReview(null);
                setSubmitSuccessToast(`Thank you! Your review for ${selectedSwapForReview.partner.name} was submitted.`);

                if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                toastTimerRef.current = setTimeout(() => {
                  if (isMountedRef.current) setSubmitSuccessToast(null);
                }, 5000);

                await refreshAccount();
                await loadRealActiveSwaps();
              }}
              className="as-modal-form"
            >
              {reviewError && (
                <div className="error-alert" style={{ color: 'var(--color-error)', padding: '0.5rem', marginBottom: '0.5rem' }}>
                  {reviewError}
                </div>
              )}

              {/* STAR RATING PICKER */}
              <div className="form-group" style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                  Rating
                </label>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', fontSize: '2rem', cursor: 'pointer' }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      style={{
                        color: star <= reviewRating ? '#d97706' : 'var(--border-color, #4b5563)',
                        transition: 'transform 0.1s ease',
                      }}
                      onClick={() => setReviewRating(star)}
                      role="button"
                      aria-label={`${star} star${star > 1 ? 's' : ''}`}
                    >
                      ★
                    </span>
                  ))}
                </div>
                <span style={{ fontSize: '0.85rem', color: '#d97706', fontWeight: 600, display: 'block', marginTop: '0.35rem' }}>
                  {reviewRating} out of 5 stars
                </span>
              </div>

              {/* REVIEW TEXTAREA */}
              <div className="form-group">
                <label className="form-label" htmlFor="review-text">
                  Your Feedback <span className="badge-optional">(Optional)</span>
                </label>
                <textarea
                  id="review-text"
                  className="form-textarea"
                  placeholder="Share a few words about communication, quality, or collaboration during this exchange..."
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  rows={4}
                  maxLength={2000}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn modal-btn--cancel"
                  disabled={isReviewSubmitting}
                  onClick={() => setSelectedSwapForReview(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="modal-btn modal-btn--confirm" disabled={isReviewSubmitting}>
                  {isReviewSubmitting ? 'Submitting Review...' : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
