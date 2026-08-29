export function HeroVisual() {
  return (
    <section className="ecosystem" aria-label="SkillCredits circular skill exchange illustration">
      <svg className="exchange-loop" viewBox="0 0 680 580" aria-hidden="true">
        <defs>
          {/* Broad Enso Watercolor Gradient */}
          <radialGradient id="ensoBroad" cx="20%" cy="50%" r="65%" fx="15%" fy="50%">
            <stop offset="0%" stopColor="#d2c4b0" stopOpacity="0.85" />
            <stop offset="35%" stopColor="#dfd3c2" stopOpacity="0.65" />
            <stop offset="70%" stopColor="#ece3d5" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f7f5f0" stopOpacity="0" />
          </radialGradient>

          {/* Golden radial gradient for person halos */}
          <radialGradient id="haloGold" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(235, 175, 55, 0.95)" />
            <stop offset="50%" stopColor="rgba(235, 175, 55, 0.45)" />
            <stop offset="100%" stopColor="rgba(235, 175, 55, 0)" />
          </radialGradient>

          {/* Filters for organic watercolor feel */}
          <filter id="watercolorBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id="fineStrokeBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.8" />
          </filter>
        </defs>

        {/* 1. Thick Enso watercolor wash on the left */}
        <path
          d="M 360 65 C 500 65, 595 160, 595 285 C 595 410, 500 505, 360 505 C 190 505, 115 390, 115 285 C 115 170, 190 65, 360 65 Z"
          fill="none"
          stroke="url(#ensoBroad)"
          strokeWidth="85"
          strokeLinecap="round"
          filter="url(#watercolorBlur)"
        />

        {/* 2. Secondary watercolor ring texture */}
        <path
          d="M 370 78 C 490 78, 580 165, 580 285 C 580 405, 490 492, 370 492 C 220 492, 145 385, 145 285 C 145 180, 220 78, 370 78 Z"
          fill="none"
          stroke="#dfd2bf"
          strokeWidth="45"
          strokeLinecap="round"
          opacity="0.7"
        />

        {/* 3. Tapered fine Enso circular stroke on right edge */}
        <ellipse cx="380" cy="285" rx="205" ry="205" fill="none" stroke="#cfbfab" strokeWidth="2" opacity="0.5" />
        <ellipse cx="380" cy="285" rx="202" ry="202" fill="none" stroke="#e0d3c1" strokeWidth="8" opacity="0.6" filter="url(#fineStrokeBlur)" />
        <ellipse cx="380" cy="285" rx="194" ry="194" fill="none" stroke="#e9e0d2" strokeWidth="16" opacity="0.5" />
        <ellipse cx="380" cy="285" rx="156" ry="156" fill="none" stroke="#dccdb8" strokeWidth="1.5" opacity="0.3" />

        {/* --- 4. Silhouette Figures --- */}

        {/* Left Standing Man (on the thick Enso sweep) */}
        <g transform="translate(142, 245)">
          {/* Halo */}
          <circle cx="12" cy="7" r="28" fill="url(#haloGold)" />
          {/* Ground shadow */}
          <ellipse cx="12" cy="62" rx="12" ry="3" fill="rgba(20, 15, 10, 0.3)" filter="blur(1px)" />
          {/* Silhouette body */}
          <circle cx="12" cy="7" r="4.2" fill="#11161c" />
          <path d="M10.8 11h2.4v2.5h-2.4z" fill="#11161c" />
          <path
            d="M6.5 14 C6.5 13 8.2 12.8 12 12.8 C15.8 12.8 17.5 13 17.5 14 L17 27 C17 29.5 16.5 30.5 16 33.5 L15.2 45.5 L15.5 59.5 C15.5 60 14.2 60 13.2 59.5 L12.3 45 L11.7 45 L10.8 59.5 C9.8 60 8.5 60 8.5 59.5 L8.8 45.5 L8 33.5 C7.5 30.5 7 29.5 7 27 Z"
            fill="#11161c"
          />
        </g>

        {/* Top Standing Man (top curve of ring) */}
        <g transform="translate(366, 102)">
          {/* Halo */}
          <circle cx="12" cy="7" r="20" fill="url(#haloGold)" />
          {/* Ground shadow */}
          <ellipse cx="12" cy="62" rx="8" ry="2" fill="rgba(20, 15, 10, 0.25)" filter="blur(1px)" />
          {/* Silhouette body */}
          <circle cx="12" cy="7" r="4.2" fill="#11161c" />
          <path d="M10.8 11h2.4v2.5h-2.4z" fill="#11161c" />
          <path
            d="M6.5 14 C6.5 13 8.2 12.8 12 12.8 C15.8 12.8 17.5 13 17.5 14 L17 27 C17 29.5 16.5 30.5 16 33.5 L15.2 45.5 L15.5 59.5 C15.5 60 14.2 60 13.2 59.5 L12.3 45 L11.7 45 L10.8 59.5 C9.8 60 8.5 60 8.5 59.5 L8.8 45.5 L8 33.5 C7.5 30.5 7 29.5 7 27 Z"
            fill="#11161c"
          />
        </g>

        {/* Right Standing Man (right outer edge of ring) */}
        <g transform="translate(574, 210)">
          {/* Halo */}
          <circle cx="12" cy="7" r="20" fill="url(#haloGold)" />
          {/* Ground shadow extending left-down */}
          <polygon points="12,61 -15,67 5,63" fill="rgba(20, 15, 10, 0.2)" filter="blur(1px)" />
          {/* Silhouette body */}
          <circle cx="12" cy="7" r="4.2" fill="#11161c" />
          <path d="M10.8 11h2.4v2.5h-2.4z" fill="#11161c" />
          <path
            d="M6.5 14 C6.5 13 8.2 12.8 12 12.8 C15.8 12.8 17.5 13 17.5 14 L17 27 C17 29.5 16.5 30.5 16 33.5 L15.2 45.5 L15.5 59.5 C15.5 60 14.2 60 13.2 59.5 L12.3 45 L11.7 45 L10.8 59.5 C9.8 60 8.5 60 8.5 59.5 L8.8 45.5 L8 33.5 C7.5 30.5 7 29.5 7 27 Z"
            fill="#11161c"
          />
        </g>

        {/* Bottom Standing Man (bottom-center curve) */}
        <g transform="translate(402, 400)">
          {/* Ground shadow */}
          <ellipse cx="12" cy="62" rx="8" ry="2" fill="rgba(20, 15, 10, 0.25)" filter="blur(1px)" />
          {/* Silhouette body */}
          <circle cx="12" cy="7" r="4.2" fill="#11161c" />
          <path d="M10.8 11h2.4v2.5h-2.4z" fill="#11161c" />
          <path
            d="M6.5 14 C6.5 13 8.2 12.8 12 12.8 C15.8 12.8 17.5 13 17.5 14 L17 27 C17 29.5 16.5 30.5 16 33.5 L15.2 45.5 L15.5 59.5 C15.5 60 14.2 60 13.2 59.5 L12.3 45 L11.7 45 L10.8 59.5 C9.8 60 8.5 60 8.5 59.5 L8.8 45.5 L8 33.5 C7.5 30.5 7 29.5 7 27 Z"
            fill="#11161c"
          />
        </g>


        {/* --- 5. Hand-drawn Pointer Lines & Handwritten Quotes Inside SVG --- */}

        {/* Top Quote & Curved Pointer Line */}
        <g className="hand-annotation">
          <text x="390" y="52" fontFamily="'Comic Sans MS', 'Bradley Hand', 'Caveat', cursive" fontSize="17" fontWeight="600" fill="#24201b">
            I need
          </text>
          <text x="402" y="72" fontFamily="'Comic Sans MS', 'Bradley Hand', 'Caveat', cursive" fontSize="17" fontWeight="600" fill="#24201b">
            a logo design
          </text>
          {/* Line curving from top man's head (378, 104) to text label */}
          <path d="M 378 102 C 382 86, 386 76, 396 68" fill="none" stroke="#221e1a" strokeWidth="1.3" strokeLinecap="round" />
        </g>

        {/* Right Quote & Curved Pointer Line */}
        <g className="hand-annotation">
          <text x="592" y="275" fontFamily="'Comic Sans MS', 'Bradley Hand', 'Caveat', cursive" fontSize="17" fontWeight="600" fill="#24201b">
            I can
          </text>
          <text x="588" y="296" fontFamily="'Comic Sans MS', 'Bradley Hand', 'Caveat', cursive" fontSize="17" fontWeight="600" fill="#24201b">
            design logos
          </text>
          {/* Line curving from right man's side (588, 245) to quote */}
          <path d="M 586 248 C 588 258, 589 262, 590 268" fill="none" stroke="#221e1a" strokeWidth="1.3" strokeLinecap="round" />
        </g>

        {/* Bottom Quote & Arrowed Curved Pointer Line */}
        <g className="hand-annotation">
          <text x="375" y="515" fontFamily="'Comic Sans MS', 'Bradley Hand', 'Caveat', cursive" fontSize="17" fontWeight="600" fill="#24201b" textAnchor="middle">
            I can help
          </text>
          <text x="375" y="535" fontFamily="'Comic Sans MS', 'Bradley Hand', 'Caveat', cursive" fontSize="17" fontWeight="600" fill="#24201b" textAnchor="middle">
            with SEO
          </text>
          {/* Curved line pointing up to bottom man's feet (414, 460) with arrowhead */}
          <path d="M 382 495 C 392 485, 399 476, 407 466" fill="none" stroke="#221e1a" strokeWidth="1.3" strokeLinecap="round" />
          <polygon points="408,462 402,469 410,470" fill="#221e1a" />
        </g>
      </svg>

      {/* Center Core Badge */}
      <div className="credit-core" aria-label="SkillCredits: Value flows. Skills grow.">
        <div className="credit-initials-wrapper">
          <span className="credit-initials">SC</span>
        </div>
        <strong>SkillCredits</strong>
        <small>Value flows.<br />Skills grow.</small>
      </div>
    </section>
  );
}
