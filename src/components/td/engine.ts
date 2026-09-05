/**
 * Tower-defense core: waves, creeps, towers, soldiers, shots, economy, render.
 *
 * Same shape as the platformer engine — a fixed 1/60 step under a rAF loop, a
 * canvas it owns entirely, and three callbacks out to React. Nothing here
 * knows what a "goblin" is; the tables in units.ts and levels.ts decide, so
 * balancing never means touching the loop.
 *
 * The board is a fixed 960x540 world scaled to fit whatever canvas it gets, so
 * a level looks the same on every screen and a build slot is always where the
 * designer put it.
 */

import { Animator, loadAnimSet, loadImage, type AnimSet } from "../platformer/sprites";
import { drawSprite, loadAtlas, type Atlas } from "./atlas";
import { BOARD, LEVELS, loadLevel, waveSize, type Level } from "./levels";
import { MAPS } from "./maps";
import { distanceToPath, headingAt, pointAt, type Point } from "./path";
import {
  CREEPS, DIFFICULTIES, SELL_REFUND, TOWERS, applyDamage,
  type CreepDef, type CreepId, type DifficultyId, type TowerId,
} from "./units";

const STEP = 1 / 60;
const MAX_CATCHUP = 0.25;
/** Seconds of calm after a wave is cleared before the next one marches. */
const BETWEEN_WAVES = 12;
/** Calling a wave early pays this much gold per remaining second. */
const EARLY_BONUS = 2;
/** How long a tower spends playing its six firing frames. */
const FIRE_TIME = 0.42;
/** How long the eight-frame blast takes to burn out. */
const BLAST_TIME = 0.62;

/** Which painted projectile each weapon throws. */
const SHOT_ART: Record<"arrow" | "bolt" | "shell" | "rocket", string> = {
  arrow: "p.arrow", bolt: "p.bolt", shell: "p.bomb", rocket: "p.rocket",
};
/** The projectiles were all painted flying down-right, at 45 degrees. */
const SHOT_TILT = Math.PI / 4;

/**
 * Tower sheets by facing. An angle of zero points right and each quarter turn
 * clockwise is the next entry, which is the order the art was drawn in.
 */
const FACING = ["r", "d", "l", "u"];

export type Phase = "loading" | "playing" | "paused" | "won" | "lost";

export interface Hud {
  gold: number;
  lives: number;
  maxLives: number;
  wave: number;
  waves: number;
  /** seconds until the next wave marches on its own, null while one is running */
  countdown: number | null;
  earlyBonus: number;
  speed: 1 | 2;
  levelName: string;
  /** the slot the player has selected, if any */
  selected: SelectionInfo | null;
}

export interface SelectionInfo {
  slot: number;
  x: number;
  y: number;
  /** null on an empty slot — the build menu; otherwise the upgrade menu */
  tower: {
    id: TowerId;
    name: string;
    tier: number;
    upgradeCost: number | null;
    sellValue: number;
    range: number;
  } | null;
  affordable: Record<TowerId, boolean>;
}

export interface EngineHooks {
  onPhase: (p: Phase) => void;
  onHud: (h: Hud) => void;
  onToast: (t: { kind: "wave"; index: number } | { kind: "leak" } | { kind: "boss" }) => void;
}

/* --------------------------------- actors --------------------------------- */

interface Creep {
  id: CreepId;
  def: CreepDef;
  dist: number;
  hp: number;
  maxHp: number;
  anim: Animator | null;
  face: 1 | -1;
  /** while set, the creep stands and fights instead of walking */
  blocker: Soldier | null;
  swing: number;
  dead: boolean;
  dying: number;
  flash: number;
}

interface Soldier {
  x: number;
  y: number;
  hx: number;
  hy: number;
  hp: number;
  maxHp: number;
  damage: number;
  target: Creep | null;
  swing: number;
  dead: boolean;
  respawn: number;
  tower: Tower;
}

interface Tower {
  slot: number;
  x: number;
  y: number;
  id: TowerId;
  tier: number;
  cooldown: number;
  angle: number;
  /** seconds into the six-frame firing animation, negative when idle */
  fire: number;
  soldiers: Soldier[];
  /** barracks only: distance along the road the men hold */
  rally: number;
  spent: number;
}

interface Shot {
  x: number;
  y: number;
  target: Creep | null;
  tx: number;
  ty: number;
  speed: number;
  damage: number;
  kind: "physical" | "magic";
  art: "arrow" | "bolt" | "shell" | "rocket";
  splash: number;
  angle: number;
  life: number;
}

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  colour: string;
}

/** One playthrough of the blast sheet, left where a shell landed. */
interface Blast {
  x: number;
  y: number;
  t: number;
  scale: number;
}

interface Decor {
  x: number;
  y: number;
  kind: "tree" | "rock" | "bush";
  s: number;
}

/* -------------------------------- palette --------------------------------- */

interface Palette {
  /** darkest ground tone, the base the patches sit on */
  ground: string;
  /** lighter irregular patches scattered over it */
  patch: string;
  /** the walkable sand */
  road: string;
  /** the band just inside the road edge */
  roadEdge: string;
  /** the dark outline that separates road from ground */
  rim: string;
  pebble: string;
  foliage: string;
  foliageDark: string;
  accent: string;
}

