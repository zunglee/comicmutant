/**
 * Freefall core: the whole game rule set, with no drawing, sound or DOM. The client runs it at a fixed
 * 60 Hz and the server re-runs it from the input log to verify a posted score, so it must be
 * bit-for-bit deterministic across JS engines:
 *  - randomness only from the seeded mulberry32 `rng`;
 *  - a fixed step (no dt parameter), timers counted in whole steps;
 *  - only + − × ÷, Math.floor/min/max/abs/sqrt (IEEE-exact) — never Math.sin/cos/pow/random, whose
 *    last bits can differ between V8 and JavaScriptCore.
 * World units: the shaft is SW wide; y grows downward (depth). The camera keeps the hero HERO_Y below
 * the top of a VIEW_H-tall window.
 */
import { rng } from '../engine/math';
import { type Level, makeQuestion, type Question } from './maths';

export const SW = 540;
export const VIEW_H = 680;
/** Hero's height in the view: high, so ~550 units of shaft are visible below. */
export const HERO_Y = 130;
export const HERO_R = 20;
export const STEP = 1 / 60;
/** One "floor" of the tower, in world units (the depth counter). */
export const FLOOR = 120;
export const LANES = [90, 270, 450] as const;
/** Hearts at the start and the cap for heals. */
export const MAX_HEARTS = 4;
/** A correct streak of this length heals a heart. */
export const HEAL_EVERY = 8;
/** Every this many people caught heals a heart. */
export const SAVE_HEAL = 3;

interface Tune {
  /** Fall speed at the start (units/s). */
  base: number;
  /** Seconds from a question appearing to reaching its slab, at the start and at its floor. */
  think: number;
  thinkMin: number;
  /** Late-run floor: past 30 slabs the think time keeps shrinking toward this. */
  thinkFloor: number;
  /** Width of each opening in a slab. */
  open: number;
  /** Debris rows per 1000 units at the start. */
  debris: number;
}

export const TUNE: Record<Level, Tune> = {
  easy: { base: 230, think: 6.2, thinkMin: 4.0, thinkFloor: 1.6, open: 144, debris: 0.7 },
  normal: { base: 265, think: 4.8, thinkMin: 3.0, thinkFloor: 1.3, open: 128, debris: 1.3 },
  hard: { base: 300, think: 4.0, thinkMin: 2.5, thinkFloor: 1.1, open: 112, debris: 1.7 },
};

const MAX_VX = 560;
const ACCEL_X = 4200;
const ACCEL_Y = 900;
const DIVE = 1.55;
const BRAKE = 0.6;
const INVULN = 60;
/** Steps a run can last before the server refuses to replay it (20 minutes). */
export const MAX_STEPS = 60 * 60 * 20;

export interface Ctl {
  /** Keys / pad: −1 left, 1 right. Ignored while `target` ≥ 0. */
  steer: -1 | 0 | 1;
  /** Drag or lane key: x to steer toward (0..SW), −1 for none. Integer. */
  target: number;
  dive: boolean;
  brake: boolean;
}

export const IDLE: Ctl = { steer: 0, target: -1, dive: false, brake: false };

export interface Gate {
  id: number;
  y: number;
  q: Question;
  open: number;
  /** ahead → passed: 'ok' (right opening), 'wrong' (another opening), 'wall'. */
  state: 'ahead' | 'ok' | 'wrong' | 'wall';
  /** Opening the hero went through (−1 = wall). */
  pick: number;
  /** Step it was resolved. */
  at: number;
}

export interface Debris {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  /** Visual tumble seed. */
  spin: number;
  hit: boolean;
  /** Step it was spawned (the view fades it in out of the haze). */
  born: number;
}

export interface Civilian {
  id: number;
  x: number;
  y: number;
  vx: number;
  saved: boolean;
  born: number;
  /** Visual variety. */
  look: number;
}

export type FfEvent =
  | { k: 'correct'; x: number; y: number; streak: number; pts: number }
  | { k: 'wrong' | 'wall'; x: number; y: number; answer: number }
  | { k: 'hit'; x: number; y: number }
  | { k: 'save'; x: number; y: number }
  | { k: 'heal'; why: 'streak' | 'save' }
  | { k: 'question'; q: Question }
  | { k: 'over'; cause: Cause };

