import React, { useState, useEffect } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { Footer } from '../components/navigation/Footer';

interface FAQPageProps {
  onNavigate?: (path: string) => void;
}

interface FAQItem {
  id: number;
  question: string;
  answer: string;
  category: 'trust' | 'use-cases';
  linkText?: string;
  linkHref?: string;
}

const FAQ_ITEMS: FAQItem[] = [
  // Category A: How It Works & Trust
  {
    id: 1,
    category: 'trust',
    question: 'How is SkillSwap free? Is there a catch or hidden fee?',
    answer:
      'SkillSwap is 100% free with zero transaction fees. Members exchange skills directly using SkillCredits—our internal currency—rather than cash. When you complete your profile setup, you receive an initial welcome allocation of 100 SkillCredits to begin proposing and accepting swaps right away.',
  },
  {
    id: 2,
    category: 'trust',
    question: 'How do SkillCredits work?',
    answer:
      "SkillCredits are SkillSwap's internal unit of account. When you create a swap, the required SkillCredits are reserved from your balance and held safely during the swap lifecycle. Upon completing the swap, reserved credits transfer to the fulfiller. If a qualifying swap is cancelled before fulfillment, your reserved SkillCredits are released back to your balance.",
  },
  {
    id: 3,
    category: 'trust',
    question: "What happens if someone doesn't deliver or does a poor job?",
    answer:
      'SkillCredits are reserved for the swap and are only transferred when the swap is marked complete. If work is not submitted, reserved credits are released back to the requester according to platform lifecycle rules and automated timeouts. While SkillSwap holds credits in reserve during active swaps, the platform does not currently provide a dispute resolution mechanism for subjective quality disagreements, so we encourage setting clear requirements before accepting an exchange.',
  },
  {
    id: 4,
    category: 'trust',
    question: 'Can I trade different types of skills (e.g., writing for logo design)?',
    answer:
      'Yes! SkillCredits remove the need for direct 1:1 barter. You can earn SkillCredits by offering your expertise—like technical writing or coding—to one member, and then spend those earned credits to get logo design, video editing, or marketing strategy from anyone else in the community.',
    linkText: 'Create a swap offer',
    linkHref: '/create-swap',
  },
  {
    id: 5,
    category: 'trust',
    question: 'How do I get started and earn my first credits?',
    answer:
      'Signing up is fast and free. Complete your profile setup to receive your initial 100 SkillCredits. From there, you can spend credits to request a swap on the marketplace or list your own skills to fulfill swaps and earn additional credits.',
    linkText: 'Create your free account',
    linkHref: '/signup',
  },

  // Category B: Popular Skill Swaps / Use Cases
  {
    id: 6,
    category: 'use-cases',
    question: 'Where can I find someone to design something if I offer my skills in return?',
    answer:
      'SkillSwap is a peer-to-peer platform where you can find designers for UI/UX, graphic design, logos, and branding by offering your own skills in return. Using SkillCredits, you can trade coding, writing, video editing, translation, or tech help for professional design work without using money.',
    linkText: 'Explore open design swaps',
    linkHref: '/explore',
  },
  {
    id: 7,
    category: 'use-cases',
    question: 'Where can I find a skill-swap community?',
    answer:
      'SkillSwap provides a dedicated online skill-swap community where creators, freelancers, and learners exchange talents. On SkillSwap, you can browse open skill swaps across categories like design, development, writing, and video editing, connect with collaborators, and earn or spend SkillCredits in a fair, secure ecosystem.',
    linkText: 'Sign up for free',
    linkHref: '/signup',
  },
  {
    id: 8,
    category: 'use-cases',
    question: 'Can I trade writing skills for logo/design help?',
    answer:
      'Yes! On SkillSwap, you can directly trade writing skills—such as copywriting, technical writing, or content creation—for logo design and graphic assets. You can post a custom swap offer describing what you need and what you offer, or request an existing design swap using your SkillCredits.',
    linkText: 'Explore Swaps marketplace',
    linkHref: '/explore',
  },
  {
    id: 9,
    category: 'use-cases',
    question: "Where can I trade my skills for someone else's skills?",
    answer:
      "You can trade your skills for someone else's skills on SkillSwap. The platform features an open marketplace where members offer and request services in design, web development, content writing, video production, language learning, and technical support using SkillCredits.",
    linkText: 'List the skill you offer',
    linkHref: '/create-swap',
  },
  {
    id: 10,
    category: 'use-cases',
    question: 'Where can I get free tech help by offering my own skills in return?',
    answer:
      'SkillSwap allows you to get free technical support, software troubleshooting, website debugging, or coding assistance by offering your own skills in return. You earn SkillCredits by helping others with your talents and spend those credits to receive tech help from experienced community members.',
    linkText: 'Browse tech help swaps',
    linkHref: '/explore',
  },
];

