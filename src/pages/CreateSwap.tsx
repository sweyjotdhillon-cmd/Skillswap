import { useState, useEffect, useRef } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { CreateSwapHeader } from '../components/create-swap/CreateSwapHeader';
import { TopicField } from '../components/create-swap/TopicField';
import { DescriptionField } from '../components/create-swap/DescriptionField';
import { AttachmentUploader, AttachmentItem } from '../components/create-swap/AttachmentUploader';
import { ChatPermissionSelector, ChatPermissionValue } from '../components/create-swap/ChatPermissionSelector';
import { CreditsInput } from '../components/create-swap/CreditsInput';
import { RequirementsField } from '../components/create-swap/RequirementsField';
import { AdditionalMessageField } from '../components/create-swap/AdditionalMessageField';
import { CreateSwapActions } from '../components/create-swap/CreateSwapActions';
import { SwapPreviewCard } from '../components/create-swap/SwapPreviewCard';
import { useAuth } from '../context/AuthContext';
import { createCreditSwap } from '../lib/supabase/credits';

export interface CreateSwapFormState {
  topic: string;
  description: string;
  attachments: AttachmentItem[];
  chatPermission: ChatPermissionValue;
  credits: string;
  requirements: string;
  additionalMessage: string;
}

export interface FormErrors {
  topic?: string;
  description?: string;
  chatPermission?: string;
  credits?: string;
  requirements?: string;
}

type CreateSwapPageProps = {
  onNavigate?: (path: string) => void;
};

export function CreateSwapPage({ onNavigate }: CreateSwapPageProps) {
  const DRAFT_KEY = 'skillswap_create_swap_draft';
  const { account, refreshAccount } = useAuth();

  const [formState, setFormState] = useState<CreateSwapFormState>(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          topic: parsed.topic || '',
          description: parsed.description || '',
          attachments: [],
          chatPermission: parsed.chatPermission || null,
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
      description: '',
      attachments: [],
      chatPermission: null,
      credits: '',
      requirements: '',
      additionalMessage: '',
    };
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'info'; text: string } | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const hasContent = Boolean(
          (parsed.topic && parsed.topic.trim()) ||
          (parsed.description && parsed.description.trim()) ||
          (parsed.credits && parsed.credits.trim()) ||
          (parsed.requirements && parsed.requirements.trim()) ||
          (parsed.additionalMessage && parsed.additionalMessage.trim()) ||
          parsed.chatPermission !== null
        );
        if (hasContent) {
          setStatusMessage({ type: 'info', text: 'Restored your previously saved draft.' });
          if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
          statusTimerRef.current = setTimeout(() => setStatusMessage(null), 4000);
        }
      }
    } catch {
      // Ignore parse error
    }
  }, []);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formState.topic.trim()) {
      newErrors.topic = 'Please add a topic.';
    }

    if (!formState.description.trim()) {
      newErrors.description = 'Please describe your swap.';
    }

    if (formState.chatPermission === null) {
      newErrors.chatPermission = 'Choose who can start the conversation.';
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
        description: formState.description.trim(),
        chatPermission: formState.chatPermission,
        credits: formState.credits.trim(),
        requirements: formState.requirements.trim(),
        additionalMessage: formState.additionalMessage.trim(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
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
    if (validate() && formState.chatPermission) {
      setIsSubmitting(true);
      const amount = parseInt(formState.credits, 10);
      const res = await createCreditSwap({
        topic: formState.topic.trim(),
        description: formState.description.trim(),
        requirements: formState.requirements.trim(),
        chatPermission: formState.chatPermission === 'permission' ? 'requester' : 'anyone',
        creditAmount: amount,
        additionalMessage: formState.additionalMessage.trim(),
      });

      if (!res.success) {
        setErrors((prev) => ({
          ...prev,
          credits: res.error || 'Failed to reserve credits. Please try again.',
        }));
        setIsSubmitting(false);
        return;
      }

      await refreshAccount();

      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch (_) {
        // ignore
      }
      setStatusMessage({
        type: 'success',
        text: `Swap listing created and ${amount} credits reserved.`,
      });
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      statusTimerRef.current = setTimeout(() => {
        setStatusMessage(null);
      }, 5000);
      setIsSubmitting(false);
    } else {
      // Scroll to first error
      const firstErrorEl = document.querySelector('.error-message, .input-error, .permission-card--error');
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

            <form onSubmit={handleSubmit} noValidate className="create-swap-form">
              <TopicField
                value={formState.topic}
                onChange={(val) => {
                  setFormState((prev) => ({ ...prev, topic: val }));
                  if (errors.topic) setErrors((prev) => ({ ...prev, topic: undefined }));
                }}
                error={errors.topic}
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

              <ChatPermissionSelector
                value={formState.chatPermission}
                onChange={(val) => {
                  setFormState((prev) => ({ ...prev, chatPermission: val }));
                  if (errors.chatPermission) setErrors((prev) => ({ ...prev, chatPermission: undefined }));
                }}
                error={errors.chatPermission}
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
          </div>

          <SwapPreviewCard formState={formState} />
        </div>
      </main>
    </div>
  );
}