const BIOMES: Record<"forest" | "cave" | "ember", Palette> = {
  forest: {
    ground: "#4a8a3c", patch: "#5aa347", road: "#e6d59b", roadEdge: "#d4bd80",
    rim: "#3b6b30", pebble: "#c7ad76", foliage: "#3f7d34", foliageDark: "#2d5c26",
    accent: "#c6d831",
  },
  cave: {
    ground: "#7a5a3f", patch: "#8d6b4b", road: "#e2cfa4", roadEdge: "#cbb488",
    rim: "#5b4230", pebble: "#b79a72", foliage: "#6b533c", foliageDark: "#4d3a2a",
    accent: "#ffb347",
  },
  ember: {
    ground: "#6d3a30", patch: "#824639", road: "#dcbb8e", roadEdge: "#c4a074",
    rim: "#4e2721", pebble: "#a87c5c", foliage: "#5c2f2a", foliageDark: "#3f1f1c",
    accent: "#ff6a3d",
  },
};

/** Cheap deterministic noise, so the same board wobbles the same way twice. */
function noise1(x: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

export class TdEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private hooks: EngineHooks;

  private level!: Level;
  private levelIdx = 0;
  private diff: DifficultyId = "normal";

  private creepSets: Partial<Record<string, AnimSet>> = {};
  private atlas: Atlas | null = null;
  /** background paintings, kept by file name so a replay costs no download */
  private maps: Record<string, HTMLImageElement> = {};
  private decor: Decor[] = [];

  private creeps: Creep[] = [];
  private towers: Tower[] = [];
  private shots: Shot[] = [];
  private puffs: Puff[] = [];
  private blasts: Blast[] = [];

  private gold = 0;
  private lives = 0;
  private maxLives = 0;
  private waveIdx = -1;
  private countdown = 0;
  private spawning: { creep: CreepId; left: number; gap: number; t: number }[] = [];
  private selected: number | null = null;

  private view = { scale: 1, ox: 0, oy: 0 };
  private t = 0;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private frame = 0;
  private running = false;
  private destroyed = false;
  speed: 1 | 2 = 1;
  phase: Phase = "loading";

  constructor(canvas: HTMLCanvasElement, hooks: EngineHooks) {
    this.canvas = canvas;
    this.hooks = hooks;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
  }

  /* ------------------------------- lifecycle ------------------------------- */

  async load() {
    const atlas = loadAtlas("./games/td");
    const maps = Promise.all(
      [...new Set(LEVELS.map((l) => l.map).filter(Boolean))].map(async (id) => {
        const file = MAPS[id as string].image;
        return [file, await loadImage(`./games/td/maps/${file}`).catch(() => null)] as const;
      }),
    );
    const kinds = [...new Set(Object.values(CREEPS).map((c) => c.sheet))];
    const sets = await Promise.all(
      kinds.map((sheet) =>
        loadAnimSet(`./games/platformer/${sheet}`, {
          walk: { file: sheet.includes("wizard") ? "run.png" : "run.png", frames: sheet.includes("skeleton") ? 4 : 8, fps: 11 },
          attack: { file: "attack.png", frames: 8, fps: 12, loop: false },
          death: { file: "death.png", frames: sheet.includes("wizard") ? 7 : 4, fps: 9, loop: false },
        }).catch(() => null),
      ),
    );
    this.atlas = await atlas;
    for (const [file, img] of await maps) {
      if (img) this.maps[file] = img;
    }
    if (this.destroyed) return;
    kinds.forEach((k, i) => {
      if (sets[i]) this.creepSets[k] = sets[i] as AnimSet;
    });
  }

  start(levelIdx: number, diff: DifficultyId) {
    this.levelIdx = levelIdx;
    this.diff = diff;
    this.reset();
    this.running = true;
    this.last = performance.now();
    this.loop();
  }

  private reset() {
    const d = DIFFICULTIES[this.diff];
    this.level = loadLevel(this.levelIdx);
    this.creeps = [];
    this.towers = [];
    this.shots = [];
    this.puffs = [];
    this.blasts = [];
    this.spawning = [];
    this.selected = null;
    this.gold = d.gold;
    this.lives = d.lives;
    this.maxLives = d.lives;
    this.waveIdx = -1;
    this.countdown = d.prep;
    this.decor = this.buildDecor();
    this.setPhase("playing");
    this.resize();
    this.emit();
  }

  restart() {
    this.reset();
  }

  destroy() {
    this.destroyed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setPaused(p: boolean) {
    if (this.phase !== "playing" && this.phase !== "paused") return;
    this.setPhase(p ? "paused" : "playing");
    if (!p) this.last = performance.now();
  }

  setSpeed(s: 1 | 2) {
    this.speed = s;
    this.emit();
  }

  private setPhase(p: Phase) {
    if (this.phase === p) return;
    this.phase = p;
    this.hooks.onPhase(p);
  }

  /**
   * Dress the board.
   *
   * Scenery is CLUSTERED, not sprinkled: a handful of seed points, each grown
   * into a thicket. Even scatter is what makes a hand-drawn map look
   * procedural, and it also fills the middle of the board — exactly where the
   * player needs clear ground to read the road and place towers. So clumps are
   * pushed toward the far side of the build band and the edges.
   */
  private buildDecor(): Decor[] {
    let seed = 9781 + this.levelIdx * 4517;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const out: Decor[] = [];
    const blocked = (x: number, y: number) =>
      distanceToPath(this.level.path, { x, y }) < 52 ||
      this.level.slots.some((s) => Math.hypot(s.x - x, s.y - y) < 40);

    for (let c = 0; c < 26; c++) {
      let cx = 0;
      let cy = 0;
      let ok = false;
      for (let tries = 0; tries < 40 && !ok; tries++) {
        cx = rnd() * BOARD.w;
        cy = rnd() * BOARD.h;
        const edge = Math.min(cx, cy, BOARD.w - cx, BOARD.h - cy);
        // favour the rim of the board and the deep pockets between road loops
        if (distanceToPath(this.level.path, { x: cx, y: cy }) < 110 && edge > 80) continue;
        ok = !blocked(cx, cy);
      }
      if (!ok) continue;
      const n = 3 + Math.floor(rnd() * 6);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const r = rnd() * 46;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (x < 8 || y < 8 || x > BOARD.w - 8 || y > BOARD.h - 8 || blocked(x, y)) continue;
        const k = rnd();
        out.push({
          x, y,
          kind: k < 0.5 ? "tree" : k < 0.82 ? "bush" : "rock",
          s: 0.65 + rnd() * 0.65,
        });
      }
    }
    // painter's order: things lower on the board overlap things above them
    out.sort((a, b) => a.y - b.y);
    return out;
  }

  /**
   * The road as a filled shape rather than a stroked line.
   *
   * A stroke gives a perfectly even ribbon, which is the one thing these maps
   * never look like. Sampling the centreline, smoothing the waypoint corners
   * and offsetting each side by a half-width that wanders gives the ragged
   * edge the style lives on — and it is the same shape every run, because the
   * wander comes from a hash of the distance rather than a random number.
   */
  private roadOutline(halfW: number, amp: number, seed: number): Point[] {
    const path = this.level.path;
    const step = 8;
    const mid: Point[] = [];
    for (let d = -20; d <= path.length + 20; d += step) mid.push(pointAt(path, d));
    // two smoothing passes round off the authored corners
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < mid.length - 1; i++) {
        mid[i] = {
          x: (mid[i - 1].x + mid[i].x * 2 + mid[i + 1].x) / 4,
          y: (mid[i - 1].y + mid[i].y * 2 + mid[i + 1].y) / 4,
        };
      }
    }
    const left: Point[] = [];
    const right: Point[] = [];
    for (let i = 0; i < mid.length; i++) {
      const a = mid[Math.max(0, i - 1)];
      const b = mid[Math.min(mid.length - 1, i + 1)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const wl = halfW + noise1(i * 0.38, seed) * amp;
      const wr = halfW + noise1(i * 0.38, seed + 17) * amp;
      left.push({ x: mid[i].x + nx * wl, y: mid[i].y + ny * wl });
      right.push({ x: mid[i].x - nx * wr, y: mid[i].y - ny * wr });
    }
    return [...left, ...right.reverse()];
  }

  private fillPoly(ctx: CanvasRenderingContext2D, poly: Point[], colour: string) {
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
  }

  /* ------------------------------ player input ----------------------------- */

  /** Canvas pixel -> board space. */
  private toBoard(px: number, py: number): Point {
    return { x: (px - this.view.ox) / this.view.scale, y: (py - this.view.oy) / this.view.scale };
  }

  pick(px: number, py: number) {
    const p = this.toBoard(px, py);
    let best = -1;
    let bestD = 34;
    this.level.slots.forEach((s, i) => {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    this.selected = best >= 0 ? best : null;
    this.emit();
  }

  clearSelection() {
    this.selected = null;
    this.emit();
  }

  build(id: TowerId) {
    if (this.selected === null) return;
    const slot = this.level.slots[this.selected];
    if (this.towers.some((t) => t.slot === this.selected)) return;
    const cost = TOWERS[id].tiers[0].cost;
    if (this.gold < cost) return;
    this.gold -= cost;
    const tower: Tower = {
      slot: this.selected, x: slot.x, y: slot.y, id, tier: 0,
      cooldown: 0, angle: 0, fire: -1, soldiers: [], rally: 0, spent: cost,
    };
    if (TOWERS[id].blocks) this.assignRally(tower);
    this.towers.push(tower);
    this.puff(slot.x, slot.y, 14, "#ffd45e");
    this.emit();
  }

  upgrade() {
    const t = this.towerAtSelection();
    if (!t || t.tier >= 2) return;
    const cost = TOWERS[t.id].tiers[t.tier + 1].cost;
    if (this.gold < cost) return;
    this.gold -= cost;
    t.spent += cost;
    t.tier++;
    if (TOWERS[t.id].blocks) {
      t.soldiers = [];
      this.assignRally(t);
    }
    this.puff(t.x, t.y, 16, "#c6d831");
    this.emit();
  }

  sell() {
    const t = this.towerAtSelection();
    if (!t) return;
    this.gold += Math.round(t.spent * SELL_REFUND);
    this.towers = this.towers.filter((x) => x !== t);
    for (const c of this.creeps) if (c.blocker && c.blocker.tower === t) c.blocker = null;
    this.puff(t.x, t.y, 12, "#a9c0b6");
    this.selected = null;
    this.emit();
  }

  /** March the next wave now and pocket the unspent countdown. */
  callWave() {
    if (this.phase !== "playing" || this.countdown <= 0) return;
    this.gold += Math.round(this.countdown * EARLY_BONUS);
    this.countdown = 0;
    this.emit();
  }

  private towerAtSelection(): Tower | undefined {
    if (this.selected === null) return undefined;
    return this.towers.find((t) => t.slot === this.selected);
  }

  /** Put a barracks' men on the nearest stretch of road inside its reach. */
  private assignRally(t: Tower) {
    const range = TOWERS[t.id].tiers[t.tier].range;
    let best = 0;
    let bestD = Infinity;
    for (let d = 0; d < this.level.path.length; d += 12) {
      const p = pointAt(this.level.path, d);
      const dist = Math.hypot(p.x - t.x, p.y - t.y);
      if (dist < bestD && dist <= range) {
        bestD = dist;
        best = d;
      }
    }
    t.rally = best;
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
      this.acc += dt * this.speed;
      while (this.acc >= STEP) {
        this.step(STEP);
        this.acc -= STEP;
      }
    }
    this.t += dt;
    this.render();
  };

  step(dt: number) {
    this.updateWaves(dt);
    this.updateCreeps(dt);
    this.updateTowers(dt);
    this.updateShots(dt);
    this.updateBlasts(dt);
    this.updatePuffs(dt);
    if ((this.frame = (this.frame + 1) % 10) === 0) this.emit();
  }

  /* --------------------------------- waves --------------------------------- */

  private get waves() {
    return this.level.def.waves;
  }

  private updateWaves(dt: number) {
    // trickle the current wave's groups onto the road
    for (const s of this.spawning) {
      s.t -= dt;
      while (s.left > 0 && s.t <= 0) {
        this.spawnCreep(s.creep);
        s.left--;
        s.t += s.gap;
      }
    }
    this.spawning = this.spawning.filter((s) => s.left > 0);

    const running = this.spawning.length > 0 || this.creeps.some((c) => !c.dead);
    if (running) return;

    if (this.waveIdx >= this.waves.length - 1) {
      if (this.phase === "playing") this.setPhase("won");
      return;
    }
    this.countdown -= dt;
    if (this.countdown <= 0) this.startWave();
  }

  private startWave() {
    this.waveIdx++;
    const wave = this.waves[this.waveIdx];
    this.spawning = wave.groups.map((g) => ({
      creep: g.creep, left: g.count, gap: g.gap, t: g.delay ?? 0,
    }));
    this.countdown = BETWEEN_WAVES;
    this.hooks.onToast({ kind: "wave", index: this.waveIdx + 1 });
    if (wave.groups.some((g) => CREEPS[g.creep].boss)) this.hooks.onToast({ kind: "boss" });
    this.emit();
  }

  private spawnCreep(id: CreepId) {
    const def = CREEPS[id];
    const set = this.creepSets[def.sheet];
    const hp = def.hp * DIFFICULTIES[this.diff].hp;
    this.creeps.push({
      id, def, dist: -20 - Math.random() * 30,
      hp, maxHp: hp,
      anim: set ? new Animator(set, "walk") : null,
      face: 1, blocker: null, swing: 0, dead: false, dying: 0, flash: 0,
    });
  }

  /* --------------------------------- creeps -------------------------------- */

  private updateCreeps(dt: number) {
    const path = this.level.path;
    for (const c of this.creeps) {
      c.anim?.update(dt);
      c.flash = Math.max(0, c.flash - dt);
      if (c.dead) {
        c.dying += dt;
        continue;
      }

      // a blocked creep stands and swings instead of advancing
      if (c.blocker && (c.blocker.dead || c.blocker.hp <= 0)) c.blocker = null;
      if (c.blocker) {
        c.swing -= dt;
        c.anim?.play("attack");
        if (c.swing <= 0) {
          c.swing = 1.1;
          c.blocker.hp -= Math.max(4, c.def.hp * 0.06);
          if (c.blocker.hp <= 0) {
            c.blocker.dead = true;
            c.blocker.respawn = 9;
            this.puff(c.blocker.x, c.blocker.y, 8, "#ff5f86");
            c.blocker = null;
          }
        }
        continue;
      }

      c.anim?.play("walk");
      c.dist += c.def.speed * dt;
      const h = headingAt(path, c.dist);
      c.face = h.x >= 0 ? 1 : -1;

      if (c.dist >= path.length) {
        this.lives -= c.def.leak;
        c.dead = true;
        c.dying = 99; // straight to removal, no corpse at the keep
        this.hooks.onToast({ kind: "leak" });
        this.emit();
        if (this.lives <= 0) {
          this.lives = 0;
          this.setPhase("lost");
        }
      }
    }
    this.creeps = this.creeps.filter((c) => !c.dead || c.dying < 1.1);
  }

  private hurtCreep(c: Creep, raw: number, kind: "physical" | "magic") {
    if (c.dead) return;
    c.hp -= applyDamage(raw, kind, c.def);
    c.flash = 0.1;
    if (c.hp <= 0) {
      c.dead = true;
      c.dying = 0;
      c.anim?.play("death", true);
      this.gold += Math.round(c.def.gold * DIFFICULTIES[this.diff].gold_rate);
      this.puff(this.creepPos(c).x, this.creepPos(c).y, 10, "#ffd45e");
      for (const s of this.towers.flatMap((t) => t.soldiers)) if (s.target === c) s.target = null;
      this.emit();
    }
  }

  private creepPos(c: Creep): Point {
    return pointAt(this.level.path, Math.max(0, c.dist));
  }

  /* --------------------------------- towers -------------------------------- */

  private updateTowers(dt: number) {
    for (const t of this.towers) {
      const def = TOWERS[t.id];
      const tier = def.tiers[t.tier];

      if (def.blocks) {
        this.updateBarracks(t, dt);
        continue;
      }

      // clamp: an idle tower used to run its cooldown off to minus infinity
      t.cooldown = Math.max(0, t.cooldown - dt);
      // ... and the firing animation runs once, then parks on the idle frame
      if (t.fire >= 0) t.fire = t.fire + dt > FIRE_TIME ? -1 : t.fire + dt;
      if (t.cooldown > 0) continue;

      // furthest along the road first: the closest to leaking is the threat
      let target: Creep | null = null;
      for (const c of this.creeps) {
        if (c.dead) continue;
        if (c.def.flying && !def.hitsAir) continue;
        const p = this.creepPos(c);
        if (Math.hypot(p.x - t.x, p.y - t.y) > tier.range) continue;
        if (!target || c.dist > target.dist) target = c;
      }
      if (!target) continue;

      const p = this.creepPos(target);
      t.angle = Math.atan2(p.y - t.y, p.x - t.x);
      t.cooldown = tier.reload;
      t.fire = 0;
      this.shots.push({
        x: t.x, y: t.y - 22, target, tx: p.x, ty: p.y,
        speed: def.projectile === "shell" ? 260 : 460,
        damage: tier.damage, kind: def.kind, art: def.projectile as Shot["art"],
        splash: tier.splash ?? 0, angle: t.angle, life: 3,
      });
    }
  }

  private updateBarracks(t: Tower, dt: number) {
    const tier = TOWERS[t.id].tiers[t.tier];
    const want = tier.soldiers ?? 0;
    while (t.soldiers.length < want) {
      const i = t.soldiers.length;
      const spread = (i - (want - 1) / 2) * 26;
      const p = pointAt(this.level.path, t.rally);
      const h = headingAt(this.level.path, t.rally);
      const hx = p.x - h.y * spread;
      const hy = p.y + h.x * spread;
      t.soldiers.push({
        x: hx, y: hy, hx, hy, hp: tier.soldierHp ?? 60, maxHp: tier.soldierHp ?? 60,
        damage: tier.soldierDamage ?? 5, target: null, swing: 0, dead: false, respawn: 0, tower: t,
      });
    }

    for (const s of t.soldiers) {
      if (s.dead) {
        s.respawn -= dt;
        if (s.respawn <= 0) {
          s.dead = false;
          s.hp = s.maxHp;
          s.x = s.hx;
          s.y = s.hy;
          s.target = null;
        }
        continue;
      }
      if (s.target && (s.target.dead || s.target.blocker !== s)) s.target = null;
      if (!s.target) {
        for (const c of this.creeps) {
          if (c.dead || c.blocker || c.def.flying || c.def.ignoresBlockers) continue;
          const p = this.creepPos(c);
          if (Math.hypot(p.x - s.hx, p.y - s.hy) > 40) continue;
          c.blocker = s;
          s.target = c;
          break;
        }
      }
      if (!s.target) continue;
      s.swing -= dt;
      if (s.swing <= 0) {
        s.swing = 0.9;
        this.hurtCreep(s.target, s.damage, "physical");
      }
    }
  }

  /* -------------------------------- shots ---------------------------------- */

  private updateShots(dt: number) {
    for (const s of this.shots) {
      s.life -= dt;
      if (s.target && !s.target.dead) {
        const p = this.creepPos(s.target);
        s.tx = p.x;
        s.ty = p.y;
      }
      const dx = s.tx - s.x;
      const dy = s.ty - s.y;
      const d = Math.hypot(dx, dy);
      s.angle = Math.atan2(dy, dx);
      const move = s.speed * dt;
      if (d <= move) {
        this.landShot(s);
        s.life = 0;
        continue;
      }
      s.x += (dx / d) * move;
      s.y += (dy / d) * move;
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  private landShot(s: Shot) {
    if (s.splash > 0) {
      for (const c of this.creeps) {
        if (c.dead || c.def.flying) continue;
        const p = this.creepPos(c);
        if (Math.hypot(p.x - s.tx, p.y - s.ty) <= s.splash) this.hurtCreep(c, s.damage, s.kind);
      }
      this.blasts.push({ x: s.tx, y: s.ty, t: 0, scale: Math.max(0.5, s.splash / 46) });
      this.puff(s.tx, s.ty, 10, "#ffb347");
    } else if (s.target && !s.target.dead) {
      this.hurtCreep(s.target, s.damage, s.kind);
      this.puff(s.tx, s.ty, 4, s.kind === "magic" ? "#b678ff" : "#ffe9a8");
    }
  }

  /* ------------------------------- particles ------------------------------- */

  private puff(x: number, y: number, n: number, colour: string) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 90;
      const life = 0.25 + Math.random() * 0.4;
      this.puffs.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        life, max: life, r: 1.5 + Math.random() * 2.5, colour,
      });
    }
  }

  private updateBlasts(dt: number) {
    for (const b of this.blasts) b.t += dt;
    this.blasts = this.blasts.filter((b) => b.t < BLAST_TIME);
  }

  private updatePuffs(dt: number) {
    for (const p of this.puffs) {
      p.life -= dt;
      p.vy += 130 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    if (this.puffs.length > 300) this.puffs.splice(0, this.puffs.length - 300);
    this.puffs = this.puffs.filter((p) => p.life > 0);
  }

  /* ---------------------------------- hud ---------------------------------- */

  private emit() {
    const sel = this.selected;
    let info: SelectionInfo | null = null;
    if (sel !== null) {
      const slot = this.level.slots[sel];
      const t = this.towers.find((x) => x.slot === sel);
      const affordable = {} as Record<TowerId, boolean>;
      (Object.keys(TOWERS) as TowerId[]).forEach((id) => {
        affordable[id] = this.gold >= TOWERS[id].tiers[0].cost;
      });
      info = {
        slot: sel, x: slot.x, y: slot.y, affordable,
        tower: t
          ? {
              id: t.id, name: TOWERS[t.id].name, tier: t.tier,
              upgradeCost: t.tier < 2 ? TOWERS[t.id].tiers[t.tier + 1].cost : null,
              sellValue: Math.round(t.spent * SELL_REFUND),
              range: TOWERS[t.id].tiers[t.tier].range,
            }
          : null,
      };
    }
    this.hooks.onHud({
      gold: Math.floor(this.gold),
      lives: this.lives,
      maxLives: this.maxLives,
      wave: Math.max(0, this.waveIdx + 1),
      waves: this.waves.length,
      countdown: this.spawning.length > 0 ? null : Math.max(0, this.countdown),
      earlyBonus: Math.round(Math.max(0, this.countdown) * EARLY_BONUS),
      speed: this.speed,
      levelName: this.level.def.name,
      selected: info,
    });
  }

  /* --------------------------------- render -------------------------------- */

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    const cssW = Math.max(320, r.width);
    const cssH = Math.max(200, r.height);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    // letterbox the fixed board so a slot is always where the level says
    const scale = Math.min(cssW / BOARD.w, cssH / BOARD.h) * dpr;
    this.view.scale = scale;
    this.view.ox = (cssW * dpr - BOARD.w * scale) / 2;
    this.view.oy = (cssH * dpr - BOARD.h * scale) / 2;
  }

  private render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0a1420";
    ctx.fillRect(0, 0, W, H);
    if (!this.level) return;
    ctx.setTransform(this.view.scale, 0, 0, this.view.scale, this.view.ox, this.view.oy);

    const pal = BIOMES[this.level.def.biome];
    const bg = this.level.image ? this.maps[this.level.image] : undefined;
    if (bg) {
      ctx.drawImage(bg, 0, 0, BOARD.w, BOARD.h);
    } else {
      this.drawGround(ctx, pal);
      this.drawRoad(ctx, pal);
      this.drawDecor(ctx, pal);
    }
    this.drawSlots(ctx, pal, !!bg);
    this.drawTowers(ctx);
    this.drawCreeps(ctx);
    this.drawSoldiers(ctx);
    this.drawShots(ctx);
    this.drawBlasts(ctx);
    this.drawPuffs(ctx);
  }

  /**
   * Ground in layers: a dark base, irregular lighter patches over it, then
   * pebbles. Three cheap passes, and the difference between "a game board"
   * and "a flat green rectangle" is entirely in the second one.
   */
  private drawGround(ctx: CanvasRenderingContext2D, pal: Palette) {
    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, 0, BOARD.w, BOARD.h);

    let seed = 4211 + this.levelIdx * 977;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

    // many small blobs, not a few huge ones: at this size they read as ground
    // texture, where the first attempt read as green clouds
    ctx.fillStyle = pal.patch;
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 120; i++) {
      const cx = rnd() * BOARD.w;
      const cy = rnd() * BOARD.h;
      const r = 10 + rnd() * 22;
      ctx.beginPath();
      for (let b = 0; b < 4; b++) {
        const a = (b / 4) * Math.PI * 2;
        const rr = r * (0.6 + rnd() * 0.45);
        ctx.moveTo(cx + Math.cos(a) * r * 0.35 + rr, cy + Math.sin(a) * r * 0.35);
        ctx.arc(cx + Math.cos(a) * r * 0.35, cy + Math.sin(a) * r * 0.35, rr, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = pal.pebble;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 150; i++) {
      const x = rnd() * BOARD.w;
      const y = rnd() * BOARD.h;
      const r = 1.4 + rnd() * 2.4;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawRoad(ctx: CanvasRenderingContext2D, pal: Palette) {
    const seed = this.levelIdx * 31 + 7;
    // dark rim, then the shoulder, then the lighter track worn down the middle
    this.fillPoly(ctx, this.roadOutline(35, 5, seed), pal.rim);
    this.fillPoly(ctx, this.roadOutline(29, 4.5, seed), pal.roadEdge);
    this.fillPoly(ctx, this.roadOutline(21, 3.5, seed + 5), pal.road);

    // gravel along the track, thinning toward the middle
    let s2 = 8123 + this.levelIdx * 613;
    const rnd = () => ((s2 = (s2 * 1664525 + 1013904223) >>> 0) / 4294967296);
    ctx.fillStyle = pal.pebble;
    ctx.globalAlpha = 0.55;
    const len = this.level.path.length;
    for (let i = 0; i < 220; i++) {
      const d = rnd() * len;
      const p = pointAt(this.level.path, d);
      const h = headingAt(this.level.path, d);
      const off = (rnd() * 2 - 1) * 26;
      const x = p.x - h.y * off;
      const y = p.y + h.x * off;
      const r = 1.2 + rnd() * 2;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawDecor(ctx: CanvasRenderingContext2D, pal: Palette) {
    for (const d of this.decor) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.scale(d.s, d.s);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(0, 4, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      if (d.kind === "tree") {
        ctx.fillStyle = "#5a3b28";
        ctx.fillRect(-3, -10, 6, 14);
        ctx.fillStyle = pal.foliageDark;
        ctx.beginPath();
        ctx.arc(-6, -18, 11, 0, Math.PI * 2);
        ctx.arc(7, -16, 10, 0, Math.PI * 2);
        ctx.arc(0, -26, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = pal.foliage;
        ctx.beginPath();
        ctx.arc(-4, -21, 9, 0, Math.PI * 2);
        ctx.arc(4, -25, 8, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.kind === "bush") {
        ctx.fillStyle = pal.foliageDark;
        ctx.beginPath();
        ctx.arc(-6, 0, 8, 0, Math.PI * 2);
        ctx.arc(6, -1, 9, 0, Math.PI * 2);
        ctx.arc(0, -6, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = pal.foliage;
        ctx.beginPath();
        ctx.arc(-3, -4, 6, 0, Math.PI * 2);
        ctx.arc(4, -5, 5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#7e8ba0";
        ctx.beginPath();
        ctx.moveTo(-9, 4);
        ctx.lineTo(-4, -8);
        ctx.lineTo(6, -6);
        ctx.lineTo(10, 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /**
   * On a painted map the pads are already there, so an empty one only needs a
   * hint that it can be clicked — a faint ring that firms up on hover. The
   * dashed square is for the drawn boards, where nothing marks the spot.
   */
  private drawSlots(ctx: CanvasRenderingContext2D, pal: Palette, painted = false) {
    this.level.slots.forEach((s, i) => {
      if (this.towers.some((t) => t.slot === i)) return;
      const on = this.selected === i;
      ctx.save();
      ctx.translate(s.x, s.y);
      if (painted) {
        const pulse = 0.5 + Math.sin(this.t * 2.4 + i) * 0.12;
        ctx.globalAlpha = on ? 0.95 : pulse;
        ctx.strokeStyle = on ? pal.accent : "rgba(255,255,255,0.8)";
        ctx.lineWidth = on ? 3 : 2;
        ctx.beginPath();
        ctx.arc(0, 0, on ? 26 : 22, 0, Math.PI * 2);
        ctx.stroke();
        // a hammer-and-anvil dot is more art than this needs; a plus reads as
        // "something goes here" at any size
        ctx.beginPath();
        ctx.moveTo(-7, 0);
        ctx.lineTo(7, 0);
        ctx.moveTo(0, -7);
        ctx.lineTo(0, 7);
        ctx.stroke();
      } else {
        ctx.globalAlpha = on ? 1 : 0.5;
        ctx.strokeStyle = on ? pal.accent : "rgba(255,255,255,0.55)";
        ctx.lineWidth = on ? 3 : 2;
        ctx.setLineDash(on ? [] : [6, 5]);
        ctx.beginPath();
        ctx.roundRect(-19, -19, 38, 38, 7);
        ctx.stroke();
        ctx.setLineDash([]);
        if (on) {
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = pal.accent;
          ctx.fill();
        }
      }
      ctx.restore();
    });
  }

  /**
   * A tower is one painted sheet of six frames: frame 0 is it standing there,
   * 1 to 5 are the shot. `t.fire` runs the strip once per volley and then
   * parks back on 0, so the board animates without the engine tracking any
   * animation state of its own.
   *
   * Tiers do not have their own art, so they read as a modest size step plus
   * the pips under the base — enough to tell three archer towers apart at a
   * glance without three times the art.
   *
   * The hand-drawn silhouettes below are still the fallback: they are what
   * the barracks uses, and what everything falls back to if the atlas fails
   * to load.
   */
  private drawTowers(ctx: CanvasRenderingContext2D) {
    for (const t of this.towers) {
      const sel = this.selected === t.slot;
      const tier = t.tier;
      const art = TOWERS[t.id].art;

      if (art) {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath();
        ctx.ellipse(t.x, t.y + 6, 24, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // one sheet per facing, six frames each: the tower turns to whichever
        // quarter it last aimed at and runs the six once per shot
        const face = FACING[(Math.round(t.angle / (Math.PI / 2)) + 4) % 4];
        const phase = t.fire < 0 ? 0 : Math.min(5, 1 + Math.floor((t.fire / FIRE_TIME) * 5));
        const name = `t.${art}.${tier + 1}.${face}`;
        if (drawSprite(ctx, this.atlas, name, t.x, t.y + 8, { frame: phase })) {
          this.drawTierPips(ctx, t.x, t.y + 12, tier);
          if (sel) this.drawRange(ctx, t);
          continue;
        }
      }

      const s = 1 + tier * 0.16;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(0, 12, 20 * s, 8 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.scale(s, s);

      // shared stone footing
      ctx.fillStyle = "#6f7b8c";
      ctx.beginPath();
      ctx.roundRect(-17, -6, 34, 20, 5);
      ctx.fill();
      ctx.fillStyle = "#59647a";
      ctx.fillRect(-17, 6, 34, 8);

      if (t.id === "archer") {
        ctx.fillStyle = "#8a5a33";
        ctx.fillRect(-12, -26, 24, 22);
        ctx.fillStyle = "#a86f3f";
        ctx.fillRect(-12, -26, 24, 5);
        ctx.fillStyle = "#c6d831";
        ctx.beginPath();
        ctx.moveTo(-15, -26);
        ctx.lineTo(0, -26 - 12 - tier * 3);
        ctx.lineTo(15, -26);
        ctx.closePath();
        ctx.fill();
      } else if (t.id === "mage") {
        ctx.fillStyle = "#5b5f84";
        ctx.beginPath();
        ctx.moveTo(-11, -6);
        ctx.lineTo(-8, -30);
        ctx.lineTo(8, -30);
        ctx.lineTo(11, -6);
        ctx.closePath();
        ctx.fill();
        const glow = 0.6 + Math.sin(this.t * 3 + t.slot) * 0.4;
        ctx.fillStyle = `rgba(150,110,255,${0.5 + glow * 0.5})`;
        ctx.beginPath();
        ctx.arc(0, -36 - tier * 2, 7 + tier, 0, Math.PI * 2);
        ctx.fill();
      } else if (t.id === "barracks") {
        ctx.fillStyle = "#7c6a4e";
        ctx.fillRect(-15, -24, 30, 20);
        ctx.fillStyle = "#93805f";
        ctx.fillRect(-15, -24, 30, 5);
        for (let i = -1; i <= 1; i++) {
          ctx.fillStyle = "#5a4d38";
          ctx.fillRect(i * 10 - 3, -20, 6, 8);
        }
        ctx.fillStyle = "#c6d831";
        ctx.fillRect(11, -38, 2, 16);
        ctx.beginPath();
        ctx.moveTo(13, -38);
        ctx.lineTo(13 + 12, -34);
        ctx.lineTo(13, -30);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = "#4f5a6b";
        ctx.beginPath();
        ctx.roundRect(-14, -22, 28, 18, 4);
        ctx.fill();
        ctx.save();
        ctx.translate(0, -18);
        ctx.rotate(t.angle);
        ctx.fillStyle = "#2f3744";
        ctx.fillRect(0, -5, 22 + tier * 4, 10);
        ctx.fillStyle = "#3d4757";
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();
      this.drawTierPips(ctx, t.x, t.y + 16 * s, tier);
      if (sel) this.drawRange(ctx, t);
    }
  }

  private drawTierPips(ctx: CanvasRenderingContext2D, x: number, y: number, tier: number) {
    ctx.fillStyle = "#ffd45e";
    for (let i = 0; i <= tier; i++) ctx.fillRect(x - 8 + i * 7, y, 5, 3);
  }

  private drawRange(ctx: CanvasRenderingContext2D, t: Tower) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.arc(t.x, t.y, TOWERS[t.id].tiers[t.tier].range, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawCreeps(ctx: CanvasRenderingContext2D) {
    // draw the ones further down the road last, so they overlap correctly
    const order = [...this.creeps].sort((a, b) => a.dist - b.dist);
    for (const c of order) {
      const p = this.creepPos(c);
      ctx.save();
      ctx.globalAlpha = c.dead ? Math.max(0, 1 - c.dying / 1.1) : 1;
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 8, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      if (c.flash > 0) ctx.filter = "brightness(2.4) saturate(0.3)";
      if (c.anim) {
        c.anim.draw(ctx, p.x, p.y + 10, c.face, c.def.scale, c.def.flying ? "centre" : "feet");
      } else {
        ctx.fillStyle = "#ff5f86";
        ctx.fillRect(p.x - 8, p.y - 16, 16, 24);
      }
      ctx.filter = "none";
      ctx.restore();

      if (!c.dead && c.hp < c.maxHp) {
        const w = c.def.boss ? 60 : 26;
        const y = p.y - (c.def.boss ? 62 : 34);
        ctx.fillStyle = "rgba(6,12,20,0.8)";
        ctx.fillRect(p.x - w / 2, y, w, 5);
        ctx.fillStyle = c.def.boss ? "#ff2e88" : "#7ee06a";
        ctx.fillRect(p.x - w / 2 + 1, y + 1, (w - 2) * Math.max(0, c.hp / c.maxHp), 3);
      }
    }
  }

  private drawSoldiers(ctx: CanvasRenderingContext2D) {
    for (const t of this.towers) {
      for (const s of t.soldiers) {
        if (s.dead) continue;
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + 7, 9, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#cfd9e6";
        ctx.fillRect(s.x - 5, s.y - 12, 10, 16);
        ctx.fillStyle = "#e8c48a";
        ctx.fillRect(s.x - 4, s.y - 18, 8, 7);
        ctx.fillStyle = "#c6d831";
        ctx.fillRect(s.x + 5, s.y - 16, 3, 16);
        ctx.restore();
        const f = s.hp / s.maxHp;
        if (f < 1) {
          ctx.fillStyle = "rgba(6,12,20,0.8)";
          ctx.fillRect(s.x - 10, s.y - 26, 20, 4);
          ctx.fillStyle = "#6ad0ff";
          ctx.fillRect(s.x - 9, s.y - 25, 18 * f, 2);
        }
      }
    }
  }

  private drawShots(ctx: CanvasRenderingContext2D) {
    for (const s of this.shots) {
      // The painted projectiles are drawn pointing down-right, so the sprite
      // is turned back to level before the shot's own heading is applied.
      if (drawSprite(ctx, this.atlas, SHOT_ART[s.art], s.x, s.y, {
        angle: s.angle - SHOT_TILT, centred: true,
      })) continue;

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      if (s.art === "arrow") {
        ctx.fillStyle = "#ffe9a8";
        ctx.fillRect(-8, -1.5, 16, 3);
      } else if (s.art === "bolt") {
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 9);
        g.addColorStop(0, "#e0b8ff");
        g.addColorStop(1, "rgba(140,80,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#3a4250";
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawBlasts(ctx: CanvasRenderingContext2D) {
    for (const b of this.blasts) {
      const frame = Math.floor((b.t / BLAST_TIME) * 8);
      if (drawSprite(ctx, this.atlas, "fx.blast", b.x, b.y + 6, {
        frame, scale: b.scale,
      })) continue;
      ctx.globalAlpha = Math.max(0, 1 - b.t / BLAST_TIME);
      ctx.fillStyle = "#ffb347";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 10 + b.t * 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawPuffs(ctx: CanvasRenderingContext2D) {
    for (const p of this.puffs) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.colour;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* --------------------------------- info ---------------------------------- */

  get levelCount() {
    return LEVELS.length;
  }
  get levelIndex() {
    return this.levelIdx;
  }
  get waveCount() {
    return this.waves.length;
  }
  get remainingLives() {
    return this.lives;
  }
  previewWave(i: number) {
    const wv = this.waves[i];
    return wv ? { size: waveSize(wv), kinds: wv.groups.map((g) => g.creep) } : null;
  }
}
