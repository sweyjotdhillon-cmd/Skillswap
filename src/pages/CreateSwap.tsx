import { useState, useEffect, useRef } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { CreateSwapHeader } from '../components/create-swap/CreateSwapHeader';
import { TopicField } from '../components/create-swap/TopicField';
import { TagSelectionField } from '../components/create-swap/TagSelectionField';
import { DescriptionField } from '../components/create-swap/DescriptionField';
import { AttachmentUploader, AttachmentItem } from '../components/create-swap/AttachmentUploader';
import { CreditsInput } from '../components/create-swap/CreditsInput';
import { RequirementsField } from '../components/create-swap/RequirementsField';
import { AdditionalMessageField } from '../components/create-swap/AdditionalMessageField';
import { CreateSwapActions } from '../components/create-swap/CreateSwapActions';
import { SwapPreviewCard } from '../components/create-swap/SwapPreviewCard';
import { useAuth } from '../context/AuthContext';
import { createCreditSwap, uploadSwapAttachments, cancelCreditSwap } from '../lib/supabase/credits';
import { generateUUID } from '../lib/uuid';

export interface CreateSwapFormState {
  topic: string;
  tags: string[];
  description: string;
  attachments: AttachmentItem[];
  credits: string;
  requirements: string;
  additionalMessage: string;
}

export interface FormErrors {
  topic?: string;
  tags?: string;
  description?: string;
  credits?: string;
  requirements?: string;
}

type CreateSwapPageProps = {
  onNavigate?: (path: string) => void;
};

