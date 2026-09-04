/**
 * NEON RUN — a pseudo-3D "behind the car" arcade racer, rendered on a single
 * <canvas> with the classic OutRun / old-phone-racer road technique: the track
 * is a loop of fixed-length segments, each carrying a curve value; segments are
 * perspective-projected every frame and curves are faked by accumulating an
 * x-shift per row. No WebGL, no dependencies — pure 2D canvas at 60fps.
 *
 * Rendering is built for speed: everything reusable (sun, mountain ridges, the
 * car, bugs, coins, pylons) is pre-baked into offscreen canvases once per
 * resize — the hot loop is drawImage calls plus SEVEN batched Path2D fills for
 * the whole road (no per-frame gradients, no shadowBlur, opaque context). An
 * adaptive-quality governor drops the internal resolution on slow devices and
 * restores it when there is headroom.
 *
 * The engine owns the game loop, input, world state and rendering. React
 * (Arcade.tsx) owns the chrome around it (ready / game-over overlays) and is
 * driven through the `onState` / `onGameOver` callbacks.
 */

import { CAR_KEY, CAR_STYLES } from "./cars";

export type ArcadePhase = "ready" | "playing" | "crash" | "over" | "prompt";

export interface ArcadeOptions {
  onState: (phase: ArcadePhase) => void;
  onGameOver: (score: number, best: number, record: boolean, reachedGate: boolean) => void;
  /** Fired at the moment of a real (non-rewound) crash — for page-level effects. */
  onCrash?: () => void;
}

/* ---------------------------------- tuning ---------------------------------- */

const SEG_LEN = 200; // world units per track segment
const ROAD_W = 2200; // half-width of the road in world units
const CAM_H = 1050; // camera height above the road
const FOV = 100; // degrees
const DRAW = 190; // max segments projected ahead of the camera
const MIN_ROW_PX = 0.4; // rows thinner than this are culled (fog hides them)
const LANES = [-0.55, 0, 0.55]; // obstacle lanes (normalized -1..1 across the road)

const BASE_SPEED = 9500; // world units/s at difficulty 0
const MAX_EXTRA = 7500; // added on top of BASE_SPEED at difficulty 1
const ACCEL = 3600;
const BRAKE = 9000;
const OFFROAD_DECEL = 6200;
const OFFROAD_LIMIT = 0.92; // |playerX| beyond this = on the shoulder
const STEER_RATE = 2.0; // half-road-widths per second at full speed
const CENTRIFUGAL = 0.36;
const DIFF_TIME = 110; // seconds to reach max difficulty

// adaptive quality: internal-resolution caps, stepped down while our own
// update+render cost stays above SLOW_MS and back up when it is under FAST_MS
const QUALITY_STEPS = [1.5, 1.2, 1.0, 0.8];
const SLOW_MS = 9;
const FAST_MS = 4;
const SLOW_FRAMES = 45;
const FAST_FRAMES = 360;

const GRAZE_BAND = 0.18; // extra half-width beyond the hitbox that counts as a near-miss
const REWIND_WINDOW = 1.5; // seconds to accept the Ctrl+Z offer
const REWIND_BACK = 0.55; // seconds of travel undone by a rewind
const INVULN_TIME = 1.2; // post-rewind mercy window

// career milestones shown as roadside signposts, then the hiring gate
const MILESTONES: [string, string][] = [
  ["2023", "FIRST COMMIT"],
  ["2024", "PERION AD-TECH"],
  ["550+", "CREATIVES SHIPPED"],
  ["2026", "AMIGO GAMING"],
  ["3+ YRS", "STILL DRIVING"],
];
const MILESTONE_VSEGS = [350, 850, 1400, 1950, 2500];
const GATE_VSEG = 3000; // ~50-55s in: the "YOUR COMPANY HERE?" finish gate

/** Obstacles are runtime errors: short tokens stay legible as the block grows. */
const ERROR_TOKENS = ["ERROR", "NaN", "NULL", "404", "undefined"];

const BEST_KEY = "portfolio-arcade-best";
const VIEW_KEY = "portfolio-arcade-view";
const TILT_KEY = "portfolio-arcade-tilt";
const TILT_DEADZONE = 3; // degrees of lean ignored around the calibrated zero
const TILT_RANGE = 19; // degrees past the deadzone for full steering lock
const WHEEL_TURN = 1.85; // rad of wheel rotation at full steer
const GAUGE_MAX = 650; // km/h at the end of the speedometer sweep

const COLORS = {
  sky0: "#0d0221",
  sky1: "#2b0a4e",
  ground: ["#120530", "#160a3a"],
  asphalt: ["#241543", "#1e1140"],
  rumble: ["#ff2e88", "#3b1a5e"],
  lane: "rgba(0, 229, 255, 0.7)",
  fogTo: "#1a0a3d",
  magenta: "#ff2e88",
  cyan: "#00e5ff",
  amber: "#ffb800",
  violet: "#a855f7",
  text: "#f3ecff",
};

/* --------------------------------- helpers --------------------------------- */

interface Sprite {
  vseg: number; // virtual (monotonic, non-wrapping) segment index
  offset: number; // -1..1 across the road (beyond ±1 = roadside)
  type: "bug" | "coin" | "pylon" | "sign" | "milestone" | "gate";
  /** sign variant: 0 billboard, 1 deploy station, 2 thanks marquee */
  variant?: number;
  taken?: boolean;
}

interface Row {
  x: number; // screen x of the road centre (near edge)
  y: number;
  halfW: number; // screen half-width of the road (near edge)
  x2: number; // same for the far edge
  y2: number;
  halfW2: number;
}

/** Deterministic tiny PRNG so the track and skyline are stable across mounts. */
function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A baked image: starts as a canvas, asynchronously promoted to a GPU-resident ImageBitmap. */
type Baked = HTMLCanvasElement | ImageBitmap;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  return [c, ctx];
}

