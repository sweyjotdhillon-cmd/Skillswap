import { useEffect } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { Footer } from '../components/navigation/Footer';

type WhatIsSkillExchangeProps = {
  onNavigate?: (path: string) => void;
};

export function WhatIsSkillExchangePage({ onNavigate }: WhatIsSkillExchangeProps) {
  useEffect(() => {
    // Set page title
    document.title = 'What Is Skill Exchange? | SkillSwap';

    // Set meta description
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    const originalDescription = metaDescription.getAttribute('content');
    metaDescription.setAttribute(
      'content',
      'Learn what skill exchange is, how peer-to-peer skill sharing works using SkillCredits, and how to find skill partners on SkillSwap without cash transactions.'
    );

    // Inject WebPage JSON-LD structured data
    const scriptId = 'json-ld-what-is-skill-exchange';
    let scriptTag = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.id = scriptId;
      scriptTag.type = 'application/ld+json';
      document.head.appendChild(scriptTag);
    }

    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': 'https://skillswap.sweyjotdhillon.workers.dev/learn/what-is-skill-exchange#webpage',
      'url': 'https://skillswap.sweyjotdhillon.workers.dev/learn/what-is-skill-exchange',
      'name': 'What Is Skill Exchange? | SkillSwap',
      'description': 'A comprehensive guide explaining the concept of skill exchange, peer-to-peer skill sharing, and how SkillCredits power collaborative learning on SkillSwap.',
      'isPartOf': {
        '@id': 'https://skillswap.sweyjotdhillon.workers.dev/#website'
      },
      'publisher': {
        '@id': 'https://skillswap.sweyjotdhillon.workers.dev/#organization'
      },
      'breadcrumb': {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          {
            '@type': 'ListItem',
            'position': 1,
            'name': 'Home',
            'item': 'https://skillswap.sweyjotdhillon.workers.dev/'
          },
          {
            '@type': 'ListItem',
            'position': 2,
            'name': 'Learn',
            'item': 'https://skillswap.sweyjotdhillon.workers.dev/learn/what-is-skill-exchange'
          },
          {
            '@type': 'ListItem',
            'position': 3,
            'name': 'What Is Skill Exchange?',
            'item': 'https://skillswap.sweyjotdhillon.workers.dev/learn/what-is-skill-exchange'
          }
        ]
      }
    };

    scriptTag.textContent = JSON.stringify(structuredData);

    return () => {
      // Revert meta description on unmount
      if (metaDescription && originalDescription) {
        metaDescription.setAttribute('content', originalDescription);
      }
      // Remove JSON-LD script on unmount
      const tag = document.getElementById(scriptId);
      if (tag && tag.parentNode) {
        tag.parentNode.removeChild(tag);
      }
    };
  }, []);

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    if (onNavigate) {
      onNavigate(href);
    } else {
      window.location.href = href;
    }
  };

  const handleButtonClick = (href: string) => {
    if (onNavigate) {
      onNavigate(href);
    } else {
      window.location.href = href;
    }
  };

  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} />

      <main
        className="learn-page-main"
        style={{
          flex: 1,
          width: '100%',
          maxWidth: '920px',
          margin: '0 auto',
          padding: '2.5rem 1rem 4rem',
        }}
      >
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" style={{ marginBottom: '1.5rem' }}>
          <ol
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              listStyle: 'none',
              padding: 0,
              margin: 0,
              fontSize: '0.875rem',
              color: 'var(--text-muted, #64748b)',
            }}
          >
            <li>
              <a
                href="/"
                onClick={(e) => handleLinkClick(e, '/')}
                style={{ color: 'var(--text-muted, #64748b)', textDecoration: 'none' }}
              >
                Home
              </a>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <span style={{ color: 'var(--text-muted, #64748b)' }}>Learn</span>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" style={{ fontWeight: 600, color: 'var(--text-color, #0f172a)' }}>
              What Is Skill Exchange?
            </li>
          </ol>
        </nav>

        {/* Hero Section */}
        <header style={{ marginBottom: '3.5rem', textAlign: 'center' }}>
          <span className="section-eyebrow">Product Education</span>
          <h1
            style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontSize: 'clamp(2.2rem, 4.5vw, 3.4rem)',
              fontWeight: 800,
              lineHeight: 1.15,
              color: 'var(--text-color, #11161c)',
              margin: '0.5rem 0 1.25rem',
            }}
          >
            What Is Skill Exchange?
          </h1>
          <p
            style={{
              fontSize: 'clamp(1.05rem, 1.8vw, 1.25rem)',
              lineHeight: 1.6,
              color: 'var(--text-muted, rgba(17, 22, 28, 0.75))',
              maxWidth: '720px',
              margin: '0 auto',
            }}
          >
            A practical guide to peer-to-peer skill sharing, collaborative learning, and how SkillCredits power skill trading on SkillSwap without cash transactions.
          </p>
        </header>

        {/* Section 1: Definition */}
        <section
          style={{
            marginBottom: '3rem',
            background: 'var(--color-surface, #ffffff)',
            border: '1px solid var(--shell-border, rgba(17, 22, 28, 0.08))',
            borderRadius: '20px',
            padding: '2rem',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
          }}
        >
          <h2
            style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontSize: 'clamp(1.5rem, 2.8vw, 1.9rem)',
              fontWeight: 700,
              color: 'var(--text-color, #11161c)',
              marginTop: 0,
              marginBottom: '1rem',
            }}
          >
            Understanding Skill Exchange
          </h2>
          <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--text-color, #11161c)', marginBottom: '1rem' }}>
            <strong>Skill exchange</strong> (also referred to as skill sharing or skill trading) is a collaborative arrangement where individuals exchange knowledge, technical abilities, or creative services directly with one another without requiring traditional cash payments.
          </p>
          <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--text-muted, rgba(17, 22, 28, 0.75))', margin: 0 }}>
            Instead of spending money on courses or hiring commercial service providers, participants leverage their existing expertise to help others while gaining access to skills they want to learn. This model turns personal knowledge into a shared resource, enabling peer-to-peer growth through active collaboration.
          </p>
        </section>

        {/* Section 2: How It Works & Concrete Example */}
        <section style={{ marginBottom: '3rem' }}>
          <div className="section-header" style={{ marginBottom: '1.5rem' }}>
            <span className="section-eyebrow">Mechanics &amp; Workflow</span>
            <h2
              style={{
                fontFamily: 'Playfair Display, Georgia, serif',
                fontSize: 'clamp(1.5rem, 2.8vw, 1.9rem)',
                fontWeight: 700,
                color: 'var(--text-color, #11161c)',
                margin: '0.25rem 0 0.5rem',
              }}
            >
              How Skill Exchange Works
            </h2>
            <p className="section-description">
              In a skill exchange ecosystem, participants offer what they know and request what they need.
            </p>
          </div>

          <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--text-color, #11161c)', marginBottom: '1.5rem' }}>
            In a traditional direct barter system, two people must find a perfect mutual match: Person A must need Person B's skill, and Person B must simultaneously need Person A's skill. Modern skill-sharing platforms remove this limitation by structuring exchanges around clear project scopes, digital deliverables, or structured peer-learning sessions.
          </p>

          {/* Concrete Example Container */}
          <div
            style={{
              background: 'var(--color-surface, #ffffff)',
              border: '1px solid var(--shell-border, rgba(17, 22, 28, 0.1))',
              borderRadius: '20px',
              padding: '1.75rem',
              marginBottom: '2rem',
            }}
          >
            <h3
              style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                color: 'var(--text-color, #11161c)',
                marginTop: 0,
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>💡</span> Concrete Example of a Skill Exchange
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '1.25rem',
                marginBottom: '1.25rem',
              }}
            >
              <div
                style={{
                  padding: '1.25rem',
                  borderRadius: '14px',
                  background: 'rgba(2, 132, 199, 0.06)',
                  border: '1px solid rgba(2, 132, 199, 0.15)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0284c7', marginBottom: '0.35rem' }}>
                  Person A — Graphic Designer
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-color)' }}>
                  <li><strong>Offers:</strong> Graphic Design &amp; Brand Assets</li>
                  <li><strong>Wants to Learn:</strong> Python Programming</li>
                </ul>
              </div>

              <div
                style={{
                  padding: '1.25rem',
                  borderRadius: '14px',
                  background: 'rgba(214, 166, 74, 0.1)',
                  border: '1px solid rgba(214, 166, 74, 0.25)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#a8781d', marginBottom: '0.35rem' }}>
                  Person B — Python Developer
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-color)' }}>
                  <li><strong>Offers:</strong> Python Scripting &amp; Data Help</li>
                  <li><strong>Wants to Learn:</strong> Graphic Design &amp; Layout</li>
                </ul>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: '0.925rem', lineHeight: 1.6, color: 'var(--text-muted, rgba(17, 22, 28, 0.75))' }}>
              Instead of paying cash for software development or branding services, Person A creates custom visual assets for Person B, while Person B guides Person A through Python basics or helps debug a script. Both participants gain valuable skills and project outcomes through direct collaboration.
            </p>
          </div>
        </section>

        {/* Section 3: Difference Between Skill Exchange and Paid Services */}
        <section
          style={{
            marginBottom: '3rem',
            background: 'var(--color-surface, #ffffff)',
            border: '1px solid var(--shell-border, rgba(17, 22, 28, 0.08))',
            borderRadius: '20px',
            padding: '2rem',
          }}
        >
          <h2
            style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontSize: 'clamp(1.5rem, 2.8vw, 1.9rem)',
              fontWeight: 700,
              color: 'var(--text-color, #11161c)',
              marginTop: 0,
              marginBottom: '1rem',
            }}
          >
            Skill Exchange vs. Paid Services
          </h2>
          <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--text-color, #11161c)', marginBottom: '1.25rem' }}>
            Understanding how skill exchange differs from commercial freelancing or paid tutoring helps set realistic expectations for both learners and collaborators:
          </p>

          <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.925rem',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(17, 22, 28, 0.12)', background: 'rgba(17, 22, 28, 0.02)' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Feature</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Skill Exchange</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Paid Service / Freelancing</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(17, 22, 28, 0.06)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Primary Medium</td>
                  <td style={{ padding: '0.75rem 1rem' }}>Shared skills / Internal credits (SkillCredits)</td>
                  <td style={{ padding: '0.75rem 1rem' }}>Fiat currency (USD, EUR, etc.)</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(17, 22, 28, 0.06)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Financial Barrier</td>
                  <td style={{ padding: '0.75rem 1rem' }}>Zero monetary cost for exchanges</td>
                  <td style={{ padding: '0.75rem 1rem' }}>Requires available budget / subscription fees</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(17, 22, 28, 0.06)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Relationship Dynamic</td>
                  <td style={{ padding: '0.75rem 1rem' }}>Peer-to-peer collaborative partners</td>
                  <td style={{ padding: '0.75rem 1rem' }}>Client and hired contractor/vendor</td>
                </tr>
                <tr>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Primary Goal</td>
                  <td style={{ padding: '0.75rem 1rem' }}>Mutual learning, skill growth &amp; project help</td>
                  <td style={{ padding: '0.75rem 1rem' }}>Commercial transaction &amp; monetary profit</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 4: Exchanging Skills Online */}
        <section style={{ marginBottom: '3rem' }}>
          <h2
            style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontSize: 'clamp(1.5rem, 2.8vw, 1.9rem)',
              fontWeight: 700,
              color: 'var(--text-color, #11161c)',
              marginTop: 0,
              marginBottom: '1rem',
            }}
          >
            How People Exchange Skills Online
          </h2>
          <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--text-color, #11161c)', marginBottom: '1rem' }}>
            Exchanging skills online relies on structured communication tools, shared project repositories, and clear milestones. Online skill exchanges typically follow these practical steps:
          </p>
          <ol
            style={{
              paddingLeft: '1.25rem',
              fontSize: '0.975rem',
              lineHeight: 1.75,
              color: 'var(--text-color, #11161c)',
              margin: 0,
            }}
          >
            <li style={{ marginBottom: '0.75rem' }}>
              <strong>Discovering Opportunities:</strong> Members browse an open marketplace or search for specific tags like <em>UI/UX Design</em>, <em>Web Development</em>, <em>Copywriting</em>, or <em>Video Editing</em>.
            </li>
            <li style={{ marginBottom: '0.75rem' }}>
              <strong>Defining Scope:</strong> Before starting, partners discuss requirements, deliverables, file formats, and expected timelines in integrated chat.
            </li>
            <li style={{ marginBottom: '0.75rem' }}>
              <strong>Executing &amp; Sharing Files:</strong> Participants share draft work, code repositories, design assets, or schedule live remote review sessions.
            </li>
            <li style={{ marginBottom: '0.75rem' }}>
              <strong>Completing the Swap:</strong> Upon reviewing the completed work, both parties mark the exchange complete, allowing credits or review feedback to settle transparently.
            </li>
          </ol>
        </section>

        {/* Section 5: What are SkillCredits and How Do They Relate to Skillswap? */}
        <section
          style={{
            marginBottom: '3rem',
            background: 'var(--color-surface, #ffffff)',
            border: '1px solid var(--shell-border, rgba(17, 22, 28, 0.08))',
            borderRadius: '20px',
            padding: '2rem',
          }}
        >
          <span className="section-eyebrow" style={{ color: '#d6a64a' }}>Platform Accounting</span>
          <h2
            style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontSize: 'clamp(1.5rem, 2.8vw, 1.9rem)',
              fontWeight: 700,
              color: 'var(--text-color, #11161c)',
              margin: '0.25rem 0 1rem',
            }}
          >
            What Are SkillCredits &amp; How Do They Power SkillSwap?
          </h2>

          <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--text-color, #11161c)', marginBottom: '1rem' }}>
            <strong>SkillCredits</strong> are SkillSwap's internal unit of account. They solve the fundamental challenge of <em>double coincidence of wants</em> in bartering.
          </p>

          <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--text-muted, rgba(17, 22, 28, 0.75))', marginBottom: '1.25rem' }}>
            With SkillCredits, you do not need to find one single person who has the exact skill you want <em>and</em> simultaneously needs the exact skill you offer. Instead:
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <div
              style={{
                padding: '1.25rem',
                borderRadius: '14px',
                background: 'rgba(17, 22, 28, 0.03)',
                border: '1px solid rgba(17, 22, 28, 0.08)',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-color)', marginBottom: '0.35rem' }}>
                1. Earn SkillCredits
              </div>
              <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.55, color: 'var(--text-muted)' }}>
                Offer your expertise—such as writing, coding, or translating—to any member who requests it on the platform.
              </p>
            </div>

            <div
              style={{
                padding: '1.25rem',
                borderRadius: '14px',
                background: 'rgba(17, 22, 28, 0.03)',
                border: '1px solid rgba(17, 22, 28, 0.08)',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-color)', marginBottom: '0.35rem' }}>
                2. Spend SkillCredits
              </div>
              <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.55, color: 'var(--text-muted)' }}>
                Use your earned credits to request assistance or lessons from anyone else in the community, whenever you need it.
              </p>
            </div>
          </div>

          <p style={{ fontSize: '0.95rem', lineHeight: 1.65, color: 'var(--text-color, #11161c)', margin: 0 }}>
            To make getting started seamless, SkillSwap grants every new member a <strong>100 SkillCredits welcome grant</strong> upon completing their initial profile setup. When you propose or accept a swap, the corresponding SkillCredits are held safely in reserve until work is completed and approved, ensuring transparent accounting for every exchange. Learn more about the exact swap lifecycle on our{' '}
            <a
              href="/how-it-works"
              onClick={(e) => handleLinkClick(e, '/how-it-works')}
              style={{ color: '#a8781d', fontWeight: 600, textDecoration: 'underline' }}
            >
              How It Works page
            </a>
            .
          </p>
        </section>

        {/* Section 6: How to Find a Skill Partner & Get Started */}
        <section style={{ marginBottom: '3.5rem' }}>
          <h2
            style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontSize: 'clamp(1.5rem, 2.8vw, 1.9rem)',
              fontWeight: 700,
              color: 'var(--text-color, #11161c)',
              marginTop: 0,
              marginBottom: '1rem',
            }}
          >
            Finding a Skill Partner &amp; Getting Started
          </h2>

          <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--text-color, #11161c)', marginBottom: '1.25rem' }}>
            Finding a compatible skill partner on SkillSwap involves exploring open listings or sharing your own learning goals:
          </p>

          <ul
            style={{
              paddingLeft: '1.25rem',
              fontSize: '0.975rem',
              lineHeight: 1.75,
              color: 'var(--text-color, #11161c)',
              marginBottom: '2rem',
            }}
          >
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>Browse Open Swaps:</strong> Search the{' '}
              <a
                href="/explore"
                onClick={(e) => handleLinkClick(e, '/explore')}
                style={{ color: '#a8781d', fontWeight: 600, textDecoration: 'underline' }}
              >
                Marketplace Explorer
              </a>{' '}
              to filter swaps by skill categories, required credits, or keywords.
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>Create Your Listing:</strong> Use the{' '}
              <a
                href="/create-swap"
                onClick={(e) => handleLinkClick(e, '/create-swap')}
                style={{ color: '#a8781d', fontWeight: 600, textDecoration: 'underline' }}
              >
                Create Swap tool
              </a>{' '}
              to publish what skill you offer and what skill you want to receive.
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>Check Common Questions:</strong> Visit our{' '}
              <a
                href="/faq"
                onClick={(e) => handleLinkClick(e, '/faq')}
                style={{ color: '#a8781d', fontWeight: 600, textDecoration: 'underline' }}
              >
                Frequently Asked Questions
              </a>{' '}
              to understand platform rules, safety, and escrow features.
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <strong>Learn About Our Mission:</strong> Read our{' '}
              <a
                href="/about"
                onClick={(e) => handleLinkClick(e, '/about')}
                style={{ color: '#a8781d', fontWeight: 600, textDecoration: 'underline' }}
              >
                About Page
              </a>{' '}
              to see our vision for accessible peer-to-peer knowledge sharing.
            </li>
          </ul>

          {/* Call to Action Box */}
          <div
            style={{
              background: '#11161c',
              color: '#ffffff',
              borderRadius: '24px',
              padding: 'clamp(2rem, 4vw, 3rem)',
              textAlign: 'center',
              boxShadow: '0 20px 40px rgba(17, 22, 28, 0.15)',
            }}
          >
            <span className="section-eyebrow" style={{ color: '#d6a64a' }}>
              Start Exchanging Today
            </span>
            <h3
              style={{
                fontFamily: 'Playfair Display, Georgia, serif',
                fontSize: 'clamp(1.75rem, 3vw, 2.4rem)',
                margin: '0.5rem 0 1rem',
                color: '#ffffff',
              }}
            >
              Ready to Join the SkillSwap Community?
            </h3>
            <p
              style={{
                fontSize: '1rem',
                lineHeight: 1.6,
                color: 'rgba(255, 255, 255, 0.8)',
                maxWidth: '580px',
                margin: '0 auto 2rem',
              }}
            >
              Create your free account, claim your 100 SkillCredits welcome grant, and start connecting with skill partners today.
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                className="action-button action-button--filled"
                onClick={() => handleButtonClick('/signup')}
              >
                <span>Get Started Free</span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
              <button
                type="button"
                className="action-button action-button--outline"
                style={{ borderColor: 'rgba(255, 255, 255, 0.3)', color: '#ffffff' }}
                onClick={() => handleButtonClick('/explore')}
              >
                <span>Browse Swaps</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  );
}
