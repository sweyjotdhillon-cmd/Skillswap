import { Logo } from '../brand/Logo';

const navItems = ['How It Works', 'Community', 'About'];

export function Navbar() {
  return (
    <header className="site-header">
      <Logo />
      <nav className="main-nav" aria-label="Primary navigation">
        {navItems.map((item) => (
          <a key={item} href={`#${item.toLowerCase().replaceAll(' ', '-')}`}>
            {item}
          </a>
        ))}
      </nav>
      <a className="header-cta" href="#early-access" aria-label="Get Started placeholder">
        Get Started
      </a>
    </header>
  );
}
