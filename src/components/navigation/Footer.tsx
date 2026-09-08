type FooterProps = {
  onNavigate?: (path: string) => void;
};

export function Footer({ onNavigate }: FooterProps) {
  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (path === '/faq') {
      window.location.href = '/faq';
      return;
    }
    if (onNavigate) {
      e.preventDefault();
      onNavigate(path);
    }
  };

  return (
    <footer className="site-footer" style={{ borderTop: '1px solid var(--border-color, rgba(148, 163, 184, 0.15))', background: 'var(--color-canvas, #0f172a)', padding: '3rem 1.5rem 2rem', color: 'var(--text-color, #f8fafc)', marginTop: 'auto' }}>
      <div className="footer-container" style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '2.5rem' }}>

        {/* COL 1: Brand & Philosophy */}
        <div className="footer-brand-col" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-color)' }}>SkillSwap</span>
            <span className="verification-badge" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}>✓ Peer Exchange</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)', lineHeight: 1.55, maxWidth: '300px' }}>
            Skills are your currency. Share what you know, learn what you need, and exchange expertise through mutual growth.
          </p>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)', marginTop: '0.25rem' }}>
            <span>© {new Date().getFullYear()} SkillSwap Ecosystem. All rights reserved.</span>
          </div>
        </div>

        {/* COL 2: Marketplace Navigation */}
        <div className="footer-nav-col">
          <h4 style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#d6a64a', marginBottom: '1rem' }}>
            Marketplace
          </h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.875rem' }}>
            <li>
              <a href="/explore" onClick={(e) => handleLinkClick(e, '/explore')} style={{ color: 'var(--text-color)', textDecoration: 'none', transition: 'color 0.15s' }}>
                Explore Swaps
              </a>
            </li>
            <li>
              <a href="/active-swaps" onClick={(e) => handleLinkClick(e, '/active-swaps')} style={{ color: 'var(--text-color)', textDecoration: 'none', transition: 'color 0.15s' }}>
                Active Swaps
              </a>
            </li>
            <li>
              <a href="/create-swap" onClick={(e) => handleLinkClick(e, '/create-swap')} style={{ color: 'var(--text-color)', textDecoration: 'none', transition: 'color 0.15s' }}>
                Create Swap
              </a>
            </li>
            <li>
              <a href="/how-it-works" onClick={(e) => handleLinkClick(e, '/how-it-works')} style={{ color: 'var(--text-color)', textDecoration: 'none', transition: 'color 0.15s' }}>
                How It Works
              </a>
            </li>
          </ul>
        </div>

        {/* COL 3: Platform & Trust */}
        <div className="footer-trust-col">
          <h4 style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#d6a64a', marginBottom: '1rem' }}>
            Platform Trust
          </h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.875rem' }}>
            <li>
              <a href="/about" onClick={(e) => handleLinkClick(e, '/about')} style={{ color: 'var(--text-color)', textDecoration: 'none', transition: 'color 0.15s' }}>
                About SkillSwap
              </a>
            </li>
            <li>
              <a href="/faq" onClick={(e) => handleLinkClick(e, '/faq')} style={{ color: 'var(--text-color)', textDecoration: 'none', transition: 'color 0.15s' }}>
                Frequently Asked Questions
              </a>
            </li>
            <li style={{ color: 'var(--text-muted)', fontSize: '0.825rem' }}>
              🔒 Dual-Ledger Escrow Security
            </li>
            <li style={{ color: 'var(--text-muted)', fontSize: '0.825rem' }}>
              ⚡ 100 SkillCredits Registration Grant
            </li>
          </ul>
        </div>

        {/* COL 4: Verifiable Contact & Support Paths (H.4 Stanford Guideline 5) */}
        <div className="footer-contact-col">
          <h4 style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#d6a64a', marginBottom: '1rem' }}>
            Support &amp; Verification
          </h4>
          <p style={{ margin: '0 0 0.85rem', fontSize: '0.825rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Direct, verifiable contact paths for member support and issues:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
            <a
              href="mailto:skillswap165@gmail.com"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-color)', textDecoration: 'none', fontWeight: 600 }}
              aria-label="Email Support at skillswap165@gmail.com"
            >
              <span>✉️</span>
              <span style={{ borderBottom: '1px solid rgba(214, 166, 74, 0.4)' }}>skillswap165@gmail.com</span>
            </a>
            <a
              href="https://wa.me/916284387420"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-color)', textDecoration: 'none', fontWeight: 600 }}
              aria-label="WhatsApp Support at 6284387420"
            >
              <span>💬</span>
              <span style={{ borderBottom: '1px solid rgba(214, 166, 74, 0.4)' }}>WhatsApp: 6284387420</span>
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
}