/** Rounded-rect path helper (roundRect with a plain-rect fallback). */
function rrect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Bake an emoji glyph into an offscreen canvas (drawImage ≫ per-frame fillText). */
function bakeEmoji(glyph: string, size: number): HTMLCanvasElement {
  const pad = Math.round(size * 0.18);
  const [c, ctx] = makeCanvas(size + pad * 2, size + pad * 2);
  ctx.font = `${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, c.width / 2, c.height / 2 + size * 0.04);
  return c;
}

/**
 * A red "runtime error" road block: neon-bordered panel with the error token,
 * baked at 2x. Two variants per token — idle and flashing — so the blink in the
 * game loop is a sprite swap rather than per-frame glow work.
 */
function bakeErrorBlock(token: string, flash: boolean): HTMLCanvasElement {
  const W = 320;
  const H = 192;
  const [c, ctx] = makeCanvas(W, H);
  const pad = 26; // room for the baked glow
  const x = pad;
  const y = pad;
  const w = W - pad * 2;
  const h = H - pad * 2;

  const edge = flash ? "#ffe9ec" : "#ff3355";
  const glow = flash ? "rgba(255, 90, 120, 0.95)" : "rgba(255, 45, 80, 0.7)";

  /* body + baked outer glow */
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = flash ? 34 : 20;
  const fill = ctx.createLinearGradient(0, y, 0, y + h);
  fill.addColorStop(0, flash ? "#4a0a18" : "#2a0512");
  fill.addColorStop(1, flash ? "#2a0510" : "#16030a");
  ctx.fillStyle = fill;
  rrect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.restore();

  /* CRT scanlines inside the panel */
  ctx.save();
  rrect(ctx, x, y, w, h, 16);
  ctx.clip();
  ctx.fillStyle = "rgba(255, 60, 90, 0.09)";
  for (let sy2 = y; sy2 < y + h; sy2 += 6) ctx.fillRect(x, sy2, w, 2);
  ctx.restore();

  /* neon border, doubled for a hot inner edge */
  ctx.strokeStyle = edge;
  ctx.lineWidth = flash ? 7 : 5;
  rrect(ctx, x, y, w, h, 16);
  ctx.stroke();
  ctx.strokeStyle = flash ? "rgba(255,255,255,0.95)" : "rgba(255, 140, 165, 0.55)";
  ctx.lineWidth = 2;
  rrect(ctx, x + 7, y + 7, w - 14, h - 14, 10);
  ctx.stroke();

  /* corner ticks — reads as a warning marker even when the text is tiny */
  ctx.strokeStyle = edge;
  ctx.lineWidth = 4;
  const tick = 14;
  for (const [cx2, cy2, dx, dy] of [
    [x + 4, y + 4, 1, 1],
    [x + w - 4, y + 4, -1, 1],
    [x + 4, y + h - 4, 1, -1],
    [x + w - 4, y + h - 4, -1, -1],
  ] as [number, number, number, number][]) {
    ctx.beginPath();
    ctx.moveTo(cx2 + dx * tick, cy2);
    ctx.lineTo(cx2, cy2);
    ctx.lineTo(cx2, cy2 + dy * tick);
    ctx.stroke();
  }

  /* the token, auto-fitted so even "undefined" stays inside the panel */
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 46;
  const maxW = w - 34;
  do {
    ctx.font = `${size}px "Press Start 2P", monospace`;
    if (ctx.measureText(token).width <= maxW) break;
    size -= 2;
  } while (size > 10);
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = flash ? 18 : 10;
  ctx.fillStyle = flash ? "#ffffff" : "#ffc2cc";
  ctx.fillText(token, W / 2, H / 2 + 2);
  ctx.restore();

  return c;
}

/** Minimal WebAudio blips — created lazily on the first user gesture. */
class Beeper {
  private ctx: AudioContext | null = null;

  private ensure(): AudioContext | null {
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(freq0: number, freq1: number, dur: number, type: OscillatorType, vol: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      osc.type = type;
      osc.frequency.setValueAtTime(freq0, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {
      /* ignore */
    }
  }

  coin() {
    this.tone(880, 1720, 0.09, "square", 0.05);
  }
  go() {
    this.tone(440, 880, 0.16, "square", 0.06);
  }
  graze(streak: number) {
    const f = 620 * Math.pow(1.09, Math.min(streak, 12));
    this.tone(f, f * 1.6, 0.07, "square", 0.045);
  }
  alert() {
    this.tone(980, 660, 0.09, "square", 0.06);
    this.tone(660, 980, 0.09, "square", 0.06);
  }
  rewind() {
    this.tone(1400, 240, 0.22, "sawtooth", 0.05);
    this.tone(240, 900, 0.18, "square", 0.05);
  }
  fanfare() {
    this.tone(523, 523, 0.12, "square", 0.06);
    this.tone(659, 659, 0.12, "square", 0.06);
    this.tone(784, 1046, 0.25, "square", 0.07);
  }
  crash() {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const dur = 0.35;
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      src.buffer = buf;
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(gain).connect(ctx.destination);
      src.start(t);
    } catch {
      /* ignore */
    }
  }
  destroy() {
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
  }
}

/* ---------------------------------- engine ---------------------------------- */

export class ArcadeEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private opts: ArcadeOptions;
  private beeper = new Beeper();

  private camDepth = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
  private playerZoff = CAM_H * this.camDepth;

  // track: loop of per-segment curve values
  private curves: Float32Array;
  private trackSegs: number;

  // world state
  private phase: ArcadePhase = "ready";
  private position = 0; // camera z, monotonic (never wraps)
  private speed = 0;
  private playerX = 0; // -1..1 = on the road
  private elapsed = 0;
  private score = 0;
  private coins = 0;
  private best = 0;
  private crashT = 0;
  private sprites: Sprite[] = [];
  private nextObstacle = 0; // virtual segment of the next obstacle spawn
  private nextPylon = 0;
  private nextSign = 0;
  private nextMilestone = 0;
  private gateSpawned = false;
  private gatePassed = false;
  // Ctrl+Z (one rewind per run) + close-call state
  private rewindCharge = true;
  private promptT = 0;
  private invulnT = 0;
  private rewindFxT = 0;
  private grazeStreak = 0;
  private grazeCooldown = 10;
  private timeDilate = 0;
  private toasts: { text: string; t: number; color: string }[] = [];
  private confetti: { x: number; y: number; vx: number; vy: number; color: string; life: number }[] = [];
  private night = false;
  // garage selection (index into CAR_STYLES)
  private carIdx = 0;
  // camera: chase (behind the car) or cockpit (behind the wheel)
  private viewMode: "chase" | "cockpit" = "chase";
  private camHCur = CAM_H;
  private wheelD = 0;
  private skyOff = 0;
  private steerVis = 0; // smoothed steer for car tilt

  // input
  private keyL = false;
  private keyR = false;
  private keyBrake = false;
  private touchL = false;
  private touchR = false;
  private activePointers = new Map<number, "l" | "r">();
  // tilt steering (mobile): analog -1..1, opt-in, zero-calibrated per run
  private tiltEnabled = false;
  private tiltPending = false; // stored preference awaiting a user gesture (iOS)
  private tiltZero: number | null = null;
  private tiltSteer = 0;

  // frame plumbing
  private raf = 0;
  private lastT = 0;
  private W = 0;
  private H = 0;
  private rows: Row[] = [];
  private rowsDrawn = 0;
  private stars: { x: number; y: number; r: number; bucket: number }[] = [];
  private mountainPts: number[] = [];
  private mountain2Pts: number[] = [];
  private resizeObs: ResizeObserver;
  private destroyed = false;

  // adaptive quality + fps meter
  private bakeGen = 0;
  private dprQuery: MediaQueryList | null = null;
  private qualityIdx = 0;
  private costEma = 0;
  private slowRun = 0;
  private fastRun = 0;
  private fps = 60;
  private showFps = false;

  // pre-baked art (rebuilt on resize where size-dependent)
  /** [token][0 = idle, 1 = flashing] — the blink is a sprite swap, not a repaint */
  private errSprites: Baked[][] = [];
  private boomSprite: Baked;
  private coinSprite: Baked;
  // roadside cameos of the portfolio page's 2D roadside props
  private signSprites: Baked[] = [];
  private milestoneSprites: Baked[] = [];
  private gateSprite: Baked | null = null;
  private nightSprite: Baked | null = null; // blackout darkness w/ headlight cone
  private scanSprite: Baked | null = null; // VHS scanlines for the Ctrl+Z prompt
  private cockpitSprite: Baked | null = null; // static interior: dash, pillars, mirror
  private wheelSprite: Baked | null = null; // steering wheel + hands, rotated per frame
  private gaugeSprite: Baked | null = null; // speedometer face (needle drawn live)
  private carSprite: Baked | null = null;
  private carSpriteBrake: Baked | null = null;
  private sunSprite: Baked | null = null;
  private ridge1: Baked | null = null;
  private ridge2: Baked | null = null;
  // gradient fills re-tessellate every frame (~1ms full-screen), so the sky
  // and fog bands are rasterized once into offscreen canvases instead
  private skySprite: Baked | null = null;
  private fogSprite: Baked | null = null;

  constructor(canvas: HTMLCanvasElement, opts: ArcadeOptions) {
    this.canvas = canvas;
    this.opts = opts;
    // opaque canvas: the sky repaints every pixel, and alpha-less surfaces
    // composite measurably faster
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;

    try {
      this.best = parseInt(localStorage.getItem(BEST_KEY) ?? "0", 10) || 0;
    } catch {
      this.best = 0;
    }
    try {
      this.showFps = new URLSearchParams(window.location.search).has("fps");
    } catch {
      /* ignore */
    }
    try {
      if (localStorage.getItem(VIEW_KEY) === "cockpit") {
        this.viewMode = "cockpit";
        this.camHCur = CAM_H * 0.8;
      }
    } catch {
      /* ignore */
    }
    try {
      const c = parseInt(localStorage.getItem(CAR_KEY) ?? "0", 10);
      if (c >= 0 && c < CAR_STYLES.length) this.carIdx = c;
    } catch {
      /* ignore */
    }
    try {
      if (localStorage.getItem(TILT_KEY) === "1") {
        // iOS needs requestPermission() from a user gesture — defer to the
        // first tap; everywhere else the listener can start right away
        if (ArcadeEngine.tiltNeedsPermission()) this.tiltPending = true;
        else this.startTiltListener();
      }
    } catch {
      /* ignore */
    }

    // ---- build the looping track: straights and eased curves ----
    const parts: number[] = [];
    const rnd = mulberry(20260824);
    const section = (len: number, curve: number) => {
      const ramp = Math.min(24, len >> 2);
      for (let i = 0; i < len; i++) {
        const inR = Math.min(1, i / ramp);
        const outR = Math.min(1, (len - 1 - i) / ramp);
        parts.push(curve * Math.min(inR, outR));
      }
    };
    for (let i = 0; i < 34; i++) {
      section(40 + Math.floor(rnd() * 110), 0);
      const dir = rnd() < 0.5 ? -1 : 1;
      section(50 + Math.floor(rnd() * 90), dir * (2 + rnd() * 3.4));
    }
    this.curves = new Float32Array(parts);
    this.trackSegs = parts.length;

    // ---- static sky decorations ----
    const srnd = mulberry(777);
    for (let i = 0; i < 80; i++) {
      this.stars.push({
        x: srnd(),
        y: srnd() * 0.44,
        r: 0.5 + srnd() * 1.4,
        bucket: Math.floor(srnd() * 6),
      });
    }
    const ridge = (r: () => number, n: number, lo: number, hi: number): number[] => {
      const pts: number[] = [];
      for (let i = 0; i < n; i++) pts.push(lo + r() * (hi - lo));
      return pts;
    };
    this.mountainPts = ridge(mulberry(31337), 18, 0.04, 0.16);
    this.mountain2Pts = ridge(mulberry(1291), 12, 0.1, 0.26);

    // ---- size-independent sprite bakes ----
    ERROR_TOKENS.forEach((token, i) => {
      this.errSprites[i] = [];
      for (const flash of [false, true]) {
        const k = flash ? 1 : 0;
        const c = bakeErrorBlock(token, flash);
        this.errSprites[i][k] = c;
        this.promote(c, (b) => (this.errSprites[i][k] = b));
      }
    });
    const boom = bakeEmoji("💥", 160);
    this.boomSprite = boom;
    this.promote(boom, (b) => (this.boomSprite = b));
    const coin = this.bakeCoin();
    this.coinSprite = coin;
    this.promote(coin, (b) => (this.coinSprite = b));
    this.bakeSigns().forEach((sign, i) => {
      this.signSprites[i] = sign;
      this.promote(sign, (b) => (this.signSprites[i] = b));
    });
    this.bakeMilestones().forEach((m, i) => {
      this.milestoneSprites[i] = m;
      this.promote(m, (b) => (this.milestoneSprites[i] = b));
    });
    const gate = this.bakeGate();
    this.gateSprite = gate;
    this.promote(gate, (b) => (this.gateSprite = b));
    // blackout crossover: if the page's flashlight is on, race in the dark
    try {
      this.night = !!document.querySelector('[data-on="true"]');
    } catch {
      this.night = false;
    }

    // ---- listeners ----
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);

    this.resetWorld();
    this.resize();
    this.setPhase("ready");
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("deviceorientation", this.onTilt);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.dprQuery?.removeEventListener("change", this.onDprChange);
    this.resizeObs.disconnect();
    this.beeper.destroy();
    for (const b of [
      this.skySprite,
      this.fogSprite,
      this.sunSprite,
      this.ridge1,
      this.ridge2,
      this.carSprite,
      this.carSpriteBrake,
      ...this.errSprites.flat(),
      this.boomSprite,
      this.coinSprite,
      ...this.signSprites,
      ...this.milestoneSprites,
      this.gateSprite,
      this.nightSprite,
      this.scanSprite,
      this.cockpitSprite,
      this.wheelSprite,
      this.gaugeSprite,
    ]) {
      this.closeIfBitmap(b);
    }
  }

  private static tiltNeedsPermission(): boolean {
    const doe = DeviceOrientationEvent as unknown as
      | { requestPermission?: () => Promise<string> }
      | undefined;
    return typeof doe?.requestPermission === "function";
  }

  isTiltEnabled(): boolean {
    return this.tiltEnabled || this.tiltPending;
  }

  /**
   * Opt into tilt steering. Must be called from a user gesture on iOS
   * (requestPermission). Resolves to whether tilt is now active.
   */
  async enableTilt(): Promise<boolean> {
    try {
      if (ArcadeEngine.tiltNeedsPermission()) {
        const doe = DeviceOrientationEvent as unknown as {
          requestPermission: () => Promise<string>;
        };
        if ((await doe.requestPermission()) !== "granted") return false;
      }
      this.startTiltListener();
      try {
        localStorage.setItem(TILT_KEY, "1");
      } catch {
        /* ignore */
      }
      return true;
    } catch {
      return false;
    }
  }

  disableTilt() {
    window.removeEventListener("deviceorientation", this.onTilt);
    this.tiltEnabled = false;
    this.tiltPending = false;
    this.tiltSteer = 0;
    try {
      localStorage.setItem(TILT_KEY, "0");
    } catch {
      /* ignore */
    }
  }

  private startTiltListener() {
    if (this.destroyed) return;
    window.addEventListener("deviceorientation", this.onTilt);
    this.tiltEnabled = true;
    this.tiltPending = false;
    this.tiltZero = null; // calibrate to the current grip on the next reading
  }

  private onTilt = (e: DeviceOrientationEvent) => {
    // pick the left/right lean axis for the current screen orientation
    const angle =
      (screen.orientation?.angle ??
        (window as unknown as { orientation?: number }).orientation ??
        0) as number;
    let raw: number | null;
    if (angle === 90) raw = e.beta;
    else if (angle === 270 || angle === -90) raw = e.beta === null ? null : -e.beta;
    else if (angle === 180) raw = e.gamma === null ? null : -e.gamma;
    else raw = e.gamma;
    if (raw === null) return;
    if (this.tiltZero === null) this.tiltZero = raw;
    const delta = raw - this.tiltZero;
    const mag = Math.abs(delta);
    const target =
      mag <= TILT_DEADZONE
        ? 0
        : Math.sign(delta) * Math.min(1, (mag - TILT_DEADZONE) / TILT_RANGE);
    // low-pass: sensor jitter out, steering feel in
    this.tiltSteer += (target - this.tiltSteer) * 0.3;
  };

  /** Garage: swap the car and re-bake everything that wears its colors. */
  setCar(idx: number) {
    if (idx === this.carIdx || idx < 0 || idx >= CAR_STYLES.length) return;
    this.carIdx = idx;
    if (this.W > 0) this.rebuildStatic();
  }

  /** Switch between the chase camera and the in-car cockpit view. */
  toggleView() {
    this.viewMode = this.viewMode === "chase" ? "cockpit" : "chase";
    try {
      localStorage.setItem(VIEW_KEY, this.viewMode);
    } catch {
      /* ignore */
    }
  }

  /** (Re)start an actual run — from the ready screen or the game-over panel. */
  play() {
    this.resetWorld();
    this.tiltZero = null; // grip changes between runs — recalibrate
    this.setPhase("playing");
    this.beeper.go();
  }

  /* -------------------------------- state -------------------------------- */

  private setPhase(p: ArcadePhase) {
    this.phase = p;
    this.opts.onState(p);
  }

  private resetWorld() {
    this.position = 0;
    this.speed = 0;
    this.playerX = 0;
    this.elapsed = 0;
    this.score = 0;
    this.coins = 0;
    this.crashT = 0;
    this.skyOff = 0;
    this.steerVis = 0;
    this.sprites = [];
    // never drop an obstacle onto the player's bumper right at spawn
    this.nextObstacle = Math.floor(this.playerZoff / SEG_LEN) + 55;
    this.nextPylon = 0;
    this.nextSign = 30;
    this.nextMilestone = 0;
    this.gateSpawned = false;
    this.gatePassed = false;
    this.rewindCharge = true;
    this.promptT = 0;
    this.invulnT = 0;
    this.rewindFxT = 0;
    this.grazeStreak = 0;
    this.grazeCooldown = 10;
    this.timeDilate = 0;
    this.toasts = [];
    this.confetti = [];
  }

  /* ------------------------- crash / rewind flow ------------------------- */

  /** A hit: offer Ctrl+Z once per run, otherwise crash for real. */
  private tryCrash() {
    if (this.rewindCharge) {
      this.rewindCharge = false;
      this.promptT = REWIND_WINDOW;
      this.setPhase("prompt");
      this.beeper.alert();
    } else {
      this.realCrash();
    }
  }

  private realCrash() {
    this.crashT = 0;
    this.setPhase("crash");
    this.beeper.crash();
    this.opts.onCrash?.();
  }

  /** Accepted Ctrl+Z: roll the road back, clear the ambush, drive on. */
  private doRewind() {
    const back = Math.max(this.speed, BASE_SPEED * 0.6) * REWIND_BACK;
    this.position = Math.max(0, this.position - back);
    const pv = Math.floor((this.position + this.playerZoff) / SEG_LEN);
    for (const sp of this.sprites) {
      if (!sp.taken && sp.type === "bug" && sp.vseg >= pv - 2 && sp.vseg <= pv + 26) {
        sp.taken = true;
      }
    }
    this.speed *= 0.55;
    this.invulnT = INVULN_TIME;
    this.rewindFxT = 0.45;
    this.grazeStreak = 0;
    this.setPhase("playing");
    this.beeper.rewind();
  }

  private spawnConfetti() {
    const { W, H } = this;
    const colors = [COLORS.magenta, COLORS.cyan, COLORS.amber, "#aaff00", COLORS.violet];
    for (let i = 0; i < 90; i++) {
      this.confetti.push({
        x: W * (0.35 + Math.random() * 0.3),
        y: H * 0.75,
        vx: (Math.random() - 0.5) * 420,
        vy: -(260 + Math.random() * 380),
        color: colors[i % colors.length],
        life: 1.4 + Math.random() * 0.5,
      });
    }
  }

  /* -------------------------------- input -------------------------------- */

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") return; // React owns closing
    const k = e.key.toLowerCase();
    if (this.phase === "prompt") {
      // "z" (or RU-layout "я") accepts the Ctrl+Z offer
      if (k === "z" || k === "\u044f") {
        e.preventDefault();
        this.doRewind();
      }
      return;
    }
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "enter"].includes(k)) {
      e.preventDefault();
    }
    if (k === "c" || k === "\u0441") {
      // camera toggle ("\u0441" = RU-layout C); never doubles as "start".
      // edge-triggered, so ignore OS key auto-repeat
      if (!e.repeat) this.toggleView();
      return;
    }
    if (k === "arrowleft" || k === "a") this.keyL = true;
    if (k === "arrowright" || k === "d") this.keyR = true;
    if (k === "arrowdown" || k === "s") this.keyBrake = true;
    if (this.phase === "ready") {
      // the garage owns the keyboard: arrows browse cars (React), Tab moves
      // focus, letters do nothing — only an explicit confirm starts the run
      if (k === "enter" || k === " ") this.play();
    }
    else if (this.phase === "over" && (k === "enter" || k === " ")) this.play();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") this.keyL = false;
    if (k === "arrowright" || k === "d") this.keyR = false;
    if (k === "arrowdown" || k === "s") this.keyBrake = false;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.tiltPending) {
      // stored tilt preference: the first tap is our user gesture on iOS
      this.tiltPending = false;
      void this.enableTilt();
    }
    if (this.phase === "ready") {
      this.play();
      return;
    }
    if (this.phase === "prompt") {
      this.doRewind();
      return;
    }
    const side = e.clientX < window.innerWidth / 2 ? "l" : "r";
    this.activePointers.set(e.pointerId, side);
    this.syncTouch();
  };

  private onPointerUp = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    this.syncTouch();
  };

  /** Losing window focus never delivers keyup/pointerup — reset all input. */
  private onBlur = () => {
    this.keyL = false;
    this.keyR = false;
    this.keyBrake = false;
    this.activePointers.clear();
    this.syncTouch();
    this.tiltZero = null; // re-zero after the phone was set down / app switched
  };

  private syncTouch() {
    this.touchL = false;
    this.touchR = false;
    this.activePointers.forEach((side) => {
      if (side === "l") this.touchL = true;
      else this.touchR = true;
    });
  }

  /* -------------------------------- update -------------------------------- */

  private curveAt(vseg: number): number {
    return this.curves[((vseg % this.trackSegs) + this.trackSegs) % this.trackSegs];
  }

  private difficulty(): number {
    return Math.min(1, this.elapsed / DIFF_TIME);
  }

  private update(dt: number) {
    const attract = this.phase === "ready";
    if (this.phase === "over") return;

    if (this.phase === "prompt") {
      this.promptT -= dt;
      if (this.promptT <= 0) this.realCrash();
      return;
    }

    // close-call slow-mo + short-lived FX timers
    if (this.timeDilate > 0) {
      this.timeDilate -= dt;
      dt *= 0.5;
    }
    this.grazeCooldown += dt;
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.rewindFxT = Math.max(0, this.rewindFxT - dt);
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].t += dt;
      if (this.toasts[i].t > 0.9) this.toasts.splice(i, 1);
    }
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const p = this.confetti[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.confetti.splice(i, 1);
        continue;
      }
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    if (this.phase === "crash") {
      this.crashT += dt;
      this.speed = Math.max(0, this.speed - 26000 * dt);
      if (this.crashT > 0.95) {
        const score = Math.round(this.score);
        const record = score > this.best;
        if (record) {
          this.best = score;
          try {
            localStorage.setItem(BEST_KEY, String(score));
          } catch {
            /* ignore */
          }
        }
        this.setPhase("over");
        this.opts.onGameOver(score, this.best, record, this.gatePassed);
      }
      return;
    }

    this.elapsed += dt;
    const diff = this.difficulty();
    const maxSpeed = attract ? BASE_SPEED * 0.45 : BASE_SPEED + MAX_EXTRA * diff;
    const speedPct = this.speed / (BASE_SPEED + MAX_EXTRA);

    // auto-accelerate (old-phone style); ↓/S brakes
    if (!attract && this.keyBrake) this.speed = Math.max(0, this.speed - BRAKE * dt);
    else this.speed = Math.min(maxSpeed, this.speed + ACCEL * dt);

    const baseVSeg = Math.floor(this.position / SEG_LEN);
    const playerVSeg = Math.floor((this.position + this.playerZoff) / SEG_LEN);
    const curve = this.curveAt(playerVSeg);

    // steering + centrifugal pull on curves
    const digital = (this.keyR || this.touchR ? 1 : 0) - (this.keyL || this.touchL ? 1 : 0);
    const steer = attract ? 0 : digital !== 0 ? digital : this.tiltEnabled ? this.tiltSteer : 0;
    this.steerVis += (steer - this.steerVis) * Math.min(1, dt * 14);
    // responsiveness floor: the wheel bites even at low speed
    this.playerX += steer * STEER_RATE * (0.55 + 0.55 * speedPct) * dt;
    this.playerX -= curve * CENTRIFUGAL * speedPct * speedPct * dt;
    if (attract) this.playerX *= 1 - Math.min(1, dt * 3); // attract mode stays centred
    this.playerX = Math.max(-2.2, Math.min(2.2, this.playerX));

    // shoulder: slow down hard
    if (Math.abs(this.playerX) > OFFROAD_LIMIT && this.speed > maxSpeed * 0.35) {
      this.speed = Math.max(maxSpeed * 0.35, this.speed - OFFROAD_DECEL * dt);
    }

    this.position += this.speed * dt;
    this.skyOff += curve * speedPct * dt * 46;
    if (!attract) this.score += this.speed * dt * 0.0022;

    // ---- spawn obstacles / coins ahead, cull behind ----
    const horizon = baseVSeg + DRAW;
    while (this.nextObstacle < horizon) {
      const lane = LANES[Math.floor(Math.random() * LANES.length)] + (Math.random() - 0.5) * 0.16;
      if (Math.random() < 0.62) {
        this.sprites.push({
          vseg: this.nextObstacle,
          offset: lane,
          type: "bug",
          variant: Math.floor(Math.random() * ERROR_TOKENS.length),
        });
      } else {
        const n = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          this.sprites.push({ vseg: this.nextObstacle + i * 3, offset: lane, type: "coin" });
        }
      }
      const gap = Math.round(34 - 18 * diff + Math.random() * 18);
      this.nextObstacle += Math.max(12, gap);
    }
    while (this.nextPylon < horizon) {
      const off = 1.75 + Math.random() * 0.5;
      this.sprites.push({ vseg: this.nextPylon, offset: -off, type: "pylon" });
      this.sprites.push({ vseg: this.nextPylon, offset: off, type: "pylon" });
      this.nextPylon += 9;
    }
    // occasional roadside cameos from the page's 2D world (billboard & friends)
    while (this.nextSign < horizon) {
      const side = Math.random() < 0.5 ? -1 : 1;
      this.sprites.push({
        vseg: this.nextSign,
        offset: side * (2.4 + Math.random() * 0.25),
        type: "sign",
        variant: Math.floor(Math.random() * 3),
      });
      this.nextSign += 55 + Math.round(Math.random() * 55);
    }
    // career milestones at fixed marks, then the hiring gate
    while (
      this.nextMilestone < MILESTONE_VSEGS.length &&
      MILESTONE_VSEGS[this.nextMilestone] < horizon
    ) {
      this.sprites.push({
        vseg: MILESTONE_VSEGS[this.nextMilestone],
        offset: (this.nextMilestone % 2 === 0 ? 1 : -1) * 2.45,
        type: "milestone",
        variant: this.nextMilestone,
      });
      this.nextMilestone++;
    }
    if (!this.gateSpawned && GATE_VSEG < horizon) {
      this.gateSpawned = true;
      this.sprites.push({ vseg: GATE_VSEG, offset: 0, type: "gate" });
    }
    if (this.sprites.length && this.sprites[0].vseg < baseVSeg - 2) {
      this.sprites = this.sprites.filter((s) => s.vseg >= baseVSeg - 2);
    }

    // ---- collisions (skipped in attract mode) ----
    // The player can cross more than one segment per frame at speed, so test
    // every segment crossed this frame, not just the current one (tunneling).
    if (!attract) {
      const playerVSegAfter = Math.floor((this.position + this.playerZoff) / SEG_LEN);
      if (this.invulnT <= 0) {
        for (const s of this.sprites) {
          if (s.taken || s.vseg <= playerVSeg || s.vseg > playerVSegAfter) continue;
          if (s.type === "milestone" || s.type === "gate") continue; // story props, no hitbox
          // half-widths match the drawn sizes (+ half a car): bugs/pylons no
          // longer kill with visible daylight, coins are deliberately generous
          const w =
            s.type === "bug" ? 0.23 : s.type === "coin" ? 0.36 : s.type === "sign" ? 0.4 : 0.12;
          const adx = Math.abs(this.playerX - s.offset);
          if (s.type === "bug" && adx > w && adx <= w + GRAZE_BAND) {
            // close call! shaving past a bug pays — streak raises the stakes
            this.grazeStreak = this.grazeCooldown > 2.5 ? 1 : this.grazeStreak + 1;
            this.grazeCooldown = 0;
            const pts = 50 * this.grazeStreak;
            this.score += pts;
            this.timeDilate = 0.12;
            this.toasts.push({ text: `+${pts} CLOSE!`, t: 0, color: "#aaff00" });
            this.beeper.graze(this.grazeStreak);
            continue;
          }
          if (adx > w) continue;
          if (s.type === "coin") {
            s.taken = true;
            this.coins += 1;
            this.score += 100;
            this.beeper.coin();
          } else {
            this.tryCrash();
            break;
          }
        }
      }
      if (this.gateSpawned && !this.gatePassed && playerVSegAfter >= GATE_VSEG) {
        this.gatePassed = true;
        this.score += 2500;
        this.toasts.push({ text: "+2500 YOU MADE IT!", t: 0, color: COLORS.amber });
        this.spawnConfetti();
        this.beeper.fanfare();
      }
    }
  }

  /* --------------------------- sizes & static bakes --------------------------- */

  /** Re-armed one-shot listener: fires when the window moves to a monitor with a different dpr. */
  private onDprChange = () => this.resize();

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY_STEPS[this.qualityIdx]);
    try {
      this.dprQuery?.removeEventListener("change", this.onDprChange);
      this.dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      this.dprQuery.addEventListener("change", this.onDprChange, { once: true });
    } catch {
      this.dprQuery = null;
    }
    const sizeChanged = this.W !== Math.round(rect.width) || this.H !== Math.round(rect.height);
    this.W = Math.round(rect.width);
    this.H = Math.round(rect.height);
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (sizeChanged || !this.sunSprite) this.rebuildStatic();
  }

  /**
   * Asynchronously swap a baked canvas for a GPU-resident ImageBitmap: canvas
   * sources can be re-uploaded as textures on every drawImage, an ImageBitmap
   * is uploaded once. Falls back to the canvas silently where unsupported.
   */
  private promote(c: HTMLCanvasElement, assign: (b: Baked) => void, gen = -1) {
    if (typeof createImageBitmap !== "function") return;
    void createImageBitmap(c)
      .then((b) => {
        // drop promotions that lost to destroy() or to a newer bake generation
        if (this.destroyed || (gen >= 0 && gen !== this.bakeGen)) b.close();
        else assign(b);
      })
      .catch(() => {
        /* keep the canvas fallback */
      });
  }

  private closeIfBitmap(b: Baked | null) {
    if (typeof ImageBitmap !== "undefined" && b instanceof ImageBitmap) b.close();
  }

  /** Rebuild everything that depends on the CSS size (not on dpr). */
  private rebuildStatic() {
    const { W, H } = this;
    const horizonY = H / 2;
    const gen = ++this.bakeGen;
    // release the previous generation's GPU bitmaps before re-baking
    for (const old of [
      this.skySprite,
      this.fogSprite,
      this.sunSprite,
      this.ridge1,
      this.ridge2,
      this.carSprite,
      this.carSpriteBrake,
    ]) {
      this.closeIfBitmap(old);
    }

    {
      const [c, cctx] = makeCanvas(W, horizonY + 2);
      const grad = cctx.createLinearGradient(0, 0, 0, horizonY);
      grad.addColorStop(0, COLORS.sky0);
      grad.addColorStop(1, COLORS.sky1);
      cctx.fillStyle = grad;
      cctx.fillRect(0, 0, c.width, c.height);
      this.skySprite = c;
      this.promote(c, (b) => (this.skySprite = b), gen);
    }
    {
      const fogH = Math.max(2, H * 0.14);
      const [c, cctx] = makeCanvas(W, fogH);
      const grad = cctx.createLinearGradient(0, 0, 0, fogH);
      grad.addColorStop(0, COLORS.fogTo);
      grad.addColorStop(1, "rgba(26, 10, 61, 0)");
      cctx.fillStyle = grad;
      cctx.fillRect(0, 0, c.width, c.height);
      this.fogSprite = c;
      this.promote(c, (b) => (this.fogSprite = b), gen);
    }

    const sun = this.bakeSun(H * 0.21);
    this.sunSprite = sun;
    this.promote(sun, (b) => (this.sunSprite = b), gen);
    const r1 = this.bakeRidge(this.mountainPts, "#1e0d42");
    this.ridge1 = r1;
    this.promote(r1, (b) => (this.ridge1 = b), gen);
    const r2 = this.bakeRidge(this.mountain2Pts, "#170735");
    this.ridge2 = r2;
    this.promote(r2, (b) => (this.ridge2 = b), gen);

    const cw = Math.min(150, Math.max(96, W * 0.13));
    const car = this.bakeCar(cw, false);
    this.carSprite = car;
    this.promote(car, (b) => (this.carSprite = b), gen);
    const carB = this.bakeCar(cw, true);
    this.carSpriteBrake = carB;
    this.promote(carB, (b) => (this.carSpriteBrake = b), gen);

    this.closeIfBitmap(this.nightSprite);
    const night = this.bakeNight();
    this.nightSprite = night;
    this.promote(night, (b) => (this.nightSprite = b), gen);
    this.closeIfBitmap(this.scanSprite);
    const scan = this.bakeScanlines();
    this.scanSprite = scan;
    this.promote(scan, (b) => (this.scanSprite = b), gen);

    this.closeIfBitmap(this.cockpitSprite);
    const cockpit = this.bakeCockpit();
    this.cockpitSprite = cockpit;
    this.promote(cockpit, (b) => (this.cockpitSprite = b), gen);
    this.closeIfBitmap(this.wheelSprite);
    this.wheelD = Math.round(Math.min(W * 0.46, H * 0.82));
    const wheel = this.bakeWheel(this.wheelD);
    this.wheelSprite = wheel;
    this.promote(wheel, (b) => (this.wheelSprite = b), gen);
    this.closeIfBitmap(this.gaugeSprite);
    const gauge = this.bakeGauge(Math.round(Math.min(H * 0.15, W * 0.18)));
    this.gaugeSprite = gauge;
    this.promote(gauge, (b) => (this.gaugeSprite = b), gen);
  }

  /** Synthwave sun: gradient disc with horizontal slices + baked outer glow. */
  private bakeSun(r: number): HTMLCanvasElement {
    const pad = r * 0.45;
    const size = (r + pad) * 2;
    const [c, ctx] = makeCanvas(size, size);
    const cx = size / 2;
    ctx.save();
    ctx.shadowColor = "rgba(255, 46, 136, 0.85)";
    ctx.shadowBlur = r * 0.42;
    ctx.beginPath();
    ctx.arc(cx, cx, r, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.magenta;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cx, r, 0, Math.PI * 2);
    ctx.clip();
    const grad = ctx.createLinearGradient(0, cx - r, 0, cx + r);
    grad.addColorStop(0, COLORS.amber);
    grad.addColorStop(0.55, COLORS.magenta);
    grad.addColorStop(1, COLORS.violet);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cx - r, r * 2, r * 2);
    ctx.fillStyle = COLORS.sky0;
    for (let i = 0; i < 7; i++) {
      const yy = cx + r * (0.12 + i * 0.13);
      ctx.fillRect(cx - r, yy, r * 2, 1.5 + i * 1.15);
    }
    ctx.restore();
    return c;
  }

  /** One tileable mountain-ridge silhouette (drawn twice per frame, wrapped). */
  private bakeRidge(pts: number[], color: string): HTMLCanvasElement {
    const { W, H } = this;
    const tileW = Math.max(2, W * 1.25);
    const maxH = Math.max(...pts) * H + 2;
    const [c, ctx] = makeCanvas(tileW, maxH);
    const stepX = tileW / (pts.length - 1);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, maxH);
    for (let i = 0; i < pts.length; i++) ctx.lineTo(i * stepX, maxH - pts[i] * H);
    ctx.lineTo(tileW, maxH);
    ctx.closePath();
    ctx.fill();
    return c;
  }

  /** Spinning collectible: amber disc + baked radial glow. */
  private bakeCoin(): HTMLCanvasElement {
    const r = 40;
    const pad = 22;
    const size = (r + pad) * 2;
    const [c, ctx] = makeCanvas(size, size);
    const cx = size / 2;
    const glow = ctx.createRadialGradient(cx, cx, r * 0.4, cx, cx, r + pad);
    glow.addColorStop(0, "rgba(255, 184, 0, 0.55)");
    glow.addColorStop(1, "rgba(255, 184, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
    const disc = ctx.createLinearGradient(0, cx - r, 0, cx + r);
    disc.addColorStop(0, "#ffe289");
    disc.addColorStop(0.5, COLORS.amber);
    disc.addColorStop(1, "#c77f00");
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(cx, cx, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(120, 70, 0, 0.8)";
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.arc(cx, cx, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    return c;
  }

  /**
   * Simplified cameos of the portfolio page's roadside props (Billboard,
   * DeployStation, ThanksSign) as baked roadside sprites. Glow is baked, so
   * they cost one drawImage each at runtime.
   */
  private bakeSigns(): HTMLCanvasElement[] {
    const W = 320;
    const H = 300;

    const posts = (ctx: CanvasRenderingContext2D, topY: number) => {
      ctx.fillStyle = "#31103a";
      ctx.fillRect(92, topY, 12, H - 8 - topY);
      ctx.fillRect(216, topY, 12, H - 8 - topY);
      ctx.fillRect(80, H - 12, 36, 6);
      ctx.fillRect(204, H - 12, 36, 6);
    };

    const bulbRing = (
      ctx: CanvasRenderingContext2D,
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      color: string
    ) => {
      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      const step = 26;
      for (let x = x0; x <= x1 + 0.1; x += step) {
        ctx.beginPath();
        ctx.arc(x, y0, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y1, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let y = y0 + step; y < y1 - 0.1; y += step) {
        ctx.beginPath();
        ctx.arc(x0, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x1, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    /* -- variant 0: "OPEN TO NEW OPPORTUNITIES" billboard -- */
    const [b0, c0] = makeCanvas(W, H);
    posts(c0, 208);
    c0.save();
    c0.shadowColor = COLORS.magenta;
    c0.shadowBlur = 16;
    c0.fillStyle = "#1d0f3d";
    rrect(c0, 10, 36, 300, 172, 22);
    c0.fill();
    c0.restore();
    c0.strokeStyle = COLORS.magenta;
    c0.lineWidth = 4;
    rrect(c0, 10, 36, 300, 172, 22);
    c0.stroke();
    c0.fillStyle = "#0e0626";
    rrect(c0, 44, 68, 232, 108, 12);
    c0.fill();
    bulbRing(c0, 28, 54, 292, 190, COLORS.amber);
    c0.textAlign = "center";
    c0.textBaseline = "middle";
    c0.fillStyle = "#ffd7ec";
    c0.font = '600 24px "Exo 2", sans-serif';
    c0.fillText("Open to new", 160, 102);
    c0.save();
    c0.shadowColor = COLORS.cyan;
    c0.shadowBlur = 10;
    c0.fillStyle = COLORS.cyan;
    c0.font = '800 27px "Exo 2", sans-serif';
    c0.fillText("opportunities", 160, 144);
    c0.restore();

    /* -- variant 1: "DEPLOY STATION" canopy sign -- */
    const [b1, c1] = makeCanvas(W, H);
    posts(c1, 190);
    c1.save();
    c1.shadowColor = COLORS.cyan;
    c1.shadowBlur = 16;
    c1.fillStyle = "#140b2e";
    rrect(c1, 18, 52, 284, 138, 16);
    c1.fill();
    c1.restore();
    c1.strokeStyle = "rgba(0, 229, 255, 0.8)";
    c1.lineWidth = 4;
    rrect(c1, 18, 52, 284, 138, 16);
    c1.stroke();
    c1.textAlign = "center";
    c1.textBaseline = "middle";
    c1.save();
    c1.shadowColor = COLORS.amber;
    c1.shadowBlur = 10;
    c1.fillStyle = COLORS.amber;
    c1.font = '26px "Press Start 2P", monospace';
    c1.fillText("DEPLOY", 160, 100);
    c1.restore();
    c1.fillStyle = COLORS.cyan;
    c1.font = '18px "Press Start 2P", monospace';
    c1.fillText("STATION", 160, 146);
    c1.save();
    c1.fillStyle = COLORS.amber;
    c1.shadowColor = COLORS.amber;
    c1.shadowBlur = 5;
    for (let x = 40; x <= 280; x += 24) {
      c1.beginPath();
      c1.arc(x, 198, 4, 0, Math.PI * 2);
      c1.fill();
    }
    c1.restore();

    /* -- variant 2: "THANKS!" amber marquee with a heart -- */
    const [b2, c2] = makeCanvas(W, H);
    posts(c2, 216);
    c2.save();
    c2.shadowColor = COLORS.amber;
    c2.shadowBlur = 16;
    c2.fillStyle = "#2a1206";
    rrect(c2, 24, 48, 272, 168, 20);
    c2.fill();
    c2.restore();
    c2.strokeStyle = "rgba(255, 184, 0, 0.85)";
    c2.lineWidth = 4;
    rrect(c2, 24, 48, 272, 168, 20);
    c2.stroke();
    bulbRing(c2, 42, 66, 278, 198, "#ffd98a");
    c2.textAlign = "center";
    c2.textBaseline = "middle";
    c2.save();
    c2.shadowColor = COLORS.amber;
    c2.shadowBlur = 10;
    c2.fillStyle = "#ffd98a";
    c2.font = '22px "Press Start 2P", monospace';
    c2.fillText("THANKS!", 160, 112);
    c2.restore();
    // heart
    c2.save();
    c2.translate(160, 160);
    c2.fillStyle = COLORS.magenta;
    c2.shadowColor = COLORS.magenta;
    c2.shadowBlur = 10;
    c2.beginPath();
    c2.moveTo(0, 18);
    c2.bezierCurveTo(-22, 0, -16, -18, 0, -8);
    c2.bezierCurveTo(16, -18, 22, 0, 0, 18);
    c2.closePath();
    c2.fill();
    c2.restore();

    return [b0, b1, b2];
  }

  /** Career milestone signposts: neon year badge + caption, roadside style. */
  private bakeMilestones(): HTMLCanvasElement[] {
    return MILESTONES.map(([year, text]) => {
      const [c, ctx] = makeCanvas(340, 300);
      ctx.fillStyle = "#31103a";
      ctx.fillRect(160, 196, 14, 96);
      ctx.fillRect(146, 288, 42, 6);
      ctx.save();
      ctx.shadowColor = COLORS.cyan;
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#140b2e";
      rrect(ctx, 16, 60, 308, 138, 16);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "rgba(0, 229, 255, 0.85)";
      ctx.lineWidth = 4;
      rrect(ctx, 16, 60, 308, 138, 16);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.save();
      ctx.shadowColor = COLORS.amber;
      ctx.shadowBlur = 10;
      ctx.fillStyle = COLORS.amber;
      ctx.font = '30px "Press Start 2P", monospace';
      ctx.fillText(year, 170, 106);
      ctx.restore();
      ctx.fillStyle = "#f3ecff";
      ctx.font = '15px "Press Start 2P", monospace';
      ctx.fillText(text, 170, 156);
      return c;
    });
  }

  /** The finish arch: "YOUR COMPANY HERE?" spanning the road. */
  private bakeGate(): HTMLCanvasElement {
    const [c, ctx] = makeCanvas(680, 360);
    // pillars
    for (const px of [22, 622]) {
      const grad = ctx.createLinearGradient(0, 40, 0, 360);
      grad.addColorStop(0, "rgba(0, 229, 255, 0.9)");
      grad.addColorStop(1, "rgba(0, 229, 255, 0.25)");
      ctx.fillStyle = grad;
      ctx.fillRect(px, 40, 36, 320);
      ctx.fillStyle = COLORS.magenta;
      ctx.beginPath();
      ctx.arc(px + 18, 36, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    // beam
    ctx.save();
    ctx.shadowColor = COLORS.magenta;
    ctx.shadowBlur = 22;
    ctx.fillStyle = "#1d0f3d";
    rrect(ctx, 8, 60, 664, 120, 18);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = COLORS.magenta;
    ctx.lineWidth = 5;
    rrect(ctx, 8, 60, 664, 120, 18);
    ctx.stroke();
    // checkered strip under the beam
    for (let i = 0; i < 22; i++) {
      ctx.fillStyle = i % 2 ? "#f3ecff" : "#0d0221";
      ctx.fillRect(14 + i * 30, 182, 30, 16);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.save();
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#f3ecff";
    ctx.font = '28px "Press Start 2P", monospace';
    ctx.fillText("YOUR COMPANY", 340, 100);
    ctx.fillText("HERE?", 340, 144);
    ctx.restore();
    return c;
  }

  /** Blackout overlay: darkness with a headlight cone punched out, baked once. */
  private bakeNight(): HTMLCanvasElement {
    const { W, H } = this;
    const [c, ctx] = makeCanvas(Math.max(2, W * 1.2), Math.max(2, H));
    const cx = c.width / 2;
    ctx.fillStyle = "rgba(2, 0, 10, 0.9)";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = "destination-out";
    // pool of light around the car
    let g = ctx.createRadialGradient(cx, H * 0.86, H * 0.05, cx, H * 0.86, H * 0.52);
    g.addColorStop(0, "rgba(0, 0, 0, 1)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    // beam reaching toward the horizon
    g = ctx.createRadialGradient(cx, H * 0.55, H * 0.02, cx, H * 0.55, H * 0.34);
    g.addColorStop(0, "rgba(0, 0, 0, 0.95)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(cx, H * 0.55);
    ctx.scale(1.35, 0.55);
    ctx.translate(-cx, -H * 0.55);
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
    return c;
  }

  /** VHS scanline pattern for the Ctrl+Z freeze-frame. */
  private bakeScanlines(): HTMLCanvasElement {
    const { W, H } = this;
    const [c, ctx] = makeCanvas(Math.max(2, W), Math.max(2, H));
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    for (let y = 0; y < c.height; y += 4) ctx.fillRect(0, y, c.width, 2);
    return c;
  }

  /**
   * Static cockpit interior, baked once per resize: windshield vignette and
   * glass reflections, A-pillars, roof band, rear-view mirror (with a tiny
   * synthwave sunset in it), and the neon-trimmed dashboard cowl. Everything
   * that never moves lives here — one drawImage per frame at runtime.
   */
  private bakeCockpit(): HTMLCanvasElement {
    const { W, H } = this;
    const [c, ctx] = makeCanvas(Math.max(2, W), Math.max(2, H));

    /* windshield vignette: corners darken, centre stays clear */
    const vig = ctx.createRadialGradient(W / 2, H * 0.36, H * 0.22, W / 2, H * 0.42, H * 0.78);
    vig.addColorStop(0, "rgba(5, 1, 16, 0)");
    vig.addColorStop(1, "rgba(5, 1, 16, 0.42)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H * 0.78);

    /* glass reflection streaks */
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H * 0.72);
    ctx.clip();
    for (const [off, alpha, wd] of [
      [0, 0.05, W * 0.09],
      [W * 0.16, 0.03, W * 0.045],
    ] as [number, number, number][]) {
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(W * 0.14 + off, 0);
      ctx.lineTo(W * 0.14 + off + wd, 0);
      ctx.lineTo(W * 0.04 + off + wd, H * 0.72);
      ctx.lineTo(W * 0.04 + off, H * 0.72);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    /* roof band */
    const roof = ctx.createLinearGradient(0, 0, 0, H * 0.06);
    roof.addColorStop(0, "#0b0518");
    roof.addColorStop(1, "rgba(11, 5, 24, 0)");
    ctx.fillStyle = roof;
    ctx.fillRect(0, 0, W, H * 0.06);

    /* A-pillars: slanted, with a lit inner edge */
    for (const side of [-1, 1]) {
      ctx.save();
      if (side === 1) {
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
      }
      const grad = ctx.createLinearGradient(0, 0, W * 0.075, 0);
      grad.addColorStop(0, "#100a20");
      grad.addColorStop(1, "#1b1230");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W * 0.085, 0);
      ctx.lineTo(W * 0.028, H * 0.78);
      ctx.lineTo(0, H * 0.78);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 229, 255, 0.16)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W * 0.085, 0);
      ctx.lineTo(W * 0.028, H * 0.78);
      ctx.stroke();
      ctx.restore();
    }

    /* rear-view mirror with a baked synthwave reflection */
    const mw = W * 0.15;
    const mh = H * 0.078;
    const mx = W / 2 - mw / 2;
    const my = H * 0.035;
    ctx.fillStyle = "#0b0518";
    ctx.fillRect(W / 2 - 6, 0, 12, my + 6); // stalk
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#171028";
    rrect(ctx, mx - 5, my - 5, mw + 10, mh + 10, 10);
    ctx.fill();
    ctx.restore();
    const mg = ctx.createLinearGradient(0, my, 0, my + mh);
    mg.addColorStop(0, "#2b0a4e");
    mg.addColorStop(0.62, "#43125e");
    mg.addColorStop(0.64, "#1a0a3d");
    mg.addColorStop(1, "#0d0221");
    ctx.save();
    rrect(ctx, mx, my, mw, mh, 6);
    ctx.clip();
    ctx.fillStyle = mg;
    ctx.fillRect(mx, my, mw, mh);
    // tiny sun sinking behind the road you left behind
    ctx.fillStyle = COLORS.amber;
    ctx.beginPath();
    ctx.arc(mx + mw * 0.5, my + mh * 0.62, mh * 0.3, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 46, 136, 0.5)";
    ctx.fillRect(mx, my + mh * 0.6, mw, 1.5);
    ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
    ctx.fillRect(mx, my, mw * 0.45, mh);
    ctx.restore();

    /* dashboard cowl */
    const dashEdge = (yEdge: number, yDip: number) => {
      ctx.beginPath();
      ctx.moveTo(0, yEdge);
      ctx.quadraticCurveTo(W / 2, yDip, W, yEdge);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
    };
    ctx.save();
    ctx.shadowColor = "rgba(0, 229, 255, 0.55)";
    ctx.shadowBlur = 16;
    const dg = ctx.createLinearGradient(0, H * 0.72, 0, H);
    dg.addColorStop(0, "#221540");
    dg.addColorStop(0.35, "#170f2e");
    dg.addColorStop(1, "#0a0515");
    ctx.fillStyle = dg;
    dashEdge(H * 0.745, H * 0.815);
    ctx.fill();
    ctx.restore();
    // neon trim along the cowl edge
    ctx.strokeStyle = "rgba(0, 229, 255, 0.75)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.745);
    ctx.quadraticCurveTo(W / 2, H * 0.815, W, H * 0.745);
    ctx.stroke();
    // amber stitching just below the trim
    ctx.strokeStyle = "rgba(255, 184, 0, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 7]);
    ctx.beginPath();
    ctx.moveTo(0, H * 0.762);
    ctx.quadraticCurveTo(W / 2, H * 0.832, W, H * 0.762);
    ctx.stroke();
    ctx.setLineDash([]);

    /* defroster vents */
    for (const side of [0.09, 0.79]) {
      ctx.fillStyle = "#0c0718";
      for (let i = 0; i < 4; i++) {
        rrect(ctx, W * side + i * W * 0.032, H * 0.80 + i * 1.5, W * 0.024, H * 0.012, 3);
        ctx.fill();
      }
    }
    /* dash badge + a couple of idiot lights */
    ctx.font = `${Math.max(8, Math.round(H * 0.014))}px "Press Start 2P", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0, 229, 255, 0.4)";
    ctx.fillText("NEON RUN", W * 0.965, H * 0.9);
    for (const [dx, col] of [
      [0.928, "rgba(255, 46, 136, 0.8)"],
      [0.945, "rgba(255, 184, 0, 0.7)"],
    ] as [number, string][]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(W * dx, H * 0.94, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  }

  /**
   * The steering wheel (with gloved hands at 9 and 3), baked at 2x and
   * rotated live with ctx.rotate — realism costs one drawImage per frame.
   */
  private bakeWheel(d: number): HTMLCanvasElement {
    const S = 2;
    const size = d * S;
    const [c, ctx] = makeCanvas(size, size);
    const cx = size / 2;
    const r = size * 0.46;
    const rim = size * 0.075;

    /* soft drop glow so the wheel separates from the dash */
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
    ctx.shadowBlur = size * 0.04;
    ctx.strokeStyle = "#0d0718";
    ctx.lineWidth = rim;
    ctx.beginPath();
    ctx.arc(cx, cx, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    /* leather rim: radial shading + top specular arc */
    const rg = ctx.createRadialGradient(cx, cx, r - rim, cx, cx, r + rim);
    rg.addColorStop(0, "#191026");
    rg.addColorStop(0.5, "#2c1c47");
    rg.addColorStop(1, "#120b1d");
    ctx.strokeStyle = rg;
    ctx.lineWidth = rim;
    ctx.beginPath();
    ctx.arc(cx, cx, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = rim * 0.28;
    ctx.beginPath();
    ctx.arc(cx, cx, r + rim * 0.28, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    /* racing stripe at 12 o'clock */
    ctx.strokeStyle = CAR_STYLES[this.carIdx].bar[1];
    ctx.lineWidth = rim * 0.85;
    ctx.beginPath();
    ctx.arc(cx, cx, r, Math.PI * 1.46, Math.PI * 1.54);
    ctx.stroke();
    /* stitching inside the rim */
    ctx.strokeStyle = "rgba(255, 184, 0, 0.3)";
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 9]);
    ctx.beginPath();
    ctx.arc(cx, cx, r - rim * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    /* three spokes (9, 3 and 6 o'clock) with a cyan accent line */
    const spoke = (ang: number) => {
      ctx.save();
      ctx.translate(cx, cx);
      ctx.rotate(ang);
      const sg = ctx.createLinearGradient(0, -size * 0.035, 0, size * 0.035);
      sg.addColorStop(0, "#241738");
      sg.addColorStop(0.5, "#160e26");
      sg.addColorStop(1, "#0e081a");
      ctx.fillStyle = sg;
      rrect(ctx, size * 0.06, -size * 0.032, r - rim * 0.5 - size * 0.06, size * 0.064, size * 0.02);
      ctx.fill();
      ctx.fillStyle = "rgba(0, 229, 255, 0.5)";
      rrect(ctx, size * 0.1, -size * 0.004, r - rim - size * 0.12, size * 0.008, size * 0.004);
      ctx.fill();
      ctx.restore();
    };
    spoke(0);
    spoke(Math.PI);
    spoke(Math.PI / 2);

    /* hub: horn pad + logo */
    const hub = ctx.createRadialGradient(cx - size * 0.02, cx - size * 0.02, size * 0.01, cx, cx, size * 0.115);
    hub.addColorStop(0, "#2c1c47");
    hub.addColorStop(1, "#120b1d");
    ctx.fillStyle = hub;
    ctx.beginPath();
    ctx.arc(cx, cx, size * 0.115, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 229, 255, 0.55)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cx, size * 0.115, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `${Math.round(size * 0.055)}px "Press Start 2P", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.save();
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 8;
    ctx.fillStyle = COLORS.cyan;
    ctx.fillText("AL", cx, cx + 1);
    ctx.restore();

    /* gloved hands at 9 and 3 */
    const hand = (side: -1 | 1) => {
      ctx.save();
      // racing 10-and-2 grip: mount the hands 30 deg above the 9/3 spokes
      ctx.translate(cx, cx);
      ctx.rotate((-side * Math.PI) / 6);
      ctx.translate(side * r, 0);
      // palm wrapping the rim
      const hg = ctx.createLinearGradient(0, -size * 0.075, 0, size * 0.075);
      hg.addColorStop(0, "#41173c");
      hg.addColorStop(1, "#26102a");
      ctx.fillStyle = hg;
      rrect(ctx, -rim * 0.95, -size * 0.075, rim * 1.9, size * 0.15, rim * 0.8);
      ctx.fill();
      // fingers hinted as darker creases on the outer side
      ctx.strokeStyle = "rgba(10, 4, 16, 0.6)";
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(side * rim * 0.15, i * size * 0.036 - size * 0.008);
        ctx.lineTo(side * rim * 0.85, i * size * 0.036 + size * 0.004);
        ctx.stroke();
      }
      // thumb tucked inward
      ctx.fillStyle = "#341433";
      rrect(ctx, side === 1 ? -rim * 1.7 : rim * 0.4, -size * 0.02, rim * 1.3, size * 0.045, size * 0.02);
      ctx.fill();
      // cyan knuckle accent
      ctx.fillStyle = "rgba(0, 229, 255, 0.35)";
      rrect(ctx, -rim * 0.35, -size * 0.062, rim * 0.7, size * 0.012, size * 0.006);
      ctx.fill();
      ctx.restore();
    };
    hand(-1);
    hand(1);
    return c;
  }

  /** Speedometer face: ticks, numbers, redline. The needle is drawn live. */
  private bakeGauge(r: number): HTMLCanvasElement {
    const [c, ctx] = makeCanvas(r * 2, r * 2);
    const cx = r;
    const face = ctx.createRadialGradient(cx, cx, r * 0.1, cx, cx, r);
    face.addColorStop(0, "#140c26");
    face.addColorStop(1, "#070312");
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(cx, cx, r * 0.97, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = "rgba(0, 229, 255, 0.6)";
    ctx.shadowBlur = r * 0.12;
    ctx.strokeStyle = "rgba(0, 229, 255, 0.8)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cx, r * 0.95, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const a0 = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    /* redline: last 100 km/h */
    ctx.strokeStyle = "rgba(255, 46, 136, 0.75)";
    ctx.lineWidth = r * 0.07;
    ctx.beginPath();
    ctx.arc(cx, cx, r * 0.8, a0 + sweep * ((GAUGE_MAX - 100) / GAUGE_MAX), a0 + sweep);
    ctx.stroke();
    /* ticks + numbers */
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let v = 0; v <= GAUGE_MAX; v += 50) {
      const a = a0 + sweep * (v / GAUGE_MAX);
      const major = v % 100 === 0;
      const r1 = r * (major ? 0.72 : 0.78);
      const r2 = r * 0.86;
      ctx.strokeStyle = major ? "rgba(0, 229, 255, 0.9)" : "rgba(0, 229, 255, 0.4)";
      ctx.lineWidth = major ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cx + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cx + Math.sin(a) * r2);
      ctx.stroke();
      if (major && v % 200 === 0) {
        ctx.font = `${Math.max(7, Math.round(r * 0.11))}px "Press Start 2P", monospace`;
        ctx.fillStyle = "#b6a6da";
        ctx.fillText(String(v), cx + Math.cos(a) * r * 0.56, cx + Math.sin(a) * r * 0.56);
      }
    }
    ctx.font = `${Math.max(6, Math.round(r * 0.09))}px "Press Start 2P", monospace`;
    ctx.fillStyle = "rgba(182, 166, 218, 0.55)";
    ctx.fillText("KM/H", cx, cx - r * 0.3);
    /* glass glint */
    ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    ctx.arc(cx, cx, r * 0.62, Math.PI * 1.15, Math.PI * 1.5);
    ctx.stroke();
    return c;
  }

  /** The live cockpit pass: static interior + rotating wheel + gauge needle. */
  private drawCockpit(t: number, speedPct: number) {
    const { ctx, W, H } = this;
    const bob = Math.sin(t * 29) * speedPct * 2.2;
    ctx.save();
    ctx.translate(0, bob);

    if (this.cockpitSprite) ctx.drawImage(this.cockpitSprite, 0, 0);

    /* speedometer */
    if (this.gaugeSprite) {
      const gr = this.gaugeSprite.width / 2;
      const gx = Math.max(gr + 8, W * 0.235);
      const gy = H * 0.85;
      ctx.drawImage(this.gaugeSprite, gx - gr, gy - gr);
      const kmh = Math.min(this.speed / 28, GAUGE_MAX);
      const a = Math.PI * 0.75 + (kmh / GAUGE_MAX) * Math.PI * 1.5;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      ctx.strokeStyle = "rgba(255, 46, 136, 0.3)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(gx - nx * gr * 0.12, gy - ny * gr * 0.12);
      ctx.lineTo(gx + nx * gr * 0.74, gy + ny * gr * 0.74);
      ctx.stroke();
      ctx.strokeStyle = COLORS.magenta;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(gx - nx * gr * 0.12, gy - ny * gr * 0.12);
      ctx.lineTo(gx + nx * gr * 0.74, gy + ny * gr * 0.74);
      ctx.stroke();
      ctx.fillStyle = COLORS.cyan;
      ctx.beginPath();
      ctx.arc(gx, gy, gr * 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${Math.max(9, Math.round(gr * 0.22))}px "Press Start 2P", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = COLORS.cyan;
      ctx.fillText(String(Math.round(kmh)), gx, gy + gr * 0.42);
    }

    /* the wheel: turns with the (smoothed) steering input */
    if (this.wheelSprite && this.wheelD) {
      const wx = W / 2;
      const wy = H + this.wheelD * 0.02;
      const ang = this.steerVis * WHEEL_TURN + Math.sin(t * 37) * 0.01 * speedPct;
      ctx.translate(wx, wy);
      ctx.rotate(ang);
      ctx.drawImage(this.wheelSprite, -this.wheelD / 2, -this.wheelD / 2, this.wheelD, this.wheelD);
    }
    ctx.restore();
  }

  /**
   * The player's car, seen from behind — baked per garage selection: the
   * body gradient, light bar, trim and tail silhouette (wing / clean /
   * ducktail) all come from CAR_STYLES[this.carIdx]. Baked at 2x and drawn
   * scaled; the glow costs nothing at runtime because it is in the bake.
   */
  private bakeCar(cwCss: number, brake: boolean): HTMLCanvasElement {
    const st = CAR_STYLES[this.carIdx];
    const S = 2; // supersample
    const u = cwCss * S; // car width in bake pixels
    const w = u * 1.4;
    const h = u * 1.1;
    const [c, ctx] = makeCanvas(w, h);
    const cx = w / 2;
    const bottom = h - u * 0.08; // baseline: bottom of the wheels

    const px = (v: number) => v * u; // fractions of car width -> bake px

    /* wheels (peek out past the fenders) */
    ctx.fillStyle = "#0b0716";
    rrect(ctx, cx - px(0.5), bottom - px(0.17), px(0.13), px(0.17), px(0.03));
    ctx.fill();
    rrect(ctx, cx + px(0.37), bottom - px(0.17), px(0.13), px(0.17), px(0.03));
    ctx.fill();
    ctx.fillStyle = "#171028";
    ctx.fillRect(cx - px(0.5), bottom - px(0.06), px(0.13), px(0.018));
    ctx.fillRect(cx + px(0.37), bottom - px(0.06), px(0.13), px(0.018));

    /* tail: full wing on struts, muscle ducktail, or a clean deck */
    if (st.wing === "wing") {
      const wingY = bottom - px(0.52);
      ctx.fillStyle = "#31103a";
      ctx.fillRect(cx - px(0.24), wingY, px(0.045), px(0.1));
      ctx.fillRect(cx + px(0.195), wingY, px(0.045), px(0.1));
      const wingGrad = ctx.createLinearGradient(0, wingY - px(0.05), 0, wingY + px(0.02));
      wingGrad.addColorStop(0, "#5b1a52");
      wingGrad.addColorStop(1, "#38103f");
      ctx.fillStyle = wingGrad;
      rrect(ctx, cx - px(0.42), wingY - px(0.05), px(0.84), px(0.055), px(0.025));
      ctx.fill();
      ctx.fillStyle = st.bar[1];
      rrect(ctx, cx - px(0.435), wingY - px(0.065), px(0.03), px(0.085), px(0.012));
      ctx.fill();
      rrect(ctx, cx + px(0.405), wingY - px(0.065), px(0.03), px(0.085), px(0.012));
      ctx.fill();
    } else if (st.wing === "duck") {
      const duckY = bottom - px(0.47);
      const duckGrad = ctx.createLinearGradient(0, duckY - px(0.05), 0, duckY + px(0.03));
      duckGrad.addColorStop(0, st.body[0]);
      duckGrad.addColorStop(1, st.body[2]);
      ctx.fillStyle = duckGrad;
      rrect(ctx, cx - px(0.4), duckY - px(0.045), px(0.8), px(0.075), px(0.02));
      ctx.fill();
      ctx.fillStyle = st.accent;
      rrect(ctx, cx - px(0.4), duckY - px(0.052), px(0.8), px(0.014), px(0.007));
      ctx.fill();
    }

    /* cabin (narrower than the body) + rear window */
    const cabinTop = bottom - px(st.wing === "none" ? 0.58 : 0.62);
    const cabinH = px(0.3);
    ctx.beginPath();
    ctx.moveTo(cx - px(0.31), cabinTop + cabinH);
    ctx.lineTo(cx - px(0.24), cabinTop + px(0.03));
    ctx.quadraticCurveTo(cx, cabinTop - px(0.025), cx + px(0.24), cabinTop + px(0.03));
    ctx.lineTo(cx + px(0.31), cabinTop + cabinH);
    ctx.closePath();
    const cabinGrad = ctx.createLinearGradient(0, cabinTop, 0, cabinTop + cabinH);
    cabinGrad.addColorStop(0, "#43154a");
    cabinGrad.addColorStop(1, "#2b0f2e");
    ctx.fillStyle = cabinGrad;
    ctx.fill();
    // window
    ctx.beginPath();
    ctx.moveTo(cx - px(0.255), cabinTop + cabinH - px(0.03));
    ctx.lineTo(cx - px(0.2), cabinTop + px(0.055));
    ctx.quadraticCurveTo(cx, cabinTop + px(0.005), cx + px(0.2), cabinTop + px(0.055));
    ctx.lineTo(cx + px(0.255), cabinTop + cabinH - px(0.03));
    ctx.closePath();
    const winGrad = ctx.createLinearGradient(0, cabinTop, 0, cabinTop + cabinH);
    winGrad.addColorStop(0, `rgba(${st.v.glass.join(",")}, 0.5)`);
    winGrad.addColorStop(0.6, `rgba(${st.v.glass.join(",")}, 0.18)`);
    winGrad.addColorStop(1, `rgba(${st.v.glass.join(",")}, 0.06)`);
    ctx.fillStyle = winGrad;
    ctx.fill();
    // diagonal sheen across the glass
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
    ctx.beginPath();
    ctx.moveTo(cx - px(0.16), cabinTop);
    ctx.lineTo(cx - px(0.05), cabinTop);
    ctx.lineTo(cx - px(0.16), cabinTop + cabinH);
    ctx.lineTo(cx - px(0.27), cabinTop + cabinH);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // rim light along the roof line
    ctx.strokeStyle = st.accent;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(1.5, px(0.012));
    ctx.beginPath();
    ctx.moveTo(cx - px(0.24), cabinTop + px(0.03));
    ctx.quadraticCurveTo(cx, cabinTop - px(0.025), cx + px(0.24), cabinTop + px(0.03));
    ctx.stroke();
    ctx.globalAlpha = 1;

    /* body: wide trunk with flared fenders */
    const bodyTop = bottom - px(0.38);
    const bodyH = px(0.3);
    ctx.beginPath();
    ctx.moveTo(cx - px(0.36), bodyTop);
    ctx.lineTo(cx + px(0.36), bodyTop);
    ctx.quadraticCurveTo(cx + px(0.49), bodyTop + px(0.02), cx + px(0.5), bodyTop + px(0.14));
    ctx.lineTo(cx + px(0.48), bodyTop + bodyH);
    ctx.quadraticCurveTo(cx, bodyTop + bodyH + px(0.035), cx - px(0.48), bodyTop + bodyH);
    ctx.lineTo(cx - px(0.5), bodyTop + px(0.14));
    ctx.quadraticCurveTo(cx - px(0.49), bodyTop + px(0.02), cx - px(0.36), bodyTop);
    ctx.closePath();
    const bodyGrad = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
    bodyGrad.addColorStop(0, st.body[0]);
    bodyGrad.addColorStop(0.45, st.body[1]);
    bodyGrad.addColorStop(1, st.body[2]);
    ctx.fillStyle = bodyGrad;
    ctx.save();
    ctx.shadowColor = `rgba(${st.glowRGB}, 0.55)`;
    ctx.shadowBlur = px(0.09);
    ctx.fill();
    ctx.restore();
    // shoulder highlight
    ctx.strokeStyle = st.accent;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(1, px(0.01));
    ctx.beginPath();
    ctx.moveTo(cx - px(0.47), bodyTop + px(0.035));
    ctx.quadraticCurveTo(cx, bodyTop - px(0.015), cx + px(0.47), bodyTop + px(0.035));
    ctx.stroke();
    ctx.globalAlpha = 1;

    /* full-width neon light bar */
    const barY = bodyTop + px(0.075);
    const barH = px(0.07);
    const bar = brake ? st.barBrake : st.bar;
    ctx.save();
    ctx.shadowColor = bar[1];
    ctx.shadowBlur = brake ? px(0.22) : px(0.12);
    const barGrad = ctx.createLinearGradient(0, barY, 0, barY + barH);
    barGrad.addColorStop(0, bar[0]);
    barGrad.addColorStop(0.5, bar[1]);
    barGrad.addColorStop(1, bar[2]);
    ctx.fillStyle = barGrad;
    rrect(ctx, cx - px(0.42), barY, px(0.84), barH, px(0.03));
    ctx.fill();
    ctx.restore();
    // bright core line
    ctx.fillStyle = brake ? "rgba(255, 255, 255, 0.95)" : "rgba(255, 255, 255, 0.65)";
    rrect(ctx, cx - px(0.4), barY + barH * 0.32, px(0.8), barH * 0.22, barH * 0.11);
    ctx.fill();

    /* licence plate */
    const plateW = px(0.2);
    const plateH = px(0.085);
    const plateY = barY + barH + px(0.035);
    ctx.fillStyle = "#0c1830";
    rrect(ctx, cx - plateW / 2, plateY, plateW, plateH, px(0.015));
    ctx.fill();
    ctx.strokeStyle = st.accent;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = Math.max(1, px(0.008));
    rrect(ctx, cx - plateW / 2, plateY, plateW, plateH, px(0.015));
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#9adfff";
    ctx.font = `bold ${px(0.055)}px "Share Tech Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ALEX", cx, plateY + plateH * 0.56);

    /* diffuser with vents */
    const difY = bottom - px(0.075);
    ctx.fillStyle = "#240d33";
    rrect(ctx, cx - px(0.44), difY, px(0.88), px(0.06), px(0.02));
    ctx.fill();
    ctx.fillStyle = "#140620";
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(cx + i * px(0.14) - px(0.045), difY + px(0.012), px(0.09), px(0.036));
    }

    /* exhaust tips */
    ctx.fillStyle = "#1a0a1f";
    ctx.strokeStyle = st.accent;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = Math.max(1, px(0.008));
    for (const ex of [-0.17, 0.17]) {
      ctx.beginPath();
      ctx.arc(cx + px(ex), bottom - px(0.045), px(0.032), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    return c;
  }

  /* -------------------------------- render -------------------------------- */

  private tick = (now: number) => {
    if (this.destroyed) return;
    const dtRaw = (now - this.lastT) / 1000;
    const dt = Math.min(0.05, dtRaw);
    this.lastT = now;
    if (dtRaw > 0) this.fps += (1 / Math.max(dtRaw, 1e-4) - this.fps) * 0.05;

    const c0 = performance.now();
    this.update(dt);
    this.render(now / 1000);
    const cost = performance.now() - c0;

    // adaptive quality: track OUR frame cost (not vsync-padded dt)
    this.costEma += (cost - this.costEma) * 0.1;
    if (this.costEma > SLOW_MS) {
      this.slowRun++;
      this.fastRun = 0;
    } else if (this.costEma < FAST_MS) {
      this.fastRun++;
      this.slowRun = 0;
    } else {
      this.slowRun = 0;
      this.fastRun = 0;
    }
    if (this.slowRun > SLOW_FRAMES && this.qualityIdx < QUALITY_STEPS.length - 1) {
      this.qualityIdx++;
      this.slowRun = 0;
      this.costEma = SLOW_MS * 0.7; // settle before judging again
      this.resize();
    } else if (this.fastRun > FAST_FRAMES && this.qualityIdx > 0) {
      this.qualityIdx--;
      this.fastRun = 0;
      this.costEma = FAST_MS * 1.5;
      this.resize();
    }

    this.raf = requestAnimationFrame(this.tick);
  };

  private project(xWorld: number, dz: number): { x: number; y: number; halfW: number } {
    const d = Math.max(dz, 4);
    const scale = this.camDepth / d;
    return {
      x: this.W / 2 + scale * (xWorld - this.playerX * ROAD_W) * (this.W / 2),
      y: Math.min(this.H * 4, this.H / 2 + scale * this.camHCur * (this.H / 2)),
      halfW: scale * ROAD_W * (this.W / 2),
    };
  }

  private render(t: number) {
    const { ctx, W, H } = this;
    if (!W || !this.sunSprite || !this.ridge1 || !this.ridge2) return;
    const horizonY = H / 2;
    // seat height: the cockpit camera sits lower, eased for a smooth cut
    const camHTarget = this.viewMode === "cockpit" ? CAM_H * 0.8 : CAM_H;
    this.camHCur += (camHTarget - this.camHCur) * 0.12;

    // camera shake on the shoulder / during a crash
    let shakeX = 0;
    let shakeY = 0;
    const speedPct = this.speed / (BASE_SPEED + MAX_EXTRA);
    if (this.phase === "crash") {
      const k = Math.max(0, 1 - this.crashT * 2) * 9;
      shakeX = (Math.random() - 0.5) * k;
      shakeY = (Math.random() - 0.5) * k;
    } else if (Math.abs(this.playerX) > OFFROAD_LIMIT && speedPct > 0.15) {
      shakeX = (Math.random() - 0.5) * 3.4;
      shakeY = (Math.random() - 0.5) * 3.4;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);

    /* ---- sky (everything pre-rasterized) ---- */
    ctx.fillStyle = COLORS.sky0;
    ctx.fillRect(-16, -16, W + 32, horizonY + 16);
    if (this.skySprite) ctx.drawImage(this.skySprite, 0, 0);

    // stars, twinkling in 6 phase buckets (6 alpha changes instead of 80)
    ctx.fillStyle = "#e6dcff";
    for (let b = 0; b < 6; b++) {
      ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(t * 1.7 + b * 1.047));
      for (const s of this.stars) {
        if (s.bucket !== b) continue;
        const sx = (((s.x * W * 2 - this.skyOff * 0.2) % (W * 2)) + W * 2) % (W * 2) - W * 0.5;
        if (sx < -8 || sx > W + 8) continue;
        ctx.fillRect(sx, s.y * H, s.r, s.r);
      }
    }
    ctx.globalAlpha = 1;

    // sun (pre-baked, wraps with the sky offset)
    const sunR = H * 0.21;
    const sunX =
      ((((W * 0.5 - this.skyOff * 0.42) % (W * 1.6)) + W * 1.6) % (W * 1.6)) - W * 0.3;
    const sunY = horizonY - sunR * 0.18;
    ctx.drawImage(
      this.sunSprite,
      sunX - this.sunSprite.width / 2,
      sunY - this.sunSprite.height / 2
    );

    // mountain silhouettes (pre-baked tiles, two parallax layers)
    const ridgeDraw = (tile: Baked, shift: number) => {
      const tileW = tile.width;
      const y = horizonY + 1 - tile.height;
      let ox = -(((shift % tileW) + tileW) % tileW);
      for (; ox < W; ox += tileW) ctx.drawImage(tile, ox, y);
    };
    ridgeDraw(this.ridge2, this.skyOff * 0.3);
    ridgeDraw(this.ridge1, this.skyOff * 0.55);

    /* ---- road: project rows (culling sub-pixel ones), then batch-fill ---- */
    const posLoop = this.position % (this.trackSegs * SEG_LEN);
    const baseVSeg = Math.floor(this.position / SEG_LEN);
    const basePct = (this.position % SEG_LEN) / SEG_LEN;
    const zBase = posLoop - basePct * SEG_LEN;

    this.rows.length = 0;
    let x = 0;
    let dx = -this.curveAt(baseVSeg) * basePct;
    let prevY = Infinity;
    let n = 0;
    for (; n < DRAW; n++) {
      const z1 = zBase + n * SEG_LEN - posLoop;
      const p1 = this.project(x, z1);
      x += dx;
      dx += this.curveAt(baseVSeg + n);
      const p2 = this.project(x, z1 + SEG_LEN);
      this.rows.push({ x: p1.x, y: p1.y, halfW: p1.halfW, x2: p2.x, y2: p2.y, halfW2: p2.halfW });
      // beyond ~n=40 the rows compress below a pixel — everything further is
      // hidden by the fog band anyway, so stop projecting entirely
      if (n > 40 && prevY - p2.y < MIN_ROW_PX) {
        n++;
        break;
      }
      prevY = p2.y;
    }
    this.rowsDrawn = n;

    const last = this.rows[this.rowsDrawn - 1];
    if (last) {
      // ground + a converging road tail between the last row and the horizon
      ctx.fillStyle = COLORS.ground[0];
      ctx.fillRect(-16, horizonY - 1, W + 32, Math.max(0, last.y2 - horizonY) + 2);
      ctx.fillStyle = COLORS.asphalt[1];
      ctx.beginPath();
      ctx.moveTo(last.x2 - last.halfW2, last.y2);
      ctx.lineTo(last.x2 + last.halfW2, last.y2);
      ctx.lineTo(last.x2 + dx * 4 + last.halfW2 * 0.12, horizonY);
      ctx.lineTo(last.x2 + dx * 4 - last.halfW2 * 0.12, horizonY);
      ctx.closePath();
      ctx.fill();
    }

    // seven batched fills for every remaining row: 2×ground, 2×rumble,
    // 2×asphalt, 1×lanes — instead of ~4 fill() calls per row
    const paths = [
      new Path2D(), // ground alt 0
      new Path2D(), // ground alt 1
      new Path2D(), // rumble alt 0
      new Path2D(), // rumble alt 1
      new Path2D(), // asphalt alt 0
      new Path2D(), // asphalt alt 1
      new Path2D(), // lane dashes
    ];
    const quad = (
      p: Path2D,
      cx1: number,
      w1: number,
      y1: number,
      cx2: number,
      w2: number,
      y2: number
    ) => {
      p.moveTo(cx1 - w1, y1);
      p.lineTo(cx1 + w1, y1);
      p.lineTo(cx2 + w2, y2);
      p.lineTo(cx2 - w2, y2);
      p.closePath();
    };
    for (let i = this.rowsDrawn - 1; i >= 0; i--) {
      const r = this.rows[i];
      if (r.y2 >= r.y) continue; // degenerate/behind
      const alt = (baseVSeg + i) % 2;
      paths[alt].rect(-16, r.y2, W + 32, r.y - r.y2 + 0.5);
      quad(paths[2 + alt], r.x, r.halfW * 1.12, r.y, r.x2, r.halfW2 * 1.12, r.y2);
      quad(paths[4 + alt], r.x, r.halfW, r.y, r.x2, r.halfW2, r.y2);
      if ((baseVSeg + i) % 8 < 4) {
        for (const lane of [-1 / 3, 1 / 3]) {
          quad(
            paths[6],
            r.x + r.halfW * lane,
            r.halfW * 0.016,
            r.y,
            r.x2 + r.halfW2 * lane,
            r.halfW2 * 0.016,
            r.y2
          );
        }
      }
    }
    ctx.fillStyle = COLORS.ground[0];
    ctx.fill(paths[0]);
    ctx.fillStyle = COLORS.ground[1];
    ctx.fill(paths[1]);
    ctx.fillStyle = COLORS.rumble[0];
    ctx.fill(paths[2]);
    ctx.fillStyle = COLORS.rumble[1];
    ctx.fill(paths[3]);
    ctx.fillStyle = COLORS.asphalt[0];
    ctx.fill(paths[4]);
    ctx.fillStyle = COLORS.asphalt[1];
    ctx.fill(paths[5]);
    ctx.fillStyle = COLORS.lane;
    ctx.fill(paths[6]);

    // fog band pushing the far road into the background colour
    if (this.fogSprite) ctx.drawImage(this.fogSprite, 0, horizonY - 1);

    /* ---- sprites (far → near so near ones draw on top) ---- */
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i];
      if (s.taken) continue;
      const sn = s.vseg - baseVSeg;
      if (sn < 1 || sn >= this.rowsDrawn) continue;
      const r = this.rows[sn];
      if (r.y2 >= r.y) continue;
      const sx = r.x + r.halfW * s.offset;
      const sy = r.y;
      // far sprites fade in out of the fog instead of popping fully-formed
      ctx.globalAlpha = Math.min(1, (this.rowsDrawn - sn) / 14);
      if (s.type === "bug") {
        const bw = Math.max(9, r.halfW * 0.42);
        const bh = bw * 0.6;
        if (sy - bh > H || sx + bw < 0 || sx - bw > W) continue; // fully off-screen
        // blink: each block keeps its own phase so the road never pulses in sync
        const flash = Math.sin(t * 9 + s.vseg * 1.7) > 0.55 ? 1 : 0;
        const set = this.errSprites[s.variant ?? 0] ?? this.errSprites[0];
        const img = set?.[flash] ?? set?.[0];
        if (!img) continue;
        ctx.drawImage(img, sx - bw / 2, sy - bh * 1.06, bw, bh);
      } else if (s.type === "coin") {
        const cr = Math.max(3, r.halfW * 0.075);
        if (sy - cr * 2.6 > H) continue;
        const squash = Math.max(0.22, Math.abs(Math.sin(t * 5 + s.vseg)));
        const dw = cr * 2.9 * squash;
        const dh = cr * 2.9;
        ctx.drawImage(this.coinSprite, sx - dw / 2, sy - cr * 1.15 - dh / 2, dw, dh);
      } else if (s.type === "sign") {
        const img = this.signSprites[s.variant ?? 0];
        if (!img) continue;
        const dh = Math.max(10, r.halfW * 0.62);
        const dw = dh * (img.width / img.height);
        if (sy - dh > H || sx + dw < 0 || sx - dw > W) continue;
        ctx.drawImage(img, sx - dw / 2, sy - dh, dw, dh);
      } else if (s.type === "milestone") {
        const img = this.milestoneSprites[s.variant ?? 0];
        if (!img) continue;
        const dh = Math.max(10, r.halfW * 0.56);
        const dw = dh * (img.width / img.height);
        if (sy - dh > H || sx + dw < 0 || sx - dw > W) continue;
        ctx.drawImage(img, sx - dw / 2, sy - dh, dw, dh);
      } else if (s.type === "gate") {
        const img = this.gateSprite;
        if (!img) continue;
        const dw = r.halfW * 2.7;
        const dh = dw * (img.height / img.width);
        if (sy - dh > H) continue;
        ctx.drawImage(img, r.x - dw / 2, sy - dh, dw, dh);
      } else {
        // vector pylon: three solid fills, no gradients, no texture sampling
        const ph = Math.max(7, r.halfW * 0.46);
        if (sy - ph > H || sx + ph < 0 || sx - ph > W) continue;
        const pw = Math.max(1.5, ph * 0.045);
        ctx.fillStyle = "rgba(0, 229, 255, 0.55)";
        ctx.fillRect(sx - pw / 2, sy - ph * 0.66, pw, ph * 0.66);
        ctx.fillStyle = "rgba(0, 229, 255, 0.2)";
        ctx.fillRect(sx - pw / 2, sy - ph, pw, ph * 0.34);
        ctx.fillStyle = COLORS.magenta;
        ctx.beginPath();
        ctx.arc(sx, sy - ph, pw * 0.85, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    /* ---- blackout crossover: headlight-cone darkness over the world ---- */
    if (this.night && this.nightSprite) {
      const sway = -this.steerVis * W * 0.045;
      ctx.drawImage(this.nightSprite, (W - this.nightSprite.width) / 2 + sway, 0);
    }

    /* ---- player car / cockpit interior ---- */
    if (this.viewMode === "cockpit") {
      this.drawCockpit(t, speedPct);
    } else if (this.phase !== "ready" && !(this.invulnT > 0 && Math.sin(t * 42) > 0.25)) {
      this.drawCar(t, speedPct);
    }

    /* ---- confetti (gate celebration) ---- */
    for (const p of this.confetti) {
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 5, 8);
    }
    ctx.globalAlpha = 1;

    /* ---- rewind flash ---- */
    if (this.rewindFxT > 0) {
      const f = this.rewindFxT / 0.45;
      ctx.fillStyle = `rgba(0, 229, 255, ${0.22 * f})`;
      ctx.fillRect(-16, -16, W + 32, H + 32);
      if (this.scanSprite) {
        ctx.globalAlpha = f;
        ctx.drawImage(this.scanSprite, 0, 0);
        ctx.globalAlpha = 1;
      }
    }

    /* ---- crash flash + explosion ---- */
    if (this.phase === "crash") {
      if (this.crashT < 0.12) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.3 * (1 - this.crashT / 0.12)})`;
        ctx.fillRect(-16, -16, W + 32, H + 32);
      }
      const es = 60 + this.crashT * 160;
      const boomY = this.viewMode === "cockpit" ? H * 0.45 : H - H * 0.17;
      ctx.globalAlpha = Math.max(0, 1 - this.crashT * 0.9);
      ctx.drawImage(this.boomSprite, W / 2 - es / 2, boomY - es / 2, es, es);
      ctx.globalAlpha = 1;
    }

    /* ---- Ctrl+Z freeze-frame ---- */
    if (this.phase === "prompt") {
      ctx.fillStyle = "rgba(13, 2, 33, 0.55)";
      ctx.fillRect(-16, -16, W + 32, H + 32);
      if (this.scanSprite) ctx.drawImage(this.scanSprite, 0, 0);
      const blink = Math.sin(t * 14) > -0.3;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (blink) {
        ctx.font = `${Math.round(Math.min(46, W * 0.045))}px "Press Start 2P", monospace`;
        ctx.fillStyle = COLORS.cyan;
        ctx.fillText("CTRL+Z?", W / 2 + 3, H * 0.42 + 3);
        ctx.fillStyle = "#f3ecff";
        ctx.fillText("CTRL+Z?", W / 2, H * 0.42);
      }
      ctx.font = `${Math.round(Math.min(15, W * 0.014))}px "Press Start 2P", monospace`;
      ctx.fillStyle = COLORS.amber;
      ctx.fillText("[Z] / TAP", W / 2, H * 0.53);
      // countdown bar
      const bw = Math.min(300, W * 0.3);
      ctx.fillStyle = "rgba(0, 229, 255, 0.25)";
      ctx.fillRect(W / 2 - bw / 2, H * 0.58, bw, 6);
      ctx.fillStyle = COLORS.cyan;
      ctx.fillRect(W / 2 - bw / 2, H * 0.58, bw * Math.max(0, this.promptT / REWIND_WINDOW), 6);
    }

    /* ---- floating score toasts ---- */
    if (this.toasts.length) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${Math.round(Math.min(20, W * 0.018))}px "Press Start 2P", monospace`;
      for (const toast of this.toasts) {
        ctx.globalAlpha = Math.max(0, 1 - toast.t / 0.9);
        const ty = H * 0.6 - toast.t * 70;
        ctx.fillStyle = "rgba(13, 2, 33, 0.8)";
        ctx.fillText(toast.text, W / 2 + 2, ty + 2);
        ctx.fillStyle = toast.color;
        ctx.fillText(toast.text, W / 2, ty);
      }
      ctx.globalAlpha = 1;
    }

    /* ---- HUD (crisp pixel text — no shadowBlur in the hot path) ---- */
    if (this.phase === "playing" || this.phase === "crash" || this.phase === "prompt") {
      const fs = Math.round(Math.min(18, Math.max(10, W * 0.015)));
      ctx.font = `${fs}px "Press Start 2P", monospace`;
      const text = (str: string, tx: number, ty: number, color: string) => {
        ctx.fillStyle = "rgba(13, 2, 33, 0.75)";
        ctx.fillText(str, tx + 2, ty + 2);
        ctx.fillStyle = color;
        ctx.fillText(str, tx, ty);
      };
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      text(`SCORE ${String(Math.round(this.score)).padStart(6, "0")}`, 18, 16, COLORS.text);
      ctx.textAlign = "right";
      const bestShown = Math.max(this.best, Math.round(this.score));
      text(`BEST ${String(bestShown).padStart(6, "0")}`, W - 18, 16, COLORS.text);
      ctx.textBaseline = "bottom";
      if (this.viewMode !== "cockpit") {
        ctx.textAlign = "right";
        text(`${Math.round(this.speed / 28)} KM/H`, W - 18, H - 16, COLORS.cyan);
      }
      ctx.textAlign = "left";
      const coinSz = fs * 1.3;
      // the dash owns the bottom edge in cockpit view — dock this group
      // under the SCORE line instead of over the speedometer
      const inCab = this.viewMode === "cockpit";
      const yRow = inCab ? 22 + fs * 1.8 : H - 18;
      ctx.textBaseline = inCab ? "top" : "bottom";
      ctx.drawImage(
        this.coinSprite,
        16,
        inCab ? yRow - (coinSz - fs) / 2 : yRow - coinSz,
        coinSz,
        coinSz
      );
      text(`${this.coins}`, 22 + coinSz, yRow, COLORS.amber);
      if (this.rewindCharge) {
        text("CTRL+Z x1", 22 + coinSz * 3.2, yRow, COLORS.cyan);
      }
    }
    if (this.showFps) {
      const fs = 12;
      ctx.font = `${fs}px "Press Start 2P", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = COLORS.lane;
      ctx.fillText(`${Math.round(this.fps)} FPS · Q${this.qualityIdx}`, W / 2, 16);
    }

    ctx.restore();
  }

  private drawCar(t: number, speedPct: number) {
    const { ctx, W, H } = this;
    const sprite = this.keyBrake ? this.carSpriteBrake : this.carSprite;
    if (!sprite) return;
    if (this.phase === "crash" && this.crashT > 0.55) return; // consumed by the explosion

    const cw = Math.min(150, Math.max(96, W * 0.13));
    const cx = W / 2;
    const cy = H - cw * 0.28;
    const bounce = Math.sin(t * 31) * speedPct * 1.6;
    const tilt =
      this.steerVis * 0.09 + this.curveAt(Math.floor(this.position / SEG_LEN)) * speedPct * 0.02;

    // ground shadow (stays put while the body bounces)
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + cw * 0.26, cw * 0.56, cw * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy + bounce);
    ctx.rotate(tilt);

    const dw = sprite.width / 2; // baked at 2× supersample
    const dh = sprite.height / 2;
    ctx.drawImage(sprite, -dw / 2, -dh + cw * 0.36, dw, dh);

    // exhaust flames at speed (dynamic — cheap two triangles)
    if (speedPct > 0.55 && Math.sin(t * 47) > -0.2) {
      const fl = cw * (0.1 + speedPct * 0.08) * (0.8 + 0.4 * Math.abs(Math.sin(t * 61)));
      ctx.fillStyle = "rgba(0, 229, 255, 0.75)";
      for (const ex of [-0.17, 0.17]) {
        ctx.beginPath();
        ctx.moveTo(cw * ex - cw * 0.028, cw * 0.3);
        ctx.lineTo(cw * ex, cw * 0.3 + fl);
        ctx.lineTo(cw * ex + cw * 0.028, cw * 0.3);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
