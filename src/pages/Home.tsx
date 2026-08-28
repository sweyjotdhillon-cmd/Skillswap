import { Hero } from '../components/hero/Hero';
import { Navbar } from '../components/navigation/Navbar';

type HomeProps = {
  onNavigate?: (path: string) => void;
};

export function Home({ onNavigate }: HomeProps) {
  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} />
      <Hero onNavigate={onNavigate} />
      <section className="mvp-note" id="current-mvp" aria-label="Current MVP status">
        <p>Homepage preview only. Swaps, accounts, and SkillCredit transactions arrive in future milestones.</p>
      </section>
    </div>
  );
}
