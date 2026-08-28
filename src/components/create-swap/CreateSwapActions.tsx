type CreateSwapActionsProps = {
  onSaveDraft: () => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting?: boolean;
};

export function CreateSwapActions({ onSaveDraft, onSubmit, isSubmitting = false }: CreateSwapActionsProps) {
  return (
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
        onClick={onSubmit}
      >
        Create Swap
      </button>
    </div>
  );
}
