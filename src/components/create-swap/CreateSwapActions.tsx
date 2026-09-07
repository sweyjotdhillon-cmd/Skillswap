type CreateSwapActionsProps = {
  onSaveDraft: () => void;
  onSubmit?: (e: React.FormEvent) => void;
  isSubmitting?: boolean;
};

export function CreateSwapActions({ onSaveDraft, isSubmitting = false }: CreateSwapActionsProps) {
  return (
    <div className="create-swap-actions-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
        SkillCredits are held securely in escrow until you review and approve completed work.
      </p>
      <div className="create-swap-actions">
        <button
          type="button"
          className="btn-save-draft"
          onClick={onSaveDraft}
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
  );
}
