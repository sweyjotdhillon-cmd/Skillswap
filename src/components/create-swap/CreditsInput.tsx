type CreditsInputProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

export function CreditsInput({ value, onChange, error }: CreditsInputProps) {
  const numValue = value === '' ? null : parseInt(value, 10);

  const handleDecrement = () => {
    if (numValue === null) {
      onChange('1');
    } else if (numValue > 1) {
      onChange((numValue - 1).toString());
    }
  };

  const handleIncrement = () => {
    if (numValue === null) {
      onChange('1');
    } else {
      onChange((numValue + 1).toString());
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    if (rawValue === '') {
      onChange('');
      return;
    }
    const cleanValue = rawValue.replace(/\D/g, '');
    if (cleanValue === '') {
      onChange('');
    } else {
      // Prevent leading zeros if length > 1
      const parsed = parseInt(cleanValue, 10);
      onChange(isNaN(parsed) ? '' : parsed.toString());
    }
  };

  return (
    <div className="form-group">
      <div className="form-label-row">
        <label htmlFor="credits-input" className="form-label">
          SkillCredits you're offering
        </label>
        <span className="badge-required">Required</span>
      </div>
      <p className="form-helper-text">
        SkillCredits are awarded after the swap requirements are completed.
      </p>

      <div className="credits-stepper-row">
        <div className={`credits-stepper ${error ? 'stepper-error' : ''}`}>
          <button
            type="button"
            className="stepper-btn stepper-btn--minus"
            onClick={handleDecrement}
            disabled={numValue !== null && numValue <= 1}
            aria-label="Decrease credits"
          >
            –
          </button>
          <input
            id="credits-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="stepper-input"
            placeholder="—"
            value={value}
            onChange={handleInputChange}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'credits-error' : undefined}
          />
          <button
            type="button"
            className="stepper-btn stepper-btn--plus"
            onClick={handleIncrement}
            aria-label="Increase credits"
          >
            +
          </button>
        </div>
        <span className="credits-label">SkillCredits</span>
      </div>
      {error && <p id="credits-error" className="error-message" role="alert">{error}</p>}
    </div>
  );
}
