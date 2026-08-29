export function HeroVisual() {
  return (
    <section className="ecosystem" aria-label="SkillCredits circular skill exchange illustration">
      <svg className="exchange-loop" viewBox="0 0 640 560" aria-hidden="true">
        <defs>
          {/* Watercolor ring gradient */}
          <radialGradient id="ringGrad" cx="30%" cy="40%" r="60%" fx="25%" fy="35%">
            <stop offset="0%" stopColor="#ded1be" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#ebe1d3" stopOpacity="0.6" />
            <stop offset="85%" stopColor="#f4ece1" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f7f2ea" stopOpacity="0" />
          </radialGradient>
          <filter id="brushBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" />
          </filter>
        </defs>

        {/* Artistic watercolor brushstroke ring background */}
        <path
          className="loop loop--wash"
          d="M 170 280 C 120 190, 180 110, 310 95 C 440 80, 530 150, 535 270 C 540 390, 440 480, 305 475 C 170 470, 110 380, 170 280 Z"
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="75"
          strokeLinecap="round"
          filter="url(#brushBlur)"
        />

        <path
          className="loop loop--main"
          d="M 180 270 C 135 175, 205 105, 320 98 C 435 90, 515 155, 520 270 C 525 385, 430 465, 310 460 C 185 455, 125 365, 180 270 Z"
          fill="none"
          stroke="#e3d6c5"
          strokeWidth="48"
          strokeLinecap="round"
          opacity="0.8"
        />

        <path
          className="loop loop--outer-stroke"
          d="M 160 295 C 115 180, 200 95, 335 88 C 455 80, 545 160, 540 285 C 535 410, 420 490, 290 482 C 150 475, 110 370, 160 295 Z"
          fill="none"
          stroke="#dfd1bd"
          strokeWidth="18"
          strokeLinecap="round"
          opacity="0.5"
          filter="url(#softGlow)"
        />

        <path
          className="loop loop--accent"
          d="M 140 310 C 110 230, 160 140, 260 105 C 360 70, 480 110, 525 210"
          fill="none"
          stroke="#d4c3aa"
          strokeWidth="28"
          strokeLinecap="round"
          opacity="0.4"
        />

        {/* Pointer Lines & Arrows */}
        {/* Top figure pointer line: curves up-right from head to "I need a logo design" quote */}
        <g className="pointer-group">
          <path
            d="M 206 148 C 215 130, 222 118, 228 108"
            fill="none"
            stroke="#2b2621"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <circle cx="206" cy="148" r="1.5" fill="#2b2621" />
        </g>

        {/* Right figure pointer line: curves down-right from head to "I can design logos" quote */}
        <g className="pointer-group">
          <path
            d="M 522 238 C 532 248, 540 256, 548 262"
            fill="none"
            stroke="#2b2621"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </g>

        {/* Bottom figure pointer line: curves from quote "I can help with SEO" up-right with arrowhead to feet */}
        <g className="pointer-group">
          <path
            d="M 218 450 C 230 442, 240 435, 246 424"
            fill="none"
            stroke="#2b2621"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <polygon points="247,421 241,427 249,429" fill="#2b2621" />
        </g>
      </svg>

      {/* Center SC Core */}
      <div className="credit-core" aria-label="SkillCredits: Value flows. Skills grow.">
        <div className="credit-initials-wrapper">
          <span className="credit-initials">SC</span>
        </div>
        <strong>SkillCredits</strong>
        <small>Value flows.<br />Skills grow.</small>
      </div>

      {/* Top Figure: "I need a logo design" */}
      <div className="person person--top">
        <span className="person-halo" />
        <svg className="person-silhouette" viewBox="0 0 24 64" aria-hidden="true">
          <ellipse cx="12" cy="61" rx="8" ry="2" fill="rgba(17,22,28,0.25)" filter="blur(1px)" />
          <circle cx="12" cy="7" r="4.2" fill="#11161c" />
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
          <ellipse cx="12" cy="61" rx="8" ry="2" fill="rgba(17,22,28,0.25)" filter="blur(1px)" />
          <circle cx="12" cy="7" r="4.2" fill="#11161c" />
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
        <svg className="person-silhouette" viewBox="0 0 24 64" aria-hidden="true">
          <ellipse cx="12" cy="61" rx="8" ry="2" fill="rgba(17,22,28,0.25)" filter="blur(1px)" />
          <circle cx="12" cy="7" r="4.2" fill="#11161c" />
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

      {/* Left Figure: Standing man with glowing golden halo */}
      <div className="person person--left">
        <span className="person-halo person-halo--large" />
        <svg className="person-silhouette" viewBox="0 0 24 64" aria-hidden="true">
          <ellipse cx="12" cy="61" rx="8" ry="2" fill="rgba(17,22,28,0.25)" filter="blur(1px)" />
          <circle cx="12" cy="7" r="4.2" fill="#11161c" />
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
