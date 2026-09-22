import { useState, useEffect, useRef, useCallback } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { useAuth } from '../context/AuthContext';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { validateAttachmentFile } from '../lib/fileValidation';
import {
  getUserSwaps,
  getSwapById,
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
import { PerfTracker } from '../lib/perf';
import { getTagLabel } from '../constants/tags';
import { getFileExpiryStatus } from '../lib/fileExpiry';
import { mapSwapRecordToSwap, type Swap, type SwapSubmission } from '../types/swap';
import { SwapChatModal } from '../components/chat/SwapChatModal';
import { TransactionProgress } from '../components/transaction/TransactionProgress';
import { PendingTransactionVault } from '../components/transaction/PendingTransactionVault';
import { useScaffolding } from '../hooks/useScaffolding';
import { VerificationBadge } from '../components/ui/VerificationBadge';
import { FileExpiryIndicator } from '../components/ui/FileExpiryIndicator';

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';

export interface SwapParticipant {
  userId: string;
  name: string;
  username: string;
  location: string;
  avatar: string;
  bio?: string;
  isVerified?: boolean;
  averageRating?: number | null;
  reviewCount?: number;
  completedSwapsCount?: number;
}

export type MainSection = 'active' | 'listings' | 'history';
export type ActiveSubFilter = 'all' | 'needs_action' | 'in_progress' | 'awaiting_review';
export type HistorySubFilter = 'all' | 'completed' | 'cancelled_expired';

export interface CategorizedSwapItem {
  swap: Swap;
  partner: SwapParticipant;
  isRequester: boolean;
  isParticipant: boolean;
  roleContext: string; // "You requested" | "You are providing" | "Your listing"
  humanStatus: string; // "Awaiting Your Submission", "Awaiting Your Review", "In Progress", "Completed", etc.
  statusCategory: 'action_required' | 'in_progress' | 'awaiting_partner' | 'completed' | 'open_listing' | 'cancelled_expired';
  nextAction: string; // "Submit your work", "Review submitted work", "Waiting for Alex to submit work", etc.
  formattedDate: string;
  formattedTimeLabel: string; // "Accepted on Oct 12" / "Submitted on Oct 14" / "Completed on Oct 15"
  needsAction: boolean;
}

type ActiveSwapsPageProps = {
  onNavigate?: (path: string) => void;
};

export function ActiveSwapsPage({ onNavigate }: ActiveSwapsPageProps) {
  const { user, account, refreshAccount, updateAccountState } = useAuth();
  const journeyScaffold = useScaffolding('active_swaps_journey');

  // Primary Information Architecture Navigation
  const [mainSection, setMainSection] = useState<MainSection>('active');
  const [activeSubFilter, setActiveSubFilter] = useState<ActiveSubFilter>('all');
  const [historySubFilter, setHistorySubFilter] = useState<HistorySubFilter>('all');

  // Categorized Swap Datasets
  const [activeSwaps, setActiveSwaps] = useState<CategorizedSwapItem[]>([]);
  const [myListings, setMyListings] = useState<CategorizedSwapItem[]>([]);
  const [swapHistory, setSwapHistory] = useState<CategorizedSwapItem[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Selected Card ID per view
  const [selectedActiveId, setSelectedActiveId] = useState<string>('');
  const [selectedListingId, setSelectedListingId] = useState<string>('');
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>('');

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
  const [selectedGivenDetailsModal, setSelectedGivenDetailsModal] = useState<CategorizedSwapItem | null>(null);

  // Review Modal state
  const [selectedSwapForReview, setSelectedSwapForReview] = useState<CategorizedSwapItem | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewText, setReviewText] = useState<string>('');
  const [isReviewSubmitting, setIsReviewSubmitting] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewedSwaps, setReviewedSwaps] = useState<Record<string, boolean>>({});

  // Chat Modal state
  const [activeChatSwap, setActiveChatSwap] = useState<CategorizedSwapItem | null>(null);

  const isMountedRef = useRef(true);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastMutationTimestampRef = useRef<number>(0);

  const loadRealActiveSwaps = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await getUserSwaps(user.id);
      if (res.error) {
        setFetchError(res.error);
        setActiveSwaps([]);
        setMyListings([]);
        setSwapHistory([]);
        return;
      }
      const records: SwapRecord[] = res.data || [];
      const canonicalSwaps: Swap[] = records.map(mapSwapRecordToSwap);

      const activeList: CategorizedSwapItem[] = [];
      const listingsList: CategorizedSwapItem[] = [];
      const historyList: CategorizedSwapItem[] = [];

      canonicalSwaps.forEach((swap) => {
        const isRequester = swap.requesterId === user.id;
        const isParticipant = swap.participantId === user.id;

        const partnerProfile = isRequester ? swap.participantProfile : swap.requesterProfile;
        const partnerUserId = isRequester ? (swap.participantId || '') : swap.requesterId;
        const partnerName = partnerProfile?.fullName || (partnerProfile?.username ? `@${partnerProfile.username}` : (isRequester ? 'SkillSwap Provider' : 'SkillSwap Requester'));
        const partnerUsername = partnerProfile?.username || '';
        const partnerAvatar = partnerProfile?.avatarUrl || DEFAULT_AVATAR;
        const partnerLocation = partnerUsername ? `@${partnerUsername}` : 'SkillSwap Network';
        const partnerIsVerified = Boolean(partnerProfile?.isVerified);
        const partnerAvgRating = partnerProfile?.averageRating ?? null;
        const partnerReviewCount = partnerProfile?.reviewCount ?? 0;
        const partnerCompletedSwapsCount = partnerProfile?.completedSwapsCount ?? 0;

        const partnerObj: SwapParticipant = {
          userId: partnerUserId,
          name: partnerName,
          username: partnerUsername,
          location: partnerLocation,
          avatar: partnerAvatar,
          isVerified: partnerIsVerified,
          averageRating: partnerAvgRating,
          reviewCount: partnerReviewCount,
          completedSwapsCount: partnerCompletedSwapsCount,
        };

        const createdDateFormatted = new Date(swap.createdAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

        // 1. OPEN LISTINGS CREATED BY USER
        if (isRequester && swap.status === 'open') {
          listingsList.push({
            swap,
            partner: {
              userId: user.id,
              name: 'You (Listing Creator)',
              username: '',
              location: 'Open Listing',
              avatar: DEFAULT_AVATAR,
            },
            isRequester: true,
            isParticipant: false,
            roleContext: 'Your listing',
            humanStatus: 'Open Listing',
            statusCategory: 'open_listing',
            nextAction: 'Waiting for marketplace applicants',
            formattedDate: createdDateFormatted,
            formattedTimeLabel: `Created on ${createdDateFormatted}`,
            needsAction: false,
          });
          return;
        }

        // Exclude open listings created by others or un-involved swaps
        if (swap.status === 'open' || (!isRequester && !isParticipant)) return;

        // Role context
        const roleContext = isRequester ? 'You requested' : 'You are providing';

        // 2. ACTIVE EXCHANGES (Accepted or Submitted)
        if (swap.status === 'accepted' || swap.status === 'submitted') {
          let humanStatus = '';
          let statusCategory: CategorizedSwapItem['statusCategory'] = 'in_progress';
          let nextAction = '';
          let needsAction = false;
          let formattedTimeLabel = `Accepted on ${createdDateFormatted}`;

          if (swap.status === 'accepted') {
            if (isParticipant) {
              humanStatus = 'Awaiting Your Submission';
              statusCategory = 'action_required';
              nextAction = 'Submit your work when ready';
              needsAction = true;
            } else {
              humanStatus = 'In Progress';
              statusCategory = 'awaiting_partner';
              nextAction = `Waiting for ${partnerName} to submit work`;
              needsAction = false;
            }
          } else if (swap.status === 'submitted') {
            if (swap.submittedAt) {
              formattedTimeLabel = `Submitted on ${new Date(swap.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
            }
            if (isRequester) {
              humanStatus = 'Awaiting Your Review';
              statusCategory = 'action_required';
              nextAction = 'Review submitted work & transfer credits';
              needsAction = true;
            } else {
              humanStatus = 'Submitted (Under Review)';
              statusCategory = 'awaiting_partner';
              nextAction = `Waiting for ${partnerName} to review & approve`;
              needsAction = false;
            }
          }

          activeList.push({
            swap,
            partner: partnerObj,
            isRequester,
            isParticipant,
            roleContext,
            humanStatus,
            statusCategory,
            nextAction,
            formattedDate: createdDateFormatted,
            formattedTimeLabel,
            needsAction,
          });
          return;
        }

        // 3. SWAP HISTORY (Completed, Cancelled, Declined, Withdrawn, Expired)
        if (['completed', 'cancelled', 'declined', 'withdrawn', 'expired'].includes(swap.status)) {
          let humanStatus = 'Completed';
          let statusCategory: CategorizedSwapItem['statusCategory'] = 'completed';
          let nextAction = 'No action required';
          let formattedTimeLabel = `Completed on ${createdDateFormatted}`;

          if (swap.status === 'completed') {
            humanStatus = 'Completed';
            statusCategory = 'completed';
            nextAction = 'Exchange finished';
            if (swap.completedAt) {
              formattedTimeLabel = `Completed on ${new Date(swap.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
            }
          } else {
            const capitalized = swap.status.charAt(0).toUpperCase() + swap.status.slice(1);
            humanStatus = capitalized;
            statusCategory = 'cancelled_expired';
            nextAction = 'Swap closed';
            formattedTimeLabel = `${capitalized} on ${createdDateFormatted}`;
          }

          historyList.push({
            swap,
            partner: partnerObj,
            isRequester,
            isParticipant,
            roleContext,
            humanStatus,
            statusCategory,
            nextAction,
            formattedDate: createdDateFormatted,
            formattedTimeLabel,
            needsAction: false,
          });
        }
      });

      setActiveSwaps(activeList);
      setSelectedActiveId((prev) => (prev && activeList.some((a) => a.swap.id === prev) ? prev : activeList[0]?.swap.id || ''));

      setMyListings(listingsList);
      setSelectedListingId((prev) => (prev && listingsList.some((l) => l.swap.id === prev) ? prev : listingsList[0]?.swap.id || ''));

      setSwapHistory(historyList);
      setSelectedHistoryId((prev) => (prev && historyList.some((h) => h.swap.id === prev) ? prev : historyList[0]?.swap.id || ''));

      // Check review status for completed swaps
      const completedList = historyList.filter((i) => i.swap.status === 'completed');
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

  // Realtime subscription with payload filtering and event deduplication
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerTargetedRefresh = (swapId?: string) => {
      // Ignore realtime events triggered within 3s of user's own optimistic mutation
      if (Date.now() - lastMutationTimestampRef.current < 3000) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        if (!swapId) {
          void loadRealActiveSwaps();
          return;
        }

        // Targeted fetch for affected swap ID
        const { data: updatedRecord } = await getSwapById(swapId);
        if (!updatedRecord) {
          void loadRealActiveSwaps();
          return;
        }

        const updatedSwap = mapSwapRecordToSwap(updatedRecord);
        const isRequester = updatedSwap.requesterId === user.id;
        const isParticipant = updatedSwap.participantId === user.id;

        if (!isRequester && !isParticipant) return;

        // Update single swap in local state without full reload
        setActiveSwaps((prev) =>
          prev.map((item) => (item.swap.id === swapId ? { ...item, swap: updatedSwap } : item))
        );
        setMyListings((prev) =>
          prev.map((item) => (item.swap.id === swapId ? { ...item, swap: updatedSwap } : item))
        );
        setSwapHistory((prev) =>
          prev.map((item) => (item.swap.id === swapId ? { ...item, swap: updatedSwap } : item))
        );
      }, 300);
    };

    const channel = supabase
      .channel(`active_swaps_realtime_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swaps' }, (payload) => {
        const swapId = (payload.new as { id?: string })?.id || (payload.old as { id?: string })?.id;
        triggerTargetedRefresh(swapId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swap_submissions' }, (payload) => {
        const swapId = (payload.new as { swap_id?: string })?.swap_id || (payload.old as { swap_id?: string })?.swap_id;
        if (swapId && swapId === selectedActiveId) {
          void getSwapSubmission(swapId).then((res) => {
            if (res.data) setCurrentSubmission(res.data);
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swap_attachment_files' }, (payload) => {
        const swapId = (payload.new as { swap_id?: string })?.swap_id || (payload.old as { swap_id?: string })?.swap_id;
        if (swapId && swapId === selectedActiveId) {
          void getSwapAttachments(swapId).then((res) => {
            if (res.data) setCreatorAttachments(res.data);
          });
        }
      })
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [user, loadRealActiveSwaps, selectedActiveId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Filter Active Swaps by Sub-Filter
  const filteredActiveSwaps = activeSwaps.filter((item) => {
    if (activeSubFilter === 'needs_action') return item.needsAction;
    if (activeSubFilter === 'in_progress') return item.swap.status === 'accepted';
    if (activeSubFilter === 'awaiting_review') return item.swap.status === 'submitted';
    return true; // 'all'
  });

  // Filter History Swaps by Sub-Filter
  const filteredHistorySwaps = swapHistory.filter((item) => {
    if (historySubFilter === 'completed') return item.swap.status === 'completed';
    if (historySubFilter === 'cancelled_expired') return ['cancelled', 'declined', 'withdrawn', 'expired'].includes(item.swap.status);
    return true; // 'all'
  });

  // Currently selected item getters
  const currentActiveItem = filteredActiveSwaps.find((s) => s.swap.id === selectedActiveId) || filteredActiveSwaps[0] || null;
  const currentListingItem = myListings.find((s) => s.swap.id === selectedListingId) || myListings[0] || null;
  const currentHistoryItem = filteredHistorySwaps.find((s) => s.swap.id === selectedHistoryId) || filteredHistorySwaps[0] || null;

  const currentSelectedItem = mainSection === 'active' ? currentActiveItem : mainSection === 'listings' ? currentListingItem : currentHistoryItem;

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

  const handleOpenChat = (item: CategorizedSwapItem) => {
    setActiveChatSwap(item);
  };

  // ==========================================
  // DOWNLOAD LOGIC (Blob-based Forced Download)
  // ==========================================

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
      setDownloadError(`"${fileName}" is no longer available.`);
      return;
    }

    setDownloadingFileId(fileId);
    setDownloadError(null);

    try {
      const signedUrl = isSubmission
        ? await getSubmissionFileSignedUrl(storagePath)
        : await getSwapAttachmentSignedUrl(storagePath);

      if (!signedUrl) {
        setDownloadError(`"${fileName}" is no longer available.`);
        setDownloadingFileId(null);
        return;
      }

      const res = await downloadFileFromSignedUrl(signedUrl, fileName);
      if (!res.success) {
        setDownloadError(`"${fileName}" is no longer available.`);
      }
    } catch (err) {
      console.error('Download exception:', err);
      setDownloadError(`"${fileName}" is no longer available.`);
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
      const validation = validateAttachmentFile(file);
      if (!validation.valid) {
        setSubmitError(validation.error || `File "${file.name}" is invalid.`);
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
    if (!currentActiveItem || isMutating) return;

    const trimmedNotes = submitWorkNotes.trim();
    if (trimmedNotes.length === 0 && submitWorkFiles.length === 0) {
      setSubmitError('Add an explanation or attach at least one file.');
      return;
    }

    setSubmitError(null);
    setIsMutating(true);

    const tracker = new PerfTracker('submit_work');

    try {
      const res = await submitSwapWorkWithFiles({
        swapId: currentActiveItem.swap.id,
        notes: trimmedNotes,
        files: submitWorkFiles,
      });

      tracker.logPhase('rpc');

      if (!res.success) {
        setSubmitError(res.error || 'Failed to submit work.');
        setIsMutating(false);
        void loadRealActiveSwaps();
        return;
      }

      lastMutationTimestampRef.current = Date.now();

      // Immediately update local state from accepted -> submitted
      const nowIso = new Date().toISOString();
      setActiveSwaps((prev) =>
        prev.map((item) => {
          if (item.swap.id !== currentActiveItem.swap.id) return item;
          const updatedSwap: Swap = {
            ...item.swap,
            status: 'submitted',
            submittedAt: nowIso,
          };
          return {
            ...item,
            swap: updatedSwap,
            humanStatus: item.isRequester ? 'Awaiting Your Review' : 'Submitted (Under Review)',
            statusCategory: item.isRequester ? 'action_required' : 'awaiting_partner',
            nextAction: item.isRequester ? 'Review submitted work & transfer credits' : `Waiting for ${item.partner.name} to review & approve`,
            formattedTimeLabel: `Submitted on ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
            needsAction: item.isRequester,
          };
        })
      );

      // Immediately close modal & show success toast
      setIsSubmitWorkModalOpen(false);
      setSubmitWorkNotes('');
      setSubmitWorkFiles([]);
      setSubmitError(null);
      setIsMutating(false);

      setSubmitSuccessToast(`Work submitted for "${currentActiveItem.swap.topic}"! Your contribution is ready for requester review.`);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) setSubmitSuccessToast(null);
      }, 5000);

      tracker.logPhase('ui_commit');

      // Un-awaited background reconciliation
      void Promise.all([refreshAccount(), loadRealActiveSwaps()]).then(() => {
        tracker.logPhase('reconcile');
      });
    } catch (err) {
      console.error('[SUBMISSION] unexpected error in handleSubmitWork', err);
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred while submitting work.';
      setSubmitError(errorMessage);
      setIsMutating(false);
    }
  };

  const isExecutingReleaseRef = useRef<boolean>(false);

  const commitReleaseSwap = useCallback(
    async (item: CategorizedSwapItem) => {
      if (isExecutingReleaseRef.current) return;
      isExecutingReleaseRef.current = true;
      setIsMutating(true);

      const tracker = new PerfTracker('complete_swap');

      try {
        const res = await completeCreditSwap(item.swap.id);
        tracker.logPhase('rpc');

        if (!res.success) {
          setIsMutating(false);
          setSubmitSuccessToast(res.error || 'Failed to complete swap and settle credits.');
          void loadRealActiveSwaps();
          return;
        }

        lastMutationTimestampRef.current = Date.now();

        // Immediately update local state to completed
        const completedDate = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const completedItem: CategorizedSwapItem = {
          ...item,
          swap: {
            ...item.swap,
            status: 'completed',
            completedAt: new Date().toISOString(),
          },
          humanStatus: 'Completed',
          statusCategory: 'completed',
          nextAction: 'Exchange finished',
          formattedTimeLabel: `Completed on ${completedDate}`,
          needsAction: false,
        };

        setActiveSwaps((prev) => prev.filter((s) => s.swap.id !== item.swap.id));
        setSwapHistory((prev) => [completedItem, ...prev]);

        // Immediately update credit balance from returned RPC response
        if (item.isRequester && typeof res.payer_credits_balance === 'number') {
          updateAccountState({
            credits_balance: res.payer_credits_balance,
            credits_reserved: res.payer_credits_reserved ?? 0,
          });
        } else if (item.isParticipant && typeof res.recipient_credits_balance === 'number') {
          updateAccountState({
            credits_balance: res.recipient_credits_balance,
          });
        }

        setIsMutating(false);
        setSubmitSuccessToast(
          `Swap completed! You exchanged expertise on "${item.swap.topic}" with ${item.partner.name} and settled ${item.swap.creditAmount} SkillCredits.`
        );

        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) setSubmitSuccessToast(null);
        }, 5000);

        tracker.logPhase('ui_commit');

        // Un-awaited background reconciliation
        void Promise.all([refreshAccount(), loadRealActiveSwaps()]).then(() => {
          tracker.logPhase('reconcile');
        });
      } catch (err) {
        setIsMutating(false);
        setSubmitSuccessToast(err instanceof Error ? err.message : 'An error occurred while settling credits.');
      } finally {
        isExecutingReleaseRef.current = false;
      }
    },
    [refreshAccount, loadRealActiveSwaps, updateAccountState]
  );

  const handleApproveGivenSwap = (item: CategorizedSwapItem) => {
    if (isMutating || isExecutingReleaseRef.current) return;
    void commitReleaseSwap(item);
  };

  // Undo state for listing cancellation
  const [undoCancelItem, setUndoCancelItem] = useState<{ item: CategorizedSwapItem; seconds: number } | null>(null);
  const undoCancelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleCancelOpenSwap = async (item: CategorizedSwapItem) => {
    if (isMutating) return;

    setIsMutating(true);
    const tracker = new PerfTracker('cancel_swap');

    try {
      const res = await cancelCreditSwap(item.swap.id);
      tracker.logPhase('rpc');

      if (!res.success) {
        setIsMutating(false);
        setSubmitSuccessToast(res.error || 'Failed to cancel swap listing.');
        return;
      }

      lastMutationTimestampRef.current = Date.now();

      // Immediately reflect closed status in local state
      const cancelledItem: CategorizedSwapItem = {
        ...item,
        swap: {
          ...item.swap,
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
        },
        humanStatus: 'Cancelled',
        statusCategory: 'cancelled_expired',
        nextAction: 'Swap closed',
        needsAction: false,
      };

      setMyListings((prev) => prev.filter((l) => l.swap.id !== item.swap.id));
      setSwapHistory((prev) => [cancelledItem, ...prev]);

      // Immediately reflect returned requester balance/reserved state
      if (typeof res.credits_balance === 'number') {
        updateAccountState({
          credits_balance: res.credits_balance,
          credits_reserved: res.credits_reserved ?? 0,
        });
      }

      setIsMutating(false);
      tracker.logPhase('ui_commit');

      // Un-awaited background reconciliation
      void Promise.all([refreshAccount(), loadRealActiveSwaps()]).then(() => {
        tracker.logPhase('reconcile');
      });

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
    } catch (err) {
      setIsMutating(false);
      setSubmitSuccessToast(err instanceof Error ? err.message : 'An error occurred while cancelling listing.');
    }
  };

  // Helper for rendering status badge with icon and semantic styling
  const renderStatusBadge = (item: CategorizedSwapItem) => {
    let icon = '●';
    let badgeClass = 'as-status-badge--in-progress';

    if (item.statusCategory === 'action_required') {
      icon = '⚡';
      badgeClass = 'as-status-badge--action';
    } else if (item.statusCategory === 'awaiting_partner') {
      icon = '⏳';
      badgeClass = 'as-status-badge--waiting';
    } else if (item.statusCategory === 'completed') {
      icon = '✓';
      badgeClass = 'as-status-badge--completed';
    } else if (item.statusCategory === 'open_listing') {
      icon = '📋';
      badgeClass = 'as-status-badge--open';
    } else if (item.statusCategory === 'cancelled_expired') {
      icon = '✕';
      badgeClass = 'as-status-badge--cancelled';
    }

    return (
      <span className={`as-status-badge ${badgeClass}`}>
        <span aria-hidden="true" style={{ marginRight: '0.25rem' }}>{icon}</span>
        {item.humanStatus}
      </span>
    );
  };

  return (
    <div className="page-shell active-swaps-shell">
      <Navbar onNavigate={onNavigate} currentPath="/active-swaps" />

      <main className="active-swaps-page">
        {/* PAGE HEADER */}
        <header className="active-swaps-header">
          <h1 className="active-swaps-title">Swap Workspace</h1>
          <p className="active-swaps-subtitle">Track active exchanges, review deliverables, and manage open marketplace listings.</p>
        </header>

        {/* EMPOWERED JOURNEY CAPITAL SUMMARY BANNER */}
        {journeyScaffold.shouldShow ? (
          <div className="as-journey-banner">
            <div className="as-journey-icon" aria-hidden="true">⚡</div>
            <div className="as-journey-text-group" style={{ flex: 1 }}>
              <span className="as-journey-label">YOUR SKILLSWAP JOURNEY IS UNDERWAY</span>
              <strong className="as-journey-balance">
                Available Trading Capital: {account?.credits_balance ?? 0} SkillCredits
              </strong>
              <p className="as-journey-subtext">
                Your exchange capital is active in your ledger. You have already started — request new expertise or complete active swaps to build your skills portfolio.
              </p>
            </div>
            <button
              type="button"
              className="scaffolding-dismiss-btn"
              title="Don't show this again"
              aria-label="Don't show this onboarding banner again"
              onClick={journeyScaffold.dismissScaffold}
              style={{
                alignSelf: 'flex-start',
                background: 'transparent',
                border: '1px solid var(--color-structure-border, rgba(148, 163, 184, 0.25))',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--color-text-muted, var(--text-muted))',
                padding: '0.2rem 0.5rem',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
              }}
            >
              Don't show this again
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
            <button
              type="button"
              className="reset-filter-btn"
              onClick={journeyScaffold.toggleExpanded}
              style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '6px' }}
            >
              💡 Show Onboarding Capital Info
            </button>
          </div>
        )}


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

        {/* 5-SECOND TRANSACTIONAL UNDO TOAST FOR LISTING CANCELLATION */}
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

        {/* TOP-LEVEL PRIMARY INFORMATION ARCHITECTURE SELECTION */}
        <nav className="as-main-nav" aria-label="Swap categories navigation">
          <button
            type="button"
            className={`as-main-nav-btn ${mainSection === 'active' ? 'as-main-nav-btn--active' : ''}`}
            onClick={() => setMainSection('active')}
          >
            <span className="as-main-nav-icon" aria-hidden="true">⚡</span>
            <span>Active Swaps</span>
            <span className="as-main-nav-badge">{activeSwaps.length}</span>
          </button>

          <button
            type="button"
            className={`as-main-nav-btn ${mainSection === 'listings' ? 'as-main-nav-btn--active' : ''}`}
            onClick={() => setMainSection('listings')}
          >
            <span className="as-main-nav-icon" aria-hidden="true">📋</span>
            <span>My Listings</span>
            <span className="as-main-nav-badge">{myListings.length}</span>
          </button>

          <button
            type="button"
            className={`as-main-nav-btn ${mainSection === 'history' ? 'as-main-nav-btn--active' : ''}`}
            onClick={() => setMainSection('history')}
          >
            <span className="as-main-nav-icon" aria-hidden="true">📜</span>
            <span>Swap History</span>
            <span className="as-main-nav-badge">{swapHistory.length}</span>
          </button>
        </nav>

        {/* MAIN WORKSPACE LAYOUT */}
        <div className="active-swaps-workspace">
          {/* LEFT PANEL: LIST VIEW */}
          <section className="as-left-panel" aria-label="Swaps navigation list">
            {/* SECTION SUB-FILTERS */}
            {mainSection === 'active' && (
              <div className="as-subfilters-bar" role="tablist" aria-label="Active swap status filters">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSubFilter === 'all'}
                  className={`as-subfilter-chip ${activeSubFilter === 'all' ? 'as-subfilter-chip--active' : ''}`}
                  onClick={() => setActiveSubFilter('all')}
                >
                  All ({activeSwaps.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSubFilter === 'needs_action'}
                  className={`as-subfilter-chip ${activeSubFilter === 'needs_action' ? 'as-subfilter-chip--active' : ''}`}
                  onClick={() => setActiveSubFilter('needs_action')}
                >
                  ⚡ Needs Action ({activeSwaps.filter((s) => s.needsAction).length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSubFilter === 'in_progress'}
                  className={`as-subfilter-chip ${activeSubFilter === 'in_progress' ? 'as-subfilter-chip--active' : ''}`}
                  onClick={() => setActiveSubFilter('in_progress')}
                >
                  In Progress ({activeSwaps.filter((s) => s.swap.status === 'accepted').length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSubFilter === 'awaiting_review'}
                  className={`as-subfilter-chip ${activeSubFilter === 'awaiting_review' ? 'as-subfilter-chip--active' : ''}`}
                  onClick={() => setActiveSubFilter('awaiting_review')}
                >
                  Awaiting Review ({activeSwaps.filter((s) => s.swap.status === 'submitted').length})
                </button>
              </div>
            )}

            {mainSection === 'history' && (
              <div className="as-subfilters-bar" role="tablist" aria-label="Swap history filters">
                <button
                  type="button"
                  role="tab"
                  aria-selected={historySubFilter === 'all'}
                  className={`as-subfilter-chip ${historySubFilter === 'all' ? 'as-subfilter-chip--active' : ''}`}
                  onClick={() => setHistorySubFilter('all')}
                >
                  All History ({swapHistory.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={historySubFilter === 'completed'}
                  className={`as-subfilter-chip ${historySubFilter === 'completed' ? 'as-subfilter-chip--active' : ''}`}
                  onClick={() => setHistorySubFilter('completed')}
                >
                  Completed ({swapHistory.filter((s) => s.swap.status === 'completed').length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={historySubFilter === 'cancelled_expired'}
                  className={`as-subfilter-chip ${historySubFilter === 'cancelled_expired' ? 'as-subfilter-chip--active' : ''}`}
                  onClick={() => setHistorySubFilter('cancelled_expired')}
                >
                  Cancelled / Expired ({swapHistory.filter((s) => ['cancelled', 'declined', 'withdrawn', 'expired'].includes(s.swap.status)).length})
                </button>
              </div>
            )}

            {/* SWAP CARDS LIST */}
            <div className="as-list-container">
              {isLoading ? (
                <div className="as-empty-state"><p>Loading swaps...</p></div>
              ) : fetchError ? (
                <div className="as-empty-state">
                  <p style={{ color: 'var(--color-error)' }}>{fetchError}</p>
                  <button type="button" className="as-btn as-btn--secondary" onClick={loadRealActiveSwaps} style={{ marginTop: '0.5rem' }}>
                    Retry
                  </button>
                </div>
              ) : mainSection === 'active' ? (
                filteredActiveSwaps.length === 0 ? (
                  <div className="as-empty-state">
                    <p>
                      {activeSubFilter === 'needs_action'
                        ? 'No active swaps require your immediate action.'
                        : activeSubFilter === 'in_progress'
                        ? 'No active swaps currently in progress.'
                        : activeSubFilter === 'awaiting_review'
                        ? 'No submitted swaps awaiting review.'
                        : 'No active swaps found. Accept a swap from the marketplace to get started!'}
                    </p>
                    {activeSubFilter !== 'all' && (
                      <button type="button" className="as-btn as-btn--secondary" onClick={() => setActiveSubFilter('all')} style={{ marginTop: '0.5rem' }}>
                        View All Active Swaps
                      </button>
                    )}
                  </div>
                ) : (
                  filteredActiveSwaps.map((item) => {
                    const isSelected = item.swap.id === selectedActiveId;

                    return (
                      <div
                        key={item.swap.id}
                        tabIndex={0}
                        role="button"
                        aria-pressed={isSelected}
                        className={`as-list-card ${isSelected ? 'as-list-card--selected' : ''} ${item.needsAction ? 'as-list-card--action-required' : ''}`}
                        onClick={() => setSelectedActiveId(item.swap.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedActiveId(item.swap.id);
                          }
                        }}
                      >
                        {/* 1. Partner Header */}
                        <div className="as-card-header-row">
                          <div className="as-card-user">
                            <img src={item.partner.avatar} alt={item.partner.name} className="as-card-avatar" />
                            <div className="as-card-user-meta">
                              <span className="as-card-user-name">{item.partner.name}</span>
                              <span className="as-card-role-context">{item.roleContext}</span>
                            </div>
                          </div>
                          {renderStatusBadge(item)}
                        </div>

                        {/* 2. Topic & Credits */}
                        <div className="as-card-body">
                          <h3 className="as-card-title">{item.swap.topic}</h3>
                          <div className="as-card-meta-row">
                            <span className="as-card-credits">{item.swap.creditAmount} SkillCredits</span>
                            <span className="as-card-time">{item.formattedTimeLabel}</span>
                          </div>
                        </div>

                        {/* 3. Next Action / Responsibility */}
                        <div className="as-card-next-action">
                          <span className="as-action-icon" aria-hidden="true">
                            {item.needsAction ? '⚡' : '👉'}
                          </span>
                          <span className="as-action-text">{item.nextAction}</span>
                        </div>
                      </div>
                    );
                  })
                )
              ) : mainSection === 'listings' ? (
                myListings.length === 0 ? (
                  <div className="as-empty-state">
                    <p>No open swap listings created yet.</p>
                    {onNavigate && (
                      <button type="button" className="as-btn as-btn--primary" onClick={() => onNavigate('/create-swap')} style={{ marginTop: '0.5rem' }}>
                        Create a Swap
                      </button>
                    )}
                  </div>
                ) : (
                  myListings.map((item) => {
                    const isSelected = item.swap.id === selectedListingId;

                    return (
                      <div
                        key={item.swap.id}
                        tabIndex={0}
                        role="button"
                        aria-pressed={isSelected}
                        className={`as-list-card ${isSelected ? 'as-list-card--selected' : ''}`}
                        onClick={() => setSelectedListingId(item.swap.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedListingId(item.swap.id);
                          }
                        }}
                      >
                        <div className="as-card-header-row">
                          <div className="as-card-user">
                            <div className="as-card-user-meta">
                              <span className="as-card-role-context">Your Listing</span>
                              <span className="as-card-user-name" style={{ fontSize: '1rem', fontWeight: 700 }}>{item.swap.topic}</span>
                            </div>
                          </div>
                          {renderStatusBadge(item)}
                        </div>

                        <div className="as-card-body">
                          <div className="as-card-meta-row">
                            <span className="as-card-credits">{item.swap.creditAmount} SkillCredits</span>
                            <span className="as-card-time">{item.formattedTimeLabel}</span>
                          </div>
                        </div>

                        <div className="as-card-next-action">
                          <span className="as-action-icon" aria-hidden="true">🌐</span>
                          <span className="as-action-text">Listing active on public marketplace</span>
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                filteredHistorySwaps.length === 0 ? (
                  <div className="as-empty-state">
                    <p>No historical swaps found.</p>
                  </div>
                ) : (
                  filteredHistorySwaps.map((item) => {
                    const isSelected = item.swap.id === selectedHistoryId;

                    return (
                      <div
                        key={item.swap.id}
                        tabIndex={0}
                        role="button"
                        aria-pressed={isSelected}
                        className={`as-list-card ${isSelected ? 'as-list-card--selected' : ''}`}
                        onClick={() => setSelectedHistoryId(item.swap.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedHistoryId(item.swap.id);
                          }
                        }}
                      >
                        <div className="as-card-header-row">
                          <div className="as-card-user">
                            <img src={item.partner.avatar} alt={item.partner.name} className="as-card-avatar" />
                            <div className="as-card-user-meta">
                              <span className="as-card-user-name">{item.partner.name}</span>
                              <span className="as-card-role-context">{item.roleContext}</span>
                            </div>
                          </div>
                          {renderStatusBadge(item)}
                        </div>

                        <div className="as-card-body">
                          <h3 className="as-card-title">{item.swap.topic}</h3>
                          <div className="as-card-meta-row">
                            <span className="as-card-credits">{item.swap.creditAmount} SkillCredits</span>
                            <span className="as-card-time">{item.formattedTimeLabel}</span>
                          </div>
                        </div>

                        <div className="as-card-next-action">
                          <span className="as-action-icon" aria-hidden="true">📜</span>
                          <span className="as-action-text">{item.nextAction}</span>
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

            {currentSelectedItem ? (
              <div className="as-detail-card">
                {/* PARTICIPANT HEADER */}
                <div className="as-detail-participant-header">
                  <div className="as-detail-user-group">
                    {mainSection !== 'listings' && (
                      <img
                        src={currentSelectedItem.partner.avatar}
                        alt={`Profile photo of ${currentSelectedItem.partner.name}`}
                        className="as-detail-avatar swap-avatar-ring"
                      />
                    )}
                    <div className="as-detail-user-info">
                      <div className="as-detail-name-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <h2 className="as-detail-user-name" style={{ margin: 0 }}>{currentSelectedItem.partner.name}</h2>
                        {mainSection !== 'listings' && (
                          <>
                            <VerificationBadge isVerified={currentSelectedItem.partner.isVerified} size="sm" />
                            <button
                              type="button"
                              className="as-view-profile-link"
                              onClick={() => setSelectedProfileModal(currentSelectedItem.partner)}
                            >
                              View Profile
                            </button>
                          </>
                        )}
                      </div>
                      {mainSection !== 'listings' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.15rem', fontSize: '0.775rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: (currentSelectedItem.partner.reviewCount ?? 0) > 0 ? 600 : 400, color: (currentSelectedItem.partner.reviewCount ?? 0) > 0 ? '#d97706' : 'var(--text-muted)' }}>
                            {(currentSelectedItem.partner.reviewCount ?? 0) > 0 && currentSelectedItem.partner.averageRating !== null && currentSelectedItem.partner.averageRating !== undefined
                              ? `★ ${currentSelectedItem.partner.averageRating.toFixed(1)} (${currentSelectedItem.partner.reviewCount} ${(currentSelectedItem.partner.reviewCount ?? 0) === 1 ? 'review' : 'reviews'})`
                              : 'No reviews yet'}
                          </span>
                          <span style={{ opacity: 0.4 }} aria-hidden="true">•</span>
                          <span>
                            <strong>{currentSelectedItem.partner.completedSwapsCount ?? 0}</strong> {(currentSelectedItem.partner.completedSwapsCount ?? 0) === 1 ? 'completed swap' : 'completed swaps'}
                          </span>
                        </div>
                      )}
                      <p className="as-detail-user-location" style={{ marginTop: '0.1rem' }}>
                        {currentSelectedItem.roleContext} • {currentSelectedItem.partner.location}
                      </p>
                    </div>
                  </div>

                  {renderStatusBadge(currentSelectedItem)}
                </div>

                {/* SWAP TITLE & DESCRIPTION */}
                <div className="as-detail-title-section">
                  <h3 className="as-detail-swap-title">{currentSelectedItem.swap.topic}</h3>
                  <p className="as-detail-swap-desc">{currentSelectedItem.swap.description}</p>
                </div>

                {/* TAGS */}
                {currentSelectedItem.swap.tags.length > 0 && (
                  <div className="as-detail-section" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                    <h4 className="as-section-subheading">Tags</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                      {currentSelectedItem.swap.tags.map((tag) => (
                        <span key={tag} className="swap-tag" style={{ cursor: 'default' }}>
                          {getTagLabel(tag)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* PENDING TRANSACTION VAULT DISPLAY */}
                <PendingTransactionVault
                  creditAmount={currentSelectedItem.swap.creditAmount}
                  status={currentSelectedItem.swap.status}
                  compact
                />

                {/* HORIZONTAL STATS ROW */}
                <div className="as-stats-row">
                  <div className="as-stat-item">
                    <span className="as-stat-label">SkillCredits Allocation</span>
                    <strong className="as-stat-value">{currentSelectedItem.swap.creditAmount} SkillCredits</strong>
                  </div>
                  <div className="as-stat-item">
                    <span className="as-stat-label">Timeline Anchor</span>
                    <strong className="as-stat-value">{currentSelectedItem.formattedTimeLabel}</strong>
                  </div>
                  <div className="as-stat-item">
                    <span className="as-stat-label">Next Action</span>
                    <strong className="as-stat-value" style={{ color: currentSelectedItem.needsAction ? '#d97706' : 'inherit' }}>
                      {currentSelectedItem.nextAction}
                    </strong>
                  </div>
                </div>

                {/* REQUIREMENTS */}
                <div className="as-detail-section">
                  <h4 className="as-section-subheading">Requirements & Guidelines</h4>
                  <p className="as-section-body-text">{currentSelectedItem.swap.requirements || currentSelectedItem.swap.description}</p>
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
                        Creator Attachments ({creatorAttachments.length})
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
                          const isAttExpired = getFileExpiryStatus(
                            att.expiresAt ?? att.storageExpiresAt,
                            att.deletedAt ?? att.storageDeletedAt ?? att.deleteStatus ?? att.storageDeleteStatus
                          ).isExpired;

                          return (
                            <div key={att.id} className="attachment-card" style={{ flexWrap: 'wrap' }}>
                              <div className="attachment-info">
                                <span style={{ fontSize: '1.2rem', marginRight: '0.25rem' }}>📎</span>
                                <div className="attachment-details">
                                  <span className="attachment-name" title={att.fileName}>{att.fileName}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {att.fileSize ? (
                                      <span className="attachment-size">{(att.fileSize / 1024).toFixed(1)} KB</span>
                                    ) : null}
                                    <FileExpiryIndicator
                                      lifecycle={att}
                                      inline
                                    />
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="as-btn as-btn--secondary"
                                style={{ padding: '0.35rem 0.85rem', fontSize: '0.825rem' }}
                                disabled={isDownloading || isAttExpired}
                                onClick={() => handleDownloadFile(att.storagePath, att.fileName, att.id, false, att.expiresAt ?? att.storageExpiresAt, att.deletedAt ?? att.storageDeletedAt ?? att.deleteStatus ?? att.storageDeleteStatus)}
                              >
                                {isAttExpired ? 'Unavailable' : isDownloading ? 'Downloading...' : 'Download'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* CANONICAL TRANSACTION LIFECYCLE PROGRESS */}
                <TransactionProgress
                  swapId={currentSelectedItem.swap.id}
                  status={currentSelectedItem.swap.status}
                  autoReleaseAt={currentSelectedItem.swap.autoReleaseAt}
                  submittedAt={currentSelectedItem.swap.submittedAt}
                  completedAt={currentSelectedItem.swap.completedAt}
                  creditAmount={currentSelectedItem.swap.creditAmount}
                  autoReleaseDays={7}
                />

                {/* SUBMITTED DELIVERABLES (For Active & History swaps) */}
                {mainSection !== 'listings' && (
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
                                const isFileExpired = getFileExpiryStatus(
                                  file.expiresAt ?? file.storageExpiresAt,
                                  file.deletedAt ?? file.storageDeletedAt ?? file.deleteStatus ?? file.storageDeleteStatus
                                ).isExpired;

                                return (
                                  <div key={file.id} className="attachment-card" style={{ flexWrap: 'wrap' }}>
                                    <div className="attachment-info">
                                      <span style={{ fontSize: '1.2rem', marginRight: '0.25rem' }}>📎</span>
                                      <div className="attachment-details">
                                        <span className="attachment-name" title={file.fileName}>{file.fileName}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                          {file.fileSize ? (
                                            <span className="attachment-size">{(file.fileSize / 1024).toFixed(1)} KB</span>
                                          ) : null}
                                          <FileExpiryIndicator
                                            lifecycle={file}
                                            inline
                                          />
                                        </div>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      className="as-btn as-btn--secondary"
                                      style={{ padding: '0.35rem 0.85rem', fontSize: '0.825rem' }}
                                      disabled={isDownloading || isFileExpired}
                                      onClick={() => handleDownloadFile(file.storagePath, file.fileName, file.id, true, file.expiresAt ?? file.storageExpiresAt, file.deletedAt ?? file.storageDeletedAt ?? file.deleteStatus ?? file.storageDeleteStatus)}
                                    >
                                      {isFileExpired ? 'Unavailable' : isDownloading ? 'Downloading...' : 'Download'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="as-section-body-text">
                        {currentSelectedItem.swap.status === 'accepted'
                          ? currentSelectedItem.isParticipant
                            ? 'Your deliverables are not submitted yet. Use "Submit Work" below when ready.'
                            : 'Waiting for partner to submit work deliverables.'
                          : 'No submission record found.'}
                      </p>
                    )}
                  </div>
                )}

                {/* MAJOR ACTION BUTTONS */}
                <div className="as-detail-actions-row">
                  {mainSection === 'active' && (
                    <>
                      {/* PARTICIPANT ACTION: SUBMIT WORK */}
                      {currentSelectedItem.isParticipant && currentSelectedItem.swap.status === 'accepted' && (
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

                      {/* REQUESTER ACTION: APPROVE WORK & TRANSFER CREDITS */}
                      {currentSelectedItem.isRequester && currentSelectedItem.swap.status === 'submitted' && (
                        <button
                          type="button"
                          className="as-btn as-btn--primary"
                          disabled={isMutating || submissionLoading || !currentSubmission}
                          onClick={() => handleApproveGivenSwap(currentSelectedItem)}
                        >
                          {isMutating ? 'Settling...' : 'Approve Work & Transfer Credits'}
                        </button>
                      )}

                      {/* WAITING STATES */}
                      {currentSelectedItem.isRequester && currentSelectedItem.swap.status === 'accepted' && (
                        <span className="as-status-badge as-status-badge--large as-status-badge--waiting">
                          Waiting for Partner Submission
                        </span>
                      )}

                      {currentSelectedItem.isParticipant && currentSelectedItem.swap.status === 'submitted' && (
                        <span className="as-status-badge as-status-badge--large as-status-badge--waiting">
                          Submitted (Awaiting Requester Review)
                        </span>
                      )}

                      <button
                        type="button"
                        className="as-btn as-btn--secondary"
                        onClick={() => handleOpenChat(currentSelectedItem)}
                      >
                        Workspace &amp; Chat
                      </button>
                    </>
                  )}

                  {mainSection === 'listings' && (
                    <button
                      type="button"
                      className="as-btn as-btn--secondary"
                      disabled={isMutating}
                      style={{ color: 'var(--color-error)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                      onClick={() => handleCancelOpenSwap(currentSelectedItem)}
                    >
                      {isMutating ? 'Cancelling...' : 'Cancel Listing'}
                    </button>
                  )}

                  {mainSection === 'history' && (
                    <>
                      <span className="as-status-badge as-status-badge--large as-status-badge--completed">
                        {currentSelectedItem.humanStatus}
                      </span>

                      {currentSelectedItem.swap.status === 'completed' && (
                        reviewedSwaps[currentSelectedItem.swap.id] ? (
                          <span className="as-status-badge as-status-badge--completed" style={{ background: 'rgba(214, 166, 74, 0.12)', color: '#a8781d' }}>
                            ★ Review Submitted
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="as-btn as-btn--primary"
                            style={{ background: '#a8781d', borderColor: '#a8781d' }}
                            onClick={() => {
                              setSelectedSwapForReview(currentSelectedItem);
                              setReviewRating(5);
                              setReviewText('');
                              setReviewError(null);
                            }}
                          >
                            ★ Leave a Review
                          </button>
                        )
                      )}

                      <button
                        type="button"
                        className="as-btn as-btn--secondary"
                        onClick={() => handleOpenChat(currentSelectedItem)}
                      >
                        View Chat History
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="as-detail-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
                <p style={{ color: 'var(--text-secondary)' }}>
                  {mainSection === 'active'
                    ? 'No active swaps available.'
                    : mainSection === 'listings'
                    ? 'No open listings created.'
                    : 'No historical swaps found.'}
                </p>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* SUBMIT WORK MODAL */}
      {isSubmitWorkModalOpen && currentActiveItem && (
        <div className="modal-overlay" onClick={() => !isMutating && setIsSubmitWorkModalOpen(false)}>
          <div className="modal-content as-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <div>
                <h3 className="chat-title">Submit Work for {currentActiveItem.swap.topic}</h3>
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

                <input
                  ref={fileInputRef}
                  id="submit-file-input"
                  type="file"
                  multiple
                  accept=".pdf,.txt,.csv,.zip,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.webp,.gif"
                  style={{ display: 'none' }}
                  onChange={handleFileSelectChange}
                  onClick={(e) => e.stopPropagation()}
                />

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
              <img src={selectedProfileModal.avatar} alt={`Profile photo of ${selectedProfileModal.name}`} className="as-modal-avatar swap-avatar-ring" />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <h3 className="as-modal-title" style={{ margin: 0 }}>{selectedProfileModal.name}</h3>
                  <VerificationBadge isVerified={selectedProfileModal.isVerified} size="sm" />
                </div>
                <p className="as-modal-subtitle">{selectedProfileModal.location}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: (selectedProfileModal.reviewCount ?? 0) > 0 ? 600 : 400, color: (selectedProfileModal.reviewCount ?? 0) > 0 ? '#d97706' : 'var(--text-muted)' }}>
                    {(selectedProfileModal.reviewCount ?? 0) > 0 && selectedProfileModal.averageRating !== null && selectedProfileModal.averageRating !== undefined
                      ? `★ ${selectedProfileModal.averageRating.toFixed(1)} (${selectedProfileModal.reviewCount} ${selectedProfileModal.reviewCount === 1 ? 'review' : 'reviews'})`
                      : 'No reviews yet'}
                  </span>
                  <span style={{ opacity: 0.4 }} aria-hidden="true">•</span>
                  <span>
                    <strong>{selectedProfileModal.completedSwapsCount ?? 0}</strong> {(selectedProfileModal.completedSwapsCount ?? 0) === 1 ? 'completed swap' : 'completed swaps'}
                  </span>
                </div>
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

      {/* VIEW DETAILS MODAL */}
      {selectedGivenDetailsModal && (
        <div className="modal-overlay" onClick={() => setSelectedGivenDetailsModal(null)}>
          <div className="modal-content as-profile-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <h3 className="chat-title">Swap Details</h3>
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
                <span>Partner:</span>
                <strong>{selectedGivenDetailsModal.partner.name} ({selectedGivenDetailsModal.partner.location})</strong>
              </div>
              <div className="as-detail-row">
                <span>Topic:</span>
                <strong>{selectedGivenDetailsModal.swap.topic}</strong>
              </div>
              <div className="as-detail-row">
                <span>SkillCredits:</span>
                <strong>{selectedGivenDetailsModal.swap.creditAmount} SkillCredits</strong>
              </div>
              <div className="as-detail-row">
                <span>Timeline:</span>
                <strong>{selectedGivenDetailsModal.formattedTimeLabel}</strong>
              </div>
              <div className="as-detail-row">
                <span>Status:</span>
                <span>{renderStatusBadge(selectedGivenDetailsModal)}</span>
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
