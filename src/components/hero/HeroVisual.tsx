export function HeroVisual() {
  return (
    <section className="ecosystem" aria-label="SkillCredits circular skill exchange illustration">
      <svg className="exchange-loop" viewBox="0 0 640 560" aria-hidden="true">
        {/* Circular watercolor loops */}
        <path className="loop loop--wide" d="M131 279c6-112 99-190 226-183 112 6 205 78 207 177 2 109-98 190-224 187-131-3-216-72-209-181Z" />
        <path className="loop loop--soft" d="M111 295c19-118 124-190 253-176 108 12 184 85 182 170-3 107-108 175-234 170-125-5-217-66-201-164Z" />
        <path className="loop loop--thin" d="M152 260c26-104 125-157 237-142 99 13 164 76 166 153 3 91-85 159-205 163-119 4-222-65-198-174Z" />

        {/* Hand-drawn annotation pointer lines matching reference image */}
        {/* Top figure pointer line: curves from label down to figure head */}
        <path
          d="M 345 88 C 350 102, 353 112, 355 125"
          fill="none"
          stroke="#11161c"
          strokeWidth="1.2"
        />
        <circle cx="345" cy="88" r="1.5" fill="#11161c" />

        {/* Right figure pointer line */}
        <path
          d="M 568 282 C 564 274, 560 268, 558 260"
          fill="none"
          stroke="#11161c"
          strokeWidth="1.2"
        />

        {/* Bottom figure pointer line: curves up to feet with arrow head */}
        <path
          d="M 368 472 C 374 460, 378 448, 381 438"
          fill="none"
          stroke="#11161c"
          strokeWidth="1.2"
        />
        <polygon points="381,435 377,443 384,442" fill="#11161c" />
      </svg>

      <div className="credit-core" aria-label="SkillCredits: Value flows. Skills grow.">
        <span className="credit-initials">SC</span>
        <strong>SkillCredits</strong>
        <small>Value flows.<br />Skills grow.</small>
      </div>

      {/* Top Figure: "I need a logo design" */}
      <div className="person person--top">
        <span className="person-halo" />
        <svg className="person-silhouette" viewBox="0 0 24 64" aria-hidden="true">
          <ellipse cx="12" cy="61" rx="8" ry="2" fill="rgba(17,22,28,0.22)" filter="blur(1px)" />
          <circle cx="12" cy="7" r="4" fill="#11161c" />
          <path d="M10.8 11h2.4v2.5h-2.4z" fill="#11161c" />
          <path
            d="M6.5 14 C6.5 13 8.2 12.8 12 12.8 C15.8 12.8 17.5 13 17.5 14 L17 27 C17 29.5 16.5 30.5 16 33.5 L15.2 45.5 L15.5 59.5 C15.5 60 14.2 60 13.2 59.5 L12.3 45 L11.7 45 L10.8 59.5 C9.8 60 8.5 60 8.5 59.5 L8.8 45.5 L8 33.5 C7.5 30.5 7 29.5 7 27 Z"
            fill="#11161c"
          />
        </svg>
        <em className="quote quote--top">
          I need<br />a logo design
        </em>
      </div>

      {/* Right Figure: "I can design logos" */}
      <div className="person person--right">
        <span className="person-halo" />
        <svg className="person-silhouette" viewBox="0 0 24 64" aria-hidden="true">
          <ellipse cx="12" cy="61" rx="8" ry="2" fill="rgba(17,22,28,0.22)" filter="blur(1px)" />
          <circle cx="12" cy="7" r="4" fill="#11161c" />
          <path d="M10.8 11h2.4v2.5h-2.4z" fill="#11161c" />
          <path
            d="M6.5 14 C6.5 13 8.2 12.8 12 12.8 C15.8 12.8 17.5 13 17.5 14 L17 27 C17 29.5 16.5 30.5 16 33.5 L15.2 45.5 L15.5 59.5 C15.5 60 14.2 60 13.2 59.5 L12.3 45 L11.7 45 L10.8 59.5 C9.8 60 8.5 60 8.5 59.5 L8.8 45.5 L8 33.5 C7.5 30.5 7 29.5 7 27 Z"
            fill="#11161c"
          />
        </svg>
        <em className="quote quote--right">
          I can<br />design logos
        </em>
      </div>

      {/* Bottom Figure: "I can help with SEO" */}
      <div className="person person--bottom">
        <span className="person-halo person-halo--subtle" />
        <svg className="person-silhouette" viewBox="0 0 24 64" aria-hidden="true">
          <ellipse cx="12" cy="61" rx="8" ry="2" fill="rgba(17,22,28,0.22)" filter="blur(1px)" />
          <circle cx="12" cy="7" r="4" fill="#11161c" />
          <path d="M10.8 11h2.4v2.5h-2.4z" fill="#11161c" />
          <path
            d="M6.5 14 C6.5 13 8.2 12.8 12 12.8 C15.8 12.8 17.5 13 17.5 14 L17 27 C17 29.5 16.5 30.5 16 33.5 L15.2 45.5 L15.5 59.5 C15.5 60 14.2 60 13.2 59.5 L12.3 45 L11.7 45 L10.8 59.5 C9.8 60 8.5 60 8.5 59.5 L8.8 45.5 L8 33.5 C7.5 30.5 7 29.5 7 27 Z"
            fill="#11161c"
          />
        </svg>
        <em className="quote quote--bottom">
          I can help<br />with SEO
        </em>
      </div>

      {/* Left Figure: Standing man with halo, no quote label */}
      <div className="person person--left">
        <span className="person-halo" />
        <svg className="person-silhouette" viewBox="0 0 24 64" aria-hidden="true">
          <ellipse cx="12" cy="61" rx="8" ry="2" fill="rgba(17,22,28,0.22)" filter="blur(1px)" />
          <circle cx="12" cy="7" r="4" fill="#11161c" />
          <path d="M10.8 11h2.4v2.5h-2.4z" fill="#11161c" />
          <path
            d="M6.5 14 C6.5 13 8.2 12.8 12 12.8 C15.8 12.8 17.5 13 17.5 14 L17 27 C17 29.5 16.5 30.5 16 33.5 L15.2 45.5 L15.5 59.5 C15.5 60 14.2 60 13.2 59.5 L12.3 45 L11.7 45 L10.8 59.5 C9.8 60 8.5 60 8.5 59.5 L8.8 45.5 L8 33.5 C7.5 30.5 7 29.5 7 27 Z"
            fill="#11161c"
          />
        </svg>
      </div>
    </section>
  );
}
