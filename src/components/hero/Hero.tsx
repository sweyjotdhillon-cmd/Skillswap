import { HeroVisual } from './HeroVisual';
import { ActionButton } from '../ui/ActionButton';

type HeroProps = {
  onNavigate?: (path: string) => void;
};

export function Hero({ onNavigate }: HeroProps) {
  const handleCreateSwapClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('/create-swap');
    }
  };

  const handleExploreSwapsClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('/explore');
    }
  };

  return (
    <main className="hero">
      <section className="hero-copy" aria-labelledby="hero-title">
        <p className="eyebrow">Premium Editorial</p>
        <h1 id="hero-title">Skills<br />are your<br /><span>currency.</span></h1>
        <p className="lede">Exchange skills. Earn SkillCredits.<br />Get what you need.</p>
        <p className="support">A community where value flows<br />through people, not money.</p>
        <div className="hero-actions" id="early-access" aria-label="Skillswap entry points coming soon">
          <ActionButton href="/create-swap" variant="filled" onClick={handleCreateSwapClick}>Create Swap</ActionButton>
          <ActionButton href="/explore" variant="outline" onClick={handleExploreSwapsClick}>Explore Swaps</ActionButton>
        </div>
      </section>
      <HeroVisual />
    </main>
  );
}
