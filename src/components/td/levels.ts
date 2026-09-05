/**
 * The five levels: which map each is played on, and what marches across it.
 *
 * The road and the build pads are not authored here — they were traced off
 * the paintings and live in maps.ts, because the picture is the authority on
 * both. Only the waves belong to the level, and they are the only part a
 * balance change should ever touch.
 *
 * A level whose map is missing falls back to a road authored here and slots
 * derived from it, which is how the game looked before the maps existed.
 */

import { MAPS } from "./maps";
import { buildPath, distanceToPath, type Path, type Point } from "./path";
import type { CreepId } from "./units";

export const BOARD = { w: 960, h: 540 };

/** How close a tower may sit to the road, and how far before it is useless. */
const SLOT_NEAR = 58;
const SLOT_FAR = 122;
/** Minimum spacing between two build slots. */
const SLOT_APART = 88;
const SLOT_MARGIN = 46;

export interface WaveGroup {
  creep: CreepId;
  count: number;
  /** seconds between creeps of this group */
  gap: number;
  /** seconds to wait before this group starts, measured from the wave start */
  delay?: number;
}

export interface Wave {
  groups: WaveGroup[];
}

export interface LevelDef {
  name: string;
  biome: "forest" | "cave" | "ember";
  /** key into MAPS: the painting this level is played on */
  map?: string;
  /** fallback road, used only when the level has no painted map */
  road: Point[];
  waves: Wave[];
}

export interface Level {
  def: LevelDef;
  path: Path;
  slots: Point[];
  /** background to draw under everything, or null to draw the board by hand */
  image: string | null;
  /** gate facades drawn over the creeps, so they come out from behind the arch */
  overlay: string | null;
}

const w = (...groups: WaveGroup[]): Wave => ({ groups });

