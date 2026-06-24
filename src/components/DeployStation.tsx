import styles from "./DeployStation.module.css";

/**
 * A cartoon, night-time roadside "DEPLOY STATION" — a software-deployment themed
 * petrol/charging station. Decorative sibling to <Billboard />: same neon idiom
 * (drop-shadow glow, an occasional flicker via the `ds-pulse` keyframes), placed
 * in the empty space beside the centered Contact section. Pure SVG + CSS.
 *
 * Scene: an overhead canopy sign on two posts, two "DEPLOY" / "SHIP IT" pumps
 * beneath it, a small lit shop with a neon "OPEN" sign + window and a code
 * glyph, a bush, and a curb with a dashed road lane that ties the piece into
 * the page's road theme.
 */

// Warm marquee bulbs running along the underside of the canopy sign.
const BULBS = (() => {
  const x0 = 36;
  const x1 = 284;
  const y = 70;
  const step = 24.8;
  const pts: { cx: number; cy: number }[] = [];
  for (let x = x0; x <= x1 + 0.1; x += step) pts.push({ cx: x, cy: y });
  return pts;
})();

// Dashes of the road lane along the bottom of the scene.
const LANE = (() => {
  const xs: number[] = [];
  for (let x = 8; x <= 296; x += 48) xs.push(x);
  return xs;
})();

/** Four-pointed sparkle path centred at (cx, cy). */
function spark(cx: number, cy: number, r: number): string {
  const i = r * 0.32;
  return `M${cx} ${cy - r} L${cx + i} ${cy - i} L${cx + r} ${cy} L${cx + i} ${cy + i} L${cx} ${cy + r} L${cx - i} ${cy + i} L${cx - r} ${cy} L${cx - i} ${cy - i} Z`;
}

/** Rounded square "corner light" of side `s`, top-left anchored at (x, y). */
function corner(x: number, y: number, s: number): string {
  const r = 2;
  return `M${x + r} ${y} h${s - 2 * r} a${r} ${r} 0 0 1 ${r} ${r} v${s - 2 * r} a${r} ${r} 0 0 1 ${-r} ${r} h${-(s - 2 * r)} a${r} ${r} 0 0 1 ${-r} ${-r} v${-(s - 2 * r)} a${r} ${r} 0 0 1 ${r} ${-r} Z`;
}

