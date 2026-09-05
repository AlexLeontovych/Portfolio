/**
 * The one texture this game draws its towers, shots and blasts from.
 *
 * scripts/td_atlas.py cuts the frames out of art-src/td, trims the empty
 * margin, scales each to the size it is drawn at and writes atlas.webp plus
 * the index below. Everything is therefore already the right size on the
 * 960x540 board: drawing is a blit, never a resample.
 *
 * Each entry also carries an anchor — where the artist's own frame centre and
 * ground line ended up inside the trimmed rectangle. Drawing through it puts
 * a tower's base exactly on its build slot no matter how much muzzle flash
 * frame 3 sticks out to the right.
 */

import { loadImage } from "../platformer/sprites";

export interface AtlasEntry {
  x: number;
  y: number;
  /** one frame, in board units */
  w: number;
  h: number;
  /** frames in this sprite */
  n: number;
  /** frames per row: a sprite too wide for the atlas wraps onto more rows */
  row: number;
  /** the anchor, measured from the frame's top-left corner */
  ax: number;
  ay: number;
}

export type Atlas = {
  img: HTMLImageElement;
  frames: Record<string, AtlasEntry>;
};

export async function loadAtlas(base: string): Promise<Atlas | null> {
  try {
    const [img, frames] = await Promise.all([
      loadImage(`${base}/atlas.webp`),
      fetch(`${base}/atlas.json`).then((r) => r.json() as Promise<Record<string, AtlasEntry>>),
    ]);
    return { img, frames };
  } catch {
    // A missing atlas must not take the level down with it — the engine keeps
    // its drawn fallbacks for exactly this.
    return null;
  }
}

export interface DrawOpts {
  /** 0..n-1, wrapped */
  frame?: number;
  /** multiplies the baked size; 1 is the size the packer chose */
  scale?: number;
  /** radians, applied around the anchor */
  angle?: number;
  flip?: boolean;
  alpha?: number;
  /** centre on the anchor's x but on the middle of the frame vertically */
  centred?: boolean;
}

/**
 * Draw one frame with (x, y) landing on the sprite's anchor.
 *
 * Returns false when the sprite is not in the atlas, which is the signal for
 * the caller to fall back to drawing the thing by hand.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas | null,
  name: string,
  x: number,
  y: number,
  opts: DrawOpts = {},
): boolean {
  const e = atlas?.frames[name];
  if (!atlas || !e) return false;

  const { scale = 1, angle = 0, flip = false, alpha = 1, centred = false } = opts;
  const f = ((Math.floor(opts.frame ?? 0) % e.n) + e.n) % e.n;
  const ax = e.ax;
  const ay = centred ? e.h / 2 : e.ay;

  ctx.save();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  if (scale !== 1) ctx.scale(scale, scale);
  if (flip) ctx.scale(-1, 1);
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  const per = e.row || e.n;
  ctx.drawImage(
    atlas.img,
    e.x + (f % per) * e.w, e.y + Math.floor(f / per) * e.h, e.w, e.h,
    -ax, -ay, e.w, e.h,
  );
  ctx.restore();
  return true;
}

/** Height of a sprite in board units, for laying out what sits above it. */
export function spriteHeight(atlas: Atlas | null, name: string): number {
  return atlas?.frames[name]?.h ?? 0;
}
