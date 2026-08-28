import { Logo } from '../brand/Logo';

const navItems = ['How It Works', 'Community', 'About'];

type NavbarProps = {
  onNavigate?: (path: string) => void;
  showUserHeader?: boolean;
};

export function Navbar({ onNavigate, showUserHeader = false }: NavbarProps) {
  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, item: string) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('/#' + item.toLowerCase().replaceAll(' ', '-'));
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
    </header>
  );
}