export const FAQPage: React.FC<FAQPageProps> = ({ onNavigate }) => {
  const [activeCategory, setActiveCategory] = useState<'all' | 'trust' | 'use-cases'>('all');
  const [openItemIds, setOpenItemIds] = useState<Set<number>>(new Set([1]));

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = 'Frequently Asked Questions — SkillSwap';

    // Inject FAQPage Schema.org Structured Data
    const scriptId = 'faq-schema-structured-data';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }

    const faqSchemaData = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ_ITEMS.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    };

    script.textContent = JSON.stringify(faqSchemaData);

    return () => {
      const existingScript = document.getElementById(scriptId);
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []);

  const toggleItem = (id: number) => {
    setOpenItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredItems = FAQ_ITEMS.filter((item) => {
    if (activeCategory === 'all') return true;
    return item.category === activeCategory;
  });

  const navigateTo = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.location.href = path;
    }
  };

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    navigateTo(href);
  };

  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} />

      <main className="faq-main">
        {/* Hero Section */}
        <section className="faq-hero-section">
          <span className="section-eyebrow">Got Questions?</span>
          <h1 className="section-title">
            Frequently Asked Questions
          </h1>
          <p className="section-description">
            Everything you need to know about SkillSwap, SkillCredits, skill exchanges, and trading talents without cash.
          </p>
        </section>

        {/* Category Filter Pills */}
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
        <section className="faq-grid" aria-label="Frequently Asked Questions list">
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
                  <span className="faq-badge" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h2 className="faq-question-heading">
                    {item.question}
                  </h2>
                  <span className={`faq-chevron-icon ${isOpen ? 'faq-chevron-icon--open' : ''}`} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </button>

                {isOpen && (
                  <div
                    id={`faq-page-ans-${item.id}`}
                    role="region"
                    aria-labelledby={`faq-page-btn-${item.id}`}
                    className="faq-accordion-content"
                  >
                    <p className="faq-answer-text">
                      {item.answer}
                    </p>
                    {item.linkHref && item.linkText && (
                      <div className="faq-answer-link-wrapper">
                        <a
                          href={item.linkHref}
                          onClick={(e) => handleLinkClick(e, item.linkHref!)}
                          className="faq-answer-link"
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
        <section className="faq-contact-section" aria-labelledby="faq-contact-heading">
          <div className="faq-contact-header">
            <span className="section-eyebrow">Need More Help?</span>
            <h2 id="faq-contact-heading" className="section-title">
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
        <section className="faq-cta-banner">
          <span className="section-eyebrow" style={{ color: '#d6a64a' }}>Ready to Trade Skills?</span>
          <h2 className="faq-cta-title">
            Trade Skills Without Money
          </h2>
          <p className="faq-cta-text">
            Join SkillSwap today and start earning SkillCredits for your skills while getting the help you need.
          </p>
          <div className="faq-cta-actions">
            <button
              type="button"
              className="action-button action-button--filled"
              onClick={() => navigateTo('/signup')}
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
              onClick={() => navigateTo('/explore')}
            >
              <span>Browse Marketplace</span>
            </button>
          </div>
        </section>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  );
};
