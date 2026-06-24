import styles from "./Billboard.module.css";

/**
 * A cartoon roadside neon marquee that sits in the hero's left gutter (desktop
 * only), echoing the "open to opportunities" theme of the page. The whole sign
 * flickers brighter every few seconds — see the `bb-pulse` keyframes in the CSS.
 */

// Light bulbs evenly spaced around the inner frame band.
const BULBS = (() => {
  const x0 = 40;
  const y0 = 36;
  const x1 = 260;
  const y1 = 164;
  const step = 22;
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

/** Four-pointed sparkle path centred at (cx, cy). */
function spark(cx: number, cy: number, r: number): string {
  const i = r * 0.32;
  return `M${cx} ${cy - r} L${cx + i} ${cy - i} L${cx + r} ${cy} L${cx + i} ${cy + i} L${cx} ${cy + r} L${cx - i} ${cy + i} L${cx - r} ${cy} L${cx - i} ${cy - i} Z`;
}

export default function Billboard() {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <svg className={styles.sign} viewBox="0 0 300 272" xmlns="http://www.w3.org/2000/svg">
        {/* support posts */}
        <g className={styles.posts}>
          <rect x="96" y="180" width="13" height="84" rx="3" />
          <rect x="191" y="180" width="13" height="84" rx="3" />
          <rect x="86" y="259" width="33" height="9" rx="3" />
          <rect x="181" y="259" width="33" height="9" rx="3" />
        </g>

        <g className={styles.board}>
          {/* neon frame + dark panel */}
          <rect className={styles.frame} x="16" y="12" width="268" height="176" rx="26" />
          <rect className={styles.panel} x="50" y="46" width="200" height="108" rx="14" />

          {/* marquee bulbs */}
          <g className={styles.bulbs}>
            {BULBS.map((b, i) => (
              <circle key={i} cx={b.cx} cy={b.cy} r="4" />
            ))}
          </g>

          {/* sparkles */}
          <path className={styles.sparkPink} d={spark(66, 62, 6.5)} />
          <path className={styles.sparkGold} d={spark(236, 66, 5.5)} />
          <path className={styles.sparkGold} d={spark(236, 132, 5)} />

          {/* lettering */}
          <text className={styles.line1} x="150" y="86" textAnchor="middle">
            Open to new
          </text>
          <text
            className={styles.line2}
            x="150"
            y="128"
            textAnchor="middle"
            textLength="184"
            lengthAdjust="spacingAndGlyphs"
          >
            opportunities
          </text>
          <path className={styles.swoosh} d="M72 140 q78 15 156 -3" />
        </g>
      </svg>
    </div>
  );
}
