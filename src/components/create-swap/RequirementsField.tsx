type RequirementsFieldProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

export function RequirementsField({ value, onChange, error }: RequirementsFieldProps) {
  const maxLength = 1000;

  return (
    <div className="form-group">
      <div className="form-label-row">
        <label htmlFor="requirements-textarea" className="form-label">
          What needs to be completed?
        </label>
        <span className="badge-required">Required</span>
      </div>
      <p className="form-helper-text">
        Tell people exactly what needs to be completed for a successful skill exchange.
      </p>
      <div className="input-wrapper">
        <textarea
          id="requirements-textarea"
          className={`form-textarea requirements-textarea ${error ? 'input-error' : ''}`}
          placeholder="Describe what needs to be completed for a successful skill exchange..."
          value={value}
          maxLength={maxLength}
          rows={4}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'requirements-error' : undefined}
        />
        <div className="counter-row">
          <span className="char-counter">{value.length}/{maxLength}</span>
        </div>
      </div>
      {error && <p id="requirements-error" className="error-message" role="alert">{error}</p>}
    </div>
  );
}
