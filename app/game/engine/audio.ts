/**
 * Tiny WebAudio synth: every sound effect is generated from oscillators and a shared noise
 * buffer — no audio files. The context is created on the first user gesture (start button).
 * Mute persists in localStorage.
 */
export type SfxName =
  | 'punch'
  | 'hit'
  | 'whoosh'
  | 'shuttle'
  | 'kick'
  | 'cheer'
  | 'correct'
  | 'wrong'
  | 'ko'
  | 'special'
  | 'block'
  | 'blip'
  | 'whistle'
  | 'bounce';

const MUTE_KEY = 'cm_game_mute';

export function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted: boolean;

  constructor() {
    this.muted = typeof window === 'undefined' ? true : readMuted();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* storage blocked: mute still applies for this session */
    }
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(
    dur: number,
    vol: number,
    filter: BiquadFilterType,
    f0: number,
    f1: number,
    q = 1,
    delay = 0,
  ) {
    const c = this.ctx;
    if (!c || !this.master || !this.noise) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const bq = c.createBiquadFilter();
    bq.type = filter;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(f0, t);
    bq.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bq).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  /** `power` 0..1 scales weight; `pan`-free by design (mono is fine for a phone speaker). */
  play(name: SfxName, power = 0.6) {
    if (this.muted || !this.ctx) return;
    const p = Math.max(0.2, Math.min(1, power));
    switch (name) {
      case 'punch':
        this.hiss(0.08, 0.5 * p, 'lowpass', 2400, 400);
        this.tone('sine', 160, 60, 0.1, 0.6 * p);
        break;
      case 'hit':
        this.hiss(0.16, 0.7 * p, 'lowpass', 3200, 300);
        this.tone('square', 220 * (1.2 - p * 0.4), 50, 0.16, 0.32 * p);
        this.tone('sine', 120, 40, 0.2, 0.8 * p);
        break;
      case 'block':
        this.tone('triangle', 900, 700, 0.07, 0.3);
        this.hiss(0.06, 0.25, 'highpass', 3000, 2000);
        break;
      case 'whoosh':
        this.hiss(0.22, 0.35 * p, 'bandpass', 500, 2600, 2);
        break;
      case 'shuttle':
        this.tone('triangle', 1500 + p * 400, 900, 0.05, 0.4);
        this.hiss(0.03, 0.3, 'highpass', 4000, 3000);
        break;
      case 'kick':
        this.tone('sine', 140, 45, 0.18, 0.9 * p);
        this.hiss(0.04, 0.4, 'highpass', 2500, 1500);
        break;
      case 'bounce':
        this.tone('sine', 110, 70, 0.08, 0.35 * p);
        break;
      case 'cheer':
        this.hiss(1.4, 0.32, 'bandpass', 900, 1400, 0.6);
        this.hiss(1.1, 0.2, 'bandpass', 2200, 1800, 1.2, 0.1);
        for (const [i, f] of [523, 659, 784, 1047].entries())
          this.tone('square', f, f, 0.12, 0.08, 0.05 + i * 0.07);
        break;
      case 'correct':
        for (const [i, f] of [523, 659, 784].entries())
          this.tone('triangle', f, f * 1.01, 0.14, 0.35, i * 0.08);
        break;
      case 'wrong':
        this.tone('sawtooth', 300, 120, 0.35, 0.22);
        this.tone('square', 150, 90, 0.35, 0.12);
        break;
      case 'ko':
        this.tone('sine', 90, 30, 0.9, 0.9);
        this.hiss(0.8, 0.6, 'lowpass', 1800, 80);
        break;
      case 'special':
        this.tone('sawtooth', 120, 900, 0.4, 0.18);
        this.hiss(0.5, 0.3, 'bandpass', 300, 3000, 3);
        break;
      case 'blip':
        this.tone('square', 880, 880, 0.06, 0.12);
        break;
      case 'whistle':
        this.tone('sine', 2100, 2050, 0.35, 0.25);
        this.tone('sine', 2160, 2100, 0.35, 0.12);
        break;
    }
  }
}
