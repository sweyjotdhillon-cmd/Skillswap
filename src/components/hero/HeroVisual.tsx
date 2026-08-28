const people = [
  { className: 'person person--one', label: 'I need\na logo design' },
  { className: 'person person--two', label: 'I can\ndesign logos' },
  { className: 'person person--three', label: 'I can help\nwith SEO' },
  { className: 'person person--four', label: 'I can write\nclean code' },
];

export function HeroVisual() {
  return (
    <section className="ecosystem" aria-label="SkillCredits circular skill exchange illustration">
      <svg className="exchange-loop" viewBox="0 0 640 560" aria-hidden="true">
        <path className="loop loop--wide" d="M131 279c6-112 99-190 226-183 112 6 205 78 207 177 2 109-98 190-224 187-131-3-216-72-209-181Z" />
        <path className="loop loop--soft" d="M111 295c19-118 124-190 253-176 108 12 184 85 182 170-3 107-108 175-234 170-125-5-217-66-201-164Z" />
        <path className="loop loop--thin" d="M152 260c26-104 125-157 237-142 99 13 164 76 166 153 3 91-85 159-205 163-119 4-222-65-198-174Z" />
      </svg>

      <div className="credit-core" aria-label="SkillCredits: Value flows. Skills grow.">
        <span className="credit-initials">SC</span>
        <strong>SkillCredits</strong>
        <small>Value flows.<br />Skills grow.</small>
      </div>

      {people.map((person) => (
        <div className={person.className} key={person.className}>
          <span className="person-glow" />
          <span className="person-body" />
          <em>{person.label}</em>
        </div>
      ))}
    </section>
  );
}