/** What took the last heart (or 'ground': the tower's bottom, reached after MAX_STEPS). */
export type Cause = 'rubble' | 'wrong' | 'wall' | 'ground';

export interface Miss {
  text: string;
  answer: number;
  /** What the hero flew through; null = hit the wall. */
  picked: number | null;
}

export interface Summary {
  score: number;
  floors: number;
  correct: number;
  asked: number;
  saved: number;
  best: number;
  steps: number;
  over: boolean;
  /** Rubble hits taken. */
  hits: number;
  /** People who fell within reach this run (the saves rule compares against it). */
  people: number;
  /** Times the run was paused (logged by the client; a long think on pause is held for a look). */
  pauses: number;
  cause: Cause | null;
}

export class FreefallCore {
  readonly level: Level;
  readonly seed: number;
  /** The tower (slab spacing, rubble, people): shared by everyone on the same seed. */
  private rand: () => number;
  /** The sums and their lane order: per run, so today's tower can't be learned off by heart. */
  private qrand: () => number;
  private t: Tune;

  step = 0;
  over = false;
  x = SW / 2;
  vx = 0;
  depth = 0;
  vy: number;
  hearts = MAX_HEARTS;
  invuln = 0;
  streak = 0;
  best = 0;
  correct = 0;
  asked = 0;
  saved = 0;
  gatePts = 0;
  diveDist = 0;
  diving = false;
  braking = false;
  gates: Gate[] = [];
  debris: Debris[] = [];
  civs: Civilian[] = [];
  misses: Miss[] = [];
  hits = 0;
  people = 0;
  pauses = 0;
  cause: Cause | null = null;
  /** Events from the last step (presentation reads and clears them). */
  events: FfEvent[] = [];
  private nextId = 1;

  constructor(seed: number, level: Level, qseed = seed) {
    this.seed = seed >>> 0;
    this.level = level;
    this.rand = rng(this.seed || 1);
    this.qrand = rng((qseed ^ 0x9e3779b9) >>> 0 || 7);
    this.t = TUNE[level];
    this.vy = this.t.base;
    // First slab after a run-up: think time plus a beat to read the first sum.
    this.spawnGate(this.t.base * (this.t.think + 1.5));
  }

  /** Nominal fall speed now (no dive/brake): +2.5% per slab, up to 2.5×. */
  get cruise(): number {
    return this.t.base * (1 + 0.025 * Math.min(this.asked, 60));
  }

  /** Think time per slab: −0.06 s a slab to thinkMin, then −0.04 s a slab to the floor (so even a
   *  near-perfect run ends in minutes, not tens of minutes). */
  get think(): number {
    const early = Math.max(this.t.thinkMin, this.t.think - 0.06 * this.asked);
    return Math.max(this.t.thinkFloor, early - 0.04 * Math.max(0, this.asked - 30));
  }

  get floors(): number {
    return Math.floor(this.depth / FLOOR);
  }

  get score(): number {
    return this.floors + this.gatePts + this.saved * 30 + Math.floor(this.diveDist / 30);
  }

  /** The slab whose sum is on screen. */
  get gate(): Gate | undefined {
    return this.gates.find((g) => g.state === 'ahead');
  }

  get stage(): number {
    return Math.floor(this.asked / 5);
  }

  summary(): Summary {
    return {
      score: this.score,
      floors: this.floors,
      correct: this.correct,
      asked: this.asked,
      saved: this.saved,
      best: this.best,
      steps: this.step,
      over: this.over,
      hits: this.hits,
      people: this.people,
      pauses: this.pauses,
      cause: this.cause,
    };
  }

