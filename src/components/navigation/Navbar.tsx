import { useState, useEffect } from 'react';
import { Logo } from '../brand/Logo';
import { useAuth } from '../../context/AuthContext';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { CreditHistoryModal } from '../credits/CreditHistoryModal';

const navItems = [
  { label: 'Explore Swaps', path: '/explore' },
  { label: 'Active Swaps', path: '/active-swaps' },
  { label: 'How It Works', path: '/how-it-works' },
  { label: 'About', path: '/about' },
  { label: 'FAQ', path: '/faq' },
];

type NavbarProps = {
  onNavigate?: (path: string) => void;
  ctaLabel?: string;
  ctaPath?: string;
  currentPath?: string;
};

export function Navbar({ onNavigate, ctaLabel, ctaPath, currentPath }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const activePath = currentPath || window.location.pathname;
  const { user, account, accountLoading, signOut } = useAuth();

  useBodyScrollLock(mobileMenuOpen);

  // Accessibility & UX: Handle Escape key to close mobile drawer
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, itemPath: string) => {
    setMobileMenuOpen(false);
    if (onNavigate) {
      e.preventDefault();
      onNavigate(itemPath);
    }
  };

  const handleCtaClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (ctaPath && onNavigate) {
      e.preventDefault();
      onNavigate(ctaPath);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    if (onNavigate) {
      onNavigate('/login');
    }
  };

  const displayedBalance = accountLoading ? '—' : account ? account.credits_balance : '0';

  return (
    <>
      <header className="site-header">
        <Logo onNavigate={onNavigate} />

        <nav className="main-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const isActive = activePath === item.path;
            return (
              <a
                key={item.label}
                href={item.path}
                className={isActive ? 'nav-link--active' : ''}
                onClick={(e) => handleNavClick(e, item.path)}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="header-right-group">
          {user ? (
            <>
              {/* Compact SkillCredit Control for Mobile Header */}
              <button
                type="button"
                className="nav-credit-indicator-btn mobile-credit-btn"
                onClick={() => setCreditModalOpen(true)}
                title="View SkillCredit Account & Available Trading Capital"
                aria-label={`SkillCredit balance: ${displayedBalance}. Available trading capital for skill exchanges. Click to view history.`}
              >
                <span className="nav-credit-content-group">
                  <span className="nav-credit-label">SkillCredits</span>
                  <span className="nav-credit-amount">{displayedBalance}</span>
                </span>
                <svg className="nav-credit-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              <div className="auth-user-menu desktop-user-menu" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                {/* Premium SkillCredit Control Pill for Desktop */}
                <button
                  type="button"
                  className="nav-credit-indicator-btn"
                  onClick={() => setCreditModalOpen(true)}
                  title="View SkillCredit Account & Available Trading Capital"
                  aria-label={`SkillCredit balance: ${displayedBalance}. Available trading capital for skill exchanges. Click to view history.`}
                >
                  <span className="nav-credit-content-group">
                    <span className="nav-credit-label">SkillCredits</span>
                    <span className="nav-credit-amount">{displayedBalance}</span>
                  </span>
                  <svg className="nav-credit-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>

                <a
                  href="/profile"
                  className="auth-link-bold nav-profile-link"
                  style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-color)' }}
                  onClick={(e) => {
                    e.preventDefault();
                    if (onNavigate) onNavigate('/profile');
                  }}
                >
                  My Profile
                </a>
                <a
                  href="/change-password"
                  className="auth-link-bold"
                  style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}
                  onClick={(e) => {
                    e.preventDefault();
                    if (onNavigate) onNavigate('/change-password');
                  }}
                >
                  Security
                </a>
                <button
                  type="button"
                  className="btn-signout"
                  onClick={handleSignOut}
                >
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            <div className="auth-user-menu desktop-user-menu">
              <a
                className="auth-link-bold"
                style={{ fontSize: '0.925rem', marginRight: '0.5rem' }}
                href="/login"
                onClick={(e) => {
                  e.preventDefault();
                  if (onNavigate) onNavigate('/login');
                }}
              >
                Log In
              </a>
              <a className="header-cta" href={ctaPath || "/signup"} onClick={(e) => {
                if (ctaPath) {
                  handleCtaClick(e);
                } else {
                  e.preventDefault();
                  if (onNavigate) onNavigate('/signup');
                }
              }} aria-label="Get Started">
                {ctaLabel || "Get Started"}
              </a>
            </div>
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
                  key={item.label}
                  href={item.path}
                  className={activePath === item.path ? 'nav-link--active' : ''}
                  onClick={(e) => handleNavClick(e, item.path)}
                >
                  {item.label}
                </a>
              ))}
              {user ? (
                <>
                  <div className="mobile-drawer-user-info">
                    <span className="mobile-user-label">Signed in as</span>
                    <strong className="mobile-user-email">{user.email}</strong>
                    <div style={{ marginTop: '0.6rem' }}>
                      <button
                        type="button"
                        className="nav-credit-indicator-btn"
                        style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setCreditModalOpen(true);
                        }}
                      >
                        <span className="nav-credit-content-group">
                          <span className="nav-credit-label">SkillCredits</span>
                          <span className="nav-credit-amount">{displayedBalance}</span>
                        </span>
                        <svg className="nav-credit-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <a
                    href="/profile"
                    className="mobile-drawer-link"
                    onClick={(e) => {
                      e.preventDefault();
                      setMobileMenuOpen(false);
                      if (onNavigate) onNavigate('/profile');
                    }}
                  >
                    My Profile
                  </a>
                  <a
                    href="/change-password"
                    className="mobile-drawer-link"
                    onClick={(e) => {
                      e.preventDefault();
                      setMobileMenuOpen(false);
                      if (onNavigate) onNavigate('/change-password');
                    }}
                  >
                    Change Password / Security
                  </a>
                  <button
                    type="button"
                    className="mobile-drawer-cta"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleSignOut();
                    }}
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <a
                    href="/login"
                    className="mobile-drawer-cta mobile-drawer-cta--outline"
                    onClick={(e) => {
                      e.preventDefault();
                      setMobileMenuOpen(false);
                      if (onNavigate) onNavigate('/login');
                    }}
                  >
                    Log In
                  </a>
                  <a
                    href={ctaPath || "/signup"}
                    className="mobile-drawer-cta"
                    onClick={(e) => {
                      if (ctaPath) {
                         handleCtaClick(e);
                      } else {
                         e.preventDefault();
                         setMobileMenuOpen(false);
                         if (onNavigate) onNavigate('/signup');
                      }
                    }}
                  >
                    {ctaLabel || "Get Started"}
                  </a>
                </>
              )}
            </nav>
          </div>
        )}
      </header>

      {/* Credit History & Account Modal */}
      <CreditHistoryModal
        isOpen={creditModalOpen}
        onClose={() => setCreditModalOpen(false)}
      />
    </>
  );
}
