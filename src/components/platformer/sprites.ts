/**
 * Sprite sheets, animation playback and the tile atlas.
 *
 * The LuizMelo packs (CC0) draw every character on a big square canvas with a
 * lot of empty margin — Huntress is 32x42 px of art inside a 150x150 frame.
 * Drawing those frames raw would make hitboxes and floor contact meaningless,
 * so each sheet is measured ONCE on load: we find the opaque bounds across all
 * frames and remember them. Actors then position by their feet and the art
 * lines up on the ground automatically, whatever the pack's padding happens
 * to be.
 */

export interface Anim {
  img: HTMLImageElement;
  frames: number;
  /** index of this animation's first frame within the sheet */
  first: number;
  fw: number;
  fh: number;
  fps: number;
  loop: boolean;
  /** opaque content box, shared by every frame of the sheet */
  trim: { x: number; y: number; w: number; h: number };
}

export interface AnimSet {
  [name: string]: Anim;
}

interface SheetSpec {
  file: string;
  /** how many frames this animation plays */
  frames: number;
  /**
   * Total frames on the sheet, when the animation is only part of it. Every
   * projectile sheet in the pack is "flight frames, then an impact burst", so
   * one image backs two animations and the frame width must still be measured
   * against the whole strip.
   */
  sheetFrames?: number;
  /** index of the first frame to play */
  first?: number;
  fps?: number;
  loop?: boolean;
}

const DEFAULT_FPS = 12;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

