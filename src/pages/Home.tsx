import { useState } from 'react';
import { Hero } from '../components/hero/Hero';
import { Navbar } from '../components/navigation/Navbar';
import { Footer } from '../components/navigation/Footer';
import { TeamCredibility } from '../components/ui/TeamCredibility';

type HomeProps = {
  onNavigate?: (path: string) => void;
};

const CATEGORIES = [
  { id: 'all', label: 'All Skills' },
  { id: 'design', label: 'Design & Creative' },
  { id: 'coding', label: 'Development & Tech' },
  { id: 'writing', label: 'Writing & Translation' },
  { id: 'marketing', label: 'Marketing & Growth' },
];

const DEMO_SWAPS = [
  {
    id: '1',
    category: 'design',
    title: 'Brand Identity & Logo Suite',
    offeredBy: 'Elena Rostova',
    role: 'Product Designer',
    credits: 150,
    tags: ['Figma', 'Branding', 'Vector'],
    description: 'Offering custom vector logo suites, brand typography guidelines, and color palette creation for early-stage startups.',
  },
  {
    id: '2',
    category: 'coding',
    title: 'React & TypeScript Code Review',
    offeredBy: 'Marcus Chen',
    role: 'Staff Frontend Engineer',
    credits: 120,
    tags: ['React', 'TypeScript', 'Performance'],
    description: 'Comprehensive code architecture audit, performance profiling, and refactoring guidance for modern web applications.',
  },
  {
    id: '3',
    category: 'writing',
    title: 'Editorial Tech Copywriting',
    offeredBy: 'Sophia Thorne',
    role: 'Tech Journalist',
    credits: 90,
    tags: ['Copywriting', 'SEO', 'Blogs'],
    description: 'High-converting technical landing page copy, documentation storytelling, and SEO-optimized blog articles.',
  },
  {
    id: '4',
    category: 'marketing',
    title: 'Product Launch & Funnel Strategy',
    offeredBy: 'David Kim',
    role: 'Growth Strategist',
    credits: 200,
    tags: ['Growth', 'Analytics', 'Funnel'],
    description: 'End-to-end launch plan for digital products including email series, conversion funnel audit, and distribution tactics.',
  },
];

const HOMEPAGE_FAQS = [
  {
    id: 'free-model',
    question: 'How is SkillSwap free? Is there a catch or hidden fee?',
    answer: 'SkillSwap is 100% free with zero transaction fees. Members exchange skills directly using SkillCredits—our internal currency—rather than cash. When you complete your profile setup, you receive an initial welcome allocation of 100 SkillCredits to begin proposing and accepting swaps right away.',
  },
  {
    id: 'how-credits-work',
    question: 'How do SkillCredits work?',
    answer: 'SkillCredits are SkillSwap\'s internal unit of account. When you create a swap, the required SkillCredits are reserved from your balance and held safely during the swap lifecycle. Upon completing the swap, reserved credits transfer to the fulfiller. If a qualifying swap is cancelled before fulfillment, your reserved SkillCredits are released back to your balance.',
  },
  {
    id: 'delivery-and-quality',
    question: 'What happens if someone doesn\'t deliver or does a poor job?',
    answer: 'SkillCredits are reserved for the swap and are only transferred when the swap is marked complete. If work is not submitted, reserved credits are released back to the requester according to platform lifecycle rules and automated timeouts. While SkillSwap holds credits in reserve during active swaps, the platform does not currently provide a dispute resolution mechanism for subjective quality disagreements, so we encourage setting clear requirements before accepting an exchange.',
  },
  {
    id: 'cross-skill-trading',
    question: 'Can I trade different types of skills (e.g., writing for logo design)?',
    answer: 'Yes! SkillCredits remove the need for direct 1:1 barter. You can earn SkillCredits by offering your expertise—like technical writing or coding—to one member, and then spend those earned credits to get logo design, video editing, or marketing strategy from anyone else in the community.',
  },
  {
    id: 'getting-started',
    question: 'How do I get started and earn my first credits?',
    answer: 'Signing up is fast and free. Complete your profile setup to receive your initial 100 SkillCredits. From there, you can spend credits to request a swap on the marketplace or list your own skills to fulfill swaps and earn additional credits.',
  },
];

