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

import { Animator, loadAnimSet, type AnimSet } from "../platformer/sprites";
import { BOARD, LEVELS, loadLevel, waveSize, type Level } from "./levels";
import { headingAt, pointAt, type Point } from "./path";
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
  art: "arrow" | "bolt" | "shell";
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

interface Decor {
  x: number;
  y: number;
  kind: "tree" | "rock" | "bush";
  s: number;
}

/* -------------------------------- palette --------------------------------- */

interface Palette {
  ground: string;
  ground2: string;
  road: string;
  rim: string;
  accent: string;
}

const BIOMES: Record<"forest" | "cave" | "ember", Palette> = {
  forest: { ground: "#2c645e", ground2: "#245450", road: "#b89a6a", rim: "#8a7047", accent: "#c6d831" },
  cave: { ground: "#153c4a", ground2: "#102f3b", road: "#7e8ba0", rim: "#5a6577", accent: "#5ee7c8" },
  ember: { ground: "#3d0f2c", ground2: "#310b24", road: "#a8703f", rim: "#7d4f2b", accent: "#ff6a3d" },
};

export class TdEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private hooks: EngineHooks;

  private level!: Level;
  private levelIdx = 0;
  private diff: DifficultyId = "normal";

  private creepSets: Partial<Record<string, AnimSet>> = {};
  private decor: Decor[] = [];

  private creeps: Creep[] = [];
  private towers: Tower[] = [];
  private shots: Shot[] = [];
  private puffs: Puff[] = [];

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
   * Scatter trees and rocks off the road. Seeded by the level index so the
   * scenery is part of the map rather than something that reshuffles on every
   * restart.
   */
  private buildDecor(): Decor[] {
    let seed = 9781 + this.levelIdx * 4517;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const out: Decor[] = [];
    const taken = (x: number, y: number) =>
      this.level.slots.some((s) => Math.hypot(s.x - x, s.y - y) < 46);
    for (let i = 0; i < 190; i++) {
      const x = rnd() * BOARD.w;
      const y = rnd() * BOARD.h;
      const d = Math.min(
        ...this.level.path.points.map((p) => Math.hypot(p.x - x, p.y - y)),
      );
      if (d < 62 || taken(x, y)) continue;
      const r = rnd();
      out.push({ x, y, kind: r < 0.42 ? "tree" : r < 0.72 ? "bush" : "rock", s: 0.7 + rnd() * 0.6 });
    }
    return out;
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
      cooldown: 0, angle: 0, soldiers: [], rally: 0, spent: cost,
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

      t.cooldown -= dt;
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
      this.shots.push({
        x: t.x, y: t.y - 14, target, tx: p.x, ty: p.y,
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
      this.puff(s.tx, s.ty, 14, "#ffb347");
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
    this.drawGround(ctx, pal);
    this.drawRoad(ctx, pal);
    this.drawDecor(ctx, pal);
    this.drawSlots(ctx, pal);
    this.drawTowers(ctx);
    this.drawCreeps(ctx);
    this.drawSoldiers(ctx);
    this.drawShots(ctx);
    this.drawPuffs(ctx);
  }

  private drawGround(ctx: CanvasRenderingContext2D, pal: Palette) {
    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, 0, BOARD.w, BOARD.h);
    // a coarse checker keeps a flat fill from looking like an empty canvas
    ctx.fillStyle = pal.ground2;
    for (let y = 0; y < BOARD.h; y += 48) {
      for (let x = ((y / 48) % 2) * 48; x < BOARD.w; x += 96) {
        ctx.fillRect(x, y, 48, 48);
      }
    }
  }

  private drawRoad(ctx: CanvasRenderingContext2D, pal: Palette) {
    const pts = this.level.path.points;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = pal.rim;
    ctx.lineWidth = 52;
    ctx.stroke();
    ctx.strokeStyle = pal.road;
    ctx.lineWidth = 42;
    ctx.stroke();
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
        ctx.fillRect(-3, -8, 6, 12);
        ctx.fillStyle = pal.accent;
        ctx.beginPath();
        ctx.arc(0, -18, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.beginPath();
        ctx.arc(4, -14, 9, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.kind === "bush") {
        ctx.fillStyle = pal.accent;
        ctx.beginPath();
        ctx.arc(-5, 0, 7, 0, Math.PI * 2);
        ctx.arc(5, -1, 8, 0, Math.PI * 2);
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

  private drawSlots(ctx: CanvasRenderingContext2D, pal: Palette) {
    this.level.slots.forEach((s, i) => {
      if (this.towers.some((t) => t.slot === i)) return;
      const on = this.selected === i;
      ctx.save();
      ctx.translate(s.x, s.y);
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
      ctx.restore();
    });
  }

  /**
   * Towers are drawn, not sprited: four silhouettes that read instantly at a
   * glance and simply grow with each tier, which is what a player needs from
   * a board this busy.
   */
  private drawTowers(ctx: CanvasRenderingContext2D) {
    for (const t of this.towers) {
      const sel = this.selected === t.slot;
      const tier = t.tier;
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

      // tier pips
      ctx.fillStyle = "#ffd45e";
      for (let i = 0; i <= tier; i++) ctx.fillRect(-8 + i * 7, 16, 5, 3);
      ctx.restore();

      if (sel) {
        const range = TOWERS[t.id].tiers[t.tier].range;
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.fillStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 6]);
        ctx.beginPath();
        ctx.arc(t.x, t.y, range, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
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
