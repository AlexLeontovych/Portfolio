import { sound } from "./muted";

/**
 * The mixer the games share: one sprite of effects, one track of music.
 *
 * Every effect a game can make lives in a single file — cues laid end to end
 * with a breath of silence between them — and playing one is an offset into
 * a buffer that was decoded once. scripts/audio_sprite.py cuts it; CREDITS.md
 * says where the CC0 packs it is cut from live.
 *
 * Three things keep a game from sounding like a machine gun, and all three
 * are here rather than in the engines, because an engine should be able to
 * say "an arrow hit" without also knowing that eleven arrows hit this frame:
 *
 *   * a cue may hold several recordings, and which one plays is decided
 *     when it plays;
 *   * every voice is detuned a few per cent, so the same recording twice
 *     running is not the same sound twice running;
 *   * a cue just heard is not heard again for a moment, and there is a
 *     ceiling on how many voices may sound at once.
 */
interface Sheet {
  rate: number;
  cues: Record<string, [number, number][]>;
}

/** A held sound — an engine, a hiss — whose pitch and level the game steers. */
export interface Drone {
  set(gain: number, rate: number): void;
  stop(): void;
}

/** How loud a game is when nothing is turned down. */
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
/** Anything above this in the decoded sprite is a cue rather than the gap. */
const AUDIBLE = 0.02;

export class GameSound<C extends string, T extends string> {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;

  private sprite: AudioBuffer | null = null;
  private slots: Record<string, [number, number][]> = {};
  /**
   * How late the decoder handed the sprite back, in seconds.
   *
   * An AAC file carries a couple of frames of encoder delay. Some browsers
   * strip it by the container's edit list and some do not, so rather than
   * trust either, the first cue is found in the decoded buffer and compared
   * with where it was laid down. Every offset is read through the answer.
   */
  private shift = 0;
  private loading: Promise<void> | null = null;

  private tracks = new Map<T, AudioBuffer>();
  private now: { name: T; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wanted: T | null = null;

  private lastAt: Partial<Record<C, number>> = {};
  private voices = 0;

  /** @param base where this game's audio lives, e.g. "./games/td/audio" */
  constructor(private readonly base: string) {}

  get ready() {
    return this.sprite !== null;
  }

  /**
   * Build the graph and start fetching. Must be called from a user gesture:
   * a browser will not let a page make a noise the reader did not ask for,
   * and an AudioContext created anywhere else starts suspended and stays
   * that way.
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
    this.loading ??= this.load();
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

  play(cue: C, gain = 1, rate = 1) {
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
    src.start(t, start + this.shift, len + 0.05);
  }

  /**
   * Hold a cue open — an engine, the hiss of a shoulder — for the game to
   * steer. The clip was made periodic when it was cut, so it comes round
   * without a seam wherever the decoder happened to start it.
   */
  drone(cue: C, gain = 0, rate = 1): Drone | null {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    const take = this.slots[cue]?.[0];
    if (!ctx || !bus || !this.sprite || !take) return null;
    const [start, len] = take;
    const src = ctx.createBufferSource();
    src.buffer = this.sprite;
    src.loop = true;
    src.loopStart = start + this.shift;
    src.loopEnd = start + this.shift + len;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(bus);
    src.start(ctx.currentTime, src.loopStart);
    let live = true;
    return {
      set: (to: number, r: number) => {
        if (!live || !this.ctx) return;
        const at = this.ctx.currentTime;
        // a ramp rather than a jump: a hundred frames a second setting a
        // gain outright is a buzz, and setting a pitch outright is a warble
        g.gain.setTargetAtTime(sound.muted() ? 0 : to, at, 0.06);
        src.playbackRate.setTargetAtTime(r, at, 0.08);
      },
      stop: () => {
        if (!live) return;
        live = false;
        const at = this.ctx?.currentTime ?? 0;
        g.gain.setTargetAtTime(0, at, 0.08);
        try {
          src.stop(at + 0.4);
        } catch {
          /* already gone */
        }
      },
    };
  }

  /* ---------------------------------- music --------------------------------- */

  /**
   * Put a track on, or take one off with `null`.
   *
   * Tracks are fetched the first time they are wanted and kept after that: a
   * megabyte is worth downloading once and not worth downloading before the
   * reader has shown any interest in the game.
   */
  async setTrack(name: T | null) {
    this.wanted = name;
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    if (this.now?.name === name) return;
    if (name === null) {
      this.fade(this.now);
      this.now = null;
      return;
    }
    let buf = this.tracks.get(name);
    if (!buf) {
      try {
        buf = await this.decode(`${this.base}/${name}.m4a`);
      } catch {
        return; // no music is a shame, not a fault
      }
      this.tracks.set(name, buf);
      // the player may have moved on while a megabyte was in the air
      if (this.wanted !== name || !this.ctx) return;
    }
    this.fade(this.now);
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

  private fade(v: { src: AudioBufferSourceNode; gain: GainNode } | null) {
    const ctx = this.ctx;
    if (!v || !ctx) return;
    const end = ctx.currentTime + CROSSFADE;
    v.gain.gain.cancelScheduledValues(ctx.currentTime);
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), ctx.currentTime);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, end);
    v.src.stop(end + 0.05);
  }

  /* --------------------------------- loading -------------------------------- */

  private async load() {
    try {
      const sheet = await fetch(`${this.base}/sfx.json`).then((r) => r.json() as Promise<Sheet>);
      this.slots = sheet.cues;
      const buf = await this.decode(`${this.base}/sfx.m4a`);
      this.shift = this.measureShift(buf);
      this.sprite = buf;
    } catch {
      this.sprite = null; // a silent game is still a game
    }
  }

  /** Where the first cue actually landed, less where it was laid down. */
  private measureShift(buf: AudioBuffer): number {
    const first = Object.values(this.slots)[0]?.[0];
    if (!first) return 0;
    const data = buf.getChannelData(0);
    const upto = Math.min(data.length, Math.ceil((first[0] + 0.5) * buf.sampleRate));
    for (let i = 0; i < upto; i++) {
      if (Math.abs(data[i]) > AUDIBLE) {
        // never negative: a cue heard early would be the previous gap, and
        // there is no gap before the first one
        return Math.max(0, i / buf.sampleRate - first[0]);
      }
    }
    return 0;
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
