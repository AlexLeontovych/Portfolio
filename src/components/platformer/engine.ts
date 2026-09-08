/**
 * Platformer core: fixed-step physics, tile collision, combat, camera, render.
 *
 * Physics runs at a fixed 120 Hz regardless of the display, so a 144 Hz laptop
 * and a 60 Hz monitor agree on how far a jump carries. Rendering interpolates
 * nothing — at 120 Hz the residual is under a pixel, and skipping it keeps
 * every hitbox exactly where it is drawn.
 */

import { GameAudio } from "./audio";
import {
  LEVELS,
  TILE,
  Tile,
  parseLevel,
  tileAt,
  tileCell,
  type EnemyKind,
  type Level,
} from "./level";
import {
  Animator,
  BOSS_SHEETS,
  ENEMY_SHEETS,
  ENEMY_SHOTS,
  ENEMY_STATS,
  HERO_INFO,
  HERO_SHEETS,
  NINE_SLICE,
  PROPS,
  TILE_SRC,
  loadAnimSet,
  loadTerrain,
  shotSpecs,
  type AnimSet,
  type HeroId,
  type EnemyStats,
  type PropId,
  type Terrain,
} from "./sprites";

/* --------------------------------- tuning --------------------------------- */

const GRAVITY = 2800; // world units / s²
const MAX_FALL = 1250;
const RUN_SPEED = 285;
const RUN_ACCEL = 2700;
const RUN_FRICTION = 2500;
const AIR_CONTROL = 0.62;
const JUMP_SPEED = 820;
/** holding jump longer keeps you rising — the classic variable-height jump */
const JUMP_CUT = 0.45;
const COYOTE = 0.1; // grace period to still jump just after walking off a ledge
/**
 * One more jump, taken in the air.
 *
 * It is a little weaker than the first and it throws away whatever downward
 * speed had built up, so it works as well out of a long fall as off the top
 * of a hop — a second jump that cannot save you from a fall is not worth
 * having.
 *
 * The budget refills on landing, and on a down-thrust bounce off an enemy's
 * head, which is how the dash already works: bouncing is the game's reward
 * for aiming, and taking the reward away mid-chain would be an odd thing to
 * do. Walking off a ledge and jumping late spends the FIRST jump through the
 * coyote grace above, so the air jump is still there afterwards.
 */
const AIR_JUMPS = 1;
const AIR_JUMP_SCALE = 0.88;
const JUMP_BUFFER = 0.12; // pressing jump slightly early still counts on landing
const STEP = 1 / 120; // fixed physics step, independent of display refresh rate
const MAX_CATCHUP = 0.25; // never simulate more than this after a stall

/** A dash is short, fast and mostly invulnerable — the only active defence. */
const DASH_SPEED = 660;
const DASH_TIME = 0.16;
const DASH_CD = 0.6;
const DASH_IFRAMES = 0.26;
/** How hard a down-thrust kicks you back up off whatever you landed on. */
const POGO_BOUNCE = 640;

/**
 * How long an enemy takes to act on what he can see.
 *
 * Without this he turned on the frame you crossed him and started walking on
 * the same one, which is the difference between fighting a creature and
 * fighting a subscription to your coordinates. The delay is re-rolled every
 * time he loses you and every time he turns, so two of them never move
 * together and none of them move the instant you do.
 */
const REACT = 0.18;
const REACT_VAR = 0.34;
/** And how long after turning round before he is any use again. */
const TURN = 0.14;
const TURN_VAR = 0.22;
/**
 * How wide a thrown weapon may miss by, in world units, at no range at all
 * and per unit of distance on top.
 *
 * A shot used to leave with the player's exact position solved into it, so
 * standing still anywhere in the arc's reach was fatal and standing still
 * out of it was free. Now the far ones are worth dodging and the near ones
 * are worth respecting.
 */
const SPREAD = 10;
const SPREAD_PER_UNIT = 0.06;

const IFRAMES = 1.05;
const HURT_LOCK = 0.28;
const HURT_KNOCK = 230;

/**
 * How much world the camera shows. The height target is what makes the game
 * feel like a platformer rather than a diorama — about 15 tiles, so the level
 * scrolls vertically instead of sitting on screen all at once. The width
 * clamps only kick in at extreme aspect ratios: too narrow on a portrait
 * phone, absurdly wide on an ultrawide.
 */
const VIEW_H = 500;
const VIEW_MIN_W = 540;
const VIEW_MAX_W = 1180;
const DEADZONE_X = 90;
const DEADZONE_Y = 70;

const COIN_SCORE = 25;
const CLEAR_BONUS = 500;

/**
 * Reach matters as much as damage here. An enemy's body overlaps yours from
 * about 37 units, so a swing that only reaches 46 forces you to stand inside
 * the contact-damage zone to land it. These reaches keep every attack usable
 * from just outside that zone.
 */
const ATTACKS = {
  light: { anim: "attack1", dmg: 7, reach: 54, w: 62, h: 58, from: 0.22, to: 0.62, knock: 110, shake: 1.5 },
  heavy: { anim: "attack2", dmg: 17, reach: 62, w: 82, h: 66, from: 0.34, to: 0.72, knock: 280, shake: 4 },
  spear: { anim: "attack3", dmg: 0, reach: 0, w: 0, h: 0, from: 0.4, to: 0.5, knock: 0, shake: 0 },
  slam: { anim: "attack2", dmg: 28, reach: 66, w: 92, h: 72, from: 0.3, to: 0.68, knock: 340, shake: 9 },
  /** the down-thrust: its box hangs below the feet, so `reach` is unused */
  pogo: { anim: "attack1", dmg: 9, reach: 0, w: 56, h: 46, from: 0.1, to: 0.95, knock: 60, shake: 3 },
} as const;

type AttackId = keyof typeof ATTACKS;

const SPEAR_SPEED = 620;
const SPEAR_DMG = 10;
const SPEAR_CD = 1.1;
const SLAM_CD = 2.2;
const SLAM_CHARGE = 0.7;

/* --------------------------------- types ---------------------------------- */

export type Phase = "loading" | "playing" | "paused" | "dead" | "cleared" | "won";

export type Rank = "S" | "A" | "B" | "C";

export interface Hud {
  hearts: number;
  maxHearts: number;
  coins: number;
  score: number;
  level: number;
  levelName: string;
  kills: number;
  time: number;
  /** 0..1 while a boss is alive, null otherwise */
  boss: number | null;
  specialCd: number; // 0..1, 1 == ready
  dashCd: number; // 0..1, 1 == ready
  charging: number; // 0..1
  /** true once a checkpoint on this level has been lit */
  checkpoint: boolean;
  coinsTotal: number;
  /** hearts lost on this attempt at the level */
  damage: number;
  par: number;
  /** set only on the level-cleared card */
  rank: Rank | null;
}

/**
 * What the engine wants announced on screen. It reports the event, never the
 * sentence: the wording (and its language) belongs to the UI layer.
 */
export type Toast =
  | { kind: "level"; index: number; name: string }
  | { kind: "bossPhase"; phase: 2 | 3 }
  | { kind: "checkpoint" };

export interface EngineHooks {
  onPhase: (phase: Phase) => void;
  onHud: (hud: Hud) => void;
  onToast: (toast: Toast) => void;
}

export type Action =
  | "left" | "right" | "down" | "jump" | "light" | "heavy" | "special" | "dash";

interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

interface Enemy extends Body {
  kind: EnemyKind;
  rangedCd: number;
  anim: Animator;
  face: 1 | -1;
  hp: number;
  maxHp: number;
  state: "patrol" | "chase" | "attack" | "ranged" | "hurt" | "dead" | "guard";
  timer: number;
  cooldown: number;
  guardCd: number;
  dying: number;
  hitFlash: number;
  didHit: boolean;
  /** seconds before he may next react: notice you, or turn to face you */
  react: number;
  homeY: number;
  bob: number;
}

interface Boss extends Body {
  anim: Animator;
  face: 1 | -1;
  hp: number;
  maxHp: number;
  state: "intro" | "idle" | "walk" | "cast" | "quake" | "summon" | "vanish" | "appear" | "hurt" | "dead";
  timer: number;
  cooldown: number;
  alpha: number;
  hitFlash: number;
  didAct: boolean;
  phase: 1 | 2 | 3;
  dying: number;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
  dmg: number;
  hostile: boolean;
  kind: "spear" | "orb" | "wave" | "meteor" | "thrown";
  spin: number;
  homing: number;
  /** thrown monster weapons render from a sheet instead of a gradient */
  anim?: Animator;
  scale?: number;
  grav?: number;
  /** once it has landed it stops moving and plays out its impact frames */
  burst?: boolean;
}

interface Pickup {
  x: number;
  y: number;
  kind: "coin" | "heart";
  taken: boolean;
  t: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  colour: string;
  gravity: number;
}

interface PropInstance {
  id: PropId;
  x: number;
  y: number;
  flip: boolean;
  depth: number;
}

/* ------------------------------ tile collision ----------------------------- */

/** Does this axis-aligned box overlap any solid tile? */
function rectHitsSolid(level: Level, x: number, y: number, w: number, h: number): boolean {
  const c0 = Math.floor((x - w / 2) / TILE);
  const c1 = Math.floor((x + w / 2 - 0.01) / TILE);
  const r0 = Math.floor((y - h / 2) / TILE);
  const r1 = Math.floor((y + h / 2 - 0.01) / TILE);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      if (tileCell(level, col, row) === Tile.Solid) return true;
    }
  }
  return false;
}

/** True when the body's feet just crossed the top edge of a one-way platform. */
function landsOnOneWay(level: Level, b: Body, prevBottom: number): number | null {
  if (b.vy <= 0) return null;
  const bottom = b.y + b.h / 2;
  const c0 = Math.floor((b.x - b.w / 2) / TILE);
  const c1 = Math.floor((b.x + b.w / 2 - 0.01) / TILE);
  const rowNow = Math.floor(bottom / TILE);
  const rowPrev = Math.floor(prevBottom / TILE);
  for (let row = rowPrev; row <= rowNow; row++) {
    const top = row * TILE;
    if (prevBottom > top + 0.5) continue; // we were already below the surface
    for (let col = c0; col <= c1; col++) {
      if (tileCell(level, col, row) === Tile.OneWay) return top;
    }
  }
  return null;
}

