export function HeroVisual() {
  return (
    <section className="ecosystem" aria-label="SkillCredits circular skill exchange illustration">
      <svg className="exchange-loop" viewBox="0 0 640 560" aria-hidden="true">
        <defs>
          <linearGradient id="shadowGrad" x1="0%" y1="0%" x2="100%" y2="60%">
            <stop offset="0%" stopColor="rgba(17,22,28,0.35)" />
            <stop offset="70%" stopColor="rgba(17,22,28,0.1)" />
            <stop offset="100%" stopColor="rgba(17,22,28,0.0)" />
          </linearGradient>
        </defs>

        {/* Circular watercolor loops */}
        <path className="loop loop--wide" d="M131 279c6-112 99-190 226-183 112 6 205 78 207 177 2 109-98 190-224 187-131-3-216-72-209-181Z" />
        <path className="loop loop--soft" d="M111 295c19-118 124-190 253-176 108 12 184 85 182 170-3 107-108 175-234 170-125-5-217-66-201-164Z" />
        <path className="loop loop--thin" d="M152 260c26-104 125-157 237-142 99 13 164 76 166 153 3 91-85 159-205 163-119 4-222-65-198-174Z" />

        {/* Hand-drawn annotation pointer lines matching reference image */}
        {/* Top figure pointer line */}
        <path
          d="M 172 75 C 166 88, 162 98, 160 110"
          fill="none"
          stroke="#11161c"
          strokeWidth="1.2"
        />
        <circle cx="172" cy="75" r="1.5" fill="#11161c" />

        {/* Right figure pointer line */}
        <path
          d="M 552 236 C 542 242, 536 248, 528 252"
          fill="none"
          stroke="#11161c"
          strokeWidth="1.2"
        />

        {/* Bottom figure pointer line with arrowhead pointing up to feet */}
        <path
          d="M 168 472 C 176 458, 182 446, 188 434"
          fill="none"
          stroke="#11161c"
          strokeWidth="1.2"
        />
        <polygon points="188,431 183,439 191,438" fill="#11161c" />
      </svg>

      <div className="credit-core" aria-label="SkillCredits: Value flows. Skills grow.">
        <span className="credit-initials">SC</span>
        <strong>SkillCredits</strong>
        <small>Value flows.<br />Skills grow.</small>
      </div>

      {/* Top Figure: "I need a logo design" */}
      <div className="person person--top">
        <span className="person-halo" />
        <svg className="person-silhouette" viewBox="0 0 48 72" aria-hidden="true">
          <path d="M 19 63 L 38 68 L 44 69 L 22 63 Z" fill="url(#shadowGrad)" filter="blur(0.8px)" />
          <ellipse cx="18" cy="8" rx="3.5" ry="4.2" fill="#11161c" />
          <path d="M 16.5 11.8 L 19.5 11.8 L 19.8 14 L 16.2 14 Z" fill="#11161c" />
          <path
            d="M 11.5 15.5 C 13.5 14.2, 22.5 14.2, 24.5 15.5 L 23.5 28 C 22.8 33, 22 36, 21.5 40 L 21 64 L 18.2 64 L 18 43 L 17.8 64 L 15 64 L 14.5 40 C 14 36, 13.2 33, 12.5 28 Z"
            fill="#11161c"
          />
          <path d="M 11.5 15.5 L 9.8 28 C 9.5 32, 9.5 36, 10.2 38 L 11.5 38 L 12.2 28 Z" fill="#11161c" />
          <path d="M 24.5 15.5 L 26.2 28 C 26.5 32, 26.5 36, 25.8 38 L 24.5 38 L 23.8 28 Z" fill="#11161c" />
        </svg>
        <em className="quote quote--top">
          I need<br />a logo design
        </em>
      </div>

      {/* Right Figure: "I can design logos" */}
      <div className="person person--right">
        <span className="person-halo" />
        <svg className="person-silhouette" viewBox="0 0 48 72" aria-hidden="true">
          <path d="M 19 63 L 38 68 L 44 69 L 22 63 Z" fill="url(#shadowGrad)" filter="blur(0.8px)" />
          <ellipse cx="18" cy="8" rx="3.5" ry="4.2" fill="#11161c" />
          <path d="M 16.5 11.8 L 19.5 11.8 L 19.8 14 L 16.2 14 Z" fill="#11161c" />
          <path
            d="M 11.5 15.5 C 13.5 14.2, 22.5 14.2, 24.5 15.5 L 23.5 28 C 22.8 33, 22 36, 21.5 40 L 21 64 L 18.2 64 L 18 43 L 17.8 64 L 15 64 L 14.5 40 C 14 36, 13.2 33, 12.5 28 Z"
            fill="#11161c"
          />
          <path d="M 11.5 15.5 L 9.8 28 C 9.5 32, 9.5 36, 10.2 38 L 11.5 38 L 12.2 28 Z" fill="#11161c" />
          <path d="M 24.5 15.5 L 26.2 28 C 26.5 32, 26.5 36, 25.8 38 L 24.5 38 L 23.8 28 Z" fill="#11161c" />
        </svg>
        <em className="quote quote--right">
          I can<br />design logos
        </em>
      </div>

      {/* Bottom Figure: "I can help with SEO" */}
      <div className="person person--bottom">
        <span className="person-halo person-halo--subtle" />
        <svg className="person-silhouette" viewBox="0 0 48 72" aria-hidden="true">
          <path d="M 19 63 L 38 68 L 44 69 L 22 63 Z" fill="url(#shadowGrad)" filter="blur(0.8px)" />
          <ellipse cx="18" cy="8" rx="3.5" ry="4.2" fill="#11161c" />
          <path d="M 16.5 11.8 L 19.5 11.8 L 19.8 14 L 16.2 14 Z" fill="#11161c" />
          <path
            d="M 11.5 15.5 C 13.5 14.2, 22.5 14.2, 24.5 15.5 L 23.5 28 C 22.8 33, 22 36, 21.5 40 L 21 64 L 18.2 64 L 18 43 L 17.8 64 L 15 64 L 14.5 40 C 14 36, 13.2 33, 12.5 28 Z"
            fill="#11161c"
          />
          <path d="M 11.5 15.5 L 9.8 28 C 9.5 32, 9.5 36, 10.2 38 L 11.5 38 L 12.2 28 Z" fill="#11161c" />
          <path d="M 24.5 15.5 L 26.2 28 C 26.5 32, 26.5 36, 25.8 38 L 24.5 38 L 23.8 28 Z" fill="#11161c" />
        </svg>
        <em className="quote quote--bottom">
          I can help<br />with SEO
        </em>
      </div>

      {/* Left Figure: Standing man with halo, no quote label */}
      <div className="person person--left">
        <span className="person-halo" />
        <svg className="person-silhouette" viewBox="0 0 48 72" aria-hidden="true">
          <path d="M 19 63 L 38 68 L 44 69 L 22 63 Z" fill="url(#shadowGrad)" filter="blur(0.8px)" />
          <ellipse cx="18" cy="8" rx="3.5" ry="4.2" fill="#11161c" />
          <path d="M 16.5 11.8 L 19.5 11.8 L 19.8 14 L 16.2 14 Z" fill="#11161c" />
          <path
            d="M 11.5 15.5 C 13.5 14.2, 22.5 14.2, 24.5 15.5 L 23.5 28 C 22.8 33, 22 36, 21.5 40 L 21 64 L 18.2 64 L 18 43 L 17.8 64 L 15 64 L 14.5 40 C 14 36, 13.2 33, 12.5 28 Z"
            fill="#11161c"
          />
          <path d="M 11.5 15.5 L 9.8 28 C 9.5 32, 9.5 36, 10.2 38 L 11.5 38 L 12.2 28 Z" fill="#11161c" />
          <path d="M 24.5 15.5 L 26.2 28 C 26.5 32, 26.5 36, 25.8 38 L 24.5 38 L 23.8 28 Z" fill="#11161c" />
        </svg>
      </div>
    </section>
  );
}