export default function DeployStation() {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <svg className={styles.sign} viewBox="0 0 320 250" xmlns="http://www.w3.org/2000/svg">
        {/* ---- ground: road, dashed lane, curb ---- */}
        <g className={styles.ground}>
          <rect className={styles.road} x="0" y="226" width="320" height="24" />
          <g className={styles.lane}>
            {LANE.map((x, i) => (
              <rect key={i} x={x} y="237" width="24" height="4" rx="2" />
            ))}
          </g>
          <rect className={styles.curb} x="0" y="218" width="320" height="9" rx="2" />
        </g>

        {/* ---- canopy support posts ---- */}
        <g className={styles.posts}>
          <rect x="41" y="66" width="11" height="156" rx="3" />
          <rect x="268" y="66" width="11" height="156" rx="3" />
          <rect x="31" y="214" width="31" height="8" rx="3" />
          <rect x="258" y="214" width="31" height="8" rx="3" />
        </g>

        {/* ---- overhead canopy sign ---- */}
        <g className={styles.canopy}>
          {/* neon frame + dark face */}
          <rect className={styles.frame} x="18" y="10" width="284" height="62" rx="14" />
          <rect className={styles.panel} x="30" y="20" width="260" height="34" rx="8" />

          {/* magenta corner light squares */}
          <path className={styles.cornerLight} d={corner(35, 24, 7)} />
          <path className={styles.cornerLight} d={corner(278, 24, 7)} />

          {/* cloud-with-up-arrow deploy glyph */}
          <g className={styles.cloud}>
            <path d="M50 47 a9 9 0 0 1 1 -18 a11 11 0 0 1 21 -2 a8.5 8.5 0 0 1 2 20 Z" />
            <path className={styles.cloudArrow} d="M62 44 v-12 m0 0 l-5 6 m5 -6 l5 6" />
          </g>

          {/* wordmark */}
          <text className={styles.wordmark} x="172" y="43" textAnchor="middle">
            DEPLOY STATION
          </text>
          {/* cyan neon underline bar */}
          <rect className={styles.underline} x="96" y="49" width="152" height="3.4" rx="1.7" />

          {/* sparkles */}
          <path className={styles.sparkGold} d={spark(260, 30, 4.2)} />
          <path className={styles.sparkPink} d={spark(286, 60, 3.6)} />

          {/* warm marquee bulbs along the underside */}
          <g className={styles.bulbs}>
            {BULBS.map((b, i) => (
              <circle key={i} cx={b.cx} cy={b.cy} r="2.9" />
            ))}
          </g>
        </g>

        {/* ---- deploy pumps (two) ---- */}
        <g className={styles.pumps}>
          {/* pump 1 — green check (deploy succeeded) */}
          <g transform="translate(74 122)">
            <rect className={styles.pumpBody} x="0" y="0" width="40" height="96" rx="7" />
            <rect className={styles.pumpScreen} x="6" y="9" width="28" height="23" rx="4" />
            <path className={styles.check} d="M13 21 l4.5 5 l9 -11" />
            <text className={styles.pumpLabel} x="20" y="47" textAnchor="middle">
              DEPLOY
            </text>
            <rect className={styles.pumpGauge} x="9" y="55" width="22" height="5" rx="2.5" />
            {/* hose + nozzle */}
            <path className={styles.hose} d="M40 40 q16 4 13 26 q-2 13 -13 16" />
            <rect className={styles.nozzle} x="34" y="79" width="9" height="13" rx="2.5" />
          </g>

          {/* pump 2 — rocket (ship it) */}
          <g transform="translate(206 122)">
            <rect className={styles.pumpBody} x="0" y="0" width="40" height="96" rx="7" />
            <rect className={styles.pumpScreen} x="6" y="9" width="28" height="23" rx="4" />
            <g className={styles.rocket}>
              <path d="M20 12 q6 4 6 12 l-12 0 q0 -8 6 -12 Z" />
              <path className={styles.rocketFin} d="M14 24 l-4 5 l4 0 Z M26 24 l4 5 l-4 0 Z" />
              <path className={styles.rocketFlame} d="M17 24 l3 6 l3 -6 Z" />
            </g>
            <text className={styles.pumpLabel} x="20" y="47" textAnchor="middle">
              SHIP IT
            </text>
            <rect className={styles.pumpGauge} x="9" y="55" width="22" height="5" rx="2.5" />
            {/* hose + nozzle (mirrored) */}
            <path className={styles.hose} d="M0 40 q-16 4 -13 26 q2 13 13 16" />
            <rect className={styles.nozzle} x="-3" y="79" width="9" height="13" rx="2.5" />
          </g>
        </g>

        {/* ---- lit shop building with neon OPEN sign ---- */}
        <g className={styles.shop} transform="translate(128 136)">
          {/* roof */}
          <path className={styles.shopRoof} d="M-4 16 l32 -16 l32 16 Z" />
          {/* body */}
          <rect className={styles.shopBody} x="2" y="16" width="56" height="66" rx="4" />
          {/* lit window */}
          <rect className={styles.shopWindow} x="9" y="25" width="20" height="22" rx="3" />
          <path className={styles.windowMullion} d="M19 25 v22 M9 36 h20" />
          {/* door */}
          <rect className={styles.shopDoor} x="38" y="48" width="15" height="34" rx="2" />
          <circle className={styles.doorKnob} cx="41" cy="65" r="1.4" />
          {/* code glyph above the door */}
          <text className={styles.codeGlyph} x="45.5" y="42" textAnchor="middle">
            {"</>"}
          </text>
          {/* neon OPEN sign */}
          <rect className={styles.openSign} x="8" y="55" width="23" height="13" rx="3" />
          <text className={styles.openText} x="19.5" y="64.5" textAnchor="middle">
            OPEN
          </text>
        </g>

        {/* ---- bush ---- */}
        <g className={styles.bush} transform="translate(287 190)">
          <circle cx="0" cy="14" r="10" />
          <circle cx="12" cy="16" r="13" />
          <circle cx="23" cy="20" r="9" />
          <circle cx="9" cy="6" r="8.5" />
        </g>
      </svg>
    </div>
  );
}
