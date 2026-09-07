import { useState } from 'react';
import { Navbar } from '../components/navigation/Navbar';

type StartPageProps = {
  onNavigate?: (path: string) => void;
};

const FEATURED_START_CATEGORIES = [
  { id: 'coding', label: 'Development & Tech', icon: '💻', sample: 'React, Python, Node.js, Web Architecture' },
  { id: 'design', label: 'Design & Creative', icon: '🎨', sample: 'UI/UX, Figma, Brand Systems, Motion' },
  { id: 'writing', label: 'Writing & Content', icon: '✍️', sample: 'SEO Copywriting, Technical Docs, Storytelling' },
  { id: 'marketing', label: 'Growth & Marketing', icon: '🚀', sample: 'Funnel Optimization, Social Strategy, Analytics' },
  { id: 'video', label: 'Video & Media', icon: '🎬', sample: 'Video Editing, Post-Production, Audio Tuning' },
];

export function StartPage({ onNavigate }: StartPageProps) {
  const [selectedCategory, setSelectedCategory] = useState('coding');

  const activeCategoryObj = FEATURED_START_CATEGORIES.find((c) => c.id === selectedCategory) || FEATURED_START_CATEGORIES[0];

  const handleStartSwap = () => {
    if (onNavigate) {
      onNavigate('/signup');
    }
  };

  const handleExplore = () => {
    if (onNavigate) {
      onNavigate('/explore');
    }
  };

  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} currentPath="/start" />

      <main className="start-page" style={{ padding: '2rem 1rem 4rem', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Hero Section */}
        <section className="hiw-hero" aria-labelledby="start-hero-title">
          <span className="section-eyebrow">QuickStart Gateway</span>
          <h1 id="start-hero-title" className="hiw-hero-title">
            Start Trading Skills in Minutes
          </h1>
          <p className="hiw-hero-subheading">
            No subscription fees. No monetary barriers. Just direct human expertise exchange.
          </p>
          <p className="hiw-hero-support">
            SkillSwap enables instant peer-to-peer learning. Claim your welcome grant, choose what you want to learn or teach, and connect with experienced creators today.
          </p>

          <div className="hiw-hero-actions">
            <button
              type="button"
              className="action-button action-button--filled"
              onClick={handleStartSwap}
            >
              <span>Claim 100 Welcome Credits</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="btn-arrow-icon" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
            <button
              type="button"
              className="action-button action-button--outline"
              onClick={handleExplore}
            >
              Explore Live Swaps
            </button>
          </div>
        </section>

        {/* Welcome Grant Spotlight (Empowered Progress / Endowment Effect) */}
        <section className="hiw-section" aria-labelledby="grant-spotlight-heading" style={{ marginTop: '3rem' }}>
          <div className="hiw-step-card hiw-step-card--highlight" style={{ padding: '2rem', borderRadius: '16px' }}>
            <div className="flex items-center gap-3 mb-3" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div className="hiw-step-icon hiw-step-icon--gold">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                  <line x1="12" y1="6" x2="12" y2="18" />
                </svg>
              </div>
              <h2 id="grant-spotlight-heading" className="hiw-step-title" style={{ margin: 0, fontSize: '1.4rem' }}>
                100 SkillCredits Welcome Grant
              </h2>
            </div>
            <p className="hiw-step-desc" style={{ fontSize: '1.05rem', lineHeight: '1.6' }}>
              Every new SkillSwap account immediately receives a <strong>100 SkillCredits</strong> registration grant. Your initial balance is reserved in your escrow ledger so you can start proposing exchanges without waiting.
            </p>

            <div className="hiw-currency-banner" style={{ marginTop: '1.5rem' }}>
              <span>⚡ Start with 25% Onboarding Progress Completed Automatically</span>
            </div>
          </div>
        </section>

        {/* Quick Skill Selector Interactive Preview */}
        <section className="hiw-section" aria-labelledby="skill-match-heading" style={{ marginTop: '3rem' }}>
          <div className="section-header">
            <span className="section-eyebrow">Instant Match Preview</span>
            <h2 id="skill-match-heading" className="section-title">What Do You Want to Learn?</h2>
            <p className="section-description">
              Select a category to see popular exchange topics actively traded on SkillSwap.
            </p>
          </div>

          <div className="category-filter-bar" role="tablist" aria-label="Quickstart Categories" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {FEATURED_START_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={selectedCategory === cat.id}
                className={`category-pill ${selectedCategory === cat.id ? 'category-pill--active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
                style={{ padding: '0.6rem 1.2rem', fontSize: '0.95rem' }}
              >
                <span style={{ marginRight: '0.4rem' }}>{cat.icon}</span>
                {cat.label}
              </button>
            ))}
          </div>

          <div className="hiw-match-box" style={{ maxWidth: '700px', margin: '0 auto', textAlign: 'center', padding: '1.75rem' }}>
            <div className="hiw-match-badge" style={{ marginBottom: '1rem' }}>Active Exchanges in {activeCategoryObj.label}</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-color)', marginBottom: '0.75rem' }}>
              Sample Skills:
            </h3>
            <p style={{ fontSize: '1.05rem', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '1.5rem' }}>
              {activeCategoryObj.sample}
            </p>
            <button
              type="button"
              className="action-button action-button--filled"
              onClick={handleExplore}
              style={{ display: 'inline-flex', margin: '0 auto' }}
            >
              View Swaps in {activeCategoryObj.label} →
            </button>
          </div>
        </section>

        {/* 3 Quick Steps */}
        <section className="hiw-section" aria-labelledby="quick-steps-heading" style={{ marginTop: '3rem' }}>
          <div className="section-header">
            <span className="section-eyebrow">Simple Onboarding</span>
            <h2 id="quick-steps-heading" className="section-title">How to Get Started Today</h2>
          </div>

          <div className="hiw-steps-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <div className="hiw-step-card">
              <span className="step-number">01</span>
              <h3 className="hiw-step-title">Create Free Account</h3>
              <p className="hiw-step-desc">
                Sign up in seconds and instantly receive your 100 SkillCredits welcome grant.
              </p>
            </div>

            <div className="hiw-step-card">
              <span className="step-number">02</span>
              <h3 className="hiw-step-title">Set Your Profile</h3>
              <p className="hiw-step-desc">
                List the skills you can teach and what you want to learn so peers can discover you.
              </p>
            </div>

            <div className="hiw-step-card">
              <span className="step-number">03</span>
              <h3 className="hiw-step-title">Exchange & Grow</h3>
              <p className="hiw-step-desc">
                Propose exchanges, collaborate directly in real time, and expand your expertise.
              </p>
            </div>
          </div>
        </section>

        {/* Final Call To Action */}
        <section className="hiw-final-cta" aria-labelledby="start-cta-heading" style={{ marginTop: '4rem' }}>
          <span className="section-eyebrow">Join the Exchange</span>
          <h2 id="start-cta-heading" className="hiw-cta-title">
            Ready to Unlock Your Expertise?
          </h2>
          <p className="hiw-cta-text">
            Join thousands of creators sharing knowledge. Skills are your currency.
          </p>
          <div className="hiw-cta-actions">
            <button
              type="button"
              className="action-button action-button--filled"
              onClick={handleStartSwap}
            >
              Get Started Now — It's Free
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
