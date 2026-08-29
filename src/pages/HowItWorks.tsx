import { Navbar } from '../components/navigation/Navbar';

type HowItWorksPageProps = {
  onNavigate?: (path: string) => void;
};

export function HowItWorksPage({ onNavigate }: HowItWorksPageProps) {
  const handleCreateSwap = () => {
    if (onNavigate) {
      onNavigate('/create-swap');
    }
  };

  const handleExploreSwaps = () => {
    if (onNavigate) {
      onNavigate('/explore');
    }
  };

  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} />

      <main className="how-it-works-page">
        {/* Section 1 — Hero Section */}
        <section className="hiw-hero" aria-labelledby="hiw-hero-title">
          <span className="section-eyebrow">How It Works</span>
          <h1 id="hiw-hero-title" className="hiw-hero-title">
            How SkillSwap Works
          </h1>
          <p className="hiw-hero-subheading">
            Turn what you know into what you want to learn.
          </p>
          <p className="hiw-hero-support">
            «SkillSwap makes learning more accessible by connecting people who can teach each other. Share your skills, discover what others can offer, and exchange knowledge without traditional course fees.»
          </p>
          <div className="hiw-hero-actions">
            <button
              type="button"
              className="action-button action-button--filled"
              onClick={handleCreateSwap}
            >
              <span>Create Your First Swap</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="btn-arrow-icon" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
            <button
              type="button"
              className="action-button action-button--outline"
              onClick={handleExploreSwaps}
            >
              Explore Swaps
            </button>
          </div>
        </section>

        {/* Section 2 — Main 6-Step Process */}
        <section className="hiw-section" aria-labelledby="steps-heading">
          <div className="section-header">
            <span className="section-eyebrow">Step-By-Step Guide</span>
            <h2 id="steps-heading" className="section-title">The 6-Step Skill Exchange Process</h2>
            <p className="section-description">
              From building your profile to trading skills, here is how SkillSwap brings learners and teachers together.
            </p>
          </div>

          <div className="hiw-steps-grid">
            {/* Step 01 — Create Your Skill Profile */}
            <div className="hiw-step-card">
              <div className="hiw-step-header">
                <span className="step-number">01</span>
                <div className="hiw-step-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              </div>
              <h3 className="hiw-step-title">Create Your Skill Profile</h3>
              <p className="hiw-step-desc">
                «Tell the SkillSwap community what you know and what you want to learn. Add the skills you can teach, the skills you're interested in learning, and a little about yourself.»
              </p>
            </div>

            {/* Step 02 — Create a Swap */}
            <div className="hiw-step-card">
              <div className="hiw-step-header">
                <span className="step-number">02</span>
                <div className="hiw-step-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                </div>
              </div>
              <h3 className="hiw-step-title">Create a Swap</h3>
              <p className="hiw-step-desc">
                «Choose a skill you can teach and a skill you want to learn. Add a clear description so other users understand what you're offering and looking for.»
              </p>

              {/* Example mini-card */}
              <div className="hiw-mini-example">
                <div className="hiw-mini-item hiw-mini-item--teach">
                  <span className="hiw-mini-label">I Can Teach</span>
                  <span className="hiw-mini-val">Graphic Design</span>
                </div>
                <div className="hiw-mini-item hiw-mini-item--learn">
                  <span className="hiw-mini-label">I Want to Learn</span>
                  <span className="hiw-mini-val">Python</span>
                </div>
              </div>
            </div>

            {/* Step 03 — Explore Available Swaps */}
            <div className="hiw-step-card">
              <div className="hiw-step-header">
                <span className="step-number">03</span>
                <div className="hiw-step-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
              </div>
              <h3 className="hiw-step-title">Explore Available Swaps</h3>
              <p className="hiw-step-desc">
                «Browse swaps created by other people. Search and discover opportunities based on the skills you want to learn or the skills you can offer.»
              </p>
              <div className="hiw-discover-pills">
                <span className="hiw-pill">Skill</span>
                <span className="hiw-pill">Category</span>
                <span className="hiw-pill">Experience Level</span>
                <span className="hiw-pill">Learning Format</span>
              </div>
            </div>

            {/* Step 04 — Find Your Match */}
            <div className="hiw-step-card hiw-step-card--highlight">
              <div className="hiw-step-header">
                <span className="step-number">04</span>
                <div className="hiw-step-icon hiw-step-icon--gold">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
              </div>
              <h3 className="hiw-step-title">Find Your Match</h3>
              <p className="hiw-step-desc">
                «Find someone whose skills complement yours. The best SkillSwap connections happen when both people can help each other grow.»
              </p>

              {/* Strong visual match component */}
              <div className="hiw-match-box">
                <div className="hiw-match-badge">A SkillSwap Match 🤝</div>

                <div className="hiw-match-row">
                  <div className="hiw-match-person">
                    <span className="hiw-person-title">You</span>
                    <div className="hiw-person-skills">
                      <span className="hiw-person-teach">Can Teach → Video Editing</span>
                      <span className="hiw-person-learn">Want to Learn → Python</span>
                    </div>
                  </div>

                  <div className="hiw-match-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="17 1 21 5 17 9" />
                      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                      <polyline points="7 23 3 19 7 15" />
                      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>
                  </div>

                  <div className="hiw-match-person">
                    <span className="hiw-person-title">Your Match</span>
                    <div className="hiw-person-skills">
                      <span className="hiw-person-teach">Can Teach → Python</span>
                      <span className="hiw-person-learn">Wants to Learn → Video Editing</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 05 — Connect & Discuss */}
            <div className="hiw-step-card">
              <div className="hiw-step-header">
                <span className="step-number">05</span>
                <div className="hiw-step-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
              </div>
              <h3 className="hiw-step-title">Connect & Discuss</h3>
              <p className="hiw-step-desc">
                «Once you find a potential match, connect and discuss how you'd like to exchange skills. Decide what you'll teach, what you'll learn, when you'll meet, and whether you'll learn online or offline.»
              </p>
            </div>

            {/* Step 06 — Start SkillSwapping */}
            <div className="hiw-step-card hiw-step-card--callout">
              <div className="hiw-step-header">
                <span className="step-number">06</span>
                <div className="hiw-step-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
                    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
                    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
                    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
                  </svg>
                </div>
              </div>
              <h3 className="hiw-step-title">Start SkillSwapping 🚀</h3>
              <p className="hiw-step-desc">
                «Start teaching, start learning, and grow together. Share what you know, learn something new, and turn knowledge into meaningful connections.»
              </p>
              <div className="hiw-currency-banner">
                <span>Your skill becomes your currency.</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3 — Visual Flow Section */}
        <section className="hiw-section" aria-labelledby="flow-heading">
          <div className="section-header">
            <span className="section-eyebrow">Visual Journey</span>
            <h2 id="flow-heading" className="section-title">The Complete Swap Journey</h2>
            <p className="section-description">
              A simple visual summary of your pathway from creating a profile to learning together.
            </p>
          </div>

          <div className="hiw-flow-container">
            <div className="hiw-flow-node">
              <div className="hiw-flow-badge">01</div>
              <span className="hiw-flow-label">Create Profile</span>
            </div>

            <div className="hiw-flow-arrow" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>

            <div className="hiw-flow-node">
              <div className="hiw-flow-badge">02</div>
              <span className="hiw-flow-label">Create a Swap</span>
            </div>

            <div className="hiw-flow-arrow" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>

            <div className="hiw-flow-node">
              <div className="hiw-flow-badge">03</div>
              <span className="hiw-flow-label">Explore Swaps</span>
            </div>

            <div className="hiw-flow-arrow" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>

            <div className="hiw-flow-node">
              <div className="hiw-flow-badge">04</div>
              <span className="hiw-flow-label">Find a Match</span>
            </div>

            <div className="hiw-flow-arrow" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>

            <div className="hiw-flow-node">
              <div className="hiw-flow-badge">05</div>
              <span className="hiw-flow-label">Connect</span>
            </div>

            <div className="hiw-flow-arrow" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>

            <div className="hiw-flow-node hiw-flow-node--final">
              <div className="hiw-flow-badge hiw-flow-badge--final">06</div>
              <span className="hiw-flow-label">Start SkillSwapping 🚀</span>
            </div>
          </div>
        </section>

        {/* Section 4 — Real Example Section */}
        <section className="hiw-section" aria-labelledby="example-heading">
          <div className="section-header">
            <span className="section-eyebrow">Practical Example</span>
            <h2 id="example-heading" className="section-title">See How a SkillSwap Can Work</h2>
            <p className="section-description">
              Here is a realistic scenario of two community members connecting through reciprocal skills.
            </p>
          </div>

          <div className="hiw-example-container">
            <div className="hiw-person-card">
              <div className="hiw-person-header">
                <div className="hiw-person-avatar">A</div>
                <div>
                  <h3 className="hiw-person-name">Person A</h3>
                  <span className="hiw-person-tag">Member</span>
                </div>
              </div>
              <div className="hiw-person-body">
                <div className="hiw-skill-row hiw-skill-row--teach">
                  <span className="hiw-skill-tag">Can teach:</span>
                  <strong>Graphic Design 🎨</strong>
                </div>
                <div className="hiw-skill-row hiw-skill-row--learn">
                  <span className="hiw-skill-tag">Wants to learn:</span>
                  <strong>Python 💻</strong>
                </div>
              </div>
            </div>

            <div className="hiw-example-connector">
              <div className="hiw-connector-badge">Person A ↔ Person B</div>
              <div className="hiw-connector-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </div>
            </div>

            <div className="hiw-person-card">
              <div className="hiw-person-header">
                <div className="hiw-person-avatar hiw-person-avatar--alt">B</div>
                <div>
                  <h3 className="hiw-person-name">Person B</h3>
                  <span className="hiw-person-tag">Member</span>
                </div>
              </div>
              <div className="hiw-person-body">
                <div className="hiw-skill-row hiw-skill-row--teach">
                  <span className="hiw-skill-tag">Can teach:</span>
                  <strong>Python 💻</strong>
                </div>
                <div className="hiw-skill-row hiw-skill-row--learn">
                  <span className="hiw-skill-tag">Wants to learn:</span>
                  <strong>Graphic Design 🎨</strong>
                </div>
              </div>
            </div>
          </div>

          <p className="hiw-example-footer-text">
            They exchange knowledge directly with each other instead of paying for a traditional course.
          </p>
        </section>

        {/* Section 5 — Why SkillSwap? */}
        <section className="hiw-section" aria-labelledby="why-heading">
          <div className="section-header">
            <span className="section-eyebrow">Platform Value</span>
            <h2 id="why-heading" className="section-title">Why SkillSwap?</h2>
            <p className="section-description">
              SkillSwap is built to make learning flexible, human, and accessible to everyone.
            </p>
          </div>

          <div className="hiw-why-grid">
            <div className="hiw-why-card">
              <div className="hiw-why-icon">💰</div>
              <h3 className="hiw-why-title">Learn Without Traditional Course Costs</h3>
              <p className="hiw-why-desc">
                Exchange knowledge with others instead of relying entirely on expensive courses.
              </p>
            </div>

            <div className="hiw-why-card">
              <div className="hiw-why-icon">🤝</div>
              <h3 className="hiw-why-title">Learn From Real People</h3>
              <p className="hiw-why-desc">
                Connect with people who have practical knowledge and experience.
              </p>
            </div>

            <div className="hiw-why-card">
              <div className="hiw-why-icon">🔄</div>
              <h3 className="hiw-why-title">Give & Get</h3>
              <p className="hiw-why-desc">
                SkillSwap isn't just about taking. You contribute your own knowledge while learning something new.
              </p>
            </div>

            <div className="hiw-why-card">
              <div className="hiw-why-icon">🌱</div>
              <h3 className="hiw-why-title">Grow Together</h3>
              <p className="hiw-why-desc">
                Build skills, confidence, connections, and experience through meaningful exchanges.
              </p>
            </div>
          </div>
        </section>

        {/* Section 6 — Final CTA Section */}
        <section className="hiw-final-cta" aria-labelledby="cta-heading">
          <span className="section-eyebrow">Get Started Today</span>
          <h2 id="cta-heading" className="hiw-cta-title">
            Ready to Start Your SkillSwap?
          </h2>
          <p className="hiw-cta-text">
            «You already know something someone else wants to learn. And someone out there knows something you want to learn.»
          </p>
          <div className="hiw-cta-actions">
            <button
              type="button"
              className="action-button action-button--filled"
              onClick={handleCreateSwap}
            >
              <span>Create Your First Swap</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="btn-arrow-icon" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
            <button
              type="button"
              className="action-button action-button--outline"
              onClick={handleExploreSwaps}
            >
              Explore Swaps
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
