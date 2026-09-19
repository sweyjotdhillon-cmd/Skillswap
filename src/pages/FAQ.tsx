import { useState } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { Footer } from '../components/navigation/Footer';

type FAQPageProps = {
  onNavigate?: (path: string) => void;
};

type FAQCategory = 'all' | 'trust' | 'use-cases';

type FAQItem = {
  id: string;
  category: 'trust' | 'use-cases';
  categoryLabel: string;
  question: string;
  answer: string;
  linkText?: string;
  linkHref?: string;
};

const FAQ_ITEMS: FAQItem[] = [
  // CATEGORY A — How It Works & Trust
  {
    id: 'free-model',
    category: 'trust',
    categoryLabel: 'How It Works & Trust',
    question: 'How is SkillSwap free? Is there a catch or hidden fee?',
    answer: 'SkillSwap is 100% free with zero transaction fees. Members exchange skills directly using SkillCredits—our internal currency—rather than cash. When you complete your profile setup, you receive an initial welcome allocation of 100 SkillCredits to begin proposing and accepting swaps right away.',
    linkText: 'Join SkillSwap Free',
    linkHref: '/signup',
  },
  {
    id: 'how-credits-work',
    category: 'trust',
    categoryLabel: 'How It Works & Trust',
    question: 'How do SkillCredits work?',
    answer: 'SkillCredits are SkillSwap\'s internal unit of account. When you create a swap, the required SkillCredits are reserved from your balance and held safely during the swap lifecycle. Upon completing the swap, reserved credits transfer to the fulfiller. If a qualifying swap is cancelled before fulfillment, your reserved SkillCredits are released back to your balance.',
    linkText: 'Explore Marketplace',
    linkHref: '/explore',
  },
  {
    id: 'delivery-and-quality',
    category: 'trust',
    categoryLabel: 'How It Works & Trust',
    question: 'What happens if someone doesn\'t deliver or does a poor job?',
    answer: 'SkillCredits are reserved for the swap and are only transferred when the swap is marked complete. If work is not submitted, reserved credits are released back to the requester according to platform lifecycle rules and automated timeouts. While SkillSwap holds credits in reserve during active swaps, the platform does not currently provide a dispute resolution mechanism for subjective quality disagreements, so we encourage setting clear requirements before accepting an exchange.',
  },
  {
    id: 'cross-skill-trading',
    category: 'trust',
    categoryLabel: 'How It Works & Trust',
    question: 'Can I trade different types of skills (e.g., writing for logo design)?',
    answer: 'Yes! SkillCredits remove the need for direct 1:1 barter. You can earn SkillCredits by offering your expertise—like technical writing or coding—to one member, and then spend those earned credits to get logo design, video editing, or marketing strategy from anyone else in the community.',
    linkText: 'Create a Swap',
    linkHref: '/create-swap',
  },
  {
    id: 'getting-started',
    category: 'trust',
    categoryLabel: 'How It Works & Trust',
    question: 'How do I get started and earn my first credits?',
    answer: 'Signing up is fast and free. Complete your profile setup to receive your initial 100 SkillCredits. From there, you can spend credits to request a swap on the marketplace or list your own skills to fulfill swaps and earn additional credits.',
    linkText: 'Sign Up Free',
    linkHref: '/signup',
  },

  // CATEGORY B — Popular Skill Swaps / Use Cases
  {
    id: 'find-designer',
    category: 'use-cases',
    categoryLabel: 'Popular Skill Swaps',
    question: 'Where can I find someone to design something if I offer my skills in return?',
    answer: 'SkillSwap is a peer-to-peer platform where you can find designers for UI/UX, graphic design, logos, and branding by offering your own skills in return. Using SkillCredits, you can trade coding, writing, video editing, translation, or tech help for professional design work without using money.',
    linkText: 'Explore Open Design Swaps',
    linkHref: '/explore',
  },
  {
    id: 'skill-swap-community',
    category: 'use-cases',
    categoryLabel: 'Popular Skill Swaps',
    question: 'Where can I find a skill-swap community?',
    answer: 'SkillSwap provides a dedicated online skill-swap community where creators, freelancers, and learners exchange talents. On SkillSwap, you can browse open skill swaps across categories like design, development, writing, and video editing, connect with collaborators, and earn or spend SkillCredits in a fair, secure ecosystem.',
    linkText: 'Join the Community',
    linkHref: '/signup',
  },
  {
    id: 'writing-for-design',
    category: 'use-cases',
    categoryLabel: 'Popular Skill Swaps',
    question: 'Can I trade writing skills for logo/design help?',
    answer: 'Yes! On SkillSwap, you can directly trade writing skills—such as copywriting, technical writing, or content creation—for logo design and graphic assets. You can post a custom swap offer describing what you need and what you offer, or request an existing design swap using your SkillCredits.',
    linkText: 'Browse Marketplace',
    linkHref: '/explore',
  },
  {
    id: 'trade-skills',
    category: 'use-cases',
    categoryLabel: 'Popular Skill Swaps',
    question: 'Where can I trade my skills for someone else\'s skills?',
    answer: 'You can trade your skills for someone else\'s skills on SkillSwap. The platform features an open marketplace where members offer and request services in design, web development, content writing, video production, language learning, and technical support using SkillCredits.',
    linkText: 'List Your Offer',
    linkHref: '/create-swap',
  },
  {
    id: 'free-tech-help',
    category: 'use-cases',
    categoryLabel: 'Popular Skill Swaps',
    question: 'Where can I get free tech help by offering my own skills in return?',
    answer: 'SkillSwap allows you to get free technical support, software troubleshooting, website debugging, or coding assistance by offering your own skills in return. You earn SkillCredits by helping others with your talents and spend those credits to receive tech help from experienced community members.',
    linkText: 'Browse Tech Swaps',
    linkHref: '/explore',
  },
];

