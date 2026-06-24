import type { Work } from "../data/types";

/**
 * Auto screenshot for a live demo URL via WordPress mShots (free, no key).
 * First request may return a "generating" placeholder — the <Thumbnail>
 * component retries and falls back to a generated poster on failure.
 */
export function shotUrl(url: string, w = 640): string {
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=${w}&h=${Math.round(
    (w * 3) / 4
  )}`;
}

export function getThumb(work: Work, w = 640): string {
  return work.thumb || shotUrl(work.url, w);
}

const KIND_COLORS: Record<string, [string, string]> = {
  Game: ["#ff2e88", "#ffb800"],
  Retail: ["#00e5ff", "#a855f7"],
  Site: ["#aaff00", "#00e5ff"],
  SVG: ["#a855f7", "#ff2e88"],
  Animation: ["#00e5ff", "#ff2e88"],
  Carousel: ["#ffb800", "#ff2e88"],
  "3D": ["#aaff00", "#a855f7"],
  AI: ["#00e5ff", "#aaff00"],
  Misc: ["#a855f7", "#00e5ff"],
  Other: ["#a855f7", "#00e5ff"],
};

/** A deterministic SVG poster used when a screenshot can't be fetched. */
export function posterFor(work: Work): string {
  const [a, b] = KIND_COLORS[work.kind] ?? KIND_COLORS.Other;
  const initials = work.company
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='480'>
  <defs>
    <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/>
    </linearGradient>
    <pattern id='grid' width='32' height='32' patternUnits='userSpaceOnUse'>
      <path d='M32 0H0V32' fill='none' stroke='rgba(255,255,255,0.12)' stroke-width='1'/>
    </pattern>
  </defs>
  <rect width='640' height='480' fill='#160a2e'/>
  <rect width='640' height='480' fill='url(#grid)'/>
  <circle cx='320' cy='200' r='150' fill='url(#g)' opacity='0.32'/>
  <text x='320' y='220' font-family='Arial,sans-serif' font-size='120' font-weight='800'
    fill='url(#g)' text-anchor='middle'>${initials}</text>
  <text x='320' y='300' font-family='monospace' font-size='26'
    fill='rgba(255,255,255,0.65)' text-anchor='middle' letter-spacing='4'>${work.kind.toUpperCase()}</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
