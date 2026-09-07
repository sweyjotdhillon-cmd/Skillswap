type DescriptionFieldProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

export function DescriptionField({ value, onChange, error }: DescriptionFieldProps) {
  const maxLength = 2000;

  return (
    <div className="form-group">
      <div className="form-label-row">
        <label htmlFor="description-textarea" className="form-label">
          Swap Description
        </label>
        <span className="badge-required">Required</span>
      </div>
      <p className="form-helper-text">
        Explain your background, goals, and context for this skill exchange.
      </p>
      <div className="input-wrapper">
        <textarea
          id="description-textarea"
          className={`form-textarea description-textarea ${error ? 'input-error' : ''}`}
          placeholder="Explain the background, goals, and context of this exchange..."
          value={value}
          maxLength={maxLength}
          rows={4}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'description-error' : undefined}
        />
        <div className="counter-row">
          <span className="char-counter">{value.length}/{maxLength}</span>
        </div>
      </div>
      {error && <p id="description-error" className="error-message" role="alert">{error}</p>}
    </div>
  );
}