export function FAQPage({ onNavigate }: FAQPageProps) {
  const [activeCategory, setActiveCategory] = useState<FAQCategory>('all');
  const [openItemIds, setOpenFaqIds] = useState<Set<string>>(new Set(['free-model', 'find-designer']));

  const filteredItems = FAQ_ITEMS.filter((item) => {
    if (activeCategory === 'trust') return item.category === 'trust';
    if (activeCategory === 'use-cases') return item.category === 'use-cases';
    return true;
  });

  const toggleItem = (id: string) => {
    setOpenFaqIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href?: string) => {
    if (!href) return;
    e.preventDefault();
    if (onNavigate) {
      onNavigate(href);
    } else {
      window.location.href = href;
    }
  };

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

        {/* Segmented Category Filter Controls */}
        <div className="faq-category-bar" role="tablist" aria-label="FAQ categories">
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'all'}
            className={`faq-tab-pill ${activeCategory === 'all' ? 'faq-tab-pill--active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            All Questions ({FAQ_ITEMS.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'trust'}
            className={`faq-tab-pill ${activeCategory === 'trust' ? 'faq-tab-pill--active' : ''}`}
            onClick={() => setActiveCategory('trust')}
          >
            How It Works &amp; Trust (5)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'use-cases'}
            className={`faq-tab-pill ${activeCategory === 'use-cases' ? 'faq-tab-pill--active' : ''}`}
            onClick={() => setActiveCategory('use-cases')}
          >
            Popular Skill Swaps &amp; Use Cases (5)
          </button>
        </div>

        {/* FAQ Accordions List */}
        <section className="faq-grid" aria-label="Frequently Asked Questions list" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {filteredItems.map((item, index) => {
            const isOpen = openItemIds.has(item.id);
            return (
              <article key={item.id} className={`faq-accordion-card ${isOpen ? 'faq-accordion-card--open' : ''}`}>
                <button
                  type="button"
                  id={`faq-page-btn-${item.id}`}
                  className="faq-accordion-btn"
                  aria-expanded={isOpen}
                  aria-controls={`faq-page-ans-${item.id}`}
                  onClick={() => toggleItem(item.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                    <span className="faq-badge" aria-hidden="true" style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(214, 166, 74, 0.15)', color: '#a8781d', fontSize: '0.875rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '3px' }}>
                      {index + 1}
                    </span>
                    <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(1.15rem, 2vw, 1.35rem)', fontWeight: 700, color: 'var(--text-color, #11161c)', lineHeight: 1.35, margin: 0 }}>
                      {item.question}
                    </h2>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <span className="faq-card-tag">{item.categoryLabel}</span>
                    <span className={`home-faq-icon ${isOpen ? 'home-faq-icon--open' : ''}`} aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div
                    id={`faq-page-ans-${item.id}`}
                    role="region"
                    aria-labelledby={`faq-page-btn-${item.id}`}
                    className="faq-accordion-content"
                  >
                    <p style={{ margin: 0, color: 'var(--text-muted, rgba(17, 22, 28, 0.7))', lineHeight: 1.65 }}>
                      {item.answer}
                    </p>
                    {item.linkHref && item.linkText && (
                      <div style={{ marginTop: '0.85rem' }}>
                        <a
                          href={item.linkHref}
                          onClick={(e) => handleLinkClick(e, item.linkHref)}
                          style={{ color: '#a8781d', fontWeight: 600, textDecoration: 'underline', fontSize: '0.925rem' }}
                        >
                          {item.linkText} &rarr;
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
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