/**
 * Integrate one body against the tilemap.
 *
 * Both passes snap analytically to the offending tile face rather than backing
 * out in a loop: a loop that never terminates is how this wedged a browser tab
 * during development, and the closed form cannot. The X pass is skipped
 * entirely when there is no horizontal motion, so a body resting with its feet
 * a hair inside the floor is never shoved sideways.
 */
function moveBody(level: Level, b: Body, dt: number, dropThrough: boolean) {
  const prevBottom = b.y + b.h / 2;

  const dx = b.vx * dt;
  if (dx !== 0) {
    b.x += dx;
    if (rectHitsSolid(level, b.x, b.y, b.w, b.h)) {
      const dir = Math.sign(dx);
      const col =
        dir > 0
          ? Math.floor((b.x + b.w / 2 - 0.01) / TILE)
          : Math.floor((b.x - b.w / 2) / TILE);
      b.x = dir > 0 ? col * TILE - b.w / 2 - 0.01 : (col + 1) * TILE + b.w / 2 + 0.01;
      b.vx = 0;
    }
  }

  b.onGround = false;
  const dy = b.vy * dt;
  if (dy !== 0) {
    b.y += dy;
    if (rectHitsSolid(level, b.x, b.y, b.w, b.h)) {
      const dir = Math.sign(dy);
      const row =
        dir > 0
          ? Math.floor((b.y + b.h / 2 - 0.01) / TILE)
          : Math.floor((b.y - b.h / 2) / TILE);
      b.y = dir > 0 ? row * TILE - b.h / 2 - 0.01 : (row + 1) * TILE + b.h / 2 + 0.01;
      if (dir > 0) b.onGround = true;
      b.vy = 0;
    } else if (!dropThrough) {
      const top = landsOnOneWay(level, b, prevBottom);
      if (top !== null) {
        b.y = top - b.h / 2 - 0.01;
        b.vy = 0;
        b.onGround = true;
      }
    }
  }

  // resting contact: without this a body flickers on/off ground every frame
  if (!b.onGround && b.vy >= 0 && rectHitsSolid(level, b.x, b.y + 1.5, b.w, b.h)) {
    b.onGround = true;
  }
}

/** Is there floor under this point? Used so patrols do not walk off ledges. */
function floorAhead(level: Level, x: number, footY: number): boolean {
  const t = tileAt(level, x, footY + 6);
  return t === Tile.Solid || t === Tile.OneWay;
}

const overlaps = (
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
) => Math.abs(ax - bx) * 2 < aw + bw && Math.abs(ay - by) * 2 < ah + bh;

/* --------------------------------- engine --------------------------------- */

