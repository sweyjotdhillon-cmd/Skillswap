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
  getSubmissionFileSignedUrl,
  getSwapAttachmentSignedUrl,
  downloadFileFromSignedUrl,
  ALLOWED_FILE_EXTENSIONS,
  type SwapRecord,
  type SwapAttachment,
} from '../lib/supabase/credits';
import { mapSwapRecordToSwap, type Swap, type SwapSubmission } from '../types/swap';
import { SwapChatModal } from '../components/chat/SwapChatModal';

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
  const { user, refreshAccount } = useAuth();
  const [activeTab, setActiveTab] = useState<'accepted' | 'given'>('accepted');

  const [acceptedSwaps, setAcceptedSwaps] = useState<ActiveSwapItem[]>([]);
  const [givenSwaps, setGivenSwaps] = useState<ActiveSwapItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [selectedAcceptedId, setSelectedAcceptedId] = useState<string>('');
  const [selectedGivenId, setSelectedGivenId] = useState<string>('');

  const [isMutating, setIsMutating] = useState(false);

  // Selected swap submission & creator attachment state
  const [currentSubmission, setCurrentSubmission] = useState<SwapSubmission | null>(null);
  const [submissionLoading, setSubmissionLoading] = useState(false);
  const [creatorAttachments, setCreatorAttachments] = useState<SwapAttachment[]>([]);
  const [creatorAttachmentsLoading, setCreatorAttachmentsLoading] = useState(false);

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

      canonicalSwaps.forEach((swap) => {
        if (['open', 'cancelled', 'declined', 'withdrawn', 'expired'].includes(swap.status)) return;

        const isRequester = swap.requesterId === user.id;
        const isParticipant = swap.participantId === user.id;
        if (!isRequester && !isParticipant) return;

        const partnerProfile = isRequester ? swap.participantProfile : swap.requesterProfile;
        const partnerUserId = isRequester ? (swap.participantId || '') : swap.requesterId;
        const partnerName = partnerProfile?.fullName || (partnerProfile?.username ? `@${partnerProfile.username}` : 'SkillSwap Member');
        const partnerUsername = partnerProfile?.username || '';
        const partnerAvatar = partnerProfile?.avatarUrl || DEFAULT_AVATAR;
        const partnerLocation = partnerUsername ? `@${partnerUsername}` : 'SkillSwap Network';

        const createdDate = new Date(swap.createdAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

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
  const currentSelectedItem = activeTab === 'accepted' ? currentAcceptedItem : currentGivenItem;

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
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!ALLOWED_FILE_EXTENSIONS.has(ext)) {
        setSubmitError(`File "${file.name}" has unaccepted extension .${ext}`);
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

      await refreshAccount();
      await loadRealActiveSwaps();

      setIsSubmitWorkModalOpen(false);
      setSubmitWorkNotes('');
      setSubmitWorkFiles([]);
      setSubmitError(null);

      setSubmitSuccessToast(`Work submitted for "${currentAcceptedItem.swap.topic}"! Waiting for requester review.`);
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
    setSubmitSuccessToast(`Swap completed! ${item.swap.creditAmount} SkillCredits settled successfully.`);

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setSubmitSuccessToast(null);
    }, 5000);
  };

  return (
    <div className="page-shell active-swaps-shell">
      <Navbar onNavigate={onNavigate} showUserHeader={true} currentPath="/active-swaps" />

      <main className="active-swaps-page">
        {/* PAGE HEADER */}
        <header className="active-swaps-header">
          <h1 className="active-swaps-title">Active Swaps</h1>
          <p className="active-swaps-subtitle">Manage your ongoing skill exchanges.</p>
        </header>

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
            </div>

            {/* SWAP CARDS LIST */}
            <div className="as-list-container">
              {isLoading ? (
                <div className="sr-empty-state"><p>Loading active swaps...</p></div>
              ) : fetchError ? (
                <div className="sr-empty-state">
                  <p style={{ color: 'var(--error-color, #ef4444)' }}>{fetchError}</p>
                  <button type="button" className="as-btn as-btn--secondary" onClick={loadRealActiveSwaps} style={{ marginTop: '0.5rem' }}>
                    Retry
                  </button>
                </div>
              ) : activeTab === 'accepted' ? (
                acceptedSwaps.length === 0 ? (
                  <div className="sr-empty-state"><p>No accepted swaps found.</p></div>
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
              ) : (
                givenSwaps.length === 0 ? (
                  <div className="sr-empty-state"><p>No given swaps found.</p></div>
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
              )}
            </div>
          </section>

          {/* RIGHT PANEL: SELECTED SWAP DETAILS */}
          <section className="as-right-panel" aria-label="Selected swap details">
            {downloadError && (
              <div className="error-alert" style={{ color: 'var(--error-color, #ef4444)', padding: '0.75rem 1rem', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.08)', marginBottom: '1rem' }}>
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
                      <span className="as-stat-label">Credits Reward</span>
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
                      <h4 className="as-section-subheading">Attachments from Swap Creator</h4>
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
                    </div>
                  ) : null}

                  {/* YOUR SUBMISSION / NEXT STEP */}
                  <div className="as-detail-section">
                    <h4 className="as-section-subheading">Submission Status</h4>
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
                            ? '✓ Work approved by requester. SkillCredits have been added to your balance.'
                            : 'Waiting for the requester to review your work.'}
                        </p>
                      </div>
                    ) : (
                      <p className="as-section-body-text">
                        Complete your deliverables and click <strong>Submit Work</strong> to submit your notes and files for requester review.
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
            ) : (
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
                      <span className="as-stat-label">Credits Reserved</span>
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
                      <h4 className="as-section-subheading">Your Attachments for this Swap</h4>
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
                    </div>
                  ) : null}

                  {/* CALLOUT / SUBMISSION DETAILS */}
                  <div className="as-detail-section">
                    {currentGivenItem.swap.status === 'accepted' ? (
                      <div className="as-callout-box">
                        <div className="as-callout-title">Waiting for submission</div>
                        <p className="as-callout-text">
                          “{currentGivenItem.partner.name} has accepted your swap request. You are waiting for them to submit work before you can review and transfer credits.”
                        </p>
                      </div>
                    ) : submissionLoading ? (
                      <p className="as-section-body-text">Loading submitted work...</p>
                    ) : currentSubmission ? (
                      <div className="as-submitted-summary-box" style={{ borderColor: 'var(--primary-color, #2563eb)' }}>
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
                      <span className="as-status-badge as-status-badge--large as-status-badge--completed">
                        ✓ Swap Completed & Credits Settled
                      </span>
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
            )}
          </section>
        </div>
      </main>

      {/* SUBMIT WORK MODAL */}
      {isSubmitWorkModalOpen && currentAcceptedItem && (
        <div className="modal-overlay" onClick={() => !isMutating && setIsSubmitWorkModalOpen(false)}>
          <div className="modal-content as-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <h3 className="chat-title">Submit Work for {currentAcceptedItem.swap.topic}</h3>
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
                <div className="error-alert" style={{ color: 'var(--error-color, #ef4444)', padding: '0.5rem', marginBottom: '0.5rem' }}>
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
                    <span className="dropzone-subtext">PDF, ZIP, PY, JPG, DOCX, etc. up to 25MB</span>
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
                  {isMutating ? 'Uploading & Submitting...' : 'Confirm Submission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHAT MODAL */}
      {activeChatSwap && (
        <SwapChatModal
          swap={activeChatSwap.swap}
          partnerName={activeChatSwap.partner.name}
          partnerAvatar={activeChatSwap.partner.avatar}
          onClose={() => setActiveChatSwap(null)}
        />
      )}

      {/* VIEW PROFILE MODAL */}
      {selectedProfileModal && (
        <div className="modal-overlay" onClick={() => setSelectedProfileModal(null)}>
          <div className="modal-content sr-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="sr-profile-modal-header">
              <img src={selectedProfileModal.avatar} alt={selectedProfileModal.name} className="sr-modal-avatar" />
              <div>
                <h3 className="sr-modal-title">{selectedProfileModal.name}</h3>
                <p className="sr-modal-subtitle">{selectedProfileModal.location}</p>
              </div>
              <button
                type="button"
                className="chat-close-btn"
                onClick={() => setSelectedProfileModal(null)}
              >
                ×
              </button>
            </div>

            <div className="sr-modal-body">
              <p className="sr-modal-bio">{selectedProfileModal.bio || 'Active SkillSwap participant.'}</p>
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
          <div className="modal-content sr-modal-content" onClick={(e) => e.stopPropagation()}>
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

            <div className="sr-details-modal-body">
              <div className="sr-detail-row">
                <span>Participant:</span>
                <strong>{selectedGivenDetailsModal.partner.name} ({selectedGivenDetailsModal.partner.location})</strong>
              </div>
              <div className="sr-detail-row">
                <span>Skill Topic:</span>
                <strong>{selectedGivenDetailsModal.swap.topic}</strong>
              </div>
              <div className="sr-detail-row">
                <span>Credits Offered:</span>
                <strong>{selectedGivenDetailsModal.swap.creditAmount} SkillCredits</strong>
              </div>
              <div className="sr-detail-row">
                <span>Accepted Date:</span>
                <strong>{selectedGivenDetailsModal.formattedDate}</strong>
              </div>
              <div className="sr-detail-row">
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
    </div>
  );
}
