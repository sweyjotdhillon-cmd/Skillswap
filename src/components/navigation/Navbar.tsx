import { useState, useEffect } from 'react';
import { Logo } from '../brand/Logo';
import { useAuth } from '../../context/AuthContext';
import { CreditHistoryModal } from '../credits/CreditHistoryModal';

const navItems = [
  { label: 'Explore Swaps', path: '/explore' },
  { label: 'Swap Requests', path: '/swap-requests' },
  { label: 'Active Swaps', path: '/active-swaps' },
  { label: 'How It Works', path: '/how-it-works' },
  { label: 'About', path: '/about' },
];

type NavbarProps = {
  onNavigate?: (path: string) => void;
  showUserHeader?: boolean;
  ctaLabel?: string;
  ctaPath?: string;
  currentPath?: string;
};

export function Navbar({ onNavigate, showUserHeader, ctaLabel, ctaPath, currentPath }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const activePath = currentPath || window.location.pathname;
  const { user, account, accountLoading, signOut } = useAuth();

  // Accessibility & UX: Handle Escape key to close mobile drawer & body scroll lock
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
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
            <div className="auth-user-menu desktop-user-menu" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              {/* Live Credit Indicator Pill */}
              <button
                type="button"
                className="nav-credit-indicator-btn"
                onClick={() => setCreditModalOpen(true)}
                title="Click to view Credit History & Account details"
                aria-label={`Credit balance: ${accountLoading ? 'loading' : account ? account.credits_balance : 'unavailable'}`}
              >
                <span className="nav-credit-icon">⚡</span>
                <span className="nav-credit-amount">
                  {accountLoading ? '...' : account ? account.credits_balance : '—'}
                </span>
                <span className="nav-credit-label">Credits</span>
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
              {showUserHeader && (
                <div className="header-user-actions" aria-label="User profile and notifications">
                  <button
                    type="button"
                    className="header-icon-btn"
                    aria-label="Notifications"
                    onClick={() => onNavigate && onNavigate('/swap-requests')}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="header-icon-btn"
                    aria-label="Messages"
                    onClick={() => onNavigate && onNavigate('/swap-requests')}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </button>
                </div>
              )}
              <button
                type="button"
                className="btn-signout"
                onClick={handleSignOut}
                style={{
                  background: 'none',
                  border: '1px solid var(--shell-border, rgba(17, 22, 28, 0.15))',
                  borderRadius: '999px',
                  padding: '0.4rem 0.85rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="auth-user-menu" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                        <span className="nav-credit-icon">⚡</span>
                        <span className="nav-credit-amount">
                          {accountLoading ? '...' : account ? account.credits_balance : '—'}
                        </span>
                        <span className="nav-credit-label">Credits</span>
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
