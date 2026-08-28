export type ChatPermissionValue = 'anyone' | 'permission' | null;

type ChatPermissionSelectorProps = {
  value: ChatPermissionValue;
  onChange: (value: ChatPermissionValue) => void;
  error?: string;
};

export function ChatPermissionSelector({ value, onChange, error }: ChatPermissionSelectorProps) {
  const options = [
    {
      id: 'anyone' as const,
      title: 'Anyone can chat with me',
      description: 'People can start a conversation about this swap directly.',
    },
    {
      id: 'permission' as const,
      title: 'Ask for permission first',
      description: 'People need your approval before they can start discussing this swap.',
    },
  ];

  return (
    <div className="form-group">
      <div className="form-label-row">
        <label className="form-label">
          Who can start the conversation?
        </label>
        <span className="badge-required">Required</span>
      </div>
      <p className="form-helper-text">
        Choose how people can message you about this swap.
      </p>

      <div
        className="permission-cards-grid"
        role="radiogroup"
        aria-label="Who can start the conversation"
      >
        {options.map((option) => {
          const isSelected = value === option.id;
          return (
            <div
              key={option.id}
              className={`permission-card ${isSelected ? 'permission-card--selected' : ''} ${error ? 'permission-card--error' : ''}`}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onClick={() => onChange(option.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChange(option.id);
                }
              }}
            >
              <div className="permission-radio-indicator">
                <div className={`radio-circle ${isSelected ? 'radio-circle--checked' : ''}`} />
              </div>
              <div className="permission-content">
                <h3 className="permission-title">{option.title}</h3>
                <p className="permission-description">{option.description}</p>
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
    </div>
  );
}
