import { Navbar } from '../components/navigation/Navbar';

type AboutPageProps = {
  onNavigate?: (path: string) => void;
};

export function AboutPage({ onNavigate }: AboutPageProps) {
  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} />

      <main className="about-page">
        {/* Section 1 — Hero */}
        <section className="about-hero" aria-labelledby="about-hero-title">
          <span className="section-eyebrow">About Us</span>
          <h1 id="about-hero-title" className="about-hero-title">
            SkillSwap
          </h1>
          <p className="about-hero-subheading">Learn. Teach. Swap Skills.</p>
          <p className="about-hero-support">
            SkillSwap is a skill-exchange platform where people can teach what they know and learn what they want — by connecting with others who have complementary skills.
          </p>
          <div className="about-hero-actions">
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

        {/* Section 2 — WHAT IS SKILLSWAP? */}
        <section className="about-section-container" aria-labelledby="what-is-heading">
          <div className="section-header">
            <span className="section-eyebrow">The Core Idea</span>
            <h2 id="what-is-heading" className="section-title">What is SkillSwap?</h2>
            <p className="section-description">
              SkillSwap is built around a simple idea: everyone knows something valuable, and everyone has something new they want to learn.
            </p>
          </div>

          <div className="what-is-content">
            <p className="about-body-text">
              Instead of following the traditional model where one person is always the teacher and another is always the student, SkillSwap encourages people to exchange knowledge.
            </p>
            <p className="about-body-text">
              A user can offer a skill they already know while looking for another skill they want to learn. SkillSwap helps users discover people whose skills complement their own.
            </p>

            {/* Example visual */}
            <div className="swap-example-card" aria-label="Skill exchange example">
              <div className="example-box example-box--teach">
                <span className="example-label">I can teach</span>
                <div className="example-skill">
                  <svg className="example-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>Photoshop</span>
                </div>
              </div>

              <div className="example-connector">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              </div>

              <div className="example-box example-box--learn">
                <span className="example-label">I want to learn</span>
                <div className="example-skill">
                  <svg className="example-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  <span>Python</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3 — HOW SKILLSWAP WORKS */}
        <section className="about-section-container" aria-labelledby="how-it-works-heading">
          <div className="section-header">
            <span className="section-eyebrow">Step-By-Step</span>
            <h2 id="how-it-works-heading" className="section-title">How SkillSwap Works</h2>
          </div>

          <div className="how-it-works-grid">
            <div className="step-card">
              <span className="step-number">01</span>
              <h3 className="step-title">Create a Swap</h3>
              <p className="step-body">
                Tell the community what you can teach and what you want to learn.
              </p>
            </div>

            <div className="step-card">
              <span className="step-number">02</span>
              <h3 className="step-title">Explore Swaps</h3>
              <p className="step-body">
                Browse available skill exchanges created by other users.
              </p>
            </div>

            <div className="step-card">
              <span className="step-number">03</span>
              <h3 className="step-title">Find Your Match</h3>
              <p className="step-body">
                Discover people offering skills that match what you're looking to learn.
              </p>
            </div>

            <div className="step-card">
              <span className="step-number">04</span>
              <h3 className="step-title">Learn & Teach</h3>
              <p className="step-body">
                Connect, exchange knowledge, and grow together.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4 — WHY SKILLSWAP? */}
        <section className="about-section-container" aria-labelledby="why-skillswap-heading">
          <div className="section-header">
            <span className="section-eyebrow">Platform Purpose</span>
            <h2 id="why-skillswap-heading" className="section-title">Why SkillSwap?</h2>
          </div>

          <div className="why-grid">
            <div className="why-card">
              <div className="why-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <h3 className="why-card-title">Learn Without Limits</h3>
              <p className="why-card-body">
                Discover useful skills without depending entirely on expensive traditional courses.
              </p>
            </div>

            <div className="why-card">
              <div className="why-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </div>
              <h3 className="why-card-title">Share What You Know</h3>
              <p className="why-card-body">
                Your existing knowledge can help someone else grow.
              </p>
            </div>

            <div className="why-card">
              <div className="why-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="why-card-title">Learn From Real People</h3>
              <p className="why-card-body">
                Exchange practical knowledge with people who actually use the skills they teach.
              </p>
            </div>

            <div className="why-card">
              <div className="why-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
              <h3 className="why-card-title">Build Connections</h3>
              <p className="why-card-body">
                Meet people with complementary interests, knowledge and abilities.
              </p>
            </div>

            <div className="why-card why-card--wide">
              <div className="why-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <h3 className="why-card-title">Grow Together</h3>
              <p className="why-card-body">
                Turn learning into a collaborative experience instead of a one-way transaction.
              </p>
            </div>
          </div>
        </section>

        {/* Section 5 — WHAT MAKES SKILLSWAP DIFFERENT? */}
        <section className="about-different-banner" aria-labelledby="different-heading">
          <span className="section-eyebrow">Our Difference</span>
          <h2 id="different-heading" className="different-title">
            Learning Should Be a Two-Way Street.
          </h2>
          <p className="different-intro">
            SkillSwap isn't simply another course marketplace. We believe true learning flourishes when knowledge moves in both directions.
          </p>

          <ul className="different-bullets">
            <li>Everyone can be both a learner and a teacher.</li>
            <li>Knowledge can move in both directions.</li>
            <li>The focus is on mutual exchange.</li>
            <li>Users actively participate instead of simply consuming content.</li>
            <li>Skills become a way to connect people.</li>
          </ul>

          <div className="quote-highlight-box">
            <svg className="quote-mark" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
            </svg>
            <blockquote className="highlight-statement">
              «You don't need to know everything. You just need to know something someone else wants to learn.»
            </blockquote>
          </div>
        </section>

        {/* Section 6 — WHO IS SKILLSWAP FOR? */}
        <section className="about-section-container" aria-labelledby="who-is-heading">
          <div className="section-header">
            <span className="section-eyebrow">Target Community</span>
            <h2 id="who-is-heading" className="section-title">Who Is SkillSwap For?</h2>
          </div>

          <div className="who-grid">
            <div className="who-card">
              <div className="who-emoji" aria-hidden="true">🎓</div>
              <h3 className="who-card-title">Students</h3>
              <p className="who-card-body">
                Learn useful skills while sharing what you already know.
              </p>
            </div>

            <div className="who-card">
              <div className="who-emoji" aria-hidden="true">💻</div>
              <h3 className="who-card-title">Creators & Professionals</h3>
              <p className="who-card-body">
                Exchange expertise and expand your capabilities.
              </p>
            </div>

            <div className="who-card">
              <div className="who-emoji" aria-hidden="true">🧑‍💻</div>
              <h3 className="who-card-title">Developers & Designers</h3>
              <p className="who-card-body">
                Find people with complementary technical and creative skills.
              </p>
            </div>

            <div className="who-card">
              <div className="who-emoji" aria-hidden="true">🚀</div>
              <h3 className="who-card-title">Entrepreneurs</h3>
              <p className="who-card-body">
                Learn skills that can help turn ideas into real projects.
              </p>
            </div>

            <div className="who-card who-card--wide">
              <div className="who-emoji" aria-hidden="true">🌱</div>
              <h3 className="who-card-title">Curious Learners</h3>
              <p className="who-card-body">
                If you're interested in learning something new, SkillSwap is for you.
              </p>
            </div>
          </div>
        </section>

        {/* Section 7 — OUR VISION */}
        <section className="about-vision-section" aria-labelledby="vision-heading">
          <span className="section-eyebrow">Our Vision</span>
          <h2 id="vision-heading" className="vision-title">Empowering Global Knowledge Exchange</h2>
          <blockquote className="vision-quote">
            «Our vision is to build a world where knowledge isn't limited by money, location, or traditional classrooms.»
          </blockquote>
          <p className="vision-text">
            SkillSwap aims to create a community where everyone has something valuable to teach and something valuable to learn.
          </p>
        </section>

        {/* Section 8 — THE FUTURE OF SKILLSWAP */}
        <section className="about-section-container" aria-labelledby="future-heading">
          <div className="section-header">
            <span className="section-eyebrow">Looking Ahead</span>
            <h2 id="future-heading" className="section-title">The Future of SkillSwap</h2>
            <p className="section-description">
              SkillSwap is designed to grow into a broader ecosystem where people can:
            </p>
          </div>

          <div className="future-list-grid">
            <div className="future-item">
              <span className="future-bullet">✦</span>
              <span>Discover skills</span>
            </div>
            <div className="future-item">
              <span className="future-bullet">✦</span>
              <span>Exchange knowledge</span>
            </div>
            <div className="future-item">
              <span className="future-bullet">✦</span>
              <span>Collaborate on projects</span>
            </div>
            <div className="future-item">
              <span className="future-bullet">✦</span>
              <span>Build meaningful connections</span>
            </div>
            <div className="future-item">
              <span className="future-bullet">✦</span>
              <span>Learn from one another</span>
            </div>
            <div className="future-item">
              <span className="future-bullet">✦</span>
              <span>Grow together</span>
            </div>
          </div>
        </section>

        {/* Section 9 — CONTACT SECTION */}
        <section className="about-contact-section" aria-labelledby="contact-heading">
          <div className="section-header">
            <span className="section-eyebrow">Get In Touch</span>
            <h2 id="contact-heading" className="section-title">Have a Question or Want to Connect?</h2>
            <p className="section-description">
              We're here to help you get started on your skill exchange journey. Reach out through email or WhatsApp.
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
