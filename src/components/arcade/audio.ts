import { GameSound, type Drone } from "../../lib/gameAudio";

/**
 * What NEON RUN can say, and the engine it says it over.
 *
 * The mixer is the one all three games share; this adds the car. An engine
 * is not a noise you play but a noise you hold and bend, so it is two held
 * loops rather than a cue: a low one that carries the body of it and a
 * bright one that carries the strain, both pitched by how fast the car is
 * going, the bright one brought in as the speed comes up. A third loop is
 * the hiss of the shoulder, opened only when the car leaves the road.
 *
 * Which file each is cut from lives in scripts/arcade_audio.py.
 */
export type Cue =
  | "engineLow" | "engineHigh" | "gravel"
  | "count" | "go" | "coin" | "graze" | "sign"
  | "alert" | "rewind" | "crash"
  | "fanfare" | "click";

export type Track = "drive";

/** Playback rate of the engine loops at a standstill and flat out. */
const IDLE_RATE = 0.55;
const TOP_RATE = 1.5;
/** And how loud each layer is at full throttle. */
const LOW_LEVEL = 0.5;
const HIGH_LEVEL = 0.42;
const GRAVEL_LEVEL = 0.5;

export class ArcadeAudio extends GameSound<Cue, Track> {
  private low: Drone | null = null;
  private high: Drone | null = null;
  private dirt: Drone | null = null;

  constructor() {
    super("./games/arcade/audio");
  }

  /**
   * Start the car. Safe to call before the sprite has arrived — it simply
   * does nothing, and the next call once it has will take.
   */
  startEngine(): boolean {
    if (this.low || !this.ready) return false;
    this.low = this.drone("engineLow", 0, IDLE_RATE);
    this.high = this.drone("engineHigh", 0, IDLE_RATE);
    this.dirt = this.drone("gravel", 0, 1);
    return this.low !== null;
  }

  stopEngine() {
    this.low?.stop();
    this.high?.stop();
    this.dirt?.stop();
    this.low = this.high = this.dirt = null;
  }

  /**
   * Hand the car's state to the sound.
   *
   * @param throttle 0 at a standstill, 1 flat out
   * @param offroad  true while the car is on the shoulder
   */
  engine(throttle: number, offroad: boolean) {
    // the sprite is usually still in the air when the first run starts, so
    // the car takes hold on whichever frame it lands rather than never
    if (!this.low && !this.startEngine()) return;
    const t = Math.max(0, Math.min(1, throttle));
    const rate = IDLE_RATE + (TOP_RATE - IDLE_RATE) * t;
    // the body of the engine is there from idle; the strain arrives late,
    // which is what makes the top of the range sound like effort
    this.low?.set(LOW_LEVEL * (0.45 + 0.55 * t), rate);
    this.high?.set(HIGH_LEVEL * Math.max(0, t - 0.35) / 0.65, rate);
    this.dirt?.set(offroad ? GRAVEL_LEVEL * (0.4 + 0.6 * t) : 0, 1);
  }
}
