import { sound } from "../../lib/muted";

/**
 * The sound of IRONWOOD KEEP: one sprite, three tracks, and a mixer.
 *
 * Every effect in the game lives in a single file — thirty cues laid end to
 * end with a breath of silence between them — and playing one is an offset
 * into a buffer that was decoded once. See scripts/td_audio.py for how it is
 * cut, and CREDITS.md for where the CC0 packs it is cut from live.
 *
 * Three things keep a tower defense from sounding like a machine gun, and
 * all three are here rather than in the engine, because the engine should be
 * able to say "an arrow hit" without also knowing that eleven arrows hit
 * this frame:
 *
 *   * a cue may hold several recordings, and which one plays is decided
 *     when it plays;
 *   * every voice is detuned a few per cent, so the same recording twice
 *     running is not the same sound twice running;
 *   * a cue that has just been heard is not heard again for a moment, and
 *     there is a ceiling on how many voices may sound at once. A wave of
 *     twenty mushrooms dying to one bombard shell is one death and a
 *     flourish, not twenty deaths.
 */
export type Cue =
  | "select" | "click" | "build" | "upgrade" | "sell" | "deny" | "arm"
  | "bow" | "bolt" | "cannon" | "gun" | "boom" | "hit"
  | "swing" | "clash"
  | "dieSoft" | "dieYelp" | "dieBony" | "dieShade" | "soldierDie" | "boss"
  | "wave" | "leak" | "coins" | "gate"
  | "fireball" | "rain" | "heal"
  | "win" | "lose";

/** One track per biome, loaded when a level on it is started. */
export type Track = "forest" | "cave" | "ember";

interface Sheet {
  rate: number;
  cues: Record<string, [number, number][]>;
}

/** How loud the game is when nothing is turned down. */
const MASTER = 0.7;
const MUSIC_LEVEL = 0.38;
/** The same cue is not started twice inside this many seconds. */
const REPEAT = 0.045;
/** And no more than this many effects sound at once, whatever is happening. */
const VOICES = 14;
/** How wide the random detune on each voice is, either side of true. */
const DETUNE = 0.06;
/** Seconds one track takes to give way to another. */
const CROSSFADE = 1.4;

export class TdAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;

  private sprite: AudioBuffer | null = null;
  private slots: Record<string, [number, number][]> = {};
  private loading: Promise<void> | null = null;

  private tracks = new Map<Track, AudioBuffer>();
  private now: { name: Track; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wanted: Track | null = null;

  private lastAt: Partial<Record<Cue, number>> = {};
  private voices = 0;

  /**
   * Build the graph and start fetching. Must be called from a user gesture:
   * a browser will not let a page make a noise the reader did not ask for,
   * and an AudioContext created anywhere else starts suspended and stays
   * that way. The level-select screen's MARCH button is that gesture.
   */
  wake() {
    if (!this.ctx) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = sound.muted() ? 0 : MASTER;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = MUSIC_LEVEL;
      this.musicBus.connect(this.master);
    }
    void this.ctx.resume();
    this.loading ??= this.loadSprite();
  }

  setMuted(m: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.master.gain.setTargetAtTime(m ? 0 : MASTER, ctx.currentTime, 0.05);
  }

  destroy() {
    this.now?.src.stop();
    this.now = null;
    void this.ctx?.close();
    this.ctx = null;
    this.sprite = null;
    this.loading = null;
  }

  /* --------------------------------- effects -------------------------------- */

  play(cue: Cue, gain = 1, rate = 1) {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || !this.sprite || sound.muted()) return;
    const takes = this.slots[cue];
    if (!takes?.length) return;

    const t = ctx.currentTime;
    if (t - (this.lastAt[cue] ?? -1) < REPEAT || this.voices >= VOICES) return;
    this.lastAt[cue] = t;

    const [start, len] = takes[(Math.random() * takes.length) | 0];
    const src = ctx.createBufferSource();
    src.buffer = this.sprite;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * DETUNE);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(bus);
    this.voices++;
    src.onended = () => {
      this.voices--;
    };
    // the tail of silence after the cue is harmless and covers any frame the
    // decoder shifted the sprite by
    src.start(t, start, len + 0.1);
  }

  /* ---------------------------------- music --------------------------------- */

  /**
   * Put a track on, or take one off with `null`.
   *
   * The tracks are fetched the first time a level on that biome is played
   * and kept after that: a megabyte each is worth downloading once and not
   * worth downloading before the reader has shown any interest in the game.
   */
  async setTrack(name: Track | null) {
    this.wanted = name;
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    if (this.now?.name === name) return;
    if (name === null) {
      this.fade(this.now, 0);
      this.now = null;
      return;
    }
    let buf = this.tracks.get(name);
    if (!buf) {
      try {
        buf = await this.decode(`./games/td/audio/${name}.m4a`);
      } catch {
        return; // no music is a shame, not a fault
      }
      this.tracks.set(name, buf);
      // the player may have moved on while a megabyte was in the air
      if (this.wanted !== name || !this.ctx) return;
    }
    this.fade(this.now, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    src.connect(gain).connect(this.musicBus);
    src.start();
    gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + CROSSFADE);
    this.now = { name, src, gain };
  }

  private fade(v: { src: AudioBufferSourceNode; gain: GainNode } | null, to: number) {
    const ctx = this.ctx;
    if (!v || !ctx) return;
    const end = ctx.currentTime + CROSSFADE;
    v.gain.gain.cancelScheduledValues(ctx.currentTime);
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), ctx.currentTime);
    v.gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, to), end);
    if (to <= 0) v.src.stop(end + 0.05);
  }

  /* --------------------------------- loading -------------------------------- */

  private async loadSprite() {
    try {
      const sheet = await fetch("./games/td/audio/sfx.json").then((r) => r.json() as Promise<Sheet>);
      this.slots = sheet.cues;
      this.sprite = await this.decode("./games/td/audio/sfx.m4a");
    } catch {
      this.sprite = null; // a silent game is still a game
    }
  }

  private async decode(url: string): Promise<AudioBuffer> {
    const bytes = await fetch(url).then((r) => r.arrayBuffer());
    const ctx = this.ctx;
    if (!ctx) throw new Error("no audio context");
    // Safari's decodeAudioData is the callback one; the promise it also
    // returns is only there on newer versions, so it is wrapped either way
    return await new Promise<AudioBuffer>((ok, no) => ctx.decodeAudioData(bytes, ok, no));
  }
}
