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
          Describe your swap
        </label>
        <span className="badge-required">Required</span>
      </div>
      <div className="input-wrapper">
        <textarea
          id="description-textarea"
          className={`form-textarea description-textarea ${error ? 'input-error' : ''}`}
          placeholder="Explain what you're offering, who it's for, and what participants can expect..."
          value={value}
          maxLength={maxLength}
          rows={5}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="counter-row">
          <span className="char-counter">{value.length}/{maxLength}</span>
        </div>
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
    </div>
  );
}
