import { Navbar } from '../components/navigation/Navbar';
import { Footer } from '../components/navigation/Footer';

type FAQPageProps = {
  onNavigate?: (path: string) => void;
};

export function FAQPage({ onNavigate }: FAQPageProps) {
  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} />

      <main className="faq-main" style={{ flex: 1, width: '100%', maxWidth: '900px', margin: '0 auto', padding: '2.5rem 0 3.5rem' }}>
        <section className="faq-hero-section" style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <span className="section-eyebrow">Help &amp; Knowledge Base</span>
          <h1 className="section-title">Frequently Asked Questions</h1>
          <p className="section-description">
            Everything you need to know about trading skills, earning SkillCredits, and getting help with design, writing, coding, and technical projects on SkillSwap.
          </p>
        </section>

        <section className="faq-grid" aria-label="Frequently Asked Questions" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Question 1 */}
          <article className="faq-card" style={{ background: 'var(--card-bg, #ffffff)', border: '1px solid var(--card-border, rgba(17, 22, 28, 0.09))', borderRadius: '20px', padding: '1.85rem 2rem', boxShadow: '0 4px 20px rgba(17, 22, 28, 0.02)' }}>
            <div className="faq-card-header" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', marginBottom: '0.75rem' }}>
              <span className="faq-badge" aria-hidden="true" style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(214, 166, 74, 0.15)', color: '#a8781d', fontSize: '0.875rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '3px' }}>Q</span>
              <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(1.25rem, 2vw, 1.45rem)', fontWeight: 700, color: 'var(--text-color, #11161c)', lineHeight: 1.35, margin: 0 }}>
                Where can I find someone to design something if I offer my skills in return?
              </h2>
            </div>
            <p style={{ color: 'var(--text-muted, rgba(17, 22, 28, 0.65))', fontSize: '1rem', lineHeight: 1.65, margin: 0 }}>
              SkillSwap is a peer-to-peer platform where you can find designers for UI/UX, graphic design, logos, and branding by offering your own skills in return. Using SkillCredits, you can trade coding, writing, video editing, translation, or tech help for professional design work without using money. You can{' '}
              <a href="/explore" onClick={(e) => { e.preventDefault(); onNavigate?.('/explore'); }} style={{ color: '#a8781d', fontWeight: 600, textDecoration: 'underline' }}>
                explore open design swaps
              </a>{' '}
              or{' '}
              <a href="/create-swap" onClick={(e) => { e.preventDefault(); onNavigate?.('/create-swap'); }} style={{ color: '#a8781d', fontWeight: 600, textDecoration: 'underline' }}>
                create your own swap offer
              </a>{' '}
              today.
            </p>
          </article>

          {/* Question 2 */}
          <article className="faq-card" style={{ background: 'var(--card-bg, #ffffff)', border: '1px solid var(--card-border, rgba(17, 22, 28, 0.09))', borderRadius: '20px', padding: '1.85rem 2rem', boxShadow: '0 4px 20px rgba(17, 22, 28, 0.02)' }}>
            <div className="faq-card-header" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', marginBottom: '0.75rem' }}>
              <span className="faq-badge" aria-hidden="true" style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(214, 166, 74, 0.15)', color: '#a8781d', fontSize: '0.875rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '3px' }}>Q</span>
              <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(1.25rem, 2vw, 1.45rem)', fontWeight: 700, color: 'var(--text-color, #11161c)', lineHeight: 1.35, margin: 0 }}>
                Where can I find a skill-swap community?
              </h2>
            </div>
            <p style={{ color: 'var(--text-muted, rgba(17, 22, 28, 0.65))', fontSize: '1rem', lineHeight: 1.65, margin: 0 }}>
              SkillSwap provides a dedicated online skill-swap community where creators, freelancers, and learners exchange talents. On SkillSwap, you can browse open skill swaps across categories like design, development, writing, and video editing, connect with collaborators, and earn or spend SkillCredits in a fair, secure ecosystem.{' '}
              <a href="/signup" onClick={(e) => { e.preventDefault(); onNavigate?.('/signup'); }} style={{ color: '#a8781d', fontWeight: 600, textDecoration: 'underline' }}>
                Sign up for free
              </a>{' '}
              to join our growing community.
            </p>
          </article>

          {/* Question 3 */}
          <article className="faq-card" style={{ background: 'var(--card-bg, #ffffff)', border: '1px solid var(--card-border, rgba(17, 22, 28, 0.09))', borderRadius: '20px', padding: '1.85rem 2rem', boxShadow: '0 4px 20px rgba(17, 22, 28, 0.02)' }}>
            <div className="faq-card-header" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', marginBottom: '0.75rem' }}>
              <span className="faq-badge" aria-hidden="true" style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(214, 166, 74, 0.15)', color: '#a8781d', fontSize: '0.875rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '3px' }}>Q</span>
              <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(1.25rem, 2vw, 1.45rem)', fontWeight: 700, color: 'var(--text-color, #11161c)', lineHeight: 1.35, margin: 0 }}>
                Can I trade writing skills for logo/design help?
              </h2>
            </div>
            <p style={{ color: 'var(--text-muted, rgba(17, 22, 28, 0.65))', fontSize: '1rem', lineHeight: 1.65, margin: 0 }}>
              Yes! On SkillSwap, you can directly trade writing skills—such as copywriting, technical writing, or content creation—for logo design and graphic assets. You can post a custom swap offer describing what you need and what you offer, or request an existing design swap using your SkillCredits. Check out available design listings on our{' '}
              <a href="/explore" onClick={(e) => { e.preventDefault(); onNavigate?.('/explore'); }} style={{ color: '#a8781d', fontWeight: 600, textDecoration: 'underline' }}>
                Explore Swaps marketplace
              </a>.
            </p>
          </article>

          {/* Question 4 */}
          <article className="faq-card" style={{ background: 'var(--card-bg, #ffffff)', border: '1px solid var(--card-border, rgba(17, 22, 28, 0.09))', borderRadius: '20px', padding: '1.85rem 2rem', boxShadow: '0 4px 20px rgba(17, 22, 28, 0.02)' }}>
            <div className="faq-card-header" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', marginBottom: '0.75rem' }}>
              <span className="faq-badge" aria-hidden="true" style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(214, 166, 74, 0.15)', color: '#a8781d', fontSize: '0.875rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '3px' }}>Q</span>
              <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(1.25rem, 2vw, 1.45rem)', fontWeight: 700, color: 'var(--text-color, #11161c)', lineHeight: 1.35, margin: 0 }}>
                Where can I trade my skills for someone else's skills?
              </h2>
            </div>
            <p style={{ color: 'var(--text-muted, rgba(17, 22, 28, 0.65))', fontSize: '1rem', lineHeight: 1.65, margin: 0 }}>
              You can trade your skills for someone else's skills on SkillSwap. The platform features an open marketplace where members offer and request services in design, web development, content writing, video production, language learning, and technical support using SkillCredits. Simply{' '}
              <a href="/create-swap" onClick={(e) => { e.preventDefault(); onNavigate?.('/create-swap'); }} style={{ color: '#a8781d', fontWeight: 600, textDecoration: 'underline' }}>
                list the skill you offer
              </a>{' '}
              and the service you need in return.
            </p>
          </article>

          {/* Question 5 */}
          <article className="faq-card" style={{ background: 'var(--card-bg, #ffffff)', border: '1px solid var(--card-border, rgba(17, 22, 28, 0.09))', borderRadius: '20px', padding: '1.85rem 2rem', boxShadow: '0 4px 20px rgba(17, 22, 28, 0.02)' }}>
            <div className="faq-card-header" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', marginBottom: '0.75rem' }}>
              <span className="faq-badge" aria-hidden="true" style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(214, 166, 74, 0.15)', color: '#a8781d', fontSize: '0.875rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '3px' }}>Q</span>
              <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(1.25rem, 2vw, 1.45rem)', fontWeight: 700, color: 'var(--text-color, #11161c)', lineHeight: 1.35, margin: 0 }}>
                Where can I get free tech help by offering my own skills in return?
              </h2>
            </div>
            <p style={{ color: 'var(--text-muted, rgba(17, 22, 28, 0.65))', fontSize: '1rem', lineHeight: 1.65, margin: 0 }}>
              SkillSwap allows you to get free technical support, software troubleshooting, website debugging, or coding assistance by offering your own skills in return. You earn SkillCredits by helping others with your talents and spend those credits to receive tech help from experienced community members. Start by{' '}
              <a href="/explore" onClick={(e) => { e.preventDefault(); onNavigate?.('/explore'); }} style={{ color: '#a8781d', fontWeight: 600, textDecoration: 'underline' }}>
                browsing tech help swaps
              </a>{' '}
              or offering your expertise on SkillSwap.
            </p>
          </article>
        </section>

        {/* Contact Support Section */}
        <section className="faq-contact-section" aria-labelledby="faq-contact-heading" style={{ marginTop: '4.5rem', borderTop: '1px solid var(--shell-border, rgba(17, 22, 28, 0.08))', paddingTop: '3.5rem', textAlign: 'center' }}>
          <div className="faq-contact-header" style={{ marginBottom: '2.25rem' }}>
            <span className="section-eyebrow">Need More Help?</span>
            <h2 id="faq-contact-heading" className="section-title" style={{ fontSize: 'clamp(1.8rem, 3.2vw, 2.6rem)' }}>
              Contact Support
            </h2>
            <p className="section-description">
              If you have a question, need help with SkillSwap, or want to report an issue, contact us through email or WhatsApp.
            </p>
          </div>

          <div className="contact-cards-grid">
            {/* Email Contact Card */}
            <a
              href="mailto:skillswap165@gmail.com"
              className="contact-card"
              aria-label="Email Us at skillswap165@gmail.com"
            >
              <div className="contact-card-icon contact-card-icon--email" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <div className="contact-card-content">
                <span className="contact-card-label">Email Us</span>
                <span className="contact-card-value">skillswap165@gmail.com</span>
              </div>
              <div className="contact-card-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
            </a>

            {/* WhatsApp Contact Card */}
            <a
              href="https://wa.me/916284387420"
              target="_blank"
              rel="noopener noreferrer"
              className="contact-card"
              aria-label="WhatsApp at 6284387420"
            >
              <div className="contact-card-icon contact-card-icon--whatsapp" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
              <div className="contact-card-content">
                <span className="contact-card-label">WhatsApp</span>
                <span className="contact-card-value">6284387420</span>
              </div>
              <div className="contact-card-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
            </a>
          </div>
        </section>

        {/* CTA Banner */}
        <section className="faq-cta-banner" style={{ marginTop: '4.5rem', background: '#11161c', color: '#ffffff', borderRadius: '28px', padding: 'clamp(2.5rem, 5vw, 3.5rem) clamp(1.5rem, 4vw, 3rem)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 20px 50px rgba(17, 22, 28, 0.18)' }}>
          <span className="section-eyebrow" style={{ color: '#d6a64a' }}>Ready to Trade Skills?</span>
          <h2 className="faq-cta-title" style={{ margin: '0.4rem 0 1rem', fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(2rem, 3.8vw, 3.2rem)', color: '#ffffff', lineHeight: 1.1 }}>
            Trade Skills Without Money
          </h2>
          <p className="faq-cta-text" style={{ fontSize: 'clamp(1rem, 1.2vw, 1.15rem)', lineHeight: 1.6, color: 'rgba(255, 255, 255, 0.8)', maxWidth: '620px', margin: '0 0 2.25rem' }}>
            Join SkillSwap today and start earning SkillCredits for your skills while getting the help you need.
          </p>
          <div className="faq-cta-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="action-button action-button--filled"
              onClick={() => onNavigate?.('/signup')}
            >
              <span>Join SkillSwap Free</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
            <button
              type="button"
              className="action-button action-button--outline"
              onClick={() => onNavigate?.('/explore')}
            >
              <span>Browse Marketplace</span>
            </button>
          </div>
        </section>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  );
}
