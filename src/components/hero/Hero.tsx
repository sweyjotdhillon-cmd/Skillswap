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
    {/* Section L20: Repeated Z-Pattern Homepage Narrative Layout */}
    <section className="hero" aria-labelledby="hero-title" data-z-pattern="container">
      <div className="hero-top-grid">
        {/* Z-Pattern Node 1: Top-Left Primary Value Proposition */}
        <div className="hero-copy" data-z-step="1-top-left-headline">
          <span className="eyebrow">Reciprocal Skill Exchange</span>
          <h1 id="hero-title">
            Skills<br />are your<br /><span>currency.</span>
          </h1>
          <p className="lede">
            Share what you know. Learn what you need.<br />
            Exchange expertise through mutual growth.
          </p>
        </div>

        {/* Z-Pattern Node 3: Center/Diagonal Ecosystem Diagram */}
        <div data-z-step="3-middle-diagonal-visual">
          <HeroVisual />
        </div>
      </div>

      <div className="hero-bottom-bar">
        <p className="support">
          A community where value flows directly<br />
          through human capability, not money.
        </p>

        {/* Z-Pattern Node 4: Bottom-Right Terminal Conversion CTAs */}
        <div className="hero-actions" aria-label="Primary conversion actions" data-z-step="4-bottom-right-cta">
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
