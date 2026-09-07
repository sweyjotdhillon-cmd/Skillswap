import { useAuth } from '../../context/AuthContext';

type CreditsInputProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

export function CreditsInput({ value, onChange, error }: CreditsInputProps) {
  const { account } = useAuth();
  const numValue = value === '' ? null : parseInt(value, 10);
  const currentBalance = account?.credits_balance ?? 0;
  const remainingBalance = numValue !== null && !isNaN(numValue) ? currentBalance - numValue : currentBalance;

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
          SkillCredits Offered
        </label>
        <span className="badge-required">Required</span>
      </div>
      <p className="form-helper-text">
        SkillCredits reserved from your balance and awarded to your partner upon work approval.
      </p>

      <div className="credits-stepper-row">
        <div className={`credits-stepper ${error ? 'stepper-error' : ''}`}>
          <button
            type="button"
            className="stepper-btn stepper-btn--minus"
            onClick={handleDecrement}
            disabled={numValue !== null && numValue <= 1}
            aria-label="Decrease SkillCredits"
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
            aria-label="Increase SkillCredits"
          >
            +
          </button>
        </div>
        <span className="credits-label">SkillCredits</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <span>Available Balance: <strong style={{ color: 'var(--text-color)' }}>{currentBalance} ⚡ SkillCredits</strong></span>
        {numValue !== null && !isNaN(numValue) && numValue > 0 && (
          <span style={{ color: remainingBalance < 0 ? '#ef4444' : 'var(--text-muted)' }}>
            Remaining after swap: <strong>{remainingBalance} ⚡ SkillCredits</strong>
          </span>
        )}
      </div>

      {error && <p id="credits-error" className="error-message" role="alert">{error}</p>}
    </div>
  );
}