export const LEVELS: LevelDef[] = [
  {
    name: "SUNKEN TEMPLE",
    biome: "forest",
    map: "oasis",
    road: [
      { x: -50, y: 130 }, { x: 190, y: 130 }, { x: 250, y: 190 },
      { x: 250, y: 360 }, { x: 330, y: 430 }, { x: 610, y: 430 },
      { x: 690, y: 355 }, { x: 690, y: 200 }, { x: 780, y: 120 },
      { x: 1010, y: 120 },
    ],
    waves: [
      w({ creep: "mushroom", count: 5, gap: 1.4 }),
      w({ creep: "mushroom", count: 7, gap: 1.2 }),
      w({ creep: "goblin", count: 6, gap: 1.0 }),
      w({ creep: "mushroom", count: 6, gap: 1.1 }, { creep: "goblin", count: 5, gap: 0.9, delay: 4 }),
      w({ creep: "goblin", count: 10, gap: 0.75 }),
      w({ creep: "skeleton", count: 3, gap: 2.2 }, { creep: "goblin", count: 8, gap: 0.8, delay: 3 }),
      w({ creep: "flyingEye", count: 6, gap: 1.1 }),
      w({ creep: "skeleton", count: 5, gap: 1.8 }, { creep: "mushroom", count: 8, gap: 0.9, delay: 5 }),
      w({ creep: "eliteGoblin", count: 5, gap: 1.3 }, { creep: "flyingEye", count: 5, gap: 1.1, delay: 6 }),
      w({ creep: "skeleton", count: 6, gap: 1.5 }, { creep: "eliteGoblin", count: 6, gap: 1.0, delay: 4 }),
    ],
  },
  {
    name: "DUSTHOLLOW CANYON",
    biome: "cave",
    map: "canyon",
    road: [
      { x: -50, y: 430 }, { x: 150, y: 430 }, { x: 220, y: 360 },
      { x: 220, y: 200 }, { x: 300, y: 120 }, { x: 470, y: 120 },
      { x: 545, y: 200 }, { x: 545, y: 380 }, { x: 620, y: 460 },
      { x: 820, y: 460 }, { x: 890, y: 380 }, { x: 890, y: 160 },
      { x: 1010, y: 90 },
    ],
    waves: [
      w({ creep: "goblin", count: 8, gap: 1.0 }),
      w({ creep: "mushroom", count: 9, gap: 1.0 }),
      w({ creep: "flyingEye", count: 7, gap: 1.0 }),
      w({ creep: "skeleton", count: 4, gap: 2.0 }, { creep: "goblin", count: 9, gap: 0.8, delay: 3 }),
      w({ creep: "eliteGoblin", count: 7, gap: 1.0 }),
      w({ creep: "eliteMushroom", count: 3, gap: 2.6 }, { creep: "mushroom", count: 8, gap: 0.9, delay: 4 }),
      w({ creep: "flyingEye", count: 9, gap: 0.8 }, { creep: "wraith", count: 2, gap: 3, delay: 6 }),
      w({ creep: "skeleton", count: 7, gap: 1.4 }),
      w({ creep: "eliteGoblin", count: 9, gap: 0.8 }, { creep: "eliteMushroom", count: 4, gap: 2.2, delay: 5 }),
      w({ creep: "wraith", count: 4, gap: 2.0 }, { creep: "skeleton", count: 8, gap: 1.2, delay: 4 }),
      w({ creep: "eliteMushroom", count: 6, gap: 1.8 }, { creep: "eliteGoblin", count: 10, gap: 0.7, delay: 6 }),
    ],
  },
  {
    name: "CRYSTAL HOLLOW",
    biome: "forest",
    map: "crystal",
    road: [
      { x: 480, y: -50 }, { x: 480, y: 110 }, { x: 380, y: 190 },
      { x: 170, y: 190 }, { x: 100, y: 270 }, { x: 100, y: 380 },
      { x: 190, y: 465 }, { x: 700, y: 465 }, { x: 800, y: 380 },
      { x: 800, y: 230 }, { x: 700, y: 150 }, { x: 560, y: 150 },
      { x: 480, y: 230 }, { x: 480, y: 590 },
    ],
    waves: [
      w({ creep: "skeleton", count: 5, gap: 1.6 }),
      w({ creep: "flyingEye", count: 9, gap: 0.9 }),
      w({ creep: "eliteGoblin", count: 8, gap: 0.9 }),
      w({ creep: "eliteMushroom", count: 4, gap: 2.4 }, { creep: "skeleton", count: 6, gap: 1.4, delay: 4 }),
      w({ creep: "wraith", count: 5, gap: 1.8 }),
      w({ creep: "skeleton", count: 9, gap: 1.1 }, { creep: "flyingEye", count: 8, gap: 0.9, delay: 5 }),
      w({ creep: "eliteMushroom", count: 7, gap: 1.6 }),
      w({ creep: "wraith", count: 6, gap: 1.5 }, { creep: "eliteGoblin", count: 10, gap: 0.7, delay: 4 }),
      w({ creep: "skeleton", count: 12, gap: 0.9 }),
      w({ creep: "eliteMushroom", count: 6, gap: 1.6 }, { creep: "wraith", count: 6, gap: 1.4, delay: 5 }),
      w({ creep: "eliteGoblin", count: 14, gap: 0.6 }, { creep: "eliteMushroom", count: 5, gap: 2.0, delay: 6 }),
    ],
  },
  {
    name: "FROSTHOLD PASS",
    biome: "forest",
    map: "frost",
    road: [
      { x: -50, y: 270 }, { x: 130, y: 270 }, { x: 200, y: 180 },
      { x: 340, y: 110 }, { x: 470, y: 150 }, { x: 540, y: 260 },
      { x: 470, y: 380 }, { x: 320, y: 430 }, { x: 250, y: 470 },
      { x: 420, y: 500 }, { x: 700, y: 470 }, { x: 790, y: 360 },
      { x: 790, y: 200 }, { x: 880, y: 110 }, { x: 1010, y: 110 },
    ],
    waves: [
      w({ creep: "eliteGoblin", count: 10, gap: 0.8 }),
      w({ creep: "skeleton", count: 8, gap: 1.3 }),
      w({ creep: "wraith", count: 6, gap: 1.5 }, { creep: "flyingEye", count: 8, gap: 0.9, delay: 4 }),
      w({ creep: "eliteMushroom", count: 7, gap: 1.6 }),
      w({ creep: "skeleton", count: 12, gap: 0.9 }, { creep: "eliteGoblin", count: 10, gap: 0.7, delay: 5 }),
      w({ creep: "wraith", count: 8, gap: 1.2 }),
      w({ creep: "eliteMushroom", count: 9, gap: 1.4 }, { creep: "skeleton", count: 10, gap: 1.0, delay: 6 }),
      w({ creep: "flyingEye", count: 14, gap: 0.6 }, { creep: "wraith", count: 7, gap: 1.3, delay: 4 }),
      w({ creep: "eliteGoblin", count: 16, gap: 0.5 }),
      w({ creep: "eliteMushroom", count: 10, gap: 1.3 }, { creep: "wraith", count: 8, gap: 1.1, delay: 5 }),
      w({ creep: "skeleton", count: 14, gap: 0.8 }, { creep: "eliteMushroom", count: 8, gap: 1.5, delay: 6 }),
      w({ creep: "wraith", count: 10, gap: 1.0 }, { creep: "eliteGoblin", count: 16, gap: 0.5, delay: 4 }),
    ],
  },
  {
    name: "THE EMBER FORGE",
    biome: "ember",
    map: "forge",
    road: [
      { x: -50, y: 200 }, { x: 140, y: 200 }, { x: 220, y: 290 },
      { x: 220, y: 420 }, { x: 320, y: 490 }, { x: 640, y: 490 },
      { x: 740, y: 420 }, { x: 740, y: 290 }, { x: 660, y: 200 },
      { x: 430, y: 200 }, { x: 350, y: 120 }, { x: 350, y: 60 },
      { x: 1010, y: 60 },
    ],
    waves: [
      w({ creep: "skeleton", count: 10, gap: 1.1 }),
      w({ creep: "wraith", count: 8, gap: 1.2 }),
      w({ creep: "eliteMushroom", count: 9, gap: 1.4 }, { creep: "eliteGoblin", count: 12, gap: 0.6, delay: 5 }),
      w({ creep: "flyingEye", count: 16, gap: 0.5 }, { creep: "wraith", count: 8, gap: 1.1, delay: 4 }),
      w({ creep: "skeleton", count: 16, gap: 0.7 }),
      w({ creep: "eliteMushroom", count: 12, gap: 1.2 }, { creep: "skeleton", count: 12, gap: 0.9, delay: 6 }),
      w({ creep: "wraith", count: 12, gap: 0.9 }, { creep: "eliteGoblin", count: 18, gap: 0.5, delay: 4 }),
      w({ creep: "wizard", count: 1, gap: 1 }, { creep: "eliteMushroom", count: 8, gap: 1.6, delay: 6 }),
    ],
  },
];

