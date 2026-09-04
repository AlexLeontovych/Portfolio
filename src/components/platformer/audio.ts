/**
 * Sound for the platformer, synthesised rather than sampled.
 *
 * A handful of oscillators and noise bursts cost about four kilobytes of code
 * and nothing in download or licensing, where a sample pack would cost a
 * megabyte and an attribution trail. It also means every sound can be tuned by
 * a number here instead of a round trip through an audio editor.
 */

type Voice = "jump" | "land" | "swing" | "hitEnemy" | "hurt" | "coin" | "heart"
  | "kill" | "spear" | "charge" | "slam" | "die" | "clear" | "select"
  | "bossCast" | "bossHurt" | "bossDie";

const SCALE = [0, 2, 3, 5, 7, 8, 10, 12]; // natural minor — the sad-hero mode

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private step = 0;
  private _muted = false;
  private track: "calm" | "tense" | "boss" = "calm";

  get muted() {
    return this._muted;
  }

  /** Must be called from a user gesture — browsers refuse audio otherwise. */
  resume() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.32;
      this.musicGain.connect(this.master);
    }
    void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this._muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
  }

  destroy() {
    this.stopMusic();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  /* ------------------------------- primitives ------------------------------ */

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    sweepTo?: number,
    delay = 0,
  ) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, hp: number, lp: number, delay = 0) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hpf = ctx.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = hp;
    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hpf).connect(lpf).connect(g).connect(master);
    src.start(t);
  }

  /* --------------------------------- voices -------------------------------- */

  play(v: Voice) {
    if (!this.ctx || this._muted) return;
    switch (v) {
      case "jump":
        this.tone(330, 0.16, "square", 0.16, 620);
        break;
      case "land":
        this.noise(0.08, 0.16, 120, 1400);
        break;
      case "swing":
        this.noise(0.13, 0.2, 700, 5200);
        break;
      case "hitEnemy":
        this.noise(0.09, 0.34, 300, 3000);
        this.tone(180, 0.1, "square", 0.16, 90);
        break;
      case "kill":
        this.tone(240, 0.26, "sawtooth", 0.18, 70);
        this.noise(0.24, 0.24, 200, 2600);
        break;
      case "hurt":
        this.tone(300, 0.3, "sawtooth", 0.24, 90);
        this.noise(0.16, 0.2, 200, 1800);
        break;
      case "coin":
        this.tone(1050, 0.07, "square", 0.16);
        this.tone(1580, 0.13, "square", 0.14, undefined, 0.06);
        break;
      case "heart":
        this.tone(520, 0.1, "triangle", 0.2);
        this.tone(780, 0.1, "triangle", 0.2, undefined, 0.09);
        this.tone(1040, 0.22, "triangle", 0.2, undefined, 0.18);
        break;
      case "spear":
        this.tone(880, 0.18, "sawtooth", 0.14, 300);
        this.noise(0.1, 0.14, 900, 6000);
        break;
      case "charge":
        this.tone(140, 0.5, "sawtooth", 0.1, 420);
        break;
      case "slam":
        this.tone(90, 0.45, "sawtooth", 0.3, 34);
        this.noise(0.35, 0.32, 60, 900);
        break;
      case "die":
        this.tone(420, 0.7, "square", 0.2, 60);
        break;
      case "clear":
        [0, 4, 7, 12].forEach((s, i) =>
          this.tone(392 * Math.pow(2, s / 12), 0.3, "triangle", 0.2, undefined, i * 0.1),
        );
        break;
      case "select":
        this.tone(660, 0.07, "square", 0.12);
        break;
      case "bossCast":
        this.tone(220, 0.36, "sawtooth", 0.16, 700);
        break;
      case "bossHurt":
        this.tone(160, 0.18, "square", 0.2, 80);
        this.noise(0.12, 0.2, 200, 2200);
        break;
      case "bossDie":
        this.tone(160, 1.4, "sawtooth", 0.3, 30);
        this.noise(1.2, 0.3, 60, 1200);
        break;
    }
  }

  /* --------------------------------- music --------------------------------- */

  /**
   * A four-bar arpeggio walked one step at a time. Not a song, but it moves,
   * it changes key between biomes, and it makes the boss fight feel different
   * from the forest without shipping a single audio file.
   */
  startMusic(track: "calm" | "tense" | "boss") {
    this.track = track;
    if (!this.ctx || this.musicTimer !== null) return;
    const beat = track === "boss" ? 128 : track === "tense" ? 148 : 172;
    this.musicTimer = window.setInterval(() => this.tick(), beat);
  }

  setTrack(track: "calm" | "tense" | "boss") {
    if (this.track === track) return;
    this.stopMusic();
    this.startMusic(track);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private tick() {
    const ctx = this.ctx;
    const bus = this.musicGain;
    if (!ctx || !bus || this._muted) return;
    const s = this.step++;
    const root = this.track === "boss" ? 55 : this.track === "tense" ? 65.4 : 73.4;
    const bar = Math.floor(s / 8) % 4;
    const degree = [0, 5, 3, 4][bar];

    // bass on the beat
    if (s % 4 === 0) {
      this.voice(root * Math.pow(2, degree / 12), 0.42, "triangle", 0.5, bus);
    }
    // arpeggio
    const note = SCALE[(s * (this.track === "boss" ? 3 : 2)) % SCALE.length];
    const f = root * 4 * Math.pow(2, (degree + note) / 12);
    this.voice(f, 0.2, this.track === "boss" ? "sawtooth" : "square", 0.16, bus);
    // hat
    if (this.track !== "calm" && s % 2 === 1) this.noise(0.03, 0.05, 5000, 12000);
  }

  private voice(freq: number, dur: number, type: OscillatorType, gain: number, out: GainNode) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}
