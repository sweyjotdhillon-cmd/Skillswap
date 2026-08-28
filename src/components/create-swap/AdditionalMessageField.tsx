type AdditionalMessageFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

export function AdditionalMessageField({ value, onChange }: AdditionalMessageFieldProps) {
  const maxLength = 1000;

  return (
    <div className="form-group">
      <div className="form-label-row">
        <label htmlFor="additional-message-textarea" className="form-label">
          Additional message
        </label>
        <span className="badge-optional">(optional)</span>
      </div>
      <div className="input-wrapper">
        <textarea
          id="additional-message-textarea"
          className="form-textarea additional-textarea"
          placeholder="Anything else participants should know..."
          value={value}
          maxLength={maxLength}
          rows={4}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="counter-row">
          <span className="char-counter">{value.length}/{maxLength}</span>
        </div>
      </div>
    </div>
  );
}