export class PlatformerEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private hooks: EngineHooks;
  readonly audio = new GameAudio();
  /** pixels run since the last footfall */
  private stepDist = 0;

  private heroId: HeroId = "huntress";
  private heroSet: AnimSet | null = null;
  private enemySets: Partial<Record<EnemyKind, AnimSet>> = {};
  private shotSets: Partial<Record<EnemyKind, AnimSet>> = {};
  private bossSet: AnimSet | null = null;
  private terrain: Terrain | null = null;
  private tinted: { bg: HTMLCanvasElement[]; tileset: HTMLCanvasElement } | null = null;

  private level!: Level;
  private levelIdx = 0;
  private props: PropInstance[] = [];

  private player!: Body & {
    anim: Animator;
    face: 1 | -1;
    hearts: number;
    maxHearts: number;
    state: "idle" | "run" | "jump" | "fall" | "attack" | "hurt" | "dead";
    attack: AttackId | null;
    attackHit: boolean;
    invuln: number;
    lock: number;
    coyote: number;
    buffer: number;
    /** jumps left before the ground is needed again */
    airJumps: number;
    specialCd: number;
    charge: number;
    charging: boolean;
    dying: number;
    /** seconds of dash left; > 0 means gravity and steering are suspended */
    dash: number;
    dashCd: number;
    dashDir: 1 | -1;
    /** one dash per trip through the air, refreshed by landing or a pogo hit */
    dashReady: boolean;
    ghosts: { x: number; y: number; face: 1 | -1; life: number }[];
  };

  private enemies: Enemy[] = [];
  private boss: Boss | null = null;
  private shots: Projectile[] = [];
  private pickups: Pickup[] = [];
  private parts: Particle[] = [];
  private markers: { x: number; t: number; fire: number }[] = [];
  private exit: { x: number; y: number } | null = null;
  private checkpoints: { x: number; y: number; lit: boolean }[] = [];
  /** where a death sends you back to — the last lit checkpoint, or the start */
  private spawn = { x: 0, y: 0 };

  private cam = { x: 0, y: 0 };
  private view = { w: VIEW_MAX_W, h: VIEW_H, scale: 1 };
  private shake = 0;
  private hitstop = 0;
  private flash = 0;
  private t = 0;
  private levelTime = 0;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private frame = 0;
  private running = false;
  private destroyed = false;

  private held = new Set<Action>();
  private pressed = new Set<Action>();

  private coins = 0;
  private coinsTotal = 0;
  private kills = 0;
  private damage = 0;
  private rank: Rank | null = null;
  score = 0;
  phase: Phase = "loading";

  constructor(canvas: HTMLCanvasElement, hooks: EngineHooks) {
    this.canvas = canvas;
    this.hooks = hooks;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  /* ------------------------------- lifecycle ------------------------------- */

  async load(hero: HeroId) {
    this.heroId = hero;
    const kinds = Object.keys(ENEMY_SHEETS) as EnemyKind[];
    const [heroSet, terrain, bossSet, ...rest] = await Promise.all([
      loadAnimSet(HERO_SHEETS[hero].base, HERO_SHEETS[hero].specs),
      loadTerrain(),
      loadAnimSet(BOSS_SHEETS.base, BOSS_SHEETS.specs),
      ...kinds.map((k) => loadAnimSet(ENEMY_SHEETS[k].base, ENEMY_SHEETS[k].specs)),
      ...kinds.map((k) => loadAnimSet(ENEMY_SHEETS[k].base, shotSpecs(ENEMY_SHOTS[k]))),
    ]);
    const enemySets = rest.slice(0, kinds.length);
    const shotSets = rest.slice(kinds.length);
    if (this.destroyed) return;
    this.heroSet = heroSet;
    this.terrain = terrain;
    this.bossSet = bossSet;
    kinds.forEach((k, i) => {
      this.enemySets[k] = enemySets[i];
      this.shotSets[k] = shotSets[i];
    });
    this.tinted = {
      tileset: tint(terrain.tileset, "rgba(60,80,190,0.44)"),
      bg: terrain.bg.map((b) => tint(b, "rgba(14,8,40,0.86)")),
    };
    this.resize();
  }

  start(levelIdx = 0) {
    this.score = 0;
    this.loadLevel(levelIdx);
    this.running = true;
    this.last = performance.now();
    this.loop();
  }

  destroy() {
    this.destroyed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.audio.destroy();
  }

  get levelCount() {
    return LEVELS.length;
  }
  get levelIndex() {
    return this.levelIdx;
  }

  /* -------------------------------- level setup ---------------------------- */

  loadLevel(idx: number, announce = true) {
    this.levelIdx = Math.max(0, Math.min(LEVELS.length - 1, idx));
    const def = LEVELS[this.levelIdx];
    this.level = parseLevel(def);
    this.enemies = [];
    this.shots = [];
    this.pickups = [];
    this.parts = [];
    this.markers = [];
    this.boss = null;
    this.exit = null;
    this.coins = 0;
    this.coinsTotal = 0;
    this.kills = 0;
    this.damage = 0;
    this.rank = null;
    this.checkpoints = [];
    this.spawn = { ...this.level.start };
    this.levelTime = 0;
    this.shake = 0;
    this.hitstop = 0;
    this.flash = 0;
    this.acc = 0;
    this.clearInput();

    const info = HERO_INFO[this.heroId];
    this.player = {
      x: this.spawn.x,
      y: this.spawn.y,
      w: info.box.w,
      h: info.box.h,
      vx: 0,
      vy: 0,
      onGround: false,
      anim: new Animator(this.heroSet ?? {}, "idle"),
      face: 1,
      hearts: info.hearts,
      maxHearts: info.hearts,
      state: "idle",
      attack: null,
      attackHit: false,
      invuln: 0,
      lock: 0,
      coyote: 0,
      buffer: 0,
      airJumps: AIR_JUMPS,
      specialCd: 0,
      charge: 0,
      charging: false,
      dying: 0,
      dash: 0,
      dashCd: 0,
      dashDir: 1,
      dashReady: true,
      ghosts: [],
    };

    for (const s of this.level.spawns) {
      if (s.kind === "coin" || s.kind === "heart") {
        this.pickups.push({ x: s.x, y: s.y, kind: s.kind, taken: false, t: Math.random() * 6 });
        if (s.kind === "coin") this.coinsTotal++;
      } else if (s.kind === "checkpoint") {
        this.checkpoints.push({ x: s.x, y: s.y + TILE / 2, lit: false });
      } else if (s.kind === "exit") {
        this.exit = { x: s.x, y: s.y };
      } else if (s.kind === "boss") {
        this.spawnBoss(s.x, s.y);
      } else {
        this.spawnEnemy(s.kind, s.x, s.y);
      }
    }

    this.props = this.buildProps();
    this.resize();
    this.cam.x = this.player.x;
    this.cam.y = this.player.y;
    this.setPhase("playing");
    this.audio.setTrack(def.biome === "arena" ? "boss" : this.levelIdx >= 2 ? "tense" : "calm");
    if (announce) this.hooks.onToast({ kind: "level", index: this.levelIdx + 1, name: def.name });
    this.emitHud();
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number) {
    const st = ENEMY_STATS[kind];
    const set = this.enemySets[kind];
    if (!set) return;
    const h = st.box.h;
    this.enemies.push({
      kind,
      x,
      // ground enemies are authored on the tile they stand on; drop them to it
      y: st.flies ? y - TILE : y + TILE / 2 - h / 2,
      w: st.box.w,
      h,
      vx: 0,
      vy: 0,
      onGround: false,
      anim: new Animator(set, "idle"),
      face: -1,
      hp: st.hp,
      maxHp: st.hp,
      state: "patrol",
      timer: 0,
      cooldown: Math.random() * 0.8,
      rangedCd: 1.2 + Math.random() * 2,
      guardCd: 2 + Math.random() * 2,
      react: 0,
      dying: 0,
      hitFlash: 0,
      didHit: false,
      homeY: st.flies ? y - TILE : y,
      bob: Math.random() * Math.PI * 2,
    });
  }

  private spawnBoss(x: number, y: number) {
    if (!this.bossSet) return;
    const h = 176;
    this.boss = {
      x,
      y: y + TILE / 2 - h / 2,
      w: 66,
      h,
      vx: 0,
      vy: 0,
      onGround: false,
      anim: new Animator(this.bossSet, "idle"),
      face: -1,
      hp: 260,
      maxHp: 260,
      state: "intro",
      timer: 1.6,
      cooldown: 1.4,
      alpha: 1,
      hitFlash: 0,
      didAct: false,
      phase: 1,
      dying: 0,
    };
  }

  /**
   * Scatter trees, bushes and rocks along whatever the map turned out to be.
   * Placement is seeded by the level index so the forest looks hand-dressed
   * but never shifts between runs.
   */
  private buildProps(): PropInstance[] {
    const out: PropInstance[] = [];
    if (this.level.biome === "arena") return out;
    let seed = 1337 + this.levelIdx * 7919;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const small: PropId[] = ["bushSmall", "bushWide", "rockSmall", "rockBig"];
    for (let col = 0; col < this.level.w; col++) {
      let row = -1;
      for (let r = 0; r < this.level.h; r++) {
        if (tileCell(this.level, col, r) === Tile.Solid) {
          row = r;
          break;
        }
      }
      if (row < 0) continue;
      const surfaceY = row * TILE;
      const r = rnd();
      if (r < 0.09 && this.level.biome === "forest") {
        out.push({
          id: rnd() < 0.5 ? "treeA" : "treeB",
          x: col * TILE + TILE / 2,
          y: surfaceY + 6,
          flip: rnd() < 0.5,
          depth: 0,
        });
      } else if (r < 0.34) {
        out.push({
          id: small[Math.floor(rnd() * small.length)],
          x: col * TILE + TILE / 2,
          y: surfaceY + 2,
          flip: rnd() < 0.5,
          depth: 1,
        });
      }
    }
    return out;
  }

  /* --------------------------------- input --------------------------------- */

  press(a: Action) {
    this.held.add(a);
    this.pressed.add(a);
  }
  release(a: Action) {
    this.held.delete(a);
  }
  clearInput() {
    this.held.clear();
    this.pressed.clear();
  }

  setPaused(p: boolean) {
    if (this.phase !== "playing" && this.phase !== "paused") return;
    this.setPhase(p ? "paused" : "playing");
    if (!p) {
      this.last = performance.now();
      this.acc = 0;
    }
  }

  restart() {
    this.loadLevel(this.levelIdx);
  }

  /**
   * Continue from the last lit checkpoint.
   *
   * Everything hostile is rebuilt from the map — enemies you already killed
   * come back — but coins, score and lit checkpoints survive, so a death costs
   * you the walk back and nothing else. Without this, dying at the exit means
   * replaying ninety seconds, which is the single most annoying thing a
   * platformer can do to you.
   */
  respawn() {
    const keptCoins = this.coins;
    const keptScore = this.score;
    const keptKills = this.kills;
    const keptDamage = this.damage;
    const taken = this.pickups.filter((p) => p.taken).map((p) => `${p.x},${p.y}`);
    const lit = this.checkpoints.filter((c) => c.lit).map((c) => c.x);
    const spawn = { ...this.spawn };

    this.loadLevel(this.levelIdx, false);

    this.spawn = spawn;
    this.player.x = spawn.x;
    this.player.y = spawn.y;
    this.cam.x = spawn.x;
    this.cam.y = spawn.y;
    this.coins = keptCoins;
    this.score = keptScore;
    this.kills = keptKills;
    this.damage = keptDamage;
    const takenSet = new Set(taken);
    for (const p of this.pickups) if (takenSet.has(`${p.x},${p.y}`)) p.taken = true;
    const litSet = new Set(lit);
    for (const c of this.checkpoints) if (litSet.has(c.x)) c.lit = true;
    this.emitHud();
  }

  next() {
    if (this.levelIdx + 1 < LEVELS.length) this.loadLevel(this.levelIdx + 1);
    else this.setPhase("won");
  }

  private setPhase(p: Phase) {
    if (this.phase === p) return;
    this.phase = p;
    this.hooks.onPhase(p);
  }

  /* ---------------------------------- loop --------------------------------- */

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > MAX_CATCHUP) dt = MAX_CATCHUP;

    if (this.phase === "playing") {
      if (this.hitstop > 0) {
        this.hitstop -= dt;
      } else {
        this.acc += dt;
        while (this.acc >= STEP) {
          this.step(STEP);
          this.acc -= STEP;
          this.pressed.clear();
        }
      }
      this.levelTime += dt;
    }
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 26);
    this.flash = Math.max(0, this.flash - dt * 3.4);
    this.render();
  };

  /** Advance one fixed physics step. */
  private step(dt: number) {
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateShots(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    this.updateMarkers(dt);
    this.updateCamera(dt);
    this.frame = (this.frame + 1) % 8;
    if (this.frame === 0) this.emitHud();
  }

  /* -------------------------------- player --------------------------------- */

  private updatePlayer(dt: number) {
    const p = this.player;
    p.anim.update(dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.specialCd = Math.max(0, p.specialCd - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.lock = Math.max(0, p.lock - dt);
    for (const g of p.ghosts) g.life -= dt;
    p.ghosts = p.ghosts.filter((g) => g.life > 0);

    if (p.state === "dead") {
      p.vx *= 0.86;
      p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
      moveBody(this.level, p, dt, false);
      p.dying += dt;
      if (p.dying > 1.4) this.setPhase("dead");
      return;
    }

    if (p.y > this.level.h * TILE + 200) {
      this.killPlayer();
      return;
    }

    const dir = (this.held.has("right") ? 1 : 0) - (this.held.has("left") ? 1 : 0);

    if (p.state === "hurt" && p.lock <= 0) p.state = p.onGround ? "idle" : "fall";

    /* --- attacks --- */
    if (p.state === "attack") {
      this.resolveAttack();
      if (p.anim.done) {
        p.state = p.onGround ? "idle" : "fall";
        p.attack = null;
      }
    } else if (p.state !== "hurt") {
      const info = HERO_INFO[this.heroId];
      const wantsDown = !p.onGround && this.held.has("down");
      if (this.pressed.has("light")) this.beginAttack(wantsDown ? "pogo" : "light");
      else if (this.pressed.has("heavy")) this.beginAttack(wantsDown ? "pogo" : "heavy");
      else if (info.special === "spear") {
        if (this.pressed.has("special") && p.specialCd <= 0) this.beginAttack("spear");
      } else if (this.held.has("special") && p.specialCd <= 0) {
        if (!p.charging) this.audio.play("charge");
        p.charging = true;
        p.charge = Math.min(SLAM_CHARGE, p.charge + dt);
      } else if (p.charging) {
        p.charging = false;
        const ready = p.charge >= SLAM_CHARGE * 0.55;
        p.charge = 0;
        if (ready) this.beginAttack("slam");
      }
    }

    /* --- dash --- */
    if (p.dash > 0) {
      p.dash -= dt;
      p.vx = p.dashDir * DASH_SPEED;
      p.vy = 0;
      if (this.frame % 2 === 0) p.ghosts.push({ x: p.x, y: p.y, face: p.face, life: 0.18 });
      if (p.dash <= 0) p.vx *= 0.45; // bleed most of the speed off on exit
    } else if (
      this.pressed.has("dash") &&
      p.dashCd <= 0 &&
      p.dashReady &&
      p.state !== "hurt"
    ) {
      p.dash = DASH_TIME;
      p.dashCd = DASH_CD;
      p.dashDir = p.face;
      p.dashReady = p.onGround; // in the air this spends the one air dash
      p.invuln = Math.max(p.invuln, DASH_TIME + DASH_IFRAMES);
      p.attack = null;
      if (p.state === "attack") p.state = p.onGround ? "idle" : "fall";
      p.charging = false;
      p.charge = 0;
      this.audio.play("dash");
      this.puff(p.x, p.y, 8, "#cfe9ff");
    }

    /* --- horizontal --- */
    const control =
      p.dash > 0 ? 0
      : p.state === "attack" ? 0.28
      : p.state === "hurt" ? 0
      : p.onGround ? 1
      : AIR_CONTROL;
    if (p.dash > 0) {
      // a dash owns the horizontal axis outright: no steering, and no friction
      // either, which would otherwise bleed most of the speed away mid-dash
    } else if (dir !== 0 && control > 0) {
      p.vx += dir * RUN_ACCEL * control * dt;
      const cap = RUN_SPEED * (p.charging ? 0.45 : 1);
      p.vx = Math.max(-cap, Math.min(cap, p.vx));
      if (p.state !== "attack" && p.state !== "hurt") p.face = dir > 0 ? 1 : -1;
    } else {
      const f = RUN_FRICTION * (p.onGround ? 1 : 0.35) * dt;
      p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
    }

    /* --- jump --- */
    if (this.pressed.has("jump")) p.buffer = JUMP_BUFFER;
    p.buffer = Math.max(0, p.buffer - dt);
    if (p.onGround) p.coyote = COYOTE;
    else p.coyote = Math.max(0, p.coyote - dt);

    if (p.buffer > 0 && p.coyote > 0 && p.dash <= 0 && p.state !== "hurt" && p.state !== "attack") {
      p.vy = -JUMP_SPEED;
      p.onGround = false;
      p.coyote = 0;
      p.buffer = 0;
      p.state = "jump";
      this.audio.play("jump");
      this.puff(p.x, p.y + p.h / 2, 5, "#cfe9ff");
    } else if (
      p.buffer > 0 && p.airJumps > 0 && !p.onGround
      && p.dash <= 0 && p.state !== "hurt" && p.state !== "attack"
    ) {
      p.airJumps--;
      p.vy = -JUMP_SPEED * AIR_JUMP_SCALE;
      p.buffer = 0;
      p.state = "jump";
      // the animation is restarted by hand: it is already playing, and a
      // second jump that does not visibly happen reads as a dropped input
      p.anim.play("jump", true);
      this.audio.play("airJump");
      this.puff(p.x, p.y + p.h / 2, 9, "#cfe9ff");
    }
    if (p.vy < 0 && !this.held.has("jump")) p.vy += GRAVITY * JUMP_CUT * dt;

    /* --- integrate --- */
    const wasAir = !p.onGround;
    if (p.dash <= 0) p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
    // dropping through a one-way needs Down without an attack held on it
    moveBody(this.level, p, dt, this.held.has("down") && p.state !== "attack");
    if (wasAir && p.onGround) {
      p.dashReady = true;
      p.airJumps = AIR_JUMPS;
      this.audio.play("land");
      this.puff(p.x, p.y + p.h / 2, 6, "#cfe9ff");
    }

    if (this.touchesSpike(p)) this.hurtPlayer(1, Math.sign(p.vx) || -p.face);

    for (const c of this.checkpoints) {
      if (c.lit || Math.abs(c.x - p.x) > 40 || Math.abs(c.y - p.y) > 70) continue;
      c.lit = true;
      this.spawn = { x: c.x, y: this.level.start.y };
      this.audio.play("checkpoint");
      this.puff(c.x, c.y - 30, 16, "#ffb347");
      this.hooks.onToast({ kind: "checkpoint" });
      this.emitHud();
    }

    /* --- animation --- */
    if (p.state !== "attack" && p.state !== "hurt") {
      if (!p.onGround) p.state = p.vy < 0 ? "jump" : "fall";
      else p.state = Math.abs(p.vx) > 18 ? "run" : "idle";
    }

    // a footfall every so many pixels of ground covered, which keeps the
    // rhythm tied to how fast he is actually moving rather than to a timer
    if (p.state === "run" && p.onGround) {
      this.stepDist += Math.abs(p.vx) * dt;
      if (this.stepDist > 26) {
        this.stepDist = 0;
        this.audio.play("step");
      }
    } else {
      this.stepDist = 0;
    }
    p.anim.play(
      p.state === "attack" ? ATTACKS[p.attack ?? "light"].anim
      : p.state === "hurt" ? "hit"
      : p.state,
    );
  }

  private beginAttack(kind: AttackId) {
    const p = this.player;
    const info = HERO_INFO[this.heroId];
    if (kind === "spear" && info.special !== "spear") return;
    if (kind === "slam" && info.special !== "slam") return;
    p.state = "attack";
    p.attack = kind;
    p.attackHit = false;
    p.anim.play(ATTACKS[kind].anim, true);
    this.audio.play(kind === "slam" ? "slam" : kind === "spear" ? "spear" : "swing");

    if (kind === "spear") {
      p.specialCd = SPEAR_CD;
      this.shots.push({
        x: p.x + p.face * 26,
        y: p.y - 6,
        vx: p.face * SPEAR_SPEED,
        vy: 0,
        r: 12,
        life: 1.6,
        maxLife: 1.6,
        dmg: SPEAR_DMG,
        hostile: false,
        kind: "spear",
        spin: 0,
        homing: 0,
      });
    }
    if (kind === "slam") {
      p.specialCd = SLAM_CD;
      p.vx = p.face * 120;
      this.shake = 9;
      for (const s of [-1, 1] as const) {
        this.shots.push({
          x: p.x + s * 30,
          y: p.y + p.h / 2 - 14,
          vx: s * 420,
          vy: 0,
          r: 22,
          life: 0.85,
          maxLife: 0.85,
          dmg: 12,
          hostile: false,
          kind: "wave",
          spin: 0,
          homing: 0,
        });
      }
      this.puff(p.x, p.y + p.h / 2, 18, "#ffd27a");
    }
  }

  /** Apply the melee hitbox during the active window of the swing. */
  private resolveAttack() {
    const p = this.player;
    if (!p.attack || p.attackHit) return;
    const a = ATTACKS[p.attack];
    if (a.dmg <= 0) return;
    const pr = p.anim.progress;
    if (pr < a.from || pr > a.to) return;

    const down = p.attack === "pogo";
    const reach = a.reach * (this.heroId === "knight" ? 1.12 : 1);
    const hx = down ? p.x : p.x + p.face * (reach + a.w / 2 - 10);
    const hy = down ? p.y + p.h / 2 + a.h / 2 - 8 : p.y - 4;
    let hit = false;

    // a thrust also bounces off spikes — the classic way to cross them
    if (down && !hit) {
      const sy = hy + a.h / 2 - 4;
      for (const ox of [-a.w / 2 + 6, 0, a.w / 2 - 6]) {
        if (tileAt(this.level, hx + ox, sy) === Tile.Spike) {
          this.pogoBounce();
          return;
        }
      }
    }

    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      if (!overlaps(hx, hy, a.w, a.h, e.x, e.y, e.w, e.h)) continue;
      const facingUs = Math.sign(p.x - e.x) === e.face;
      const guarded = e.state === "guard" && facingUs;
      if (guarded) this.audio.play("block");
      this.damageEnemy(e, guarded ? a.dmg * 0.25 : a.dmg, p.face, a.knock * (guarded ? 0.2 : 1));
      hit = true;
    }
    const b = this.boss;
    if (b && b.state !== "dead" && b.alpha > 0.6 && overlaps(hx, hy, a.w, a.h, b.x, b.y, b.w, b.h)) {
      this.damageBoss(a.dmg);
      hit = true;
    }

    if (hit) {
      p.attackHit = true;
      this.hitstop = p.attack === "light" ? 0.045 : 0.085;
      this.shake = Math.max(this.shake, a.shake);
      if (down) this.pogoBounce();
    }
  }

  /**
   * Kick back up off a successful down-thrust. The dash comes back with it,
   * which is what turns a single bounce into a chain across a pit.
   */
  private pogoBounce() {
    const p = this.player;
    p.vy = -POGO_BOUNCE;
    p.state = "fall";
    p.attack = null;
    p.attackHit = true;
    p.dashReady = true;
    p.airJumps = AIR_JUMPS;
    p.coyote = 0;
    this.hitstop = 0.07;
    this.shake = Math.max(this.shake, 4);
    this.audio.play("pogo");
    this.puff(p.x, p.y + p.h / 2, 8, "#ffe9a8");
  }

  private hurtPlayer(dmg: number, from: number) {
    const p = this.player;
    if (p.invuln > 0 || p.state === "dead") return;
    p.hearts -= dmg;
    this.damage += dmg;
    p.invuln = IFRAMES;
    p.lock = HURT_LOCK;
    p.vx = -from * HURT_KNOCK;
    p.vy = -260;
    p.attack = null;
    p.dash = 0;
    p.charging = false;
    p.charge = 0;
    this.shake = 6;
    this.flash = 0.5;
    if (p.hearts <= 0) {
      this.killPlayer();
    } else {
      p.state = "hurt";
      p.anim.play("hit", true);
      this.audio.play("hurt");
      this.blood(p.x, p.y - 20, 10);
      this.emitHud();
    }
  }

  private killPlayer() {
    const p = this.player;
    if (p.state === "dead") return;
    p.hearts = 0;
    p.state = "dead";
    p.dying = 0;
    p.vx = 0;
    p.anim.play("death", true);
    this.audio.play("die");
    this.audio.stopMusic();
    this.emitHud();
  }

  private touchesSpike(b: Body): boolean {
    const y = b.y + b.h / 2 - 4;
    return (
      tileAt(this.level, b.x - b.w / 2 + 4, y) === Tile.Spike ||
      tileAt(this.level, b.x + b.w / 2 - 4, y) === Tile.Spike ||
      tileAt(this.level, b.x, y) === Tile.Spike
    );
  }

  /* -------------------------------- enemies -------------------------------- */

  private updateEnemies(dt: number) {
    const p = this.player;
    for (const e of this.enemies) {
      e.anim.update(dt);
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      const st = ENEMY_STATS[e.kind];

      if (e.state === "dead") {
        e.dying += dt;
        if (!st.flies) {
          e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
          e.vx *= 0.9;
          moveBody(this.level, e, dt, false);
        }
        continue;
      }

      // only think when roughly on screen — dozens of patrols off camera are
      // wasted work and, worse, wander out of their arena before you meet them
      const onScreen = Math.abs(e.x - this.cam.x) < this.view.w * 0.75 + 200;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy);
      const sees = onScreen && p.state !== "dead" && dist < st.sight && Math.abs(dy) < 190;

      e.cooldown = Math.max(0, e.cooldown - dt);
      e.rangedCd = Math.max(0, e.rangedCd - dt);
      e.guardCd = Math.max(0, e.guardCd - dt);

      if (e.state === "hurt") {
        e.timer -= dt;
        if (e.timer <= 0) e.state = sees ? "chase" : "patrol";
      } else if (e.state === "guard") {
        e.timer -= dt;
        e.vx = 0;
        if (e.timer <= 0) e.state = "chase";
      } else if (e.state === "ranged") {
        e.vx *= 0.75;
        const st2 = st.ranged;
        if (st2 && !e.didHit && e.anim.progress > st2.at) {
          e.didHit = true;
          this.throwShot(e, st2);
        }
        if (e.anim.done) {
          e.state = "chase";
          e.cooldown = 0.5;
        }
      } else if (e.state === "attack") {
        e.vx *= 0.8;
        const pr = e.anim.progress;
        // the blow lands on the blow, not across the whole animation: a
        // third of a second of live hit box caught anyone who walked past
        // during the follow-through as surely as the man it was aimed at
        if (!e.didHit && pr > 0.4 && pr < 0.56) {
          const hx = e.x + e.face * st.range * 0.7;
          if (overlaps(hx, e.y, st.range * 1.15, e.h + 6, p.x, p.y, p.w, p.h)) {
            this.hurtPlayer(st.touch, Math.sign(e.x - p.x) || 1);
            e.didHit = true;
          }
        }
        if (e.anim.done) {
          e.state = "chase";
          e.cooldown = st.guards ? 1.5 : 0.9;
        }
      } else if (sees && e.react > 0) {
        // he has seen you and has not acted on it yet
        e.react -= dt;
        e.vx *= 0.85;
        e.state = "chase";
      } else if (sees) {
        e.state = "chase";
        const want: 1 | -1 = dx > 0 ? 1 : -1;
        if (want !== e.face) {
          // caught out: turning round costs him a moment, which is what
          // jumping over an enemy is supposed to buy you
          e.face = want;
          e.react = TURN + Math.random() * TURN_VAR;
          e.vx *= 0.5;
        } else if (dist < st.range && e.cooldown <= 0) {
          e.state = "attack";
          e.didHit = false;
          e.anim.play("attack", true);
          this.audio.play("enemySwing");
        } else if (
          st.ranged &&
          e.rangedCd <= 0 &&
          dist > st.ranged.min &&
          dist < st.ranged.max &&
          Math.abs(dy) < 120
        ) {
          e.state = "ranged";
          e.didHit = false;
          e.rangedCd = st.ranged.cd;
          e.anim.play("ranged", true);
        } else if (st.guards && e.guardCd <= 0 && dist < st.range * 2.2) {
          e.state = "guard";
          e.timer = 0.55;
          e.guardCd = 4.8;
          e.anim.play("shield", true);
        } else if (st.flies) {
          e.vx = Math.sign(dx) * st.speed;
          e.vy = (p.y - 40 - e.y) * 2.4;
        } else {
          e.vx = Math.sign(dx) * st.speed;
        }
      } else {
        e.state = "patrol";
        // a fresh reaction time, banked against the next time he sees you
        e.react = REACT + Math.random() * REACT_VAR;
        if (st.flies) {
          e.bob += dt * 2;
          e.vx = e.face * st.speed * 0.4;
          e.vy = Math.sin(e.bob) * 40 + (e.homeY - e.y) * 1.2;
        } else {
          e.vx = e.face * st.speed * 0.55;
        }
      }

      if (!st.flies) {
        e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
        // A ledge stops him where he stands. The check used to run after the
        // move and only turn a patrol round, so anyone chasing walked
        // straight off the platform he was posted on — and a level you had
        // not reached yet was already empty, its guards in the pit below.
        // Knockback is exempt: being hit off a ledge is the player's doing
        const walking = e.state === "patrol" || e.state === "chase";
        const step = Math.sign(e.vx);
        if (walking && step !== 0 && e.onGround
            && !floorAhead(this.level, e.x + step * (e.w / 2 + 6), e.y + e.h / 2)) {
          e.vx = 0;
          if (e.state === "patrol") e.face = e.face === 1 ? -1 : 1;
        }
        const before = e.x;
        moveBody(this.level, e, dt, false);
        const blocked = e.vx !== 0 && Math.abs(e.x - before) < Math.abs(e.vx * dt) * 0.5;
        if (blocked && e.state === "patrol") e.face = e.face === 1 ? -1 : 1;
      } else {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (rectHitsSolid(this.level, e.x, e.y, e.w, e.h)) {
          e.x -= e.vx * dt;
          e.y -= e.vy * dt;
          e.face = e.face === 1 ? -1 : 1;
        }
      }

      // a staggered enemy is not a threat: without this, trading blows costs
      // you a heart for every hit you land
      if (
        p.state !== "dead" &&
        e.state !== "hurt" &&
        overlaps(e.x, e.y, e.w, e.h, p.x, p.y, p.w, p.h)
      ) {
        this.hurtPlayer(st.touch, Math.sign(e.x - p.x) || 1);
      }

      e.anim.play(
        e.state === "attack" ? "attack"
        : e.state === "ranged" ? "ranged"
        : e.state === "guard" ? "shield"
        : e.state === "hurt" ? "hit"
        : Math.abs(e.vx) > 12 ? "run"
        : "idle",
      );
    }

    this.enemies = this.enemies.filter((e) => e.state !== "dead" || e.dying < 1.4);
  }

  /**
   * Launch a monster's thrown weapon. Flat shots are aimed straight at the
   * player; the goblin's bomb gets a lobbed arc solved for the same target, so
   * it lands on you instead of at your feet.
   */
  private throwShot(e: Enemy, r: NonNullable<EnemyStats["ranged"]>) {
    const set = this.shotSets[e.kind];
    if (!set) return;
    const p = this.player;
    const spec = ENEMY_SHOTS[e.kind];
    const ox = e.x + e.face * e.w * 0.5;
    const oy = e.y - e.h * 0.15;
    // he throws at where you are, and misses by more the further away you
    // are — the whole of the difference between an enemy and a turret
    const off = SPREAD + Math.hypot(p.x - ox, p.y - oy) * SPREAD_PER_UNIT;
    const tx = p.x + (Math.random() * 2 - 1) * off;
    const ty = p.y + (Math.random() * 2 - 1) * off * 0.6;
    let vx: number;
    let vy: number;
    if (r.gravity > 0) {
      // pick the flight time from the horizontal gap, then solve vy for it
      const dx = tx - ox;
      const t = Math.max(0.35, Math.min(1.4, Math.abs(dx) / r.speed));
      vx = dx / t;
      vy = (ty - 20 - oy) / t - 0.5 * r.gravity * t;
    } else {
      const a = Math.atan2(ty - 10 - oy, tx - ox);
      vx = Math.cos(a) * r.speed;
      vy = Math.sin(a) * r.speed;
    }
    this.shots.push({
      x: ox, y: oy, vx, vy,
      r: spec.r,
      life: 4,
      maxLife: 4,
      dmg: 1,
      hostile: true,
      kind: "thrown",
      spin: 0,
      homing: 0,
      anim: new Animator(set, "fly"),
      scale: spec.scale,
      grav: r.gravity,
    });
    this.audio.play("throw");
  }

  private damageEnemy(e: Enemy, dmg: number, dir: number, knock: number) {
    if (e.state === "dead") return;
    e.hp -= dmg;
    e.hitFlash = 0.12;
    e.vx = dir * knock;
    this.audio.play("hitEnemy");
    this.blood(e.x, e.y - e.h * 0.2, 8);
    if (e.hp <= 0) {
      e.state = "dead";
      e.dying = 0;
      e.vy = -180;
      e.anim.play("death", true);
      this.kills++;
      this.score += ENEMY_STATS[e.kind].score;
      this.audio.play("kill");
      this.puff(e.x, e.y, 14, "#ff7ba8");
      this.emitHud();
    } else {
      e.state = "hurt";
      e.timer = 0.26;
      e.anim.play("hit", true);
    }
  }

  /* --------------------------------- boss ---------------------------------- */

  private updateBoss(dt: number) {
    const b = this.boss;
    if (!b) return;
    const p = this.player;
    b.anim.update(dt);
    b.hitFlash = Math.max(0, b.hitFlash - dt);
    b.timer -= dt;
    b.cooldown = Math.max(0, b.cooldown - dt);

    if (b.state === "dead") {
      b.dying += dt;
      b.alpha = b.dying > 1.6 ? Math.max(0, 1 - (b.dying - 1.6) / 1.2) : 1;
      b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
      moveBody(this.level, b, dt, false);
      if (b.dying > 2.8 && this.phase === "playing") this.clearLevel();
      return;
    }

    const ratio = b.hp / b.maxHp;
    const phase: 1 | 2 | 3 = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    if (phase > b.phase) {
      // only ever announce an escalation — healing back down would be a bug,
      // and the toast has no wording for "phase 1" anyway
      b.phase = phase;
      this.hooks.onToast({ kind: "bossPhase", phase: phase as 2 | 3 });
      this.shake = 12;
      this.flash = 0.8;
      b.state = "vanish";
      b.timer = 0.4;
    }

    b.face = p.x > b.x ? 1 : -1;

    switch (b.state) {
      case "intro":
        b.anim.play("idle");
        if (b.timer <= 0) {
          b.state = "idle";
          b.cooldown = 0.8;
        }
        break;

      case "idle":
      case "walk": {
        const dx = p.x - b.x;
        const far = Math.abs(dx) > 190;
        b.vx = far ? Math.sign(dx) * 120 : 0;
        b.anim.play(far ? "run" : "idle");
        b.state = far ? "walk" : "idle";
        if (b.cooldown <= 0) this.chooseBossAction();
        break;
      }

      case "cast":
        b.vx = 0;
        if (!b.didAct && b.anim.progress > 0.55) {
          b.didAct = true;
          this.bossOrbs();
        }
        if (b.anim.done) {
          b.state = "idle";
          b.cooldown = [1.5, 1.15, 0.85][b.phase - 1];
        }
        break;

      case "quake":
        b.vx = 0;
        if (!b.didAct && b.anim.progress > 0.5) {
          b.didAct = true;
          this.bossQuake();
        }
        if (b.anim.done) {
          b.state = "idle";
          b.cooldown = [1.9, 1.5, 1.1][b.phase - 1];
        }
        break;

      case "summon":
        b.vx = 0;
        if (!b.didAct && b.anim.progress > 0.5) {
          b.didAct = true;
          const kind: EnemyKind = b.phase >= 3 ? "goblin" : "mushroom";
          for (const s of [-1, 1] as const) {
            this.spawnEnemy(kind, b.x + s * 150, b.y + b.h / 2 - TILE / 2);
          }
          this.audio.play("bossCast");
          this.puff(b.x, b.y, 20, "#b678ff");
        }
        if (b.anim.done) {
          b.state = "idle";
          b.cooldown = 2.2;
        }
        break;

      case "vanish":
        b.alpha = Math.max(0, b.timer / 0.4);
        b.vx = 0;
        if (b.timer <= 0) {
          const side = p.x > (this.level.w * TILE) / 2 ? -1 : 1;
          b.x = Math.max(
            140,
            Math.min(this.level.w * TILE - 140, p.x + side * (200 + Math.random() * 160)),
          );
          b.y = this.level.start.y - b.h / 2;
          b.vy = 0;
          b.state = "appear";
          b.timer = 0.32;
          this.puff(b.x, b.y, 18, "#8f5bff");
          this.audio.play("bossCast");
        }
        break;

      case "appear":
        b.alpha = Math.min(1, 1 - b.timer / 0.32);
        if (b.timer <= 0) {
          b.alpha = 1;
          b.state = "idle";
          b.cooldown = 0.35;
        }
        break;

      case "hurt":
        b.vx *= 0.85;
        if (b.anim.done) b.state = "idle";
        break;
    }

    b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
    moveBody(this.level, b, dt, false);

    // The wizard deliberately does no contact damage. He is a caster: standing
    // next to him has to be survivable or melee is not a strategy, and his
    // orbs, quakes and summons are threat enough.
  }

  private chooseBossAction() {
    const b = this.boss;
    if (!b) return;
    b.didAct = false;
    const roll = Math.random();
    const alive = this.enemies.filter((e) => e.state !== "dead").length;
    if (b.phase >= 2 && alive < 3 && roll < 0.22) {
      b.state = "summon";
      b.anim.play("attack2", true);
    } else if (b.phase >= 2 && roll < 0.48) {
      b.state = "quake";
      b.anim.play("attack2", true);
    } else if (roll < 0.82) {
      b.state = "cast";
      b.anim.play("attack1", true);
    } else {
      b.state = "vanish";
      b.timer = 0.4;
    }
  }

  private bossOrbs() {
    const b = this.boss;
    if (!b) return;
    const p = this.player;
    const count = [1, 3, 5][b.phase - 1];
    const base = Math.atan2(p.y - (b.y - 20), p.x - b.x);
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * 0.22;
      this.shots.push({
        x: b.x + b.face * 30,
        y: b.y - 24,
        vx: Math.cos(a) * 300,
        vy: Math.sin(a) * 300,
        r: 13,
        life: 3.4,
        maxLife: 3.4,
        dmg: 1,
        hostile: true,
        kind: "orb",
        spin: 0,
        homing: b.phase >= 3 ? 1.5 : 0,
      });
    }
    this.audio.play("bossCast");
  }

  private bossQuake() {
    const b = this.boss;
    if (!b) return;
    this.shake = 14;
    this.audio.play("slam");
    for (const s of [-1, 1] as const) {
      this.shots.push({
        x: b.x + s * 40,
        y: b.y + b.h / 2 - 16,
        vx: s * 380,
        vy: 0,
        r: 24,
        life: 2.4,
        maxLife: 2.4,
        dmg: 1,
        hostile: true,
        kind: "wave",
        spin: 0,
        homing: 0,
      });
    }
    if (b.phase >= 3) {
      // telegraph a rain of meteors — the marker lands first, the rock later
      const p = this.player;
      for (let i = 0; i < 6; i++) {
        const x = p.x + (i - 2.5) * 110 + (Math.random() - 0.5) * 40;
        this.markers.push({ x, t: 0.9 + i * 0.07, fire: 0.9 + i * 0.07 });
      }
    }
  }

  private updateMarkers(dt: number) {
    if (!this.markers.length) return;
    for (const m of this.markers) {
      m.t -= dt;
      if (m.t <= 0 && m.fire > 0) {
        m.fire = 0;
        this.shots.push({
          x: m.x,
          y: this.cam.y - this.view.h / 2 - 40,
          vx: 0,
          vy: 640,
          r: 16,
          life: 3,
          maxLife: 3,
          dmg: 1,
          hostile: true,
          kind: "meteor",
          spin: 0,
          homing: 0,
        });
      }
    }
    this.markers = this.markers.filter((m) => m.t > -0.15);
  }

  private damageBoss(dmg: number) {
    const b = this.boss;
    if (!b || b.state === "dead") return;
    b.hp -= dmg;
    b.hitFlash = 0.12;
    this.audio.play("bossHurt");
    this.blood(b.x, b.y - 30, 10);
    if (b.hp <= 0) {
      b.hp = 0;
      b.state = "dead";
      b.dying = 0;
      b.anim.play("death", true);
      this.audio.play("bossDie");
      this.audio.stopMusic();
      this.shake = 20;
      this.flash = 1;
      this.score += 5000;
      // The fight is over the moment he falls. Sweep away his summons, his
      // spells and his telegraphs, and make the player untouchable for the
      // death animation — otherwise a stray mushroom steals the victory in
      // the three seconds between the last hit and the level clearing.
      this.shots = [];
      this.markers = [];
      for (const e of this.enemies) {
        if (e.state === "dead") continue;
        e.state = "dead";
        e.dying = 0;
        e.vy = -180;
        e.anim.play("death", true);
        this.score += ENEMY_STATS[e.kind].score;
        this.kills++;
        this.puff(e.x, e.y, 12, "#b678ff");
      }
      this.player.invuln = 99;
    }
    this.emitHud();
  }

  /* ------------------------------- projectiles ----------------------------- */

  private updateShots(dt: number) {
    const p = this.player;
    for (const s of this.shots) {
      s.life -= dt;
      s.spin += dt * 10;
      s.anim?.update(dt);
      if (s.burst) {
        if (s.anim?.done) s.life = 0;
        continue; // an impact stays put and plays itself out
      }
      if (s.grav) s.vy += s.grav * dt;
      if (s.homing > 0 && p.state !== "dead") {
        const want = Math.atan2(p.y - s.y, p.x - s.x);
        const sp = Math.hypot(s.vx, s.vy);
        const cur = Math.atan2(s.vy, s.vx);
        let d = want - cur;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const na = cur + Math.max(-s.homing * dt, Math.min(s.homing * dt, d));
        s.vx = Math.cos(na) * sp;
        s.vy = Math.sin(na) * sp;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      if (s.kind !== "wave" && rectHitsSolid(this.level, s.x, s.y, s.r, s.r)) {
        this.burstShot(s);
        continue;
      }

      if (s.hostile) {
        if (p.state !== "dead" && overlaps(s.x, s.y, s.r * 2, s.r * 2, p.x, p.y, p.w, p.h)) {
          this.hurtPlayer(s.dmg, Math.sign(s.vx) || 1);
          this.burstShot(s);
        }
      } else {
        for (const e of this.enemies) {
          if (e.state === "dead") continue;
          if (!overlaps(s.x, s.y, s.r * 2, s.r * 2, e.x, e.y, e.w, e.h)) continue;
          this.damageEnemy(e, s.dmg, Math.sign(s.vx) || 1, 140);
          if (s.kind === "spear") s.life = 0;
        }
        const b = this.boss;
        if (
          b && b.state !== "dead" && b.alpha > 0.6 &&
          overlaps(s.x, s.y, s.r * 2, s.r * 2, b.x, b.y, b.w, b.h)
        ) {
          this.damageBoss(s.dmg);
          if (s.kind === "spear") s.life = 0;
        }
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  /** End a projectile: sheet-backed ones play their impact frames in place. */
  private burstShot(s: Projectile) {
    if (s.burst) return;
    if (s.anim) {
      s.burst = true;
      s.vx = 0;
      s.vy = 0;
      s.grav = 0;
      s.life = 1.2;
      s.anim.play("burst", true);
    } else {
      s.life = 0;
    }
    this.puff(s.x, s.y, 8, s.hostile ? "#b678ff" : "#ffd27a");
  }

  /* -------------------------------- pickups -------------------------------- */

  private updatePickups(_dt: number) {
    const p = this.player;
    for (const c of this.pickups) {
      if (c.taken) continue;
      // a generous box around the whole body, not a point: a radius measured
      // from the chest silently misses anything resting near the player's feet
      const r = c.kind === "coin" ? 40 : 48;
      if (!overlaps(c.x, c.y, r, r, p.x, p.y, p.w + 16, p.h + 16)) continue;
      c.taken = true;
      if (c.kind === "coin") {
        this.coins++;
        this.score += COIN_SCORE;
        this.audio.play("coin");
        this.puff(c.x, c.y, 6, "#ffd45e");
      } else {
        p.hearts = Math.min(p.maxHearts, p.hearts + 1);
        this.audio.play("heart");
        this.puff(c.x, c.y, 10, "#ff6d8f");
      }
      this.emitHud();
    }

    if (this.exit && p.state !== "dead" && this.phase === "playing") {
      if (Math.hypot(this.exit.x - p.x, this.exit.y - p.y) < 48) this.clearLevel();
    }
  }

  /**
   * Grade the run out of a hundred: coins found, hearts kept, time against the
   * level's par. Every number is one the HUD already tracks, so this costs
   * nothing to keep honest.
   */
  private computeRank(): Rank {
    const coinPct = this.coinsTotal > 0 ? this.coins / this.coinsTotal : 1;
    const par = this.level.par;
    let pts = 40 * coinPct;
    pts += 35 * Math.max(0, 1 - this.damage / 4);
    pts += 25 * Math.max(0, Math.min(1, (par * 2 - this.levelTime) / par));
    return pts >= 90 ? "S" : pts >= 74 ? "A" : pts >= 55 ? "B" : "C";
  }

  private clearLevel() {
    this.rank = this.computeRank();
    this.score += { S: 1500, A: 900, B: 400, C: 0 }[this.rank];
    this.score += CLEAR_BONUS + Math.max(0, Math.round((150 - this.levelTime) * 4));
    this.audio.play("clear");
    this.audio.stopMusic();
    this.setPhase("cleared");
    this.emitHud();
  }

  /* ------------------------------- particles ------------------------------- */

  private spawnParticle(
    x: number, y: number, colour: string, speed: number, gravity: number, size: number,
  ) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.6);
    const life = 0.3 + Math.random() * 0.45;
    this.parts.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - speed * 0.35,
      life, max: life, size, colour, gravity,
    });
  }

  private puff(x: number, y: number, n: number, colour: string) {
    for (let i = 0; i < n; i++) this.spawnParticle(x, y, colour, 190, 420, 3 + Math.random() * 3);
  }
  private blood(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) this.spawnParticle(x, y, "#ff5b7f", 240, 900, 2 + Math.random() * 3);
  }

  private updateParticles(dt: number) {
    for (const q of this.parts) {
      q.life -= dt;
      q.vy += q.gravity * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    if (this.parts.length > 420) this.parts.splice(0, this.parts.length - 420);
    this.parts = this.parts.filter((q) => q.life > 0);
  }

  /* --------------------------------- camera -------------------------------- */

  private updateCamera(dt: number) {
    const p = this.player;
    const lead = Math.max(-70, Math.min(70, p.vx * 0.22));
    const tx = p.x + lead;
    const ty = p.y - 40;
    if (tx > this.cam.x + DEADZONE_X) this.cam.x = tx - DEADZONE_X;
    else if (tx < this.cam.x - DEADZONE_X) this.cam.x = tx + DEADZONE_X;
    if (ty > this.cam.y + DEADZONE_Y) {
      this.cam.y += (ty - DEADZONE_Y - this.cam.y) * Math.min(1, dt * 9);
    } else if (ty < this.cam.y - DEADZONE_Y) {
      this.cam.y += (ty + DEADZONE_Y - this.cam.y) * Math.min(1, dt * 9);
    }

    const lw = this.level.w * TILE;
    const lh = this.level.h * TILE;
    this.cam.x = Math.max(this.view.w / 2, Math.min(lw - this.view.w / 2, this.cam.x));
    this.cam.y = Math.max(this.view.h / 2, Math.min(lh - this.view.h / 2, this.cam.y));
    if (lw < this.view.w) this.cam.x = lw / 2;
    if (lh < this.view.h) this.cam.y = lh / 2;
  }

  /* ---------------------------------- hud ---------------------------------- */

  private emitHud() {
    const def = LEVELS[this.levelIdx];
    const info = HERO_INFO[this.heroId];
    const cd = info.special === "spear" ? SPEAR_CD : SLAM_CD;
    this.hooks.onHud({
      hearts: Math.max(0, this.player?.hearts ?? 0),
      maxHearts: this.player?.maxHearts ?? info.hearts,
      coins: this.coins,
      score: this.score,
      level: this.levelIdx,
      levelName: def.name,
      kills: this.kills,
      time: this.levelTime,
      boss: this.boss ? this.boss.hp / this.boss.maxHp : null,
      specialCd: 1 - (this.player?.specialCd ?? 0) / cd,
      dashCd: 1 - (this.player?.dashCd ?? 0) / DASH_CD,
      charging: (this.player?.charge ?? 0) / SLAM_CHARGE,
      checkpoint: this.checkpoints.some((c) => c.lit),
      coinsTotal: this.coinsTotal,
      damage: this.damage,
      par: this.level?.par ?? 0,
      rank: this.rank,
    });
  }

  /* --------------------------------- render -------------------------------- */

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(320, rect.width);
    const cssH = Math.max(200, rect.height);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.fitView(cssW, cssH, dpr);
    this.ctx.imageSmoothingEnabled = false;
  }

  /**
   * Pick the visible world rectangle. Aspect ratio drives it, but the result
   * is never taller than the level itself — showing empty sky above the top
   * row makes the world look like a model of a game rather than a game.
   */
  private fitView(cssW: number, cssH: number, dpr: number) {
    const aspect = cssW / cssH;
    let vh = VIEW_H;
    let vw = vh * aspect;
    if (vw < VIEW_MIN_W) {
      vw = VIEW_MIN_W;
      vh = vw / aspect;
    } else if (vw > VIEW_MAX_W) {
      vw = VIEW_MAX_W;
      vh = vw / aspect;
    }
    const levelH = this.level ? this.level.h * TILE : Infinity;
    if (vh > levelH) {
      vh = levelH;
      vw = vh * aspect;
    }
    this.view.w = vw;
    this.view.h = vh;
    this.view.scale = (cssW / vw) * dpr;
  }

  private render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (!this.level || !this.terrain) {
      ctx.fillStyle = "#0f0a1c";
      ctx.fillRect(0, 0, W, H);
      return;
    }

    const sx = this.shake > 0.2 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0.2 ? (Math.random() - 0.5) * this.shake : 0;
    const camX = this.cam.x + sx;
    const camY = this.cam.y + sy;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawBackdrop(ctx, camX, W, H);

    ctx.setTransform(this.view.scale, 0, 0, this.view.scale, W / 2, H / 2);
    ctx.translate(-camX, -camY);

    this.drawProps(ctx, 0);
    this.drawTiles(ctx, camX, camY);
    this.drawProps(ctx, 1);
    this.drawCheckpoints(ctx);
    this.drawExit(ctx);
    this.drawPickups(ctx);
    this.drawMarkers(ctx);
    this.drawEnemies(ctx);
    this.drawBoss(ctx);
    this.drawPlayer(ctx);
    this.drawShots(ctx);
    this.drawParticles(ctx);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,60,90,${Math.min(0.4, this.flash * 0.4)})`;
      ctx.fillRect(0, 0, W, H);
    }
    // low-health vignette: the screen itself tells you you are one hit away
    if (this.player && this.player.hearts === 1 && this.player.state !== "dead") {
      const pulse = 0.18 + Math.sin(this.t * 5) * 0.07;
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.8);
      g.addColorStop(0, "rgba(255,0,60,0)");
      g.addColorStop(1, `rgba(255,0,60,${pulse})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /**
   * Sky gradient plus parallax layers. Underground the pack's blue sky image
   * would fight the gradient, so the cave and the arena keep only the two tree
   * layers — tinted, dimmed and pushed low — which read as silhouettes against
   * the dark instead of a forest at dusk.
   */
  private drawBackdrop(ctx: CanvasRenderingContext2D, camX: number, W: number, H: number) {
    const t = this.terrain;
    if (!t) return;
    const biome = this.level.biome;
    const forest = biome === "forest";
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    if (forest) {
      sky.addColorStop(0, "#79d2f6");
      sky.addColorStop(1, "#c3f0ff");
    } else if (biome === "arena") {
      sky.addColorStop(0, "#12041c");
      sky.addColorStop(0.55, "#2b0730");
      sky.addColorStop(1, "#4a0d2c");
    } else {
      sky.addColorStop(0, "#080a26");
      sky.addColorStop(0.6, "#0f1338");
      sky.addColorStop(1, "#1b1f52");
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const layers: { img: HTMLImageElement | HTMLCanvasElement; f: number; h: number; a: number }[] =
      forest
        ? [
            { img: t.bg[0], f: 0.06, h: 1, a: 1 },
            { img: t.bg[1], f: 0.24, h: 0.42, a: 0.95 },
            { img: t.bg[2], f: 0.46, h: 0.72, a: 0.95 },
          ]
        : [
            { img: this.tinted?.bg[1] ?? t.bg[1], f: 0.2, h: 0.34, a: 0.55 },
            { img: this.tinted?.bg[2] ?? t.bg[2], f: 0.42, h: 0.6, a: 0.8 },
          ];

    for (const l of layers) {
      const img = l.img as HTMLImageElement;
      const drawH = H * l.h;
      const drawW = drawH * (img.width / img.height);
      const y = l.h >= 1 ? 0 : H - drawH;
      let x = -((((camX * l.f) % drawW) + drawW) % drawW);
      ctx.globalAlpha = l.a;
      while (x < W) {
        ctx.drawImage(img, x, y, drawW, drawH);
        x += drawW - 1;
      }
    }
    ctx.globalAlpha = 1;

    if (biome === "arena") {
      // an ember glow along the floor, so the last room feels like the last room
      const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
      g.addColorStop(0, "rgba(255,46,136,0)");
      g.addColorStop(1, "rgba(255,46,136,0.22)");
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);
    }
  }

  /**
   * Blit terrain through a 3x3 nine-slice picked by which orthogonal
   * neighbours are solid — nine source tiles cover every silhouette the maps
   * actually produce, and the whole thing is one table lookup per visible tile.
   */
  private drawTiles(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    const t = this.terrain;
    if (!t) return;
    const sheet = this.level.biome === "forest" ? t.tileset : (this.tinted?.tileset ?? t.tileset);
    const slice = NINE_SLICE[this.level.biome];
    const c0 = Math.max(0, Math.floor((camX - this.view.w / 2) / TILE) - 1);
    const c1 = Math.min(this.level.w - 1, Math.ceil((camX + this.view.w / 2) / TILE) + 1);
    const r0 = Math.max(0, Math.floor((camY - this.view.h / 2) / TILE) - 1);
    const r1 = Math.min(this.level.h - 1, Math.ceil((camY + this.view.h / 2) / TILE) + 1);

    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const tile = tileCell(this.level, col, row);
        if (tile === Tile.Empty) continue;
        const dx = col * TILE;
        const dy = row * TILE;

        if (tile === Tile.Spike) {
          this.drawSpike(ctx, dx, dy);
          continue;
        }

        let sc: number;
        let sr: number;
        if (tile === Tile.OneWay) {
          const l = tileCell(this.level, col - 1, row) === Tile.OneWay;
          const r = tileCell(this.level, col + 1, row) === Tile.OneWay;
          sc = slice.col + (!l ? 0 : !r ? 2 : 1);
          sr = slice.row;
        } else {
          const up = tileCell(this.level, col, row - 1) === Tile.Solid;
          const down = tileCell(this.level, col, row + 1) === Tile.Solid;
          const left = tileCell(this.level, col - 1, row) === Tile.Solid;
          const right = tileCell(this.level, col + 1, row) === Tile.Solid;
          sc = slice.col + (!left ? 0 : !right ? 2 : 1);
          sr = slice.row + (!up ? 0 : !down ? 2 : 1);
        }
        ctx.drawImage(sheet, sc * TILE_SRC, sr * TILE_SRC, TILE_SRC, TILE_SRC, dx, dy, TILE, TILE);
      }
    }
  }

  private drawSpike(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const n = 3;
    const w = TILE / n;
    ctx.fillStyle = "#d7dbe8";
    ctx.strokeStyle = "#2a2140";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * w, y + TILE);
      ctx.lineTo(x + i * w + w / 2, y + TILE * 0.16);
      ctx.lineTo(x + (i + 1) * w, y + TILE);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(120,60,90,0.55)";
    ctx.fillRect(x, y + TILE - 4, TILE, 4);
  }

  private drawProps(ctx: CanvasRenderingContext2D, depth: number) {
    const t = this.terrain;
    if (!t) return;
    for (const pr of this.props) {
      if (pr.depth !== depth) continue;
      const r = PROPS[pr.id];
      const w = r.w * 2;
      const h = r.h * 2;
      if (Math.abs(pr.x - this.cam.x) > this.view.w / 2 + w) continue;
      ctx.save();
      ctx.translate(Math.round(pr.x), Math.round(pr.y));
      if (pr.flip) ctx.scale(-1, 1);
      if (depth === 0) ctx.globalAlpha = 0.88;
      ctx.drawImage(t.props, r.x, r.y, r.w, r.h, Math.round(-w / 2), -h, w, h);
      ctx.restore();
    }
  }

  /** A brazier: dark and cold until you touch it, then lit and drifting. */
  private drawCheckpoints(ctx: CanvasRenderingContext2D) {
    for (const c of this.checkpoints) {
      if (Math.abs(c.x - this.cam.x) > this.view.w / 2 + 60) continue;
      const base = c.y;
      ctx.save();
      ctx.translate(Math.round(c.x), Math.round(base));
      ctx.fillStyle = "#153c4a";
      ctx.fillRect(-4, -34, 8, 34);
      ctx.fillStyle = "#2c645e";
      ctx.fillRect(-13, -4, 26, 6);
      ctx.fillRect(-11, -42, 22, 10);
      ctx.strokeStyle = "#052137";
      ctx.lineWidth = 2;
      ctx.strokeRect(-11, -42, 22, 10);
      if (c.lit) {
        const f = 1 + Math.sin(this.t * 7 + c.x) * 0.16;
        const g = ctx.createRadialGradient(0, -50, 2, 0, -50, 40 * f);
        g.addColorStop(0, "rgba(255,240,180,0.95)");
        g.addColorStop(0.35, "rgba(255,150,60,0.7)");
        g.addColorStop(1, "rgba(255,90,30,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, -50, 40 * f, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffd45e";
        ctx.beginPath();
        ctx.moveTo(-7, -42);
        ctx.quadraticCurveTo(-3, -56 * f, 0, -64 * f);
        ctx.quadraticCurveTo(3, -56 * f, 7, -42);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawExit(ctx: CanvasRenderingContext2D) {
    const e = this.exit;
    if (!e) return;
    const pulse = 0.5 + Math.sin(this.t * 3) * 0.5;
    ctx.save();
    ctx.translate(e.x, e.y);
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 52);
    g.addColorStop(0, `rgba(120,255,220,${0.55 + pulse * 0.3})`);
    g.addColorStop(1, "rgba(120,255,220,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-56, -56, 112, 112);
    ctx.strokeStyle = `rgba(200,255,242,${0.65 + pulse * 0.35})`;
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const rr = 10 + i * 9 + pulse * 5;
      ctx.beginPath();
      ctx.ellipse(0, 0, rr * 0.62, rr, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPickups(ctx: CanvasRenderingContext2D) {
    for (const c of this.pickups) {
      if (c.taken) continue;
      if (Math.abs(c.x - this.cam.x) > this.view.w / 2 + 40) continue;
      const y = c.y + Math.sin(this.t * 3 + c.t) * 4;
      ctx.save();
      ctx.translate(c.x, y);
      if (c.kind === "coin") {
        ctx.scale(0.35 + Math.abs(Math.cos(this.t * 3.4 + c.t)) * 0.65, 1);
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fillStyle = "#ffd45e";
        ctx.fill();
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = "#c98a1b";
        ctx.stroke();
      } else {
        ctx.scale(1 + Math.sin(this.t * 6) * 0.06, 1 + Math.cos(this.t * 6) * 0.06);
        ctx.fillStyle = "#ff5f86";
        ctx.beginPath();
        ctx.moveTo(0, 9);
        ctx.bezierCurveTo(-14, -3, -7, -14, 0, -6);
        ctx.bezierCurveTo(7, -14, 14, -3, 0, 9);
        ctx.fill();
        ctx.strokeStyle = "#8c1f3c";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawMarkers(ctx: CanvasRenderingContext2D) {
    for (const m of this.markers) {
      if (m.t <= 0) continue;
      ctx.fillStyle = `rgba(255,90,120,${0.22 + Math.sin(this.t * 22) * 0.16})`;
      ctx.fillRect(m.x - 22, this.cam.y - this.view.h / 2, 44, this.view.h);
    }
  }

  private drawEnemies(ctx: CanvasRenderingContext2D) {
    for (const e of this.enemies) {
      if (Math.abs(e.x - this.cam.x) > this.view.w / 2 + 160) continue;
      const st = ENEMY_STATS[e.kind];
      ctx.save();
      ctx.globalAlpha = e.state === "dead" ? Math.max(0, 1 - e.dying / 1.4) : 1;
      this.shadow(ctx, e.x, e.y + e.h / 2, e.w * 0.8);
      if (e.hitFlash > 0) ctx.filter = "brightness(2.6) saturate(0.2)";
      e.anim.draw(
        ctx,
        e.x,
        st.flies ? e.y : e.y + e.h / 2,
        e.face,
        st.scale,
        st.flies ? "centre" : "feet",
      );
      ctx.filter = "none";
      ctx.restore();

      if (e.state !== "dead" && e.hp < e.maxHp) {
        const w = e.w + 12;
        const y = e.y - e.h / 2 - 12;
        ctx.fillStyle = "rgba(10,6,20,0.72)";
        ctx.fillRect(e.x - w / 2, y, w, 5);
        ctx.fillStyle = "#ff5f86";
        ctx.fillRect(e.x - w / 2 + 1, y + 1, (w - 2) * (e.hp / e.maxHp), 3);
      }
    }
  }

  private drawBoss(ctx: CanvasRenderingContext2D) {
    const b = this.boss;
    if (!b) return;
    ctx.save();
    ctx.globalAlpha = b.alpha;
    this.shadow(ctx, b.x, b.y + b.h / 2, b.w * 1.3);
    if (b.hitFlash > 0) ctx.filter = "brightness(2.4) saturate(0.3)";
    b.anim.draw(ctx, b.x, b.y + b.h / 2, b.face, 2);
    ctx.filter = "none";
    ctx.restore();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const p = this.player;
    const info = HERO_INFO[this.heroId];
    ctx.save();
    // i-frames blink, but never so much that you lose track of yourself
    if (p.invuln > 0 && p.state !== "dead") {
      ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(this.t * 26));
    }
    for (const g of p.ghosts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, g.life / 0.18) * 0.34;
      p.anim.draw(ctx, g.x, g.y + p.h / 2, g.face, info.scale);
      ctx.restore();
    }
    this.shadow(ctx, p.x, p.y + p.h / 2, p.w * 1.1);
    if (p.attack === "pogo") {
      // the sheets have no downward stab, so the arc under the feet sells it
      const a = ATTACKS.pogo;
      const y = p.y + p.h / 2 + 10;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = "#ffe9a8";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(p.x, y - a.h * 0.4, a.w * 0.52, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
      ctx.restore();
    }
    if (p.charging) {
      const c = p.charge / SLAM_CHARGE;
      ctx.save();
      ctx.globalAlpha = 0.25 + c * 0.5;
      ctx.strokeStyle = "#ffd27a";
      ctx.lineWidth = 2 + c * 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 10, 40 + Math.sin(this.t * 20) * 4, 0, Math.PI * 2 * c);
      ctx.stroke();
      ctx.restore();
    }
    p.anim.draw(ctx, p.x, p.y + p.h / 2, p.face, info.scale);
    ctx.restore();
  }

  private drawShots(ctx: CanvasRenderingContext2D) {
    for (const s of this.shots) {
      ctx.save();
      ctx.translate(s.x, s.y);
      if (s.anim) {
        // thrown weapons point where they are going, but an impact stays level
        if (!s.burst) ctx.rotate(Math.atan2(s.vy, s.vx) + (s.vx < 0 ? Math.PI : 0));
        if (!s.burst && s.vx < 0) ctx.scale(1, -1);
        s.anim.draw(ctx, 0, 0, 1, s.scale ?? 1.5, "centre");
        ctx.restore();
        continue;
      }
      if (s.kind === "spear") {
        if (s.vx < 0) ctx.scale(-1, 1);
        ctx.fillStyle = "#ffe9a8";
        ctx.fillRect(-18, -2.5, 36, 5);
        ctx.beginPath();
        ctx.moveTo(18, -7);
        ctx.lineTo(30, 0);
        ctx.lineTo(18, 7);
        ctx.closePath();
        ctx.fill();
      } else if (s.kind === "wave") {
        const a = Math.max(0, s.life / s.maxLife);
        ctx.globalAlpha = a;
        ctx.strokeStyle = s.hostile ? "#c07bff" : "#ffd27a";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, s.r * (1.6 - a * 0.6), Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
      } else {
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, s.r * 1.8);
        g.addColorStop(0, s.kind === "meteor" ? "#ffd0a0" : "#e0b8ff");
        g.addColorStop(0.5, s.kind === "meteor" ? "#ff6a3d" : "#8f5bff");
        g.addColorStop(1, "rgba(120,60,220,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, s.r * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const q of this.parts) {
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.colour;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
  }

  private shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(x, y - 2, w / 2, w / 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Multiply an image toward a colour once, so the cave can reuse forest art. */
function tint(img: HTMLImageElement, colour: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext("2d");
  if (!x) return c;
  x.imageSmoothingEnabled = false;
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = "source-atop";
  x.fillStyle = colour;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}
