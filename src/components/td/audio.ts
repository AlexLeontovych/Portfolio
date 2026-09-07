import { GameSound } from "../../lib/gameAudio";

/**
 * What IRONWOOD KEEP can say, and what it plays underneath while it says it.
 *
 * The mixer is the one all three games share; this is the vocabulary. Which
 * file each of these is cut from lives in scripts/td_audio.py, and who made
 * it in CREDITS.md.
 */
export type Cue =
  | "select" | "click" | "build" | "upgrade" | "sell" | "deny" | "arm"
  | "bow" | "bolt" | "cannon" | "gun" | "boom" | "hit"
  | "swing" | "clash"
  | "soldierDie" | "boss"
  | "wave" | "leak" | "coins" | "gate"
  | "fireball" | "rain" | "heal"
  | "win" | "lose";

/** One track per biome, loaded when a level on it is started. */
export type Track = "forest" | "cave" | "ember";

export class TdAudio extends GameSound<Cue, Track> {
  constructor() {
    super("./games/td/audio");
  }
}
