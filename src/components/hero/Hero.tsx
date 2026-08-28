import { HeroVisual } from './HeroVisual';
import { ActionButton } from '../ui/ActionButton';

export function Hero() {
  return (
    <main className="hero">
      <section className="hero-copy" aria-labelledby="hero-title">
        <p className="eyebrow">Premium Editorial</p>
        <h1 id="hero-title">Skills<br />are your<br /><span>currency.</span></h1>
        <p className="lede">Exchange skills. Earn SkillCredits.<br />Get what you need.</p>
        <p className="support">A community where value flows<br />through people, not money.</p>
        <div className="hero-actions" id="early-access" aria-label="Skillswap entry points coming soon">
          <ActionButton href="#current-mvp" variant="filled">Create Swap</ActionButton>
          <ActionButton href="#current-mvp" variant="outline">Explore Swaps</ActionButton>
        </div>
      </section>
      <HeroVisual />
    </main>
  );
}
