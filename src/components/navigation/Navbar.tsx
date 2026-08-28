import { useState } from 'react';
import { Logo } from '../brand/Logo';

const navItems = ['How It Works', 'Community', 'About'];

type NavbarProps = {
  onNavigate?: (path: string) => void;
  showUserHeader?: boolean;
  ctaLabel?: string;
  ctaPath?: string;
};

export function Navbar({ onNavigate, showUserHeader, ctaLabel, ctaPath }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, item: string) => {
    setMobileMenuOpen(false);
    if (onNavigate) {
      e.preventDefault();
      onNavigate('/#' + item.toLowerCase().replaceAll(' ', '-'));
    }
  };

  const handleCtaClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (ctaPath && onNavigate) {
      e.preventDefault();
      onNavigate(ctaPath);
    }
  };

  return (
    <header className="site-header">
      <Logo onNavigate={onNavigate} />

      <nav className="main-nav" aria-label="Primary navigation">
        {navItems.map((item) => (
          <a
            key={item}
            href={`#${item.toLowerCase().replaceAll(' ', '-')}`}
            onClick={(e) => handleNavClick(e, item)}
          >
            {item}
          </a>
        ))}
      </nav>

      <div className="header-right-group">
        {showUserHeader ? (
          <div className="header-user-actions" aria-label="User profile and notifications">
            <button type="button" className="header-icon-btn" aria-label="Notifications">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
            <button type="button" className="header-icon-btn" aria-label="Messages">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </button>
            <div className="header-avatar" title="User profile">
              <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80" alt="User avatar" />
            </div>
          </div>
        ) : (
          <a className="header-cta" href="#early-access" aria-label="Get Started placeholder">
            Get Started
          </a>
        )}

        <button
          type="button"
          className="mobile-hamburger"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {mobileMenuOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </>
            )}
          </svg>
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Mobile menu">
          <nav className="mobile-drawer-nav">
            {navItems.map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replaceAll(' ', '-')}`}
                onClick={(e) => handleNavClick(e, item)}
              >
                {item}
              </a>
            ))}
            {onNavigate && (
              <a
                href="/create-swap"
                className="mobile-drawer-cta"
                onClick={(e) => {
                  e.preventDefault();
                  setMobileMenuOpen(false);
                  onNavigate('/create-swap');
                }}
              >
                Create Swap
              </a>
            )}
          </nav>
        </div>

      )}
    </header>
  );
}
