/**
 * Every number that defines a creep, a tower or a difficulty.
 *
 * All of it is data, deliberately: the engine reads these tables and knows
 * nothing about "goblins" or "mage towers", so balancing is editing numbers
 * here rather than hunting through the loop.
 *
 * The creep sprites are the same LuizMelo sheets EMBERWOOD already ships, so
 * this game costs no new art and reads as the same world. Elite variants are
 * palette swaps of the base creep, which is how a four-sheet pack becomes
 * eight distinct enemies.
 *
 * Their scale is set against the towers rather than against each other: a
 * creep that stands as tall as the tower shooting it makes the board hard to
 * read, so the rank and file come out around two thirds of one, and only the
 * boss is allowed to loom.
 */

/* --------------------------------- creeps --------------------------------- */

export type CreepId =
  | "mushroom" | "goblin" | "skeleton" | "flyingEye"
  | "eliteGoblin" | "eliteMushroom" | "wraith" | "wizard";

export interface CreepDef {
  name: string;
  /** folder under public/games/platformer/ that holds the animation sheets */
  sheet: string;
  hp: number;
  /** world units per second along the road */
  speed: number;
  /** flat reduction applied to physical damage, never below a tenth of it */
  armour: number;
  /** fraction of magic damage shrugged off, 0..0.9 */
  resist: number;
  gold: number;
  /** lives lost if it reaches the keep */
  leak: number;
  flying: boolean;
  scale: number;
  /** multiplied into the sprite, so one sheet yields several enemies */
  tint?: string;
  /** creeps that stop to fight blockers; a wraith walks straight past them */
  ignoresBlockers?: boolean;
  boss?: boolean;
}

export const CREEPS: Record<CreepId, CreepDef> = {
  mushroom: {
    name: "Mushroom", sheet: "enemies/mushroom", hp: 70, speed: 30, armour: 0,
    resist: 0, gold: 6, leak: 1, flying: false, scale: 1.15,
  },
  goblin: {
    name: "Goblin", sheet: "enemies/goblin", hp: 52, speed: 56, armour: 0,
    resist: 0, gold: 7, leak: 1, flying: false, scale: 1.15,
  },
  skeleton: {
    name: "Skeleton", sheet: "enemies/skeleton", hp: 150, speed: 28, armour: 5,
    resist: 0, gold: 14, leak: 2, flying: false, scale: 1.2,
  },
  flyingEye: {
    name: "Flying Eye", sheet: "enemies/flying-eye", hp: 80, speed: 70, armour: 0,
    resist: 0.3, gold: 11, leak: 1, flying: true, scale: 1.15,
  },
  eliteGoblin: {
    name: "Goblin Raider", sheet: "enemies/goblin", hp: 130, speed: 78, armour: 2,
    resist: 0, gold: 16, leak: 2, flying: false, scale: 1.3, tint: "#ff6a4d",
  },
  eliteMushroom: {
    name: "Blight Mushroom", sheet: "enemies/mushroom", hp: 260, speed: 26, armour: 8,
    resist: 0.2, gold: 22, leak: 2, flying: false, scale: 1.45, tint: "#8f5bff",
  },
  wraith: {
    name: "Wraith", sheet: "enemies/flying-eye", hp: 190, speed: 92, armour: 0,
    resist: 0.6, gold: 26, leak: 3, flying: true, scale: 1.25, tint: "#5ee7c8",
    ignoresBlockers: true,
  },
  wizard: {
    name: "Evil Wizard", sheet: "boss/wizard", hp: 2600, speed: 22, armour: 10,
    resist: 0.35, gold: 220, leak: 12, flying: false, scale: 1.9, boss: true,
  },
};

/* --------------------------------- towers --------------------------------- */

export type TowerId = "archer" | "mage" | "barracks" | "bombard" | "gatling";
export type DamageKind = "physical" | "magic";

export interface TowerTier {
  cost: number;
  damage: number;
  /** seconds between shots */
  reload: number;
  range: number;
  /** artillery only: blast radius */
  splash?: number;
  /** barracks only */
  soldiers?: number;
  soldierHp?: number;
  soldierDamage?: number;
}

