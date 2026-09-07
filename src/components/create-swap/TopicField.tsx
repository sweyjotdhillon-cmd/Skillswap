type TopicFieldProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

export function TopicField({ value, onChange, error }: TopicFieldProps) {
  const maxLength = 120;

  return (
    <div className="form-group">
      <div className="form-label-row">
        <label htmlFor="topic-input" className="form-label">
          Topic / Skill
        </label>
        <span className="badge-required">Required</span>
      </div>
      <p className="form-helper-text">
        Specify the exact skill or topic you want to learn or exchange.
      </p>
      <div className="input-wrapper">
        <input
          id="topic-input"
          type="text"
          className={`form-input ${error ? 'input-error' : ''}`}
          placeholder="e.g. React Code Review, UI Design Feedback, Conversational Spanish..."
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'topic-error' : undefined}
        />
        <div className="counter-row">
          <span className="char-counter">{value.length}/{maxLength}</span>
        </div>
      </div>
      {error && <p id="topic-error" className="error-message" role="alert">{error}</p>}
    </div>
  );
}
