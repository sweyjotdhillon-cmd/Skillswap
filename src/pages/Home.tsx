import { Hero } from '../components/hero/Hero';
import { Navbar } from '../components/navigation/Navbar';

export function Home() {
  return (
    <div className="page-shell">
      <Navbar />
      <Hero />
      <section className="mvp-note" id="current-mvp" aria-label="Current MVP status">
        <p>Homepage preview only. Swaps, accounts, and SkillCredit transactions arrive in future milestones.</p>
      </section>
    </div>
  );
}