export interface TowerDef {
  name: string;
  blurb: string;
  kind: DamageKind;
  /** archers and mages shoot anything; artillery and swords cannot reach air */
  hitsAir: boolean;
  /** barracks place men on the road instead of shooting */
  blocks: boolean;
  projectile: "arrow" | "bolt" | "shell" | "rocket" | "none";
  /**
   * Family of tower sheets in the atlas: `t.<art>.<tier>` holds four facings
   * of six firing frames. The barracks has no art yet and is drawn by hand.
   */
  art?: "crossbow" | "magic" | "cannon" | "rocket";
  tiers: [TowerTier, TowerTier, TowerTier];
}

export const TOWERS: Record<TowerId, TowerDef> = {
  archer: {
    name: "Archer Tower",
    blurb: "Cheap, quick, hits anything. Armour blunts it.",
    kind: "physical", hitsAir: true, blocks: false, projectile: "arrow",
    art: "crossbow",
    tiers: [
      { cost: 70, damage: 9, reload: 0.75, range: 150 },
      { cost: 90, damage: 15, reload: 0.62, range: 172 },
      { cost: 140, damage: 24, reload: 0.52, range: 196 },
    ],
  },
  mage: {
    name: "Mage Tower",
    blurb: "Slow and expensive, but armour means nothing to it.",
    kind: "magic", hitsAir: true, blocks: false, projectile: "bolt",
    art: "magic",
    tiers: [
      { cost: 100, damage: 26, reload: 1.5, range: 140 },
      { cost: 130, damage: 44, reload: 1.35, range: 158 },
      { cost: 190, damage: 72, reload: 1.2, range: 178 },
    ],
  },
  barracks: {
    name: "Barracks",
    blurb: "Sends men to hold the road. Nothing else stops a creep walking.",
    kind: "physical", hitsAir: false, blocks: true, projectile: "none",
    tiers: [
      { cost: 80, damage: 0, reload: 0, range: 190, soldiers: 2, soldierHp: 90, soldierDamage: 7 },
      { cost: 110, damage: 0, reload: 0, range: 210, soldiers: 3, soldierHp: 150, soldierDamage: 11 },
      { cost: 165, damage: 0, reload: 0, range: 230, soldiers: 3, soldierHp: 240, soldierDamage: 18 },
    ],
  },
  bombard: {
    name: "Bombard",
    blurb: "Lobs shells into a crowd. Cannot touch anything airborne.",
    kind: "physical", hitsAir: false, blocks: false, projectile: "shell",
    art: "cannon",
    tiers: [
      { cost: 120, damage: 30, reload: 2.2, range: 165, splash: 46 },
      { cost: 150, damage: 52, reload: 2.0, range: 182, splash: 54 },
      { cost: 220, damage: 88, reload: 1.8, range: 205, splash: 64 },
    ],
  },
  gatling: {
    name: "Gun Battery",
    blurb: "Fires far faster than it hits hard. Give it a long stretch of road.",
    kind: "physical", hitsAir: true, blocks: false, projectile: "rocket",
    art: "rocket",
    tiers: [
      { cost: 95, damage: 6, reload: 0.3, range: 128 },
      { cost: 125, damage: 10, reload: 0.26, range: 142 },
      { cost: 185, damage: 16, reload: 0.22, range: 158 },
    ],
  },
};

/** Selling never refunds in full — committing to a spot has to cost something. */
export const SELL_REFUND = 0.6;

/* ------------------------------- difficulty -------------------------------- */

export type DifficultyId = "casual" | "normal" | "veteran";

export interface DifficultyDef {
  name: string;
  lives: number;
  gold: number;
  /** multiplied into every creep's health */
  hp: number;
  /** multiplied into every bounty */
  gold_rate: number;
  /** seconds of grace before the first wave */
  prep: number;
  stars: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  casual: { name: "Casual", lives: 25, gold: 260, hp: 0.75, gold_rate: 1.2, prep: 25, stars: 1 },
  normal: { name: "Normal", lives: 20, gold: 200, hp: 1, gold_rate: 1, prep: 18, stars: 2 },
  veteran: { name: "Veteran", lives: 12, gold: 170, hp: 1.45, gold_rate: 0.9, prep: 12, stars: 3 },
};

/**
 * Physical damage is reduced by a flat armour value, magic by a fraction —
 * the split is what makes both tower kinds worth owning. Armour can never
 * absorb a hit completely, or a heavily armoured creep would be immune to a
 * tower the player has already paid for.
 */
export function applyDamage(raw: number, kind: DamageKind, c: CreepDef): number {
  if (kind === "magic") return raw * (1 - c.resist);
  return Math.max(raw * 0.1, raw - c.armour);
}
