import styles from "./ThanksSign.module.css";

/**
 * A cartoon amber marquee — "Thanks for visiting!" with a heart — that sits in
 * the empty space beside the centered Reference letter, near where the road
 * ends (the finish line of the page's road/car journey). Decorative sibling to
 * <Billboard /> / <DeployStation />: same neon idiom (bulb ring, drop-shadow
 * glow, an occasional flicker via the `ts-pulse` keyframes). Pure SVG + CSS.
 */

// Warm bulbs evenly spaced around the inner frame band (classic marquee ring).
const BULBS = (() => {
  const x0 = 34;
  const y0 = 30;
  const x1 = 266;
  const y1 = 164;
  const step = 22.4;
  const pts: { cx: number; cy: number }[] = [];
  for (let x = x0; x <= x1 + 0.1; x += step) {
    pts.push({ cx: x, cy: y0 });
    pts.push({ cx: x, cy: y1 });
  }
  for (let y = y0 + step; y < y1 - 0.1; y += step) {
    pts.push({ cx: x0, cy: y });
    pts.push({ cx: x1, cy: y });
  }
  return pts;
})();

export default function ThanksSign() {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <svg className={styles.sign} viewBox="0 0 300 256" xmlns="http://www.w3.org/2000/svg">
        {/* support posts */}
        <g className={styles.posts}>
          <rect x="96" y="180" width="12" height="64" rx="3" />
          <rect x="192" y="180" width="12" height="64" rx="3" />
        </g>

        {/* bushes at the base */}
        <g className={styles.bush} transform="translate(74 230)">
          <circle cx="0" cy="10" r="8" />
          <circle cx="11" cy="12" r="11" />
          <circle cx="21" cy="14" r="8" />
          <circle cx="8" cy="3" r="7" />
        </g>
        <g className={styles.bush} transform="translate(214 234)">
          <circle cx="0" cy="8" r="7" />
          <circle cx="10" cy="10" r="10" />
          <circle cx="19" cy="12" r="7" />
        </g>

        {/* marquee board */}
        <g className={styles.board}>
          {/* amber frame + dark face */}
          <rect className={styles.frame} x="16" y="12" width="268" height="170" rx="22" />
          <rect className={styles.panel} x="40" y="36" width="220" height="122" rx="12" />

          {/* warm bulbs around the perimeter */}
          <g className={styles.bulbs}>
            {BULBS.map((b, i) => (
              <circle key={i} cx={b.cx} cy={b.cy} r="3.6" />
            ))}
          </g>

          {/* lettering */}
          <text className={styles.thanks} x="150" y="84" textAnchor="middle">
            Thanks
          </text>
          <text
            className={styles.visiting}
            x="150"
            y="122"
            textAnchor="middle"
            textLength="196"
            lengthAdjust="spacingAndGlyphs"
          >
            for visiting!
          </text>

          {/* heart */}
          <path
            className={styles.heart}
            transform="translate(136.5 125) scale(1.1)"
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          />
        </g>
      </svg>
    </div>
  );
}