export function Home({ onNavigate }: HomeProps) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const filteredSwaps = activeCategory === 'all'
    ? DEMO_SWAPS
    : DEMO_SWAPS.filter((s) => s.category === activeCategory);

  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} />
      <Hero onNavigate={onNavigate} />

      {/* How It Works Section */}
      <section className="home-section" id="how-it-works" aria-labelledby="how-it-works-heading">
        <div className="section-header">
          <span className="section-eyebrow">Reciprocal Ecosystem</span>
          <h2 id="how-it-works-heading" className="section-title">How Skillswap Works</h2>
          <p className="section-description">
            A frictionless, money-free paradigm where knowledge is traded directly through mutual trust and SkillCredits.
          </p>
        </div>

        <div className="how-it-works-grid">
          <div className="step-card">
            <span className="step-number">01</span>
            <div className="step-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <h3 className="step-title">Create a Swap</h3>
            <p className="step-body">
              Detail the expertise you need or offer, set clear completion goals, and allocate SkillCredits to facilitate the exchange.
            </p>
          </div>

          <div className="step-card">
            <span className="step-number">02</span>
            <div className="step-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 3 21 3 21 8" />
                <line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="8 21 3 21 3 16" />
                <line x1="15" y1="15" x2="3" y2="21" />
              </svg>
            </div>
            <h3 className="step-title">Exchange & Collaborate</h3>
            <p className="step-body">
              Connect with peers across design, engineering, and creative fields. Collaborate directly to learn, teach, and execute the exchange.
            </p>
          </div>

          <div className="step-card">
            <span className="step-number">03</span>
            <div className="step-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                <line x1="12" y1="6" x2="12" y2="18" />
              </svg>
            </div>
            <h3 className="step-title">Exchange Knowledge & Reinvest SkillCredits</h3>
            <p className="step-body">
              Upon completing a swap, SkillCredits transfer seamlessly into your balance—ready to facilitate your next learning exchange while building real expertise.
            </p>
          </div>
        </div>
      </section>

      {/* Community & Featured Swaps Section */}
      <section className="home-section" id="community" aria-labelledby="community-heading">
        <div className="section-header">
          <span className="section-eyebrow">Active Exchange Marketplace</span>
          <h2 id="community-heading" className="section-title">Explore Community Swaps</h2>
          <p className="section-description">
            Discover opportunities to contribute your expertise or request skills from top creators.
          </p>
        </div>

        <div className="category-filter-bar" role="tablist" aria-label="Swap categories">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={activeCategory === cat.id}
              className={`category-pill ${activeCategory === cat.id ? 'category-pill--active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="featured-swaps-grid">
          {filteredSwaps.map((swap) => (
            <div key={swap.id} className="swap-explore-card">
              <div className="swap-card-top">
                <div className="swap-author-info">
                  <div className="swap-author-avatar">
                    {swap.offeredBy.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <h4 className="swap-author-name">{swap.offeredBy}</h4>
                    <span className="swap-author-role">{swap.role}</span>
                  </div>
                </div>
                <div className="swap-credit-badge">
                  <span className="credit-val">+{swap.credits}</span>
                  <span className="credit-unit">SkillCredits</span>
                </div>
              </div>

              <h3 className="swap-card-title">{swap.title}</h3>
              <p className="swap-card-desc">{swap.description}</p>

              <div className="swap-tags-row">
                {swap.tags.map((tag) => (
                  <span key={tag} className="swap-tag">{tag}</span>
                ))}
              </div>

              <div className="swap-card-footer">
                <button
                  type="button"
                  className="btn-request-swap"
                  onClick={() => onNavigate && onNavigate('/create-swap')}
                >
                  Propose Exchange
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* About Section */}
      <section className="home-section about-section" id="about" aria-labelledby="about-heading">
        <div className="about-content">
          <span className="section-eyebrow">Our Philosophy</span>
          <h2 id="about-heading" className="section-title">Why Skills, Not Money?</h2>
          <p className="about-text">
            Traditional marketplaces reduce human skill and creativity to transactional invoices. Skillswap restores authentic human reciprocity. By using SkillCredits to enable fair exchange, we create an ecosystem where every hour spent helping others builds competence and expands your own potential.
          </p>

          <div className="about-metrics">
            <div className="metric-item">
              <strong>100%</strong>
              <span>Peer Driven</span>
            </div>
            <div className="metric-item">
              <strong>Zero</strong>
              <span>Transaction Fees</span>
            </div>
            <div className="metric-item">
              <strong>Infinite</strong>
              <span>Growth Loops</span>
            </div>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions / Trust Section */}
      <section className="home-section" id="faq" aria-labelledby="home-faq-heading">
        <div className="section-header">
          <span className="section-eyebrow">Trust &amp; Mechanics</span>
          <h2 id="home-faq-heading" className="section-title">Frequently Asked Questions</h2>
          <p className="section-description">
            Everything you need to know about SkillCredits, zero-fee skill trading, and how exchanges are secured.
          </p>
        </div>

        <div className="home-faq-list" role="region" aria-label="Homepage Frequently Asked Questions">
          {HOMEPAGE_FAQS.map((faq, index) => {
            const isOpen = openFaqIndex === index;
            return (
              <div key={faq.id} className={`home-faq-item ${isOpen ? 'home-faq-item--open' : ''}`}>
                <button
                  type="button"
                  id={`faq-btn-${faq.id}`}
                  className="home-faq-button"
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${faq.id}`}
                  onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                >
                  <span>{faq.question}</span>
                  <span className={`home-faq-icon ${isOpen ? 'home-faq-icon--open' : ''}`} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </button>
                {isOpen && (
                  <div
                    id={`faq-answer-${faq.id}`}
                    role="region"
                    aria-labelledby={`faq-btn-${faq.id}`}
                    className="home-faq-answer"
                  >
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="home-faq-footer-link">
          <button
            type="button"
            className="home-faq-more-btn"
            onClick={() => (onNavigate ? onNavigate('/faq') : (window.location.href = '/faq'))}
          >
            <span>Have more questions? View our full FAQ</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </section>

      {/* Team & Support Direct Contact Credibility Section */}
      <div className="home-section" style={{ paddingTop: '1rem', paddingBottom: '2rem' }}>
        <TeamCredibility />
      </div>

      <Footer onNavigate={onNavigate} />
    </div>
  );
}
