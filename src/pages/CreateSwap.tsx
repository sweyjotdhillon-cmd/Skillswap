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
import { SwapPreviewCard } from '../components/create-swap/SwapPreviewCard';
import { TemplateGallery } from '../components/create-swap/TemplateGallery';
import { SwapTemplate } from '../constants/templates';
import { useAuth } from '../context/AuthContext';
import { createCreditSwap, uploadSwapAttachments, cancelCreditSwap } from '../lib/supabase/credits';
import { getTagSlug, getTagLabel, isValidSwapTag } from '../constants/tags';
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
  const { user, profile, account, refreshAccount } = useAuth();
  const draftKey = user ? `skillswap_create_swap_draft_${user.id}` : 'skillswap_create_swap_draft_guest';

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  const [formState, setFormState] = useState<CreateSwapFormState>(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        const restoredTagsRaw = Array.isArray(parsed.tags) ? parsed.tags : [];
        const canonicalRestoredTags = restoredTagsRaw
          .map((t: string) => getTagSlug(t))
          .filter((t: string) => Boolean(t) && isValidSwapTag(t))
          .filter((t: string, i: number, a: string[]) => a.indexOf(t) === i);

        return {
          topic: parsed.topic || '',
          tags: canonicalRestoredTags,
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

  const validateStep = (step: 1 | 2): boolean => {
    const newErrors: FormErrors = {};

    if (step === 1) {
      if (!formState.topic.trim()) {
        newErrors.topic = 'Please add a topic.';
      }
      if (!formState.tags || formState.tags.length === 0) {
        newErrors.tags = 'Please select at least one tag.';
      }
      if (!formState.description.trim()) {
        newErrors.description = 'Please describe your swap.';
      }
    } else if (step === 2) {
      if (!formState.credits.trim()) {
        newErrors.credits = "Enter the number of SkillCredits you're offering.";
      } else {
        const parsed = parseInt(formState.credits, 10);
        if (isNaN(parsed) || parsed <= 0) {
          newErrors.credits = 'SkillCredits must be a valid positive number.';
        } else if (account && parsed > account.credits_balance) {
          newErrors.credits = `Insufficient SkillCredits balance. You currently have ${account.credits_balance} SkillCredits available.`;
        }
      }
      if (!formState.requirements.trim()) {
        newErrors.requirements = 'Describe what participants need to complete.';
      }
    }

    setErrors((prev) => ({ ...prev, ...newErrors }));
    return Object.keys(newErrors).length === 0;
  };

  const validateAll = (): boolean => {
    const step1Valid = validateStep(1);
    const step2Valid = validateStep(2);
    return step1Valid && step2Valid;
  };

  const handleSelectTemplate = (template: SwapTemplate) => {
    const canonicalTags = template.formValues.tags
      .map((t) => getTagSlug(t))
      .filter((t) => Boolean(t) && isValidSwapTag(t));

    setFormState((prev) => ({
      ...prev,
      topic: template.formValues.topic,
      tags: canonicalTags,
      description: template.formValues.description,
      credits: template.formValues.credits,
      requirements: template.formValues.requirements,
    }));
    setActiveTemplateId(template.id);
    setErrors({});
    setCurrentStep(1);

    setStatusMessage({
      type: 'info',
      text: `Applied "${template.name}" template! All pre-filled values remain fully editable.`,
    });

    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatusMessage(null), 5000);

    // Smooth scroll to form section
    const formEl = document.querySelector('.create-swap-form, .cs-stepper-container');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleStartFromScratch = () => {
    setFormState({
      topic: '',
      tags: [],
      description: '',
      attachments: [],
      credits: '',
      requirements: '',
      additionalMessage: '',
    });
    setActiveTemplateId(null);
    setErrors({});
    setCurrentStep(1);

    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }

    setStatusMessage({
      type: 'info',
      text: 'Cleared form state. You are starting from scratch.',
    });

    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatusMessage(null), 4000);

    const formEl = document.querySelector('.create-swap-form, .cs-stepper-container');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (validateStep(1)) {
        setCurrentStep(2);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else if (currentStep === 2) {
      if (validateStep(2)) {
        setCurrentStep(3);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as 1 | 2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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

    if (!profile || profile.profile_completed === false) {
      if (onNavigate) onNavigate(`/onboarding?redirectTo=${encodeURIComponent('/create-swap')}`);
      else window.location.href = `/onboarding?redirectTo=${encodeURIComponent('/create-swap')}`;
      return;
    }

    if (validateAll()) {
      setIsSubmitting(true);
      if (!activeIdempotencyKeyRef.current) {
        activeIdempotencyKeyRef.current = `swap_create:${generateUUID()}`;
      }
      const amount = parseInt(formState.credits, 10);
      const topicTitle = formState.topic.trim();

      // Defensive pre-submission tag canonicalization & validation
      const canonicalTags = (formState.tags || [])
        .map((t) => getTagSlug(t))
        .filter((t) => Boolean(t) && isValidSwapTag(t))
        .filter((t, i, a) => a.indexOf(t) === i);

      if (canonicalTags.length === 0) {
        setErrors((prev) => ({
          ...prev,
          tags: 'Please select at least one valid tag from the available options.',
        }));
        setIsSubmitting(false);
        return;
      }

      const res = await createCreditSwap({
        topic: topicTitle,
        description: formState.description.trim(),
        requirements: formState.requirements.trim(),
        creditAmount: amount,
        tags: canonicalTags,
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
      setActiveTemplateId(null);

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

  const progressPercent = currentStep === 1 ? 33 : currentStep === 2 ? 66 : 100;

  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} showUserHeader />
      <main className="create-swap-page">
        <div className="create-swap-layout">
          <div className="create-swap-card">
            <CreateSwapHeader />

            {/* SECTION I.1 TEMPLATE GALLERY */}
            <TemplateGallery
              onSelectTemplate={handleSelectTemplate}
              onStartFromScratch={handleStartFromScratch}
              activeTemplateId={activeTemplateId}
            />

            {/* STEPPER PROGRESS INDICATOR */}
            <div className="cs-stepper-container" aria-label="Creation progress">
              <div className="cs-progress-bar-bg">
                <div
                  className="cs-progress-bar-fill"
                  style={{ width: `${progressPercent}%` }}
                  role="progressbar"
                  aria-valuenow={progressPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>

              <div className="cs-stepper-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={currentStep === 1}
                  className={`cs-step-tab ${currentStep === 1 ? 'cs-step-tab--active' : currentStep > 1 ? 'cs-step-tab--completed' : ''}`}
                  onClick={() => setCurrentStep(1)}
                >
                  <span className="cs-step-num">{currentStep > 1 ? '✓' : '1'}</span>
                  <span>1. Skill Request</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={currentStep === 2}
                  className={`cs-step-tab ${currentStep === 2 ? 'cs-step-tab--active' : currentStep > 2 ? 'cs-step-tab--completed' : ''}`}
                  onClick={() => {
                    if (validateStep(1)) setCurrentStep(2);
                  }}
                >
                  <span className="cs-step-num">{currentStep > 2 ? '✓' : '2'}</span>
                  <span>2. Exchange Terms</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={currentStep === 3}
                  className={`cs-step-tab ${currentStep === 3 ? 'cs-step-tab--active' : ''}`}
                  onClick={() => {
                    if (validateStep(1) && validateStep(2)) setCurrentStep(3);
                  }}
                >
                  <span className="cs-step-num">3</span>
                  <span>3. Resources &amp; Publish</span>
                </button>
              </div>
            </div>

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
                      setCurrentStep(1);
                    }}
                  >
                    Create Another Swap
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="create-swap-form">
                {/* STEP 1: SKILL REQUEST OVERVIEW */}
                {currentStep === 1 && (
                  <fieldset className="create-swap-section" style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <legend className="create-swap-section-title" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-color)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(214, 166, 74, 0.2)', color: '#a8781d', fontSize: '0.85rem', fontWeight: 800, textAlign: 'center', lineHeight: '24px' }}>1</span>
                      Skill Request Overview
                    </legend>

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

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', gap: '1rem' }}>
                      <button
                        type="button"
                        className="btn-save-draft"
                        onClick={handleSaveDraft}
                      >
                        Save Draft
                      </button>

                      <button
                        type="button"
                        className="btn-create-swap"
                        onClick={handleNextStep}
                      >
                        Next: Exchange Terms →
                      </button>
                    </div>
                  </fieldset>
                )}

                {/* STEP 2: EXCHANGE TERMS & DELIVERABLES */}
                {currentStep === 2 && (
                  <fieldset className="create-swap-section" style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <legend className="create-swap-section-title" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-color)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(214, 166, 74, 0.2)', color: '#a8781d', fontSize: '0.85rem', fontWeight: 800, textAlign: 'center', lineHeight: '24px' }}>2</span>
                      Exchange Terms &amp; Deliverables
                    </legend>

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

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-save-draft"
                        onClick={handlePrevStep}
                      >
                        ← Back to Overview
                      </button>

                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                          type="button"
                          className="btn-save-draft"
                          onClick={handleSaveDraft}
                        >
                          Save Draft
                        </button>

                        <button
                          type="button"
                          className="btn-create-swap"
                          onClick={handleNextStep}
                        >
                          Next: Resources &amp; Publish →
                        </button>
                      </div>
                    </div>
                  </fieldset>
                )}

                {/* STEP 3: RESOURCES & FINAL REVIEW */}
                {currentStep === 3 && (
                  <fieldset className="create-swap-section" style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <legend className="create-swap-section-title" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-color)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(214, 166, 74, 0.2)', color: '#a8781d', fontSize: '0.85rem', fontWeight: 800, textAlign: 'center', lineHeight: '24px' }}>3</span>
                      Optional Resources &amp; Final Review
                    </legend>

                    {/* SUMMARY REVIEW BOX */}
                    <div
                      style={{
                        padding: '1rem 1.25rem',
                        borderRadius: '12px',
                        background: 'rgba(17, 22, 28, 0.03)',
                        border: '1px solid rgba(17, 22, 28, 0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        fontSize: '0.9rem',
                      }}
                    >
                      <span style={{ fontWeight: 700, color: '#a8781d' }}>📋 Swap Summary Review</span>
                      <div><strong>Topic:</strong> {formState.topic || '(Not set)'}</div>
                      <div>
                        <strong>Tags:</strong>{' '}
                        {formState.tags.length > 0
                          ? formState.tags.map((t) => getTagLabel(t)).join(', ')
                          : '(None)'}
                      </div>
                      <div><strong>Credits Offered:</strong> {formState.credits || '0'} SkillCredits</div>
                      <div><strong>Requirements:</strong> {formState.requirements || '(None)'}</div>
                    </div>

                    <AttachmentUploader
                      attachments={formState.attachments}
                      onAddAttachments={handleAddAttachments}
                      onRemoveAttachment={handleRemoveAttachment}
                    />

                    <AdditionalMessageField
                      value={formState.additionalMessage}
                      onChange={(val) => setFormState((prev) => ({ ...prev, additionalMessage: val }))}
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-save-draft"
                        onClick={handlePrevStep}
                        disabled={isSubmitting}
                      >
                        ← Back to Terms
                      </button>

                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                          type="button"
                          className="btn-save-draft"
                          onClick={handleSaveDraft}
                          disabled={isSubmitting}
                        >
                          Save Draft
                        </button>

                        <button
                          type="submit"
                          className="btn-create-swap"
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? 'Publishing Swap...' : 'Publish Swap Request'}
                        </button>
                      </div>
                    </div>
                  </fieldset>
                )}
              </form>
            )}
          </div>

          <SwapPreviewCard formState={formState} />
        </div>
      </main>
    </div>
  );
}