  private spawnGate(dist: number) {
    const last = this.gates.length ? (this.gates[this.gates.length - 1] as Gate).y : this.depth;
    const y = Math.max(last, this.depth) + dist;
    const q = makeQuestion(this.qrand, this.level, this.stage);
    const g: Gate = {
      id: this.nextId++,
      y,
      q,
      open: Math.max(this.t.open - this.stage * 4, this.t.open - 20),
      state: 'ahead',
      pick: -1,
      at: 0,
    };
    // Off-screen below the camera, and clear of the slab by ≥ 0.8 s of fall (time to line up the
    // opening without swerving round rubble).
    this.populate(this.depth + VIEW_H - HERO_Y + 40, y - Math.max(230, 0.8 * this.cruise));
    this.gates.push(g);
    this.events.push({ k: 'question', q });
  }

  /** Debris rows and civilians between two depths. Every row leaves a clear gap ≥ 170. */
  private populate(from: number, to: number) {
    const r = this.rand;
    // Rubble starts sparse and thickens to 1.3× — the sums, not the rubble, should end a run.
    const density = this.t.debris * (0.6 + 0.035 * Math.min(this.asked, 20));
    const rowGap = 1000 / density;
    for (let y = from + rowGap * (0.3 + r() * 0.4); y < to; y += rowGap * (0.7 + r() * 0.6)) {
      const n = r() < 0.2 + 0.02 * Math.min(this.asked, 15) ? 2 : 1;
      const gapAt = 85 + r() * (SW - 170);
      for (let i = 0; i < n; i++) {
        const w = 60 + Math.floor(r() * 90);
        // Left of the gap or right of it.
        const left = i === 0 ? r() < 0.5 : true;
        const lo = left ? 0 : gapAt + 85;
        const hi = left ? gapAt - 85 - w : SW - w;
        if (hi < lo) continue;
        const x = lo + r() * (hi - lo) + w / 2;
        const drift = (r() - 0.5) * 2 * (12 + 1.5 * Math.min(this.asked, 20));
        this.debris.push({
          id: this.nextId++,
          x,
          y: y + (i ? r() * 60 : 0),
          w,
          h: 26 + Math.floor(r() * 26),
          vx: drift,
          spin: r(),
          hit: false,
          born: this.step,
        });
      }
    }
    const civs = r() < 0.55 ? 1 : 2;
    for (let i = 0; i < civs; i++) {
      this.people++;
      this.civs.push({
        id: this.nextId++,
        x: 50 + r() * (SW - 100),
        y: from + (to - from) * (0.2 + r() * 0.6),
        vx: (r() - 0.5) * 50,
        saved: false,
        look: Math.floor(r() * 4),
        born: this.step,
      });
    }
  }

  private hurt(cause: Exclude<Cause, 'ground'>): boolean {
    if (this.invuln > 0) return false;
    this.hearts--;
    this.invuln = INVULN;
    this.streak = 0;
    if (cause === 'rubble') this.hits++;
    if (this.hearts <= 0) this.end(cause);
    return true;
  }

  private end(cause: Cause) {
    this.over = true;
    this.cause = cause;
    this.events.push({ k: 'over', cause });
  }

