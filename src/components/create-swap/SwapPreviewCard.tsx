import { CreateSwapFormState } from '../../pages/CreateSwap';

type SwapPreviewCardProps = {
  formState: CreateSwapFormState;
};

export function SwapPreviewCard({ formState }: SwapPreviewCardProps) {
  const hasContent = formState.topic || formState.description || formState.credits || formState.requirements;

  return (
    <aside className="swap-preview-sticky">
      <div className="preview-card-header">
        <span className="preview-badge">Live Card Preview</span>
        <span className="preview-subtext">How your swap appears to the community</span>
      </div>

      <div className="swap-explore-card swap-preview-card">
        <div className="swap-card-top">
          <div className="swap-author-info">
            <div className="swap-author-avatar">YOU</div>
            <div>
              <h4 className="swap-author-name">You (Creator)</h4>
              <span className="swap-author-role">Skillswap Member</span>
            </div>
          </div>
          <div className="swap-credit-badge">
            <span className="credit-val">
              +{formState.credits ? formState.credits : '0'}
            </span>
            <span className="credit-unit">SkillCredits</span>
          </div>
        </div>

        <h3 className="swap-card-title">
          {formState.topic ? formState.topic : 'Your Swap Topic Will Appear Here'}
        </h3>

        <p className="swap-card-desc">
          {formState.description
            ? formState.description
            : 'Enter a detailed description to show potential collaborators what your swap offers.'}
        </p>

        {formState.requirements && (
          <div className="preview-requirements-box">
            <strong>Requirements:</strong>
            <p>{formState.requirements}</p>
          </div>
        )}

        {formState.attachments.length > 0 && (
          <div className="preview-attachments-count">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <span>{formState.attachments.length} file{formState.attachments.length > 1 ? 's' : ''} attached</span>
          </div>
        )}

        <div className="swap-tags-row">
          <span className="swap-tag">
            {formState.chatPermission === 'anyone' ? 'Open Chat' : formState.chatPermission === 'permission' ? 'Approval Required' : 'Chat Setting'}
          </span>
          {formState.attachments.length > 0 && <span className="swap-tag">Has Attachments</span>}
        </div>

        <div className="swap-card-footer">
          <button type="button" className="btn-request-swap" disabled>
            Propose Exchange
          </button>
        </div>
      </div>

      {!hasContent && (
        <div className="preview-tip">
          💡 Fill in the form fields on the left to watch this card update live.
        </div>
      )}
    </aside>
  );
}
