/**
 * The road creeps walk.
 *
 * A path is authored as a handful of waypoints, but everything the game asks
 * of it is in terms of *distance travelled*: how far along is this creep, who
 * is furthest, where do I draw it, has it reached the keep. So the polyline is
 * measured once on load and every later query is a binary search plus a lerp —
 * no per-frame trigonometry, and creeps move at a constant speed regardless of
 * how the waypoints happen to be spaced.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Path {
  points: Point[];
  /** cumulative length at each point; last entry is the total */
  cum: number[];
  length: number;
}

export function buildPath(points: Point[]): Path {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  return { points, cum, length: cum[cum.length - 1] };
}

/** Position at a distance along the path, clamped at both ends. */
export function pointAt(path: Path, dist: number): Point {
  const { points, cum } = path;
  if (dist <= 0) return { ...points[0] };
  if (dist >= path.length) return { ...points[points.length - 1] };

  let lo = 0;
  let hi = cum.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= dist) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const t = (dist - cum[lo]) / seg;
  return {
    x: points[lo].x + (points[hi].x - points[lo].x) * t,
    y: points[lo].y + (points[hi].y - points[lo].y) * t,
  };
}

/** Unit heading at a distance along the path — used to face the sprite. */
export function headingAt(path: Path, dist: number): Point {
  const a = pointAt(path, Math.max(0, dist - 4));
  const b = pointAt(path, Math.min(path.length, dist + 4));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * Shortest distance from a point to the road.
 *
 * Build slots are authored by hand, and a slot that overlaps the road would
 * let a tower sit where creeps walk. This is the check that keeps the level
 * data honest — it runs once per slot on load, not per frame.
 */
export function distanceToPath(path: Path, p: Point): number {
  let best = Infinity;
  const { points } = path;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const wx = p.x - a.x;
    const wy = p.y - a.y;
    const len2 = vx * vx + vy * vy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
    const d = Math.hypot(wx - vx * t, wy - vy * t);
    if (d < best) best = d;
  }
  return best;
}