/** Union of the opaque bounds of every frame, in frame-local coordinates. */
function measureTrim(img: HTMLImageElement, frames: number, fw: number, fh: number, first = 0) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { x: 0, y: 0, w: fw, h: fh };
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let minX = fw;
  let minY = fh;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  for (let f = first; f < first + frames; f++) {
    const ox = f * fw;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const a = data[(y * c.width + ox + x) * 4 + 3];
        if (a > 12) {
          found = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }
  if (!found) return { x: 0, y: 0, w: fw, h: fh };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export async function loadAnimSet(base: string, specs: Record<string, SheetSpec>): Promise<AnimSet> {
  const names = Object.keys(specs);
  const imgs = await Promise.all(names.map((n) => loadImage(`${base}/${specs[n].file}`)));
  const set: AnimSet = {};
  names.forEach((name, i) => {
    const spec = specs[name];
    const img = imgs[i];
    const first = spec.first ?? 0;
    const fw = Math.round(img.width / (spec.sheetFrames ?? spec.frames));
    const fh = img.height;
    set[name] = {
      img,
      frames: spec.frames,
      first,
      fw,
      fh,
      fps: spec.fps ?? DEFAULT_FPS,
      loop: spec.loop ?? true,
      trim: measureTrim(img, spec.frames, fw, fh, first),
    };
  });
  return set;
}

/** Plays one animation at a time and reports when a non-looping one ends. */
export class Animator {
  private set: AnimSet;
  private name: string;
  private t = 0;
  private finished = false;

  constructor(set: AnimSet, initial: string) {
    this.set = set;
    this.name = initial;
  }

  /** Switch animation; re-selecting the current one does not restart it. */
  play(name: string, restart = false) {
    if (!this.set[name]) return;
    if (this.name === name && !restart) return;
    this.name = name;
    this.t = 0;
    this.finished = false;
  }

  update(dt: number) {
    const a = this.set[this.name];
    if (!a) return;
    this.t += dt * a.fps;
    if (!a.loop && this.t >= a.frames) {
      this.t = a.frames - 0.001;
      this.finished = true;
    }
  }

  get current() {
    return this.name;
  }
  get done() {
    return this.finished;
  }
  /** 0..1 through the current animation — used to time attack hitboxes. */
  get progress() {
    const a = this.set[this.name];
    return a ? Math.min(1, this.t / a.frames) : 1;
  }
  get frameIndex() {
    const a = this.set[this.name];
    return a ? Math.floor(this.t) % a.frames : 0;
  }
  has(name: string) {
    return !!this.set[name];
  }

  /**
   * Draw so that (x, y) is the actor's feet centre — or its middle, for the
   * things that fly and have no feet to speak of.
   *
   * Vertically we use the measured trim, because every sheet pads differently
   * and the trim bottom is where the artist put the ground contact. But we do
   * NOT trim horizontally: an attack frame is much wider than an idle one (the
   * knight's swing is 133 px against 47 idle), so centring on the trim would
   * yank the body backwards the moment the swing starts. The frame centre is
   * stable across every animation, and the weapon simply extends out of it.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    face: 1 | -1,
    scale = 1,
    anchor: "feet" | "centre" = "feet",
  ) {
    const a = this.set[this.name];
    if (!a) return;
    const sx = (a.first + this.frameIndex) * a.fw;
    const w = a.fw * scale;
    const h = a.trim.h * scale;
    const dy = anchor === "feet" ? -h : -h / 2;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (face === -1) ctx.scale(-1, 1);
    ctx.drawImage(a.img, sx, a.trim.y, a.fw, a.trim.h, Math.round(-w / 2), Math.round(dy), w, h);
    ctx.restore();
  }

  /** Art size of the current animation, for sizing collision boxes. */
  get size() {
    const a = this.set[this.name];
    return a ? { w: a.trim.w, h: a.trim.h } : { w: 0, h: 0 };
  }
}

/* ------------------------------ pack manifests ----------------------------- */

const BASE = "./games/platformer";

export const HERO_SHEETS = {
  huntress: {
    base: `${BASE}/heroes/huntress`,
    specs: {
      idle: { file: "idle.png", frames: 8, fps: 10 },
      run: { file: "run.png", frames: 8, fps: 14 },
      jump: { file: "jump.png", frames: 2, fps: 8, loop: false },
      fall: { file: "fall.png", frames: 2, fps: 8, loop: false },
      attack1: { file: "attack1.png", frames: 5, fps: 18, loop: false },
      attack2: { file: "attack2.png", frames: 5, fps: 13, loop: false },
      attack3: { file: "attack3.png", frames: 7, fps: 18, loop: false },
      hit: { file: "take-hit.png", frames: 3, fps: 12, loop: false },
      death: { file: "death.png", frames: 8, fps: 10, loop: false },
    } as Record<string, SheetSpec>,
  },
  knight: {
    base: `${BASE}/heroes/knight`,
    specs: {
      idle: { file: "idle.png", frames: 11, fps: 10 },
      run: { file: "run.png", frames: 8, fps: 14 },
      jump: { file: "jump.png", frames: 3, fps: 10, loop: false },
      fall: { file: "fall.png", frames: 3, fps: 10, loop: false },
      attack1: { file: "attack1.png", frames: 7, fps: 20, loop: false },
      attack2: { file: "attack2.png", frames: 7, fps: 15, loop: false },
      hit: { file: "take-hit.png", frames: 4, fps: 12, loop: false },
      death: { file: "death.png", frames: 11, fps: 10, loop: false },
    } as Record<string, SheetSpec>,
  },
} as const;

export type HeroId = keyof typeof HERO_SHEETS;

export interface HeroInfo {
  /** proper noun, the same in every language */
  name: string;
  /** collision box, world units */
  box: { w: number; h: number };
  scale: number;
  hearts: number;
  /** what the third button does — the two heroes differ here */
  special: "spear" | "slam";
  stats: { power: number; reach: number; tough: number };
}

export const HERO_INFO: Record<HeroId, HeroInfo> = {
  huntress: {
    name: "HUNTRESS",
    box: { w: 28, h: 76 },
    scale: 2,
    hearts: 5,
    special: "spear",
    stats: { power: 2, reach: 5, tough: 2 },
  },
  knight: {
    name: "HERO KNIGHT",
    box: { w: 34, h: 92 },
    scale: 2,
    hearts: 7,
    special: "slam",
    stats: { power: 4, reach: 3, tough: 5 },
  },
};

export const BOSS_SHEETS = {
  base: `${BASE}/boss/wizard`,
  specs: {
    idle: { file: "idle.png", frames: 8, fps: 8 },
    run: { file: "run.png", frames: 8, fps: 12 },
    jump: { file: "jump.png", frames: 2, fps: 8, loop: false },
    fall: { file: "fall.png", frames: 2, fps: 8, loop: false },
    attack1: { file: "attack1.png", frames: 8, fps: 13, loop: false },
    attack2: { file: "attack2.png", frames: 8, fps: 13, loop: false },
    hit: { file: "take-hit.png", frames: 3, fps: 12, loop: false },
    death: { file: "death.png", frames: 7, fps: 8, loop: false },
  } as Record<string, SheetSpec>,
};

export const ENEMY_SHEETS = {
  mushroom: {
    base: `${BASE}/enemies/mushroom`,
    specs: {
      idle: { file: "idle.png", frames: 4, fps: 7 },
      run: { file: "run.png", frames: 8, fps: 10 },
      attack: { file: "attack.png", frames: 8, fps: 12, loop: false },
      ranged: { file: "attack-ranged.png", frames: 11, fps: 13, loop: false },
      hit: { file: "take-hit.png", frames: 4, fps: 14, loop: false },
      death: { file: "death.png", frames: 4, fps: 9, loop: false },
    } as Record<string, SheetSpec>,
  },
  goblin: {
    base: `${BASE}/enemies/goblin`,
    specs: {
      idle: { file: "idle.png", frames: 4, fps: 7 },
      run: { file: "run.png", frames: 8, fps: 13 },
      attack: { file: "attack.png", frames: 8, fps: 14, loop: false },
      ranged: { file: "attack-ranged.png", frames: 12, fps: 14, loop: false },
      hit: { file: "take-hit.png", frames: 4, fps: 14, loop: false },
      death: { file: "death.png", frames: 4, fps: 9, loop: false },
    } as Record<string, SheetSpec>,
  },
  skeleton: {
    base: `${BASE}/enemies/skeleton`,
    specs: {
      idle: { file: "idle.png", frames: 4, fps: 7 },
      run: { file: "run.png", frames: 4, fps: 8 },
      attack: { file: "attack.png", frames: 8, fps: 12, loop: false },
      ranged: { file: "attack-ranged.png", frames: 6, fps: 11, loop: false },
      shield: { file: "shield.png", frames: 4, fps: 10, loop: false },
      hit: { file: "take-hit.png", frames: 4, fps: 14, loop: false },
      death: { file: "death.png", frames: 4, fps: 9, loop: false },
    } as Record<string, SheetSpec>,
  },
  flyingEye: {
    base: `${BASE}/enemies/flying-eye`,
    specs: {
      idle: { file: "run.png", frames: 8, fps: 12 },
      run: { file: "run.png", frames: 8, fps: 14 },
      attack: { file: "attack.png", frames: 8, fps: 14, loop: false },
      ranged: { file: "attack-ranged.png", frames: 6, fps: 12, loop: false },
      hit: { file: "take-hit.png", frames: 4, fps: 14, loop: false },
      death: { file: "death.png", frames: 4, fps: 9, loop: false },
    } as Record<string, SheetSpec>,
  },
} as const;

/**
 * A monster's thrown thing. Every projectile sheet in the pack runs flight
 * frames first and an expanding impact burst after, so `flight` splits the one
 * image into a loop and a one-shot.
 */
export interface ShotSpec {
  file: string;
  /** total frames on the sheet */
  sheetFrames: number;
  /** how many of them are flight */
  flight: number;
  fps: number;
  scale: number;
  /** collision radius, world units */
  r: number;
}

export const ENEMY_SHOTS: Record<keyof typeof ENEMY_SHEETS, ShotSpec> = {
  mushroom: { file: "shot.png", sheetFrames: 8, flight: 5, fps: 12, scale: 1.6, r: 13 },
  goblin: { file: "shot.png", sheetFrames: 19, flight: 12, fps: 14, scale: 1.4, r: 14 },
  skeleton: { file: "shot.png", sheetFrames: 8, flight: 3, fps: 14, scale: 1.5, r: 16 },
  flyingEye: { file: "shot.png", sheetFrames: 8, flight: 3, fps: 14, scale: 1.6, r: 13 },
};

/** Build the two animations a projectile needs out of its single sheet. */
export function shotSpecs(s: ShotSpec) {
  return {
    fly: { file: s.file, frames: s.flight, sheetFrames: s.sheetFrames, fps: s.fps, loop: true },
    burst: {
      file: s.file,
      frames: s.sheetFrames - s.flight,
      sheetFrames: s.sheetFrames,
      first: s.flight,
      fps: s.fps + 4,
      loop: false,
    },
  } as const;
}

export interface EnemyStats {
  hp: number;
  /** collision box, world units */
  box: { w: number; h: number };
  scale: number;
  speed: number;
  /** how far it notices the player; `ranged.max` must stay under this, or
   *  the throw can only trigger from inside melee range and never fires */
  sight: number;
  /** how close before it swings */
  range: number;
  /** damage dealt in hearts */
  touch: number;
  flies: boolean;
  /** skeletons raise a shield and shrug off frontal hits */
  guards: boolean;
  score: number;
  /** the second attack: how and when this monster throws something */
  ranged?: {
    /** never used closer than this — the melee swing covers that band */
    min: number;
    max: number;
    /** seconds between throws */
    cd: number;
    speed: number;
    /** downward pull on the shot; the goblin's bomb arcs, the rest fly flat */
    gravity: number;
    /** animation progress at which the shot actually leaves the hand */
    at: number;
  };
}

export const ENEMY_STATS: Record<keyof typeof ENEMY_SHEETS, EnemyStats> = {
  mushroom: {
    hp: 12, box: { w: 36, h: 66 }, scale: 2, speed: 52, sight: 240, range: 54,
    touch: 1, flies: false, guards: false, score: 60,
    ranged: { min: 110, max: 230, cd: 4.0, speed: 250, gravity: 0, at: 0.55 },
  },
  goblin: {
    hp: 18, box: { w: 40, h: 66 }, scale: 2, speed: 108, sight: 360, range: 58,
    touch: 1, flies: false, guards: false, score: 90,
    ranged: { min: 130, max: 340, cd: 4.8, speed: 300, gravity: 900, at: 0.5 },
  },
  skeleton: {
    hp: 30, box: { w: 46, h: 92 }, scale: 2, speed: 66, sight: 400, range: 86,
    touch: 1, flies: false, guards: true, score: 180,
    ranged: { min: 150, max: 380, cd: 6.0, speed: 380, gravity: 0, at: 0.5 },
  },
  flyingEye: {
    hp: 12, box: { w: 54, h: 54 }, scale: 2, speed: 130, sight: 460, range: 62,
    touch: 1, flies: true, guards: false, score: 120,
    ranged: { min: 130, max: 430, cd: 3.6, speed: 330, gravity: 0, at: 0.6 },
  },
};

/* --------------------------------- terrain -------------------------------- */

/**
 * The tileset is one 128x96 sheet holding two 3x3 nine-slices — a lime-rimmed
 * forest block at columns 2-4 and a rocky cave block at columns 0-2 of the
 * bottom half. Everything else on the sheet is variants we do not need, so the
 * renderer only ever indexes these two.
 */
export const TILE_SRC = 16;
export const NINE_SLICE: Record<"forest" | "cave" | "arena", { col: number; row: number }> = {
  forest: { col: 2, row: 0 },
  cave: { col: 0, row: 3 },
  arena: { col: 0, row: 3 },
};

/** Decorative cut-outs measured off props.png. */
export const PROPS = {
  rockBig: { x: 12, y: 11, w: 25, h: 15 },
  rockSmall: { x: 60, y: 11, w: 14, h: 15 },
  bushSmall: { x: 12, y: 47, w: 14, h: 17 },
  bushWide: { x: 31, y: 47, w: 57, h: 17 },
  treeA: { x: 10, y: 83, w: 90, h: 125 },
  treeB: { x: 103, y: 83, w: 79, h: 125 },
} as const;

export type PropId = keyof typeof PROPS;

export interface Terrain {
  tileset: HTMLImageElement;
  props: HTMLImageElement;
  bg: HTMLImageElement[];
}

export async function loadTerrain(): Promise<Terrain> {
  const [tileset, props, b1, b2, b3] = await Promise.all([
    loadImage(`${BASE}/forest/tileset.png`),
    loadImage(`${BASE}/forest/props.png`),
    loadImage(`${BASE}/forest/bg-3.png`),
    loadImage(`${BASE}/forest/bg-2.png`),
    loadImage(`${BASE}/forest/bg-1.png`),
  ]);
  return { tileset, props, bg: [b1, b2, b3] };
}
