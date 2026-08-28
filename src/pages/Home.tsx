import { Logo } from "../components/brand/Logo";

const sections = [
  {
    label: "1. Topic",
    kind: "input",
    placeholder: "What skill or topic is this swap about?",
  },
  {
    label: "2. Describe your swap",
    kind: "textarea",
    placeholder:
      "Explain what you're offering, what you need, and what someone can expect...",
    helper: "Be specific about the outcome you can provide.",
  },
  {
    label: "3. Attachments",
    kind: "upload",
    helper: "Add files that help others understand or complete this swap.",
  },
  {
    label: "4. Conversation access",
    kind: "access",
    helper: "Choose who can start a conversation about this swap.",
  },
  {
    label: "5. Credits you're offering",
    kind: "credits",
    helper: "Credits are awarded when the swap requirements are completed.",
  },
  {
    label: "6. What's required to earn all credits?",
    kind: "textarea",
    placeholder:
      "List the requirements someone must complete to receive the full credit amount...",
    helper:
      "Be clear about what must be completed before awarding the full credit amount.",
  },
];

function SwapForm({ compact = false }: { compact?: boolean }) {
  return (
    <form className={compact ? "swap-form swap-form--compact" : "swap-form"}>
      {sections.map((section) => (
        <section className="form-section" key={section.label}>
          <label className="section-label">{section.label}</label>
          {section.kind === "input" && (
            <input className="field" placeholder={section.placeholder} />
          )}
          {section.kind === "textarea" && (
            <textarea
              className="field textarea"
              placeholder={section.placeholder}
            />
          )}
          {section.kind === "upload" && (
            <>
              <p className="helper helper--top">{section.helper}</p>
              <button className="upload-zone" type="button">
                <span>＋</span>Add attachments
              </button>
            </>
          )}
          {section.kind === "access" && (
            <>
              <p className="helper helper--top">{section.helper}</p>
              <div className="access-grid">
                <button
                  className="access-card"
                  type="button"
                  aria-pressed="false"
                >
                  <span className="empty-radio" aria-hidden="true" />
                  <span>
                    <strong>Anyone can chat</strong>
                    <small>
                      People can start a conversation with you immediately.
                    </small>
                  </span>
                </button>
                <button
                  className="access-card"
                  type="button"
                  aria-pressed="false"
                >
                  <span className="empty-radio" aria-hidden="true" />
                  <span>
                    <strong>Request to chat</strong>
                    <small>
                      People must request permission before starting a
                      conversation.
                    </small>
                  </span>
                </button>
              </div>
            </>
          )}
          {section.kind === "credits" && (
            <div className="credit-row">
              <div className="credit-stepper">
                <button type="button">−</button>
                <input
                  aria-label="Credits"
                  placeholder="Credits"
                  inputMode="numeric"
                />
                <button type="button">＋</button>
              </div>
              <p className="helper">
                <span className="coin">SC</span>
                {section.helper}
              </p>
            </div>
          )}
          {section.helper &&
            !["upload", "access", "credits"].includes(section.kind) && (
              <p className="helper">{section.helper}</p>
            )}
        </section>
      ))}
    </form>
  );
}

export function Home() {
  return (
    <div className="create-page">
      <main className="desktop-card">
        <header className="topbar">
          <Logo />
          <nav>
            <a>Explore Swaps</a>
            <a>My Swaps</a>
            <a>Community</a>
          </nav>
          <div className="profile">
            <span className="avatar">●</span>
            <span>Me</span>
            <span>⌄</span>
          </div>
        </header>
        <div className="title-row">
          <div>
            <h1>Create a Swap</h1>
            <p>Share what you can offer and what you're looking for.</p>
          </div>
          <span className="draft">✓ Draft saved</span>
        </div>
        <SwapForm />
        <footer className="actions">
          <button>Cancel</button>
          <button>Save Draft</button>
          <button className="primary" disabled>
            Create Swap →
          </button>
        </footer>
      </main>

      <aside className="phone" aria-label="Mobile preview">
        <div className="phone-screen">
          <header className="mobile-head">
            <Logo />
            <button>☰</button>
          </header>
          <div className="mobile-title">
            <h2>Create a Swap</h2>
            <p>Share what you can offer and what you're looking for.</p>
            <span className="draft">✓ Draft saved</span>
          </div>
          <SwapForm compact />
          <button className="mobile-cta" disabled>
            Create Swap →
          </button>
          <button className="mobile-save">Save Draft</button>
        </div>
      </aside>
    </div>
  );
}
