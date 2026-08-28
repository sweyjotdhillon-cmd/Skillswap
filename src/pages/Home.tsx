import { useState } from 'react';
import { Hero } from '../components/hero/Hero';
import { Navbar } from '../components/navigation/Navbar';

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

export function Home({ onNavigate }: HomeProps) {
  const [activeCategory, setActiveCategory] = useState('all');

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
            A frictionless, currency-free paradigm where knowledge is traded directly through mutual trust and SkillCredits.
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
              Detail what help or expertise you need, specify completion criteria, and allocate SkillCredits to reward your collaborator.
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
              Connect with talented peers across design, engineering, and writing. Chat directly or with permission to execute the work.
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
            <h3 className="step-title">Earn & Reinvest SkillCredits</h3>
            <p className="step-body">
              Upon successful completion, SkillCredits transfer seamlessly into your balance—ready to be spent on your next endeavor.
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
                  <span className="credit-unit">SC</span>
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
            Traditional marketplaces reduce human skill and creativity to transactional invoices. Skillswap restores authentic human reciprocity. By placing SkillCredits at the core of our exchange engine, we create a ecosystem where every hour spent helping others expands your own potential.
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

      <section className="mvp-note" id="current-mvp" aria-label="Current MVP status">
        <p>Homepage preview only. Swaps, accounts, and SkillCredit transactions arrive in future milestones.</p>
      </section>
    </div>
  );
}
