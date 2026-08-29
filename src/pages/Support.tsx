import { Navbar } from '../components/navigation/Navbar';

type SupportPageProps = {
  onNavigate?: (path: string) => void;
};

export function SupportPage({ onNavigate }: SupportPageProps) {
  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} />

      <main className="support-page">
        {/* Support Hero Section */}
        <section className="support-hero" aria-labelledby="support-hero-title">
          <span className="section-eyebrow">Help & Assistance</span>
          <h1 id="support-hero-title" className="support-hero-title">
            Support & Community
          </h1>
          <p className="support-hero-subheading">We are here to help you swap skills seamlessly.</p>
          <p className="support-hero-support">
            Whether you need help creating a swap, navigating SkillCredits, matching with potential partners, or troubleshooting your account, our team is ready to assist you every step of the way.
          </p>
          <div className="support-hero-actions">
            <button
              type="button"
              className="action-button action-button--filled"
              onClick={() => onNavigate && onNavigate('/explore')}
            >
              Explore Swaps
            </button>
            <button
              type="button"
              className="action-button action-button--outline"
              onClick={() => onNavigate && onNavigate('/')}
            >
              Back to Home
            </button>
          </div>
        </section>

        {/* Support Context Section */}
        <section className="support-section-container" aria-labelledby="how-support-helps-heading">
          <div className="section-header">
            <span className="section-eyebrow">Platform Assistance</span>
            <h2 id="how-support-helps-heading" className="section-title">How Support Helps You</h2>
            <p className="section-description">
              SkillSwap is built on direct peer-to-peer collaboration. Here is how our support team and community resources can help you achieve your learning goals:
            </p>
          </div>

          <div className="support-grid">
            <div className="support-card">
              <div className="support-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </div>
              <h3 className="support-card-title">Swap Setup & Guidelines</h3>
              <p className="support-card-body">
                Need guidance on how to phrase your skill offer or estimate fair SkillCredits? Get tips on creating attractive, clear swap listings.
              </p>
            </div>

            <div className="support-card">
              <div className="support-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                  <line x1="12" y1="6" x2="12" y2="18" />
                </svg>
              </div>
              <h3 className="support-card-title">SkillCredit Balances</h3>
              <p className="support-card-body">
                Have questions about earning, holding, or transferring SkillCredits for completed swaps? Contact us for account credit support.
              </p>
            </div>

            <div className="support-card">
              <div className="support-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="support-card-title">Collaboration & Communication</h3>
              <p className="support-card-body">
                Facing challenges while coordinating with a swap partner? We can assist with communication guidelines and resolution support.
              </p>
            </div>

            <div className="support-card">
              <div className="support-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <h3 className="support-card-title">Trust & Community Safety</h3>
              <p className="support-card-body">
                SkillSwap prioritizes mutual respect and user safety. Reach out immediately if you need help or wish to report feedback.
              </p>
            </div>
          </div>
        </section>

        {/* Contact Section - Similar Social Contacts as About */}
        <section className="support-contact-section" aria-labelledby="contact-heading">
          <div className="section-header">
            <span className="section-eyebrow">Get In Touch</span>
            <h2 id="contact-heading" className="section-title">Reach Out to Support</h2>
            <p className="section-description">
              Have a quick question or need personal assistance with your SkillSwap account? Connect directly with us via Email or WhatsApp.
            </p>
          </div>

          <div className="contact-cards-grid">
            {/* Contact Option 1 — Email */}
            <a
              href="mailto:skillswap165@gmail.com"
              className="contact-card"
              aria-label="Email Us at skillswap165@gmail.com"
            >
              <div className="contact-card-icon contact-card-icon--email">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <div className="contact-card-content">
                <span className="contact-card-label">Email Us</span>
                <span className="contact-card-value">skillswap165@gmail.com</span>
              </div>
              <div className="contact-card-arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
            </a>

            {/* Contact Option 2 — WhatsApp */}
            <a
              href="https://wa.me/916284387420"
              target="_blank"
              rel="noopener noreferrer"
              className="contact-card"
              aria-label="WhatsApp at 6284387420"
            >
              <div className="contact-card-icon contact-card-icon--whatsapp">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
              <div className="contact-card-content">
                <span className="contact-card-label">WhatsApp</span>
                <span className="contact-card-value">6284387420</span>
              </div>
              <div className="contact-card-arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