  update(c: Ctl) {
    if (this.over) return;
    this.events.length = 0;
    this.step++;
    // The tower has a bottom: a run that long ends in a landing (and can always be posted).
    if (this.step >= MAX_STEPS) {
      this.end('ground');
      return;
    }
    const dt = STEP;
    if (this.invuln > 0) this.invuln--;

    // Fall speed eases toward cruise × dive/brake.
    this.diving = c.dive && !c.brake;
    this.braking = c.brake;
    const want = this.cruise * (this.diving ? DIVE : this.braking ? BRAKE : 1);
    const dv = ACCEL_Y * dt * (this.diving ? 2 : 1);
    this.vy = this.vy < want ? Math.min(want, this.vy + dv) : Math.max(want, this.vy - dv * 1.5);
    const fell = this.vy * dt;
    this.depth += fell;
    if (this.diving) this.diveDist += fell;

    // Steering: toward a target x (drag, lane keys) or by the held direction.
    let wantVx: number;
    if (c.target >= 0) {
      const d = c.target - this.x;
      wantVx = Math.max(-MAX_VX, Math.min(MAX_VX, d * 9));
    } else wantVx = c.steer * MAX_VX;
    const ax = ACCEL_X * dt;
    this.vx = this.vx < wantVx ? Math.min(wantVx, this.vx + ax) : Math.max(wantVx, this.vx - ax);
    this.x += this.vx * dt;
    if (this.x < HERO_R) {
      this.x = HERO_R;
      this.vx = 0;
    } else if (this.x > SW - HERO_R) {
      this.x = SW - HERO_R;
      this.vx = 0;
    }

    // Debris drifts and bounces off the shaft walls.
    for (const d of this.debris) {
      d.x += d.vx * dt;
      if (d.x < d.w / 2) {
        d.x = d.w / 2;
        d.vx = Math.abs(d.vx);
      } else if (d.x > SW - d.w / 2) {
        d.x = SW - d.w / 2;
        d.vx = -Math.abs(d.vx);
      }
      if (d.hit) continue;
      const cx = Math.max(d.x - d.w / 2, Math.min(this.x, d.x + d.w / 2));
      const cy = Math.max(d.y - d.h / 2, Math.min(this.depth, d.y + d.h / 2));
      const ex = this.x - cx;
      const ey = this.depth - cy;
      if (ex * ex + ey * ey < HERO_R * HERO_R * 0.8) {
        d.hit = true;
        if (this.hurt('rubble')) this.events.push({ k: 'hit', x: this.x, y: this.depth });
      }
    }

    for (const p of this.civs) {
      if (p.saved) continue;
      p.x += p.vx * dt;
      if (p.x < 30 || p.x > SW - 30) p.vx = -p.vx;
      const ex = p.x - this.x;
      const ey = p.y - this.depth;
      if (ex * ex + ey * ey < (HERO_R + 24) * (HERO_R + 24)) {
        p.saved = true;
        this.saved++;
        this.events.push({ k: 'save', x: p.x, y: p.y });
        // Every third person caught gives a heart back: rescuing is worth the detour.
        if (this.saved % SAVE_HEAL === 0 && this.hearts < MAX_HEARTS) {
          this.hearts++;
          this.events.push({ k: 'heal', why: 'save' });
        }
      }
    }

    // The slab: resolved the step the hero's centre crosses it.
    const g = this.gate;
    if (g && this.depth >= g.y) {
      this.asked++;
      g.at = this.step;
      let lane = -1;
      for (let i = 0; i < 3; i++)
        if (Math.abs(this.x - (LANES[i] as number)) <= g.open / 2) lane = i;
      g.pick = lane;
      if (lane === g.q.correct) {
        g.state = 'ok';
        this.correct++;
        this.streak++;
        this.best = Math.max(this.best, this.streak);
        const pts = 100 + 10 * Math.min(this.streak, 20);
        this.gatePts += pts;
        this.events.push({ k: 'correct', x: this.x, y: g.y, streak: this.streak, pts });
        if (this.streak % HEAL_EVERY === 0 && this.hearts < MAX_HEARTS) {
          this.hearts++;
          this.events.push({ k: 'heal', why: 'streak' });
        }
      } else {
        g.state = lane < 0 ? 'wall' : 'wrong';
        this.misses.push({
          text: g.q.text,
          answer: g.q.answer,
          picked: lane < 0 ? null : (g.q.options[lane] as number),
        });
        // A slab always costs a heart, even mid-invulnerability: the sum is the game.
        this.invuln = 0;
        this.hurt(g.state);
        this.events.push({ k: g.state, x: this.x, y: g.y, answer: g.q.answer });
      }
      if (!this.over) this.spawnGate(this.cruise * this.think);
    }

    // Forget what has scrolled far above the camera.
    const top = this.depth - HERO_Y - 160;
    if (this.debris.length && (this.debris[0] as Debris).y < top)
      this.debris = this.debris.filter((d) => d.y >= top);
    if (this.civs.length && (this.civs[0] as Civilian).y < top)
      this.civs = this.civs.filter((p) => p.y >= top);
    if (this.gates.length > 1 && (this.gates[0] as Gate).y < top) this.gates.shift();
  }
}
