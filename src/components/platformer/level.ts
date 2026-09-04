/**
 * Level format and tile collision for the platformer.
 *
 * Levels are authored as ASCII art — one character per tile — because a map
 * you can read and edit in the source file is worth far more during tuning
 * than a compact binary. Rows are padded to the widest line on parse, so the
 * art does not have to be a perfect rectangle.
 *
 * The vertical grid is deliberate. A jump rises 120 world units, so the rows
 * a player can chain through are 3 tiles apart: ground at row 17, then
 * platforms at rows 14, 11, 8 and 5. Every map below sticks to that ladder,
 * which is why nothing is ever quite out of reach.
 */

export const TILE = 32; // world units per tile == 16px art drawn at 2x

/** What a map character means. */
export const enum Tile {
  Empty = 0,
  Solid = 1,
  /** platform you can jump up through and land on from above */
  OneWay = 2,
  /** hurts on touch */
  Spike = 3,
}

export type EnemyKind = "mushroom" | "goblin" | "skeleton" | "flyingEye";
export type SpawnKind = EnemyKind | "coin" | "heart" | "boss" | "exit";

export interface SpawnDef {
  kind: SpawnKind;
  x: number;
  y: number;
}

export interface LevelDef {
  name: string;
  /** flavour line shown on the level card */
  subtitle: string;
  /** biome key — picks the tileset, backdrop and prop set */
  biome: "forest" | "cave" | "arena";
  rows: string[];
}

export interface Level {
  name: string;
  subtitle: string;
  biome: LevelDef["biome"];
  w: number;
  h: number;
  tiles: Uint8Array;
  spawns: SpawnDef[];
  start: { x: number; y: number };
}

/*
 * Map legend
 *   #  solid ground        =  one-way platform      ^  spikes
 *   P  player start        o  coin                  +  heart pickup
 *   E  level exit          B  boss
 *   m  mushroom   g  goblin   s  skeleton   f  flying eye
 */
export const LEVELS: LevelDef[] = [
  {
    name: "FIRST COMMIT",
    subtitle: "Лес. Первые шаги, первые грибы.",
    biome: "forest",
    rows: [
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "                                                          o o",
      "                                                        ======",
      "",
      "                                       o o             o                                     o o",
      "                                     ======          ======                                ======",
      "",
      "                   o o o           o o             o o                 o m o             o o",
      "                  ======          ======          ======              ======            ======",
      "",
      "   P  o  o            m  o    o         m    o            g +                 o     o         m   o Eo",
      "############    ############    ############    ###############    ###############    ##################",
      "############    ############    ############    ###############    ###############    ##################",
    ],
  },
  {
    name: "MERGE CONFLICT",
    subtitle: "Две ветки, одни шипы. Не упади между ними.",
    biome: "forest",
    rows: [
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "                                              o o                                                o o",
      "                                            ======                                              ======",
      "",
      "                      o o                  o                o o                               o",
      "                    ======               ======           ======                             ======",
      "",
      "                  o o                  o m              o o                o g o           o",
      "                 ======               ======           ======             ======          ======",
      "",
      "   P o  o           m    ^^^     o         ^^^    o       g ^^^+     o        ^^^      o        g    o  E o",
      "###########    ################    #############    ###############    ##############    ###################",
      "###########    ################    #############    ###############    ##############    ###################",
    ],
  },
  {
    name: "NULL POINTER",
    subtitle: "Пещера. Здесь что-то летает и что-то не инициализировано.",
    biome: "cave",
    rows: [
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "                                                                 o o",
      "                                                               ======",
      "",
      "                        o o                            f      o                                 o o",
      "                      ======  f                             ======                             ======",
      "                                                                                        f",
      "                    o o                 o oso             o o                o oso           o",
      "                   ======              ======            ======             ======          ======",
      "",
      "   P o   o            m ^^^       o      ^^^      +       ^^^^m       o        ^^^      o        g ^^^  o Eo",
      "#############    ###############    #############    ################    ##############    ###################",
      "#############    ###############    #############    ################    ##############    ###################",
    ],
  },
  {
    name: "RACE CONDITION",
    subtitle: "Всё происходит одновременно. Успей.",
    biome: "cave",
    rows: [
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "                         o o                                              o o",
      "                       ======                                           ======",
      "",
      "                      o               o o     f       o o              o                               o o",
      "                    ======f         ======          ======           ======                           ======",
      "                                                                                f",
      "                  o               o m             o o              o os             o m o           o",
      "                 ======          ======          ======           ======           ======          ======",
      "",
      "   Po   o           g^^^    o       ^^^     +      ^^^g     o      ^^^^ m      o     ^^^g     +      ^^^s   g o Eo",
      "###########    ############    ############    ############    ##############    ############    ###################",
      "###########    ############    ############    ############    ##############    ############    ###################",
    ],
  },
  {
    name: "SEGFAULT",
    subtitle: "Финал. Злой волшебник уронил прод.",
    biome: "arena",
    rows: [
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "             o o+o                                     o o o",
      "           ========                                  ========",
      "",
      "         o o o                                            o o o",
      "        ========                                        ========",
      "",
      "   P +                                        B                    +",
      "########################################################################",
      "########################################################################",
    ],
  },
];

