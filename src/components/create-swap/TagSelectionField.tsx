import { ALLOWED_SWAP_TAGS, type SwapTag } from '../../constants/tags';

type TagSelectionFieldProps = {
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  error?: string;
};

export function TagSelectionField({ selectedTags, onChange, error }: TagSelectionFieldProps) {
  const toggleTag = (tag: SwapTag) => {
    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter((t) => t !== tag));
    } else {
      onChange([...selectedTags, tag]);
    }
  };

  return (
    <div className="form-group">
      <div className="form-label-row">
        <label className="form-label">
          Swap Tags
        </label>
        <span className="badge-required">Required</span>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '-0.25rem 0 0.75rem' }}>
        Select at least one tag to categorize your swap on the Explore marketplace.
      </p>

      <div
        className="tag-chips-container"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}
        role="group"
        aria-label="Select swap tags"
      >
        {ALLOWED_SWAP_TAGS.map((tag) => {
          const isSelected = selectedTags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              className={`category-pill ${isSelected ? 'category-pill--active' : ''}`}
              style={{
                fontSize: '0.875rem',
                padding: '0.4rem 0.85rem',
                borderRadius: '20px',
                cursor: 'pointer',
                transition: 'all 0.15s ease-in-out',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
              onClick={() => toggleTag(tag)}
              aria-pressed={isSelected}
            >
              <span>#{tag}</span>
              {isSelected && <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>✓</span>}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="error-message" role="alert" style={{ marginTop: '0.5rem' }}>
          {error}
        </p>
      )}
    </div>
  );
}