export function CreateSwapPage({ onNavigate }: CreateSwapPageProps) {
  const { user, account, refreshAccount } = useAuth();
  const draftKey = user ? `skillswap_create_swap_draft_${user.id}` : 'skillswap_create_swap_draft_guest';

  const [formState, setFormState] = useState<CreateSwapFormState>(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          topic: parsed.topic || '',
          tags: Array.isArray(parsed.tags) ? parsed.tags : [],
          description: parsed.description || '',
          attachments: [],
          credits: parsed.credits || '',
          requirements: parsed.requirements || '',
          additionalMessage: parsed.additionalMessage || '',
        };
      }
    } catch {
      // Ignore JSON parse errors
    }
    return {
      topic: '',
      tags: [],
      description: '',
      attachments: [],
      credits: '',
      requirements: '',
      additionalMessage: '',
    };
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeIdempotencyKeyRef = useRef<string | null>(null);
  const [createdSwapResult, setCreatedSwapResult] = useState<{ swapId: string; topic: string; creditAmount: number } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'info'; text: string } | null>(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        const hasContent = Boolean(
          (parsed.topic && parsed.topic.trim()) ||
          (parsed.description && parsed.description.trim()) ||
          (parsed.credits && parsed.credits.trim()) ||
          (parsed.requirements && parsed.requirements.trim()) ||
          (parsed.additionalMessage && parsed.additionalMessage.trim())
        );
        if (hasContent) {
          return { type: 'info', text: 'Restored your previously saved draft.' };
        }
      }
    } catch {
      // Ignore parse error
    }
    return null;
  });
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (statusMessage?.text === 'Restored your previously saved draft.') {
      statusTimerRef.current = setTimeout(() => setStatusMessage(null), 4000);
    }
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, [statusMessage]);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formState.topic.trim()) {
      newErrors.topic = 'Please add a topic.';
    }

    if (!formState.tags || formState.tags.length === 0) {
      newErrors.tags = 'Please select at least one tag.';
    }

    if (!formState.description.trim()) {
      newErrors.description = 'Please describe your swap.';
    }

    if (!formState.credits.trim()) {
      newErrors.credits = "Enter the number of credits you're offering.";
    } else {
      const parsed = parseInt(formState.credits, 10);
      if (isNaN(parsed) || parsed <= 0) {
        newErrors.credits = 'Credits must be a valid positive number.';
      } else if (account && parsed > account.credits_balance) {
        newErrors.credits = `Insufficient credits balance. You currently have ${account.credits_balance} credits available.`;
      }
    }

    if (!formState.requirements.trim()) {
      newErrors.requirements = 'Describe what participants need to complete.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveDraft = () => {
    try {
      const draftData = {
        topic: formState.topic.trim(),
        tags: formState.tags,
        description: formState.description.trim(),
        credits: formState.credits.trim(),
        requirements: formState.requirements.trim(),
        additionalMessage: formState.additionalMessage.trim(),
      };
      localStorage.setItem(draftKey, JSON.stringify(draftData));
      setStatusMessage({ type: 'info', text: 'Draft saved locally to browser storage!' });
    } catch {
      setStatusMessage({ type: 'info', text: 'Failed to save draft locally.' });
    }
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!user) {
      setErrors((prev) => ({
        ...prev,
        credits: 'You must be logged in to create a swap.',
      }));
      return;
    }

    if (validate()) {
      setIsSubmitting(true);
      if (!activeIdempotencyKeyRef.current) {
        activeIdempotencyKeyRef.current = `swap_create:${generateUUID()}`;
      }
      const amount = parseInt(formState.credits, 10);
      const topicTitle = formState.topic.trim();
      const res = await createCreditSwap({
        topic: topicTitle,
        description: formState.description.trim(),
        requirements: formState.requirements.trim(),
        creditAmount: amount,
        tags: formState.tags,
        additionalMessage: formState.additionalMessage.trim(),
        idempotencyKey: activeIdempotencyKeyRef.current,
      });

      if (!res.success || !res.swapId) {
        setErrors((prev) => ({
          ...prev,
          credits: res.error || 'Failed to reserve credits. Please try again.',
        }));
        setIsSubmitting(false);
        return;
      }

      const createdId = res.swapId;

      // Upload creator attachments if selected
      const rawFiles = formState.attachments
        .map((att) => att.file)
        .filter((f): f is File => Boolean(f));

      if (rawFiles.length > 0) {
        const uploadRes = await uploadSwapAttachments(createdId, rawFiles);
        if (!uploadRes.success) {
          // Roll back newly created swap on attachment failure
          await cancelCreditSwap(createdId);
          setErrors((prev) => ({
            ...prev,
            credits: uploadRes.error || 'Failed to upload attachments. Swap creation was safely rolled back.',
          }));
          setIsSubmitting(false);
          return;
        }
      }

      await refreshAccount();

      try {
        localStorage.removeItem(draftKey);
      } catch {
        // ignore
      }
      activeIdempotencyKeyRef.current = null;

      // Reset form state to clear draft
      setFormState({
        topic: '',
        tags: [],
        description: '',
        attachments: [],
        credits: '',
        requirements: '',
        additionalMessage: '',
      });

      setCreatedSwapResult({
        swapId: createdId,
        topic: topicTitle,
        creditAmount: amount,
      });
      setStatusMessage({
        type: 'success',
        text: `Swap listing created! (ID: ${createdId}) and ${amount} SkillCredits reserved.`,
      });
      setIsSubmitting(false);
    } else {
      // Scroll to first error
      const firstErrorEl = document.querySelector('.error-message, .input-error');
      if (firstErrorEl) {
        firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const handleAddAttachments = (files: FileList | File[]) => {
    const newItems: AttachmentItem[] = Array.from(files).map((file) => ({
      id: Math.random().toString(36).substring(2, 9) + Date.now(),
      name: file.name,
      size: file.size,
      type: file.type,
      file,
    }));
    setFormState((prev) => ({
      ...prev,
      attachments: [...prev.attachments, ...newItems],
    }));
  };

  const handleRemoveAttachment = (id: string) => {
    setFormState((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((item) => item.id !== id),
    }));
  };

  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} showUserHeader />
      <main className="create-swap-page">
        <div className="create-swap-layout">
          <div className="create-swap-card">
            <CreateSwapHeader />

            {statusMessage && (
              <div className={`status-banner status-banner--${statusMessage.type}`} role="status">
                {statusMessage.text}
              </div>
            )}

            {createdSwapResult ? (
              <div className="status-banner status-banner--success" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem', marginTop: '1rem' }}>
                <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>
                  ✓ Swap Successfully Created!
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  Your swap <strong>"{createdSwapResult.topic}"</strong> is now live on the Explore marketplace with <strong>{createdSwapResult.creditAmount} SkillCredits</strong> reserved.
                  <br />
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>ID: {createdSwapResult.swapId}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="modal-btn modal-btn--confirm"
                    onClick={() => {
                      if (onNavigate) onNavigate('/explore');
                    }}
                  >
                    View in Explore Marketplace
                  </button>
                  <button
                    type="button"
                    className="modal-btn modal-btn--cancel"
                    onClick={() => {
                      if (onNavigate) onNavigate('/active-swaps');
                    }}
                  >
                    View Active Swaps
                  </button>
                  <button
                    type="button"
                    className="modal-btn modal-btn--cancel"
                    style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}
                    onClick={() => {
                      setCreatedSwapResult(null);
                      setStatusMessage(null);
                    }}
                  >
                    Create Another Swap
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="create-swap-form">
              <TopicField
                value={formState.topic}
                onChange={(val) => {
                  setFormState((prev) => ({ ...prev, topic: val }));
                  if (errors.topic) setErrors((prev) => ({ ...prev, topic: undefined }));
                }}
                error={errors.topic}
              />

              <TagSelectionField
                selectedTags={formState.tags}
                onChange={(tags) => {
                  setFormState((prev) => ({ ...prev, tags }));
                  if (errors.tags) setErrors((prev) => ({ ...prev, tags: undefined }));
                }}
                error={errors.tags}
              />

              <DescriptionField
                value={formState.description}
                onChange={(val) => {
                  setFormState((prev) => ({ ...prev, description: val }));
                  if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
                }}
                error={errors.description}
              />

              <AttachmentUploader
                attachments={formState.attachments}
                onAddAttachments={handleAddAttachments}
                onRemoveAttachment={handleRemoveAttachment}
              />

              <CreditsInput
                value={formState.credits}
                onChange={(val) => {
                  setFormState((prev) => ({ ...prev, credits: val }));
                  if (errors.credits) setErrors((prev) => ({ ...prev, credits: undefined }));
                }}
                error={errors.credits}
              />

              <RequirementsField
                value={formState.requirements}
                onChange={(val) => {
                  setFormState((prev) => ({ ...prev, requirements: val }));
                  if (errors.requirements) setErrors((prev) => ({ ...prev, requirements: undefined }));
                }}
                error={errors.requirements}
              />

              <AdditionalMessageField
                value={formState.additionalMessage}
                onChange={(val) => setFormState((prev) => ({ ...prev, additionalMessage: val }))}
              />

              <CreateSwapActions
                onSaveDraft={handleSaveDraft}
                isSubmitting={isSubmitting}
              />
            </form>
            )}
          </div>

          <SwapPreviewCard formState={formState} />
        </div>
      </main>
    </div>
  );
}
