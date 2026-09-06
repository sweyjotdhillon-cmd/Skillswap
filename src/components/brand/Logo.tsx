type LogoProps = {
  onNavigate?: (path: string) => void;
};

export function Logo({ onNavigate }: LogoProps) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('/');
    }
  };

  return (
    <a className="brand" href="/" onClick={handleClick} aria-label="Skillswap">
      <img
        src="/logo-full.png"
        alt="Skillswap"
        className="brand-logo-img"
        width={1140}
        height={888}
        loading="eager"
        decoding="async"
      />
    </a>
  );
}