/**
 * Lay out the build slots for a road.
 *
 * Deterministic: the same road always yields the same slots, so a level plays
 * identically every time without any of them being typed by hand.
 */
function deriveSlots(path: Path): Point[] {
  const candidates: { p: Point; d: number }[] = [];
  for (let y = SLOT_MARGIN; y <= BOARD.h - SLOT_MARGIN; y += 16) {
    for (let x = SLOT_MARGIN; x <= BOARD.w - SLOT_MARGIN; x += 16) {
      const p = { x, y };
      const d = distanceToPath(path, p);
      if (d >= SLOT_NEAR && d <= SLOT_FAR) candidates.push({ p, d });
    }
  }
  // hug the road: closer slots cover more of it, so prefer them when thinning
  candidates.sort((a, b) => a.d - b.d);
  const out: Point[] = [];
  for (const c of candidates) {
    if (out.every((o) => Math.hypot(o.x - c.p.x, o.y - c.p.y) >= SLOT_APART)) {
      out.push(c.p);
    }
  }
  return out;
}

export function loadLevel(idx: number): Level {
  const def = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, idx))];
  const map = def.map ? MAPS[def.map] : undefined;
  const path = buildPath(map ? map.road : def.road);
  return {
    def,
    path,
    slots: map ? map.plots : deriveSlots(path),
    image: map ? map.image : null,
    overlay: map?.overlay ?? null,
  };
}

/** Total creeps in a wave, for the wave-preview strip in the HUD. */
export function waveSize(wave: Wave): number {
  return wave.groups.reduce((n, g) => n + g.count, 0);
}