/** Turn the ASCII art into a collision grid plus a spawn list. */
export function parseLevel(def: LevelDef): Level {
  const h = def.rows.length;
  const w = def.rows.reduce((m, r) => Math.max(m, r.length), 0);
  const tiles = new Uint8Array(w * h);
  const spawns: SpawnDef[] = [];
  let start = { x: TILE * 2, y: TILE * 2 };

  const centre = (col: number, row: number) => ({
    x: col * TILE + TILE / 2,
    y: row * TILE + TILE / 2,
  });

  /**
   * Pickups are authored on the row an actor stands in, which puts them at
   * ankle height. Lifting them most of a tile puts them at chest height —
   * where they read as collectible and where a running player sweeps through
   * them — without every map having to leave a spare row above the floor.
   */
  const PICKUP_LIFT = TILE * 0.9;

  const KIND: Record<string, SpawnKind> = {
    o: "coin",
    "+": "heart",
    m: "mushroom",
    g: "goblin",
    s: "skeleton",
    f: "flyingEye",
    B: "boss",
    E: "exit",
  };

  for (let row = 0; row < h; row++) {
    const line = def.rows[row];
    for (let col = 0; col < w; col++) {
      const ch = line[col] ?? " ";
      const i = row * w + col;
      if (ch === "#") tiles[i] = Tile.Solid;
      else if (ch === "=") tiles[i] = Tile.OneWay;
      else if (ch === "^") tiles[i] = Tile.Spike;
      else if (ch === "P") start = centre(col, row);
      else if (KIND[ch]) {
        const c = centre(col, row);
        const kind = KIND[ch];
        if (kind === "coin" || kind === "heart") c.y -= PICKUP_LIFT;
        spawns.push({ kind, ...c });
      }
    }
  }

  return { name: def.name, subtitle: def.subtitle, biome: def.biome, w, h, tiles, spawns, start };
}

/** Tile at world coordinates; out of bounds reads as solid walls, open sky. */
export function tileAt(level: Level, wx: number, wy: number): Tile {
  const col = Math.floor(wx / TILE);
  const row = Math.floor(wy / TILE);
  if (col < 0 || col >= level.w) return Tile.Solid; // keep the player inside
  if (row < 0) return Tile.Empty; // free air above the map
  if (row >= level.h) return Tile.Empty; // fell out — the engine handles it
  return level.tiles[row * level.w + col] as Tile;
}

/** Tile by grid index, without the world-coordinate rounding. */
export function tileCell(level: Level, col: number, row: number): Tile {
  if (col < 0 || col >= level.w) return Tile.Solid;
  if (row < 0 || row >= level.h) return Tile.Empty;
  return level.tiles[row * level.w + col] as Tile;
}

export const isBlocking = (t: Tile) => t === Tile.Solid;
