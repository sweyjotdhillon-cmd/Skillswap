import React from 'react';
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
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-top-grid">
        <div className="hero-copy">
          <span className="eyebrow">Reciprocal Skill Exchange</span>
          <h1 id="hero-title">
            Skills<br />are your<br /><span>currency.</span>
          </h1>
          <p className="lede">
            Share what you know. Learn what you need.<br />
            Exchange expertise through mutual growth.
          </p>
        </div>

        <HeroVisual />
      </div>

      <div className="hero-bottom-bar">
        <p className="support">
          A community where value flows directly<br />
          through human capability, not money.
        </p>
        <div className="hero-actions" aria-label="Primary conversion actions">
          <ActionButton href="/create-swap" variant="filled" onClick={handleCreateSwapClick}>
            Create Swap
          </ActionButton>
          <ActionButton href="/explore" variant="outline" onClick={handleExploreSwapsClick}>
            Explore Swaps
          </ActionButton>
        </div>
      </div>
    </section>
  );
}
