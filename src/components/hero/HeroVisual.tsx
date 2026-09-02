export function HeroVisual() {
  return (
    <section className="ecosystem" aria-label="SkillCredits circular skill exchange illustration">
      <svg className="exchange-loop" viewBox="0 0 640 560" aria-hidden="true">
        <defs>
          {/* Broad watercolor gradient for the left/thick side of Enso loop */}
          <radialGradient id="ensoGrad" cx="25%" cy="50%" r="55%" fx="20%" fy="50%">
            <stop offset="0%" stopColor="#ded2bf" stopOpacity="0.85" />
            <stop offset="45%" stopColor="#e8ded0" stopOpacity="0.65" />
            <stop offset="80%" stopColor="#f2ece1" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f7f5f0" stopOpacity="0" />
          </radialGradient>

          {/* Soft blur for watercolor edges */}
          <filter id="ensoBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <filter id="fineGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>

        {/* The overlapping, imperfect strokes intentionally mirror the painted circle in the supplied hero artwork. */}
        <path
          d="M 303 82 C 427 61, 536 150, 548 270 C 562 392, 468 490, 338 500 C 200 510, 106 417, 105 289 C 104 177, 185 97, 303 82"
          fill="none"
          stroke="url(#ensoGrad)"
          strokeWidth="74"
          strokeLinecap="round"
          filter="url(#ensoBlur)"
        />

        {/* Dry-brush layers keep the loop organic rather than mathematically circular. */}
        <path
          d="M 296 91 C 424 77, 524 166, 531 278 C 539 393, 445 480, 329 484 C 204 489, 132 404, 130 287 C 128 178, 198 103, 296 91"
          fill="none"
          stroke="#e2d5c3"
          strokeWidth="39"
          strokeLinecap="round"
          opacity="0.75"
        />
        <path
          d="M 267 103 C 186 125, 145 196, 146 280 C 146 378, 215 453, 316 463"
          fill="none"
          stroke="#d6c5ae"
          strokeWidth="9"
          strokeLinecap="round"
          opacity="0.42"
        />
        <path
          d="M 331 102 C 440 106, 514 182, 515 277 C 517 365, 459 433, 371 451"
          fill="none"
          stroke="#f4eee5"
          strokeWidth="16"
          strokeLinecap="round"
          opacity="0.82"
        />

        {/* 3. Fine circular strokes on right edge (Enso ring detail) */}
        <ellipse cx="330" cy="286" rx="192" ry="190" fill="none" stroke="#d3c3ad" strokeWidth="2.5" opacity="0.45" />
        <ellipse cx="330" cy="286" rx="187" ry="185" fill="none" stroke="#dfd2bf" strokeWidth="6" opacity="0.5" filter="url(#fineGlow)" />
        <ellipse cx="330" cy="286" rx="180" ry="178" fill="none" stroke="#e8ded0" strokeWidth="12" opacity="0.6" />
        <ellipse cx="330" cy="286" rx="148" ry="146" fill="none" stroke="#e0d2c0" strokeWidth="2" opacity="0.35" />

        {/* 4. Hand-drawn Pointer Lines & Arrows inside SVG */}
        {/* Top figure pointer line: from top figure head area (352, 126) curving up-right toward "I need a logo design" label */}
        <g className="pointer-group">
          <path
            d="M 353 125 C 358 108, 362 98, 368 88"
            fill="none"
            stroke="#221e1a"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </g>

        {/* Right figure pointer line: from right figure torso area (535, 260) curving down-right toward "I can design logos" label */}
        <g className="pointer-group">
          <path
            d="M 536 262 C 542 270, 546 276, 552 282"
            fill="none"
            stroke="#221e1a"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </g>

        {/* Bottom figure pointer line with arrowhead: from "I can help with SEO" quote up to bottom figure's feet (382, 422) */}
        <g className="pointer-group">
          <path
            d="M 364 472 C 372 458, 377 444, 381 428"
            fill="none"
            stroke="#221e1a"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <polygon points="381,424 376,432 384,431" fill="#221e1a" />
        </g>
      </svg>

      {/* Center SC Core Badge */}
      <div className="credit-core" aria-label="SkillCredits: Value flows. Skills grow.">
        <div className="credit-initials-wrapper">
          <span className="credit-initials">⚡</span>
        </div>
        <strong>SkillCredits</strong>
        <small>Value flows.<br />Skills grow.</small>
      </div>

      {/* Top Figure: "I need a logo design" */}
      <div className="person person--top">
        <span className="person-halo" />
        <svg className="person-silhouette" viewBox="0 0 24 64" aria-hidden="true">
          <ellipse cx="12" cy="61" rx="7" ry="2" fill="rgba(17,22,28,0.22)" filter="blur(1px)" />
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
          <ellipse cx="6" cy="61" rx="8" ry="2" fill="rgba(17,22,28,0.22)" filter="blur(1px)" />
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
          <ellipse cx="12" cy="61" rx="7" ry="2" fill="rgba(17,22,28,0.22)" filter="blur(1px)" />
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
          <ellipse cx="12" cy="61" rx="9" ry="2.5" fill="rgba(17,22,28,0.28)" filter="blur(1px)" />
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
