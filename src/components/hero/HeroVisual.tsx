import heroImage from '../../assets/skillcredits-hero.png';

/**
 * HeroVisual
 *
 * Renders the exact SkillCredits artwork as a single raster image so the
 * illustration is 100% pixel-identical to the source PNG on every screen.
 * Do NOT convert this back to an inline SVG — a redraw will always drift
 * from the hand-painted original.
 */
export function HeroVisual() {
  return (
    <section
      className="ecosystem ecosystem--image"
      aria-label="SkillCredits circular skill exchange illustration"
    >
      <img
        src={heroImage}
        alt="SkillCredits ecosystem: four people arranged around a hand-drawn golden circle, with the SkillCredits logo and the tagline 'Value flows. Skills grow.' at the center. Speech notes read 'I need a logo design', 'I can design logos', and 'I can help with SEO'."
        className="ecosystem-image"
        loading="eager"
        decoding="async"
        draggable={false}
      />
    </section>
  );
}
