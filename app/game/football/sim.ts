/** Big Head Football — 1v1 head football, two 45-second halves. */
import type { Fighter } from '~/lib/schema';
import { alpha, brightest, INK, readable } from '../engine/color';
import type { Input, PadState } from '../engine/input';
import { approach, clamp, rng, TAU } from '../engine/math';
import { H, W } from '../shell/const';
import { arenaLayer, banner, HEAD_FONT, inkText, onFill, plate } from '../shell/hud';
import { DISPLAY_FONT } from '../sprite/backdrop';
import { POSE_LOOP, type PoseId } from '../sprite/poses';
import { drawBall } from '../sprite/props';
import { drawFighter, jointsAt } from '../sprite/rig';
import type { Difficulty, Sim, SimEnv } from '../types';
import { FOOT_AI, FootballAI } from './ai';
import {
  BALL_R,
  BAR_Y,
  type Ball,
  collide,
  GOAL_DEPTH,
  GY,
  goalScored,
  HALF_TIME,
  MATCH_TIME,
  stepBall,
  winnerOf,
} from './physics';

export { FOOT_AI } from './ai';

const SCALE = 1.12;
const HEAD = 1.95;
const PGRAV = 2200;
const KICK = 0.36;
/** Frozen "KICK OFF" beat before the whistle. */
const KICKOFF_BEAT = 0.9;
/** The side not kicking off is released this long after the whistle. */
const HOLD_MAX = 0.4;
/** Where the side not kicking off waits: between the ball and its own goal. */
const KICKOFF_GAP = 290;
const GOAL_PAUSE = 2.6;
const HALF_PAUSE = 2.4;
const FULL_PAUSE = 1;
/** A ball whose track stays inside a 44 px box this long gets a referee nudge. */
const STILL_MAX = 2.2;
/** Players may step this far into their own goal mouth, never deeper (no wedged balls). */
const MOUTH_STEP = 8;
const METER_RATE = 1.4;

interface Assist {
  /** Kick and chip strength factor for the human. */
  kick: number;
  /** Back-heel flick strength factor (a beginner's favourite way out). */
  flick: number;
  /** Power-meter charge factor. */
  meter: number;
  /**
   * Backing onto a ball on your own goal side flicks it over your head instead of shoving it
   * goalward: when you stand `from`..`to` px from your own goal line, at most once per `cool` s;
   * `soft` only pops it up rather than passing it on.
   */
  backFlick: {
    from: number;
    to: number;
    cool: number;
    soft: boolean;
    slow: number;
    /** Seconds the ball must already have been yours (a dribble, not a shot that beat you). */
    own: number;
    /** Kill the ball and step past it instead of flicking it on. */
    trap: boolean;
    /** Only when the rival is at least this far from the ball. */
    free: number;
    /** Only while your lead is at most this. */
    lead: number;
  } | null;
  /** Within this many px of your own goal line, backing into the ball stops you instead. */
  guard: number;
}
/** Help for the human player against the CPU, by difficulty. Hard plays it straight. */
const ASSIST: Record<Difficulty, Assist | null> = {
  easy: {
    kick: 1.4,
    flick: 1.4,
    meter: 2,
    backFlick: {
      from: 0,
      to: W,
      cool: 0,
      soft: false,
      slow: 9999,
      own: 0,
      trap: false,
      free: 0,
      lead: 1,
    },
    guard: 0,
  },
  normal: {
    kick: 1.15,
    flick: 1.6,
    meter: 1.25,
    backFlick: {
      from: 0,
      to: W * 0.65,
      cool: 0.8,
      soft: false,
      slow: 9999,
      own: 0,
      trap: false,
      free: 0,
      lead: 1,
    },
    guard: 0,
  },
  hard: null,
};
/** Seconds after a kickoff whistle before a power shot can be fired: restarts are not free hits. */
const POWER_LOCK = 3;
/** Fastest a ball can leave a head. */
const HEADER_MAX = 640;
/** One header per leap: seconds before a head contact can pop, sound or charge the meter again. */
const HEADER_COOL = 0.22;

interface Player {
  f: Fighter;
  side: 0 | 1;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  kick: number;
  power: boolean;
  touched: boolean;
  meter: number;
  walkT: number;
  lob: boolean;
  stun: number;
  ready: boolean;
  /** This kick is a back-heel flick: the ball was behind the player when it started. */
  heel: boolean;
  /** Seconds the player's own body ignores the ball (lets a flick clear the head). */
  ghost: number;
  /** Clock time of the last head contact (headers have a short cooldown). */
  headAt: number;
}

/** 'intro' is the single pre-match frame, so the opening kickoff starts like every other. */
type Phase = 'intro' | 'kickoff' | 'play' | 'goal' | 'half' | 'over';

export interface GoalLog {
  /** Seconds of match clock elapsed. */
  at: number;
  /** Side credited with the goal. */
  side: 0 | 1;
  own: boolean;
  /** Clock seconds since the kickoff whistle that preceded it, and who took that kickoff. */
  sinceKickoff: number;
  kicker: 0 | 1;
  /** Side that touched the ball last, and how far from the goal it scored in that touch was. */
  lt: 0 | 1 | null;
  fromX: number;
  /** How the last touch was made, and the defender's distance from its goal line at that moment. */
  kind: string;
  keeper: number;
}

export class FootballSim implements Sim {
  p: [Player, Player];
  ball: Ball = { x: W / 2, y: GY - BALL_R, vx: 0, vy: 0, spin: 0 };
  fire = 0;
  fireOwner: 0 | 1 = 0;
  trail: { x: number; y: number }[] = [];
  score: [number, number] = [0, 0];
  time = MATCH_TIME;
  phase: Phase = 'intro';
  phaseT = 0;
  scorer: 0 | 1 | null = null;
  clock = 0;
  banner: { text: string; sub: string; t: number; dur: number; color: string } | null = null;
  /** Side taking the current kickoff. */
  kicker: 0 | 1 = 0;
  /** Side held in place until the kicker's first touch. */
  hold: 0 | 1 | null = null;
  lastTouch: 0 | 1 | null = null;
  goals: GoalLog[] = [];
  /** Referee nudges given to a dead ball. */
  nudges = 0;
  /** CPU brains by side; side 1 gets one in a vs-CPU match. Tests may plug one into side 0. */
  ai: [FootballAI | null, FootballAI | null] = [null, null];
  /**
   * Beginner assist per side (easy vs CPU, human only): no backing the ball into your own net,
   * and the power meter charges twice as fast.
   */
  assist: [Assist | null, Assist | null] = [null, null];
  private env: SimEnv;
  private rand: () => number;
  private holdT = 0;
  private kickoffAt = 0;
  private halfDone = false;
  private ended = false;
  private lastBounce = 0;
  private box = { x0: 0, x1: 0, y0: 0, y1: 0 };
  private stillT = 0;
  private scoreFx: [number, number] = [9, 9];
  private net: [number, number] = [0, 0];
  private lastBeep = 99;
  private touchAt: [number, number] = [-99, -99];
  private touchX = W / 2;
  private squeezeT = 0;
  private flip = false;
  /** When the side that touched the ball last first took it (for 'your own ball' checks). */
  private possSince = 0;
  /** View: left edge in world px and zoom (1 = whole pitch; phones zoom into the play band). */
  cam = { x: 0, z: 1 };
  private backFlickAt: [number, number] = [-9, -9];
  private roofT = 0;
  private roofed = false;
  private comingT = 0;
  private whistleAt = -9;
  private hitAt: [number, number] = [-9, -9];
  private touchKind = '';
  private touchKeeper = 0;

  constructor(env: SimEnv, seed = Date.now()) {
    this.env = env;
    this.rand = rng(seed);
    if (env.vs === 'cpu') this.ai[1] = new FootballAI(FOOT_AI[env.difficulty], rng(seed * 7 + 3));
    const help = env.vs === 'cpu' ? ASSIST[env.difficulty] : null;
    this.assist = [help, null];
    this.p = [this.mk(env.p1, 0), this.mk(env.p2, 1)];
    this.kickoff(0);
    this.phase = 'intro';
  }

  private mk(f: Fighter, side: 0 | 1): Player {
    return {
      f,
      side,
      x: 0,
      y: GY,
      vx: 0,
      vy: 0,
      facing: side ? -1 : 1,
      kick: -1,
      power: false,
      touched: false,
      meter: 0,
      walkT: 0,
      lob: false,
      stun: 0,
      ready: false,
      heel: false,
      ghost: 0,
      headAt: -9,
    };
  }

  /** Ball dead on the centre spot; the taker stands over it, the other side waits in its half. */
  private kickoff(taker: 0 | 1) {
    this.kicker = taker;
    for (const p of this.p) {
      const s = p.side ? 1 : -1;
      p.x = W / 2 + s * (p.side === taker ? 64 : KICKOFF_GAP);
      p.y = GY;
      p.vx = p.vy = 0;
      p.kick = -1;
      p.stun = 0;
    }
    this.ball = { x: W / 2, y: GY - BALL_R, vx: 0, vy: 0, spin: 0 };
    this.fire = 0;
    this.trail = [];
    this.lastTouch = null;
    this.phase = 'kickoff';
    this.phaseT = 0;
    this.hold = null;
    this.resetBox();
    const f = this.p[taker].f;
    this.banner = {
      text: 'KICK OFF',
      sub: `${f.alias.slice(0, 16)} to start`,
      t: 0,
      dur: KICKOFF_BEAT + 0.4,
      color: f.theme.palette.c3,
    };
  }

  private whistle() {
    this.phase = 'play';
    this.phaseT = 0;
    this.hold = (1 - this.kicker) as 0 | 1;
    this.holdT = 0;
    this.kickoffAt = MATCH_TIME - this.time;
    this.whistleAt = this.clock;
    this.env.sfx.play('whistle');
  }

  /** The human's assist on this side (none for a CPU-driven side). */
  private help(side: 0 | 1) {
    return this.ai[side] ? null : this.assist[side];
  }

  /** Header-strength factor: lower CPU levels nod the ball on rather than bullet it. */
  private headPow(side: 0 | 1) {
    return this.ai[side]?.P.head ?? 1;
  }

  /** Kick-strength factor: the CPU's difficulty sets it, the assist lifts the human's. */
  private shot(side: 0 | 1) {
    return this.ai[side]?.P.shot ?? this.help(side)?.kick ?? 1;
  }

  /** Power shots need settled play: none in the first seconds after a kickoff whistle. */
  powerLocked() {
    return this.phase === 'play' && this.clock - this.whistleAt < POWER_LOCK;
  }

  private bodies(p: Player) {
    const j = jointsAt(p.f, 'idle', 0, {
      x: p.x,
      y: p.y,
      scale: SCALE,
      facing: p.facing,
      headScale: HEAD,
      noLift: true,
    });
    return {
      // a jump only lends part of its speed to the ball, or every header would be a rocket
      head: { x: j.head.x, y: j.head.y, r: j.headR * 0.95, vx: p.vx, vy: p.vy * 0.45 },
      // hips + chest stack up to the head, so no ball can slip through between them
      hips: { x: p.x, y: p.y - 32, r: 23, vx: p.vx, vy: p.vy },
      chest: { x: p.x, y: p.y - 78, r: 24, vx: p.vx, vy: p.vy },
    };
  }

  private touch(side: 0 | 1, kind: string) {
    if (this.lastTouch !== side) this.possSince = this.clock;
    this.lastTouch = side;
    this.touchKind = kind;
    const d = this.p[1 - side] as Player;
    this.touchKeeper = Math.abs(d.x - (side ? GOAL_DEPTH : W - GOAL_DEPTH));
    this.touchAt[side] = this.clock;
    this.touchX = this.ball.x;
  }

  update(dt: number, input: Input) {
    this.clock += dt;
    this.phaseT += dt;
    // camera: on a zoomed (phone) view, glide after the ball with a little lead
    const vw = W / this.cam.z;
    const want = clamp(this.ball.x + this.ball.vx * 0.15 - vw / 2, 0, W - vw);
    this.cam.x += (want - this.cam.x) * Math.min(1, dt * 5);
    for (const s of [0, 1] as const) {
      this.scoreFx[s] += dt;
      this.net[s] = Math.max(0, this.net[s] - dt * 1.6);
    }
    if (this.banner) {
      this.banner.t += dt / this.banner.dur;
      if (this.banner.t >= 1) this.banner = null;
    }
    if (this.phase === 'intro') {
      this.phase = 'kickoff';
      this.phaseT = 0;
    }
    if (this.phase === 'kickoff' && this.phaseT >= KICKOFF_BEAT) this.whistle();
    const pads: [PadState | null, PadState | null] = [input.pads[0], input.pads[1]];
    for (const s of [0, 1] as const) {
      const brain = this.ai[s];
      if (brain) {
        const me = this.p[s];
        const lead = this.score[s] - (this.score[1 - s] ?? 0);
        const takingKickoff = this.phase === 'play' && this.kicker === s && this.lastTouch === null;
        pads[s] = brain.think(s, me, this.p[1 - s] as Player, this.ball, dt, lead, takingKickoff);
      }
    }
    const live = this.phase === 'play';
    for (const p of this.p) this.move(p, live ? pads[p.side] : null, dt);

    if (this.phase === 'play') {
      if (this.hold !== null) {
        this.holdT += dt;
        if (this.holdT > HOLD_MAX) this.hold = null;
      }
      const before = this.time;
      this.time = Math.max(0, this.time - dt);
      if (this.time <= 5 && Math.ceil(this.time) < this.lastBeep && this.time > 0) {
        this.lastBeep = Math.ceil(this.time);
        this.env.sfx.play('blip', 0.5);
      }
      if (this.time <= 0) return this.finish();
      if (!this.halfDone && before > HALF_TIME && this.time <= HALF_TIME) return this.halfTime();
    }
    if (this.phase === 'over') {
      stepBall(this.ball, dt); // the ball drops dead after the whistle, it does not hang in the air
      if (!this.ended && this.phaseT >= FULL_PAUSE) this.endMatch();
      return;
    }
    if (this.phase === 'half') {
      stepBall(this.ball, dt);
      if (this.phaseT > HALF_PAUSE) this.kickoff(1);
      return;
    }
    if (this.phase === 'kickoff') return;

    const impact = stepBall(this.ball, dt);
    if (impact > 260 && this.clock - this.lastBounce > 0.08) {
      this.lastBounce = this.clock;
      this.env.sfx.play('bounce', Math.min(1, impact / 900));
    }
    this.fire = Math.max(0, this.fire - dt);
    this.trail.push({ x: this.ball.x, y: this.ball.y });
    if (this.trail.length > 12) this.trail.shift();

    const hit: [boolean, boolean] = [false, false];
    // alternate who resolves first, so neither side wins every tie against the ball
    this.flip = !this.flip;
    // a ball up on a goal roof is behind the frame: players cannot touch it until it rolls off
    const bb = this.ball;
    const roofed = bb.y < BAR_Y - BALL_R && (bb.x < GOAL_DEPTH || bb.x > W - GOAL_DEPTH);
    // rolling off a roof, the ball drops in front of the mouth rather than onto a head
    if (this.roofed && !roofed)
      for (const p of this.p) if (Math.abs(p.x - bb.x) < 60) p.ghost = Math.max(p.ghost, 0.22);
    this.roofed = roofed;
    for (const p of this.flip ? [this.p[1], this.p[0]] : this.p) {
      p.ghost = Math.max(0, p.ghost - dt);
      if (roofed) continue;
      const b = this.bodies(p);
      // a power shot bowls straight through whoever is in its way and keeps its pace
      if (this.fire > 0 && this.fireOwner !== p.side && p.ghost <= 0) {
        const over = [b.head, b.chest, b.hips].some(
          (c) => Math.hypot(bb.x - c.x, bb.y - c.y) < c.r + BALL_R,
        );
        if (over) {
          this.bowled(p);
          continue;
        }
      }
      if (p.ghost <= 0 && collide(this.ball, b.head, p.vy < -100 ? 0.6 : 0.42)) {
        this.touch(p.side, 'head');
        hit[p.side] = true;
        // one header per leap: contact can last a few frames, the pop and sound must not stack
        if (p.vy < -100 && this.clock - p.headAt > HEADER_COOL) {
          p.headAt = this.clock;
          this.ball.vx += p.facing * 130;
          this.ball.vy -= 90;
          capSpeed(this.ball, HEADER_MAX * this.headPow(p.side));
          this.env.sfx.play('kick', 0.6);
          this.env.fx.ring(b.head.x + p.facing * 20, b.head.y - 10, p.f.theme.palette.c3, 44);
          this.env.fx.pop(b.head.x, b.head.y - 50, 'HEADER!', p.f.theme.palette.c3, 26);
          p.meter = Math.min(100, p.meter + 3);
        } else if (p.vy < -100) capSpeed(this.ball, HEADER_MAX * this.headPow(p.side));
        else {
          capSpeed(this.ball, HEADER_MAX * 0.8 * this.headPow(p.side));
          if (this.clock - p.headAt > HEADER_COOL) this.env.sfx.play('bounce', 0.4);
          p.headAt = this.clock;
        }
      }
      // assist for the human: backing onto a low ball on your own goal side scoops it over your
      // head instead of shoving it into your own net (only near your own goal, with a cooldown)
      const rel = (this.ball.x - p.x) * p.facing;
      const bf = this.help(p.side)?.backFlick;
      if (
        bf &&
        (p.side ? W - p.x : p.x) - GOAL_DEPTH >= bf.from &&
        (p.side ? W - p.x : p.x) - GOAL_DEPTH < bf.to &&
        this.clock - this.backFlickAt[p.side] > bf.cool &&
        p.ghost <= 0 &&
        rel < -4 &&
        rel > -62 &&
        p.vx * p.facing < -40 &&
        // only a ball you are dribbling backwards, not a shot that has already beaten you
        Math.abs(this.ball.vx) < bf.slow &&
        (bf.own === 0 || (this.lastTouch === p.side && this.clock - this.possSince > bf.own)) &&
        // not under pressure: a contested ball is a real tackle, the assist stays out of it
        Math.abs((this.p[1 - p.side] as Player).x - this.ball.x) > bf.free &&
        // a catch-up aid: switched off while you are ahead by more than `lead`
        this.score[p.side] - (this.score[1 - p.side] ?? 0) <= bf.lead &&
        this.ball.y > p.y - 190 &&
        this.ball.y < p.y + 10
      ) {
        if (bf.trap) {
          // trap: the ball dies at your heels and you step past it, instead of shoving it home
          this.touch(p.side, 'heel');
          this.ball.vx *= 0.1;
          this.ball.vy = Math.min(this.ball.vy, -220);
          p.ghost = 0.3;
          this.env.fx.pop(this.ball.x, this.ball.y - 30, 'TRAP!', p.f.theme.palette.c3, 18);
          this.env.sfx.play('bounce', 0.4);
        } else this.flick(p, bf.soft);
        this.backFlickAt[p.side] = this.clock;
        hit[p.side] = true;
      }
      for (const c of p.ghost > 0 ? [] : [b.chest, b.hips])
        if (collide(this.ball, c, 0.15, 0)) {
          this.touch(p.side, 'body');
          hit[p.side] = true;
        }
      this.tryKick(p);
      p.meter = Math.min(
        100,
        p.meter + dt * METER_RATE * (this.help(p.side)?.meter ?? this.ai[p.side]?.charge ?? 1),
      );
      if (p.meter >= 100 && !p.ready) {
        p.ready = true;
        this.env.sfx.play('blip', 0.7);
        this.env.fx.pop(p.x, p.y - 210, 'POWER READY', p.f.theme.palette.c3, 22);
      }
    }
    // bodies may shove the ball into the turf; it always sits on top of it
    if (this.ball.y > GY - BALL_R) this.ball.y = GY - BALL_R;
    for (const s of [0, 1] as const) if (hit[s]) this.hitAt[s] = this.clock;
    const jammed = this.clock - this.hitAt[0] < 0.07 && this.clock - this.hitAt[1] < 0.07;
    this.squeezeT = jammed ? this.squeezeT + dt : 0;
    if (this.squeezeT > 0.1) this.squeeze();
    this.unstick(dt);
    if (this.phase === 'play') {
      const g = goalScored(this.ball);
      if (g !== null) this.goal(g);
    } else if (this.phase === 'goal' && this.phaseT > GOAL_PAUSE) {
      if (this.time <= 0) this.finish();
      else if (!this.halfDone && this.time <= HALF_TIME) this.halfTime();
      else this.kickoff((1 - (this.scorer ?? 0)) as 0 | 1);
    }
  }

  /** Power shot flattens whoever it hits and carries on at full pace: the answer to a parked keeper. */
  private bowled(p: Player) {
    p.stun = 0.75;
    p.ghost = 0.4;
    p.vx = 0;
    p.vy = Math.min(p.vy, -260);
    p.x += (p.side ? 1 : -1) * 18;
    const fx = this.env.fx;
    fx.shake(0.35);
    fx.pop(p.x, p.y - 220, 'OOF!', '#ffffff', 30);
    fx.burst(this.ball.x, this.ball.y, 14, ['#ffffff', INK], { speed: 380, size: 4 });
    this.env.sfx.play('hit', 0.7);
  }

  /** Back-heel scoop: the ball pops up over the head and drops in front. */
  private flick(p: Player, soft = false) {
    const rel = (this.ball.x - p.x) * p.facing;
    const pal = p.f.theme.palette;
    const fx = this.env.fx;
    this.touch(p.side, 'heel');
    p.ghost = 0.32;
    this.ball.x = p.x - p.facing * Math.max(-rel, 30);
    // the assist's automatic flick only clears the ball over your head; the button one is a pass
    this.ball.vx = soft
      ? p.facing * 110
      : p.facing * (230 + p.f.stats.power * 9) * (this.help(p.side)?.flick ?? this.shot(p.side));
    this.ball.vy = soft ? -700 : -900;
    fx.burst(this.ball.x, this.ball.y, 8, ['#ffffff', pal.c3], { speed: 240, size: 3 });
    fx.pop(this.ball.x, this.ball.y - 30, 'FLICK!', pal.c3, 20);
    this.env.sfx.play('kick', 0.45);
    p.meter = Math.min(100, p.meter + 3);
  }

  /** Ball jammed between both players squirts up and out. */
  private squeeze() {
    this.squeezeT = 0;
    const b = this.ball;
    b.vy = -720 - this.rand() * 120;
    b.vx = (this.rand() - 0.5) * 160;
    for (const p of this.p) p.ghost = Math.max(p.ghost, 0.2);
    this.env.fx.pop(b.x, b.y - 30, 'POP!', '#ffffff', 20);
    this.env.sfx.play('bounce', 0.5);
  }

  private resetBox() {
    const b = this.ball;
    this.box = { x0: b.x, x1: b.x, y0: b.y, y1: b.y };
    this.stillT = 0;
    this.comingT = 0;
  }

  /** Referee nudge for a dead or wedged ball. */
  private unstick(dt: number) {
    const b = this.ball;
    if (this.phase !== 'play' || this.hold !== null) {
      this.resetBox();
      return;
    }
    // a ball juggled on top of a goal roof (heads keep knocking it back up) is dropped back in
    const onRoof = b.y < BAR_Y - BALL_R && (b.x < GOAL_DEPTH || b.x > W - GOAL_DEPTH);
    this.roofT = onRoof ? this.roofT + dt : 0;
    if (this.roofT > 1.2) {
      this.roofT = 0;
      this.nudges++;
      // a soft drop just off the roof edge, not a clearance up the pitch
      b.vx = (b.x < W / 2 ? 1 : -1) * 170;
      b.vy = -260;
      for (const p of this.p) p.ghost = Math.max(p.ghost, 0.25);
      this.env.fx.ring(b.x, b.y, '#ffffff', 50);
      return;
    }
    const box = this.box;
    box.x0 = Math.min(box.x0, b.x);
    box.x1 = Math.max(box.x1, b.x);
    box.y0 = Math.min(box.y0, b.y);
    box.y1 = Math.max(box.y1, b.y);
    if (box.x1 - box.x0 > 44 || box.y1 - box.y0 > 44) {
      this.resetBox();
      return;
    }
    this.stillT += dt;
    // a loose ball someone is running to is not dead; give them the time to get there
    const coming = this.p.some(
      (p) => Math.abs(b.x - p.x) > 45 && p.vx * (b.x - p.x) > 0 && Math.abs(p.vx) > 60,
    );
    this.comingT = coming ? this.comingT + dt : 0;
    if (this.stillT < STILL_MAX + Math.min(this.comingT, 2.2)) return;
    this.resetBox();
    this.nudges++;
    b.vx = (b.x < W / 2 ? 1 : -1) * (220 + this.rand() * 120);
    b.vy = -560;
    b.y = Math.min(b.y, GY - BALL_R - 2);
    this.env.fx.ring(b.x, b.y, '#ffffff', 50);
    this.env.sfx.play('bounce', 0.6);
  }

  private move(p: Player, pad: PadState | null, dt: number) {
    if (p.stun > 0) {
      p.stun -= dt;
      pad = null;
    }
    const held = this.hold === p.side;
    if (pad) {
      const dir = held ? 0 : (pad.held.right ? 1 : 0) - (pad.held.left ? 1 : 0);
      const brain = this.ai[p.side];
      const sp = (300 + p.f.stats.speed * 16) * (brain ? brain.P.speed * brain.pace : 1);
      p.vx = approach(p.vx, dir * sp, 4200 * dt);
      if (dir) p.walkT += dt * dir * p.facing;
      if (pad.pressed.up && p.y >= GY - 0.5) {
        p.vy = -820 - p.f.stats.speed * 12;
        this.env.sfx.play('whoosh', 0.25);
      }
      const canPower = p.meter >= 100 && !this.powerLocked();
      if (p.kick < 0 && (pad.pressed.a || pad.pressed.b || (pad.pressed.c && canPower))) {
        p.kick = 0;
        p.touched = false;
        p.power = pad.pressed.c && canPower;
        p.lob = !p.power && pad.pressed.b;
        const rel = (this.ball.x - p.x) * p.facing;
        p.heel = !p.power && rel < 4 && rel > -86 && this.ball.y > GY - 92;
        if (p.power) {
          p.meter = 0;
          p.ready = false;
          this.env.sfx.play('special');
          this.env.fx.flash(0.2, p.f.theme.palette.c3);
          this.env.fx.pop(p.x, p.y - 200, p.f.special.name.toUpperCase(), p.f.theme.palette.c3, 26);
        } else this.env.sfx.play('whoosh', 0.35);
      }
    } else p.vx = approach(p.vx, 0, 4200 * dt);
    if (p.kick >= 0) {
      p.kick += dt;
      if (p.kick > KICK) {
        p.kick = -1;
        // a whiffed power shot keeps its charge: the meter is spent only on contact
        if (p.power && !p.touched) {
          p.meter = 100;
          p.ready = true;
        }
      }
    }
    // goal-line guard (assist): near your own goal you cannot back the ball into your own net;
    // the ball at your heels stops you instead of being shoved over the line
    const guard = this.help(p.side)?.guard ?? 0;
    if (guard && p.vx * p.facing < 0) {
      const rel = (this.ball.x - p.x) * p.facing;
      const fromLine = (p.side ? W - p.x : p.x) - GOAL_DEPTH;
      const low = this.ball.y > p.y - 140;
      if (fromLine < guard && rel < 0 && rel > -66 && low) p.vx = 0;
    }
    p.x = clamp(p.x + p.vx * dt, GOAL_DEPTH - MOUTH_STEP, W - GOAL_DEPTH + MOUTH_STEP);
    if (p.y < GY || p.vy < 0) {
      p.vy += PGRAV * dt;
      p.y += p.vy * dt;
      if (p.y >= GY) {
        p.y = GY;
        p.vy = 0;
      }
    }
    // players don't overlap
    const [a, b] = this.p;
    if (p === b && Math.abs(a.x - b.x) < 46 && Math.abs(a.y - b.y) < 80) {
      const push = (46 - Math.abs(a.x - b.x)) / 2;
      const s = b.x >= a.x ? 1 : -1;
      a.x -= push * s;
      b.x += push * s;
    }
  }

  private tryKick(p: Player) {
    if (p.kick < 0 || p.touched) return;
    const k = p.kick / KICK;
    if (k < 0.25 || k > 0.7) return;
    const j = jointsAt(p.f, 'kick-ball', (0.25 + k * 0.45) * (POSE_LOOP['kick-ball'] ?? 1), {
      x: p.x,
      y: p.y,
      scale: SCALE,
      facing: p.facing,
      headScale: HEAD,
      noLift: true,
    });
    const pw = p.f.stats.power;
    const pal = p.f.theme.palette;
    const fx = this.env.fx;
    if (p.heel) {
      // back-heel scoop: the ball pops up over the head and drops in front
      const rel = (this.ball.x - p.x) * p.facing;
      if (rel > 8 || rel < -88 || this.ball.y < GY - 96) return;
      p.touched = true;
      this.flick(p);
      return;
    }
    const reach = BALL_R + 26;
    if ((j.footF.x - this.ball.x) ** 2 + (j.footF.y - this.ball.y) ** 2 > reach * reach) return;
    p.touched = true;
    this.touch(p.side, 'kick');
    if (p.power) {
      this.touchKind = 'power';
      this.ball.vx = p.facing * (1080 + pw * 28);
      this.ball.vy = -220;
      this.fire = 1.4;
      this.fireOwner = p.side;
      fx.shake(0.55);
      fx.stop(8);
      fx.burst(this.ball.x, this.ball.y, 30, [pal.c1, pal.c3, '#ffffff'], { speed: 600, size: 5 });
      fx.pop(this.ball.x, this.ball.y - 50, 'THWACK!', pal.c3, 44);
      this.env.sfx.play('hit', 1);
    } else if (p.lob) {
      this.touchKind = 'chip';
      this.ball.vx = p.facing * (360 + pw * 10) * this.shot(p.side);
      this.ball.vy = -800;
      fx.burst(this.ball.x, this.ball.y, 6, ['#ffffff'], { speed: 220, size: 3 });
      fx.stop(1);
      this.env.sfx.play('kick', 0.5);
    } else {
      this.ball.vx = p.facing * (570 + pw * 22) * this.shot(p.side);
      this.ball.vy = this.ball.y < GY - 60 ? -240 : -440;
      fx.burst(this.ball.x, this.ball.y, 10, ['#ffffff', pal.c3], { speed: 300, size: 3 });
      fx.stop(2);
      fx.shake(0.08);
      fx.pop(this.ball.x - p.facing * 10, this.ball.y - 34, 'POK!', '#ffffff', 20);
      this.env.sfx.play('kick', 0.8);
    }
    fx.ring(this.ball.x, this.ball.y, pal.c3, p.power ? 80 : 40);
    p.meter = Math.min(100, p.meter + 3);
  }

  private goal(side: 0 | 1) {
    this.score[side]++;
    this.scorer = side;
    this.phase = 'goal';
    this.phaseT = 0;
    this.scoreFx[side] = 0;
    this.net[side ? 0 : 1] = 1;
    // a deflection off the defender still belongs to the shooter
    // ...and so does a ball that merely bounced off a defender standing there
    const own =
      this.lastTouch === 1 - side &&
      this.touchKind !== 'body' &&
      this.touchKind !== 'head' &&
      this.clock - this.touchAt[side] > 2;
    this.goals.push({
      at: MATCH_TIME - this.time,
      side,
      own,
      sinceKickoff: MATCH_TIME - this.time - this.kickoffAt,
      kicker: this.kicker,
      lt: this.lastTouch,
      fromX: Math.abs(this.touchX - (side ? GOAL_DEPTH : W - GOAL_DEPTH)),
      kind: this.touchKind,
      keeper: this.touchKeeper,
    });
    const f = this.p[side].f;
    const pal = f.theme.palette;
    const fx = this.env.fx;
    fx.shake(0.6);
    fx.flash(0.35, pal.c3);
    if (!this.env.reduced) fx.slow(0.45, 0.35);
    fx.burst(this.ball.x, this.ball.y, 40, [pal.c1, pal.c3, '#ffffff', pal.c2], {
      kind: 'square',
      speed: 700,
      size: 9,
      g: 700,
      max: 1.4,
      drag: 1.2,
    });
    fx.burst(W / 2, 90, 30, [pal.c1, pal.c3, '#ffffff'], {
      kind: 'square',
      speed: 420,
      size: 7,
      g: 500,
      max: 1.8,
      drag: 1,
    });
    this.env.sfx.play('cheer');
    const tally = `${this.score[0]} – ${this.score[1]}`;
    this.banner = {
      text: own ? 'OWN GOAL!' : 'GOAL!',
      sub: own ? `Gift for ${f.alias}  ${tally}` : `${f.alias}  ${tally}`,
      t: 0,
      dur: 1.9,
      color: pal.c3,
    };
    this.env.announce(
      `${own ? 'Own goal' : 'Goal'} for ${f.alias}! ${this.p[0].f.alias} ${this.score[0]}, ${this.p[1].f.alias} ${this.score[1]}.`,
    );
  }

  private halfTime() {
    this.halfDone = true;
    this.phase = 'half';
    this.phaseT = 0;
    this.hold = null;
    this.env.sfx.play('whistle');
    this.banner = {
      text: 'HALF TIME',
      sub: `${this.score[0]} – ${this.score[1]}`,
      t: 0,
      dur: HALF_PAUSE,
      color: '#ffffff',
    };
    this.env.announce(`Half time. ${this.score[0]} to ${this.score[1]}.`);
  }

  private finish() {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.phaseT = 0;
    this.hold = null;
    this.env.sfx.play('whistle');
    this.banner = {
      text: 'FULL TIME',
      sub: `${this.score[0]} – ${this.score[1]}`,
      t: 0,
      dur: 3,
      color: '#ffffff',
    };
  }

  private endMatch() {
    this.ended = true;
    const w = winnerOf(this.score);
    const wf = w === 'p1' ? this.p[0].f : w === 'p2' ? this.p[1].f : null;
    this.env.end({
      winner: w,
      score: [this.score[0], this.score[1]],
      summary: wf
        ? `${wf.alias} wins ${Math.max(...this.score)}–${Math.min(...this.score)} at full time.`
        : `Honours even at ${this.score[0]}–${this.score[1]}.`,
    });
  }

  render(ctx: CanvasRenderingContext2D) {
    const fx = this.env.fx;
    const [a, b] = this.p;
    const bg = arenaLayer(a.f, b.f, W, H, GY, 'pitch');
    const ui = this.ui(ctx);
    const cam = this.camera(ui);
    ctx.save();
    const o = fx.offset();
    ctx.translate(o.x, o.y);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.top);
    if (bg) ctx.drawImage(bg, 0, 0);
    // halfway line, centre circle and spot on the turf
    ctx.strokeStyle = alpha('#ffffff', 0.8);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(W / 2, GY + 4);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(W / 2, GY + 26, 110, 16, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = alpha('#ffffff', 0.85);
    ctx.beginPath();
    ctx.ellipse(W / 2, GY + 6, 7, 3, 0, 0, TAU);
    ctx.fill();
    this.goalFrame(ctx, 0, true);
    this.goalFrame(ctx, 1, true);
    this.ballShadow(ctx);
    for (const p of this.p) this.drawPlayer(ctx, p);
    this.ballTrail(ctx);
    drawBall(
      ctx,
      this.ball.x,
      this.ball.y,
      BALL_R,
      this.ball.spin,
      this.fire > 0 ? this.p[this.fireOwner].f.theme.palette.c3 : '#ffd400',
    );
    this.goalFrame(ctx, 0, false);
    this.goalFrame(ctx, 1, false);
    const L = scoreboard(ui.u);
    const minY = cam.top + (L.clock.y + L.clock.h + 8) / cam.z;
    for (const p of this.p) this.tag(ctx, p, ui, cam.z, minY);
    fx.drawParticles(ctx);
    fx.drawPops(ctx, DISPLAY_FONT);
    ctx.restore();
    fx.drawFlash(ctx, W, H);
    this.hud(ctx, ui, cam);
    if (this.banner) {
      const bn = this.banner;
      banner(ctx, W, H, bn.text, bn.sub, bn.t, bn.color);
    }
  }

  private ballShadow(ctx: CanvasRenderingContext2D) {
    const h = GY - BALL_R - this.ball.y;
    const k = clamp(1 - h / 360, 0.25, 1);
    ctx.fillStyle = alpha(INK, 0.15 + 0.35 * k);
    ctx.beginPath();
    ctx.ellipse(this.ball.x, GY + 4, BALL_R * (0.5 + 0.6 * k), 3 + 3 * k, 0, 0, TAU);
    ctx.fill();
    // a thin drop line keeps a high ball easy to place against the players
    if (h > 120) {
      ctx.strokeStyle = alpha('#ffffff', 0.18);
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.moveTo(this.ball.x, this.ball.y + BALL_R + 6);
      ctx.lineTo(this.ball.x, GY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private ballTrail(ctx: CanvasRenderingContext2D) {
    const n = this.trail.length;
    if (n < 2) return;
    const sp = Math.hypot(this.ball.vx, this.ball.vy);
    if (this.fire > 0) {
      const pal = this.p[this.fireOwner].f.theme.palette;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      this.trail.forEach((q, i) => {
        ctx.fillStyle = alpha(i % 2 ? pal.c1 : pal.c3, (i / n) * 0.7);
        ctx.beginPath();
        ctx.arc(q.x, q.y, BALL_R * (0.5 + (i / n) * 0.7), 0, TAU);
        ctx.fill();
      });
      ctx.restore();
    } else if (sp > 480) {
      // speed streak: tapering white ribbon behind a hard-hit ball
      const k = clamp((sp - 480) / 600, 0.2, 1);
      ctx.lineCap = 'round';
      for (let i = Math.max(1, n - 7); i < n; i++) {
        const q0 = this.trail[i - 1];
        const q1 = this.trail[i];
        if (!q0 || !q1) continue;
        const t = (i - (n - 7)) / 7;
        ctx.strokeStyle = alpha('#ffffff', 0.45 * k * t);
        ctx.lineWidth = BALL_R * 1.4 * t;
        ctx.beginPath();
        ctx.moveTo(q0.x, q0.y);
        ctx.lineTo(q1.x, q1.y);
        ctx.stroke();
      }
    }
  }

  private goalFrame(ctx: CanvasRenderingContext2D, side: 0 | 1, back: boolean) {
    const x0 = side ? W - GOAL_DEPTH : 0;
    const x1 = side ? W : GOAL_DEPTH;
    const mouth = side ? x0 : x1;
    if (back) {
      // net bulges and ripples after a goal
      const rip = this.net[side];
      const bulge = (y: number) =>
        rip * 10 * Math.sin((y - BAR_Y) / 14 + this.clock * 26) * (side ? 1 : -1);
      ctx.fillStyle = alpha('#ffffff', 0.14 + rip * 0.18);
      ctx.fillRect(x0, BAR_Y, GOAL_DEPTH, GY - BAR_Y);
      ctx.strokeStyle = alpha('#ffffff', 0.5);
      ctx.lineWidth = 1;
      for (let y = BAR_Y; y < GY; y += 12) {
        ctx.beginPath();
        ctx.moveTo(x0 + (side ? 0 : bulge(y)), y);
        ctx.lineTo(x1 + (side ? bulge(y) : 0), y);
        ctx.stroke();
      }
      for (let x = x0; x <= x1; x += 12) {
        const k = side ? (x - x0) / GOAL_DEPTH : 1 - (x - x0) / GOAL_DEPTH;
        ctx.beginPath();
        ctx.moveTo(x, BAR_Y);
        for (let y = BAR_Y; y <= GY; y += 23) ctx.lineTo(x + bulge(y) * k, y);
        ctx.stroke();
      }
      return;
    }
    ctx.lineCap = 'round';
    for (const [lw, c] of [
      [11, INK],
      [6, '#ffffff'],
    ] as const) {
      ctx.strokeStyle = c;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(side ? W : 0, BAR_Y);
      ctx.lineTo(mouth, BAR_Y);
      ctx.lineTo(mouth, GY);
      ctx.stroke();
    }
    // red post stripes
    ctx.strokeStyle = '#e8263a';
    ctx.lineWidth = 6;
    ctx.lineCap = 'butt';
    for (let y = BAR_Y + 18; y < GY - 8; y += 36) {
      ctx.beginPath();
      ctx.moveTo(mouth, y);
      ctx.lineTo(mouth, y + 14);
      ctx.stroke();
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, p: Player) {
    const air = p.y < GY - 1;
    const pal = p.f.theme.palette;
    if (p.meter >= 100 && this.phase === 'play' && !this.powerLocked()) {
      // power-ready halo on the turf
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * 9);
      ctx.strokeStyle = alpha(pal.c3, 0.5 + 0.4 * pulse);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(p.x, GY + 6, 40 + pulse * 8, 9, 0, 0, TAU);
      ctx.stroke();
    }
    let pose: PoseId = 'idle';
    let t = this.clock + p.side * 0.5;
    if (p.stun > 0) {
      pose = 'hurt';
      t = 0.4;
    } else if (p.kick >= 0) {
      pose = 'kick-ball';
      t = (0.25 + (p.kick / KICK) * 0.45) * (POSE_LOOP['kick-ball'] ?? 1);
    } else if (air) {
      pose = 'jump';
      t = (p.vy < 0 ? 0.42 : 0.6) * (POSE_LOOP.jump ?? 1);
    } else if (Math.abs(p.vx) > 10) {
      pose = 'run';
      t = p.walkT * 0.85;
    }
    if (this.phase === 'goal') {
      pose = this.scorer === p.side ? 'celebrate' : 'hurt';
      t = this.scorer === p.side ? this.phaseT : 0.55;
    }
    if (this.phase === 'over') {
      const w = winnerOf(this.score);
      pose = w === 'draw' ? 'idle' : (w === 'p1') === (p.side === 0) ? 'victory' : 'hurt';
      t = pose === 'hurt' ? 0.55 : this.phaseT;
    }
    const heel = pose === 'kick-ball' && p.heel;
    drawFighter(ctx, p.f, pose, t, {
      x: p.x,
      y: p.y,
      scale: SCALE,
      facing: heel ? (-p.facing as 1 | -1) : p.facing,
      headScale: HEAD,
      noLift: air,
      smear: pose === 'kick-ball',
    });
    if (p.stun > 0) {
      // dizzy stars
      ctx.fillStyle = '#ffd400';
      for (let i = 0; i < 3; i++) {
        const a = this.clock * 8 + (i * TAU) / 3;
        star(ctx, p.x + Math.cos(a) * 34, p.y - 182 + Math.sin(a) * 8, 7);
      }
    }
  }

  /** "P1" / "CPU" pointer over each head, so a mirror match stays readable. */
  private tag(ctx: CanvasRenderingContext2D, p: Player, ui: Ui, z: number, minY: number) {
    const label = p.side === 0 ? 'P1' : this.ai[1] ? 'CPU' : 'P2';
    const size = ui.font(14) / z;
    const k = size / 14;
    let x = p.x;
    let y = p.y - 186 - 10 * k;
    if (y - 9 * k < minY) {
      // would sit under the scoreboard: drop it beside the head, on the side away from the rival
      y = Math.max(minY + 9 * k, p.y - 150);
      const other = this.p[1 - p.side] as Player;
      x += (p.x >= other.x ? 1 : -1) * 52;
    }
    const fill = p.f.theme.palette.c1;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(x - 9 * k, y + 11 * k);
    ctx.lineTo(x + 9 * k, y + 11 * k);
    ctx.lineTo(x, y + 22 * k);
    ctx.closePath();
    ctx.fill();
    ctx.font = `${size}px ${HEAD_FONT}`;
    const w = (label.length * 10 + 14) * k;
    plate(ctx, x - w / 2, y - 9 * k, w, 20 * k, fill);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = onFill(fill);
    ctx.fillText(label, x, y + 1 * k);
  }

  /**
   * Zoom into the play band on narrow screens: the bottom of the view stays on the turf, the
   * empty sky is cropped, players and ball read about 1.5x bigger, and the view follows the ball.
   */
  private camera(ui: Ui) {
    // desktop frames the play band at 1.3x; narrow phones go up to 1.5x
    const z = clamp(1.3 + (ui.u - 1) * 0.2, 1.3, 1.5);
    if (z !== this.cam.z) {
      this.cam.z = z;
      this.cam.x = clamp(this.ball.x - W / z / 2, 0, W - W / z);
    }
    const x = clamp(this.cam.x, 0, W - W / z);
    return { x, z, top: H - H / z };
  }

  /** Little pointer to a ball that is out of view or hidden behind the scoreboard. */
  private ballMarker(ctx: CanvasRenderingContext2D, sx: number, sy: number, top: number, ui: Ui) {
    const off = sx < 0 || sx > W;
    if (!off && sy > top) return;
    const k = Math.min(ui.u, 1.6);
    const x = clamp(sx, 24 * k, W - 24 * k);
    const y = off ? clamp(sy, top + 20 * k, H - 60) : top + 16 * k;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 9 * k, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd400';
    ctx.beginPath();
    if (off) {
      const d = sx < 0 ? -1 : 1;
      ctx.moveTo(x + d * 20 * k, y);
      ctx.lineTo(x + d * 11 * k, y - 7 * k);
      ctx.lineTo(x + d * 11 * k, y + 7 * k);
    } else {
      ctx.moveTo(x, y - 20 * k);
      ctx.lineTo(x - 7 * k, y - 11 * k);
      ctx.lineTo(x + 7 * k, y - 11 * k);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** HUD sizing for the canvas's on-screen width (CSS px); `cssWidth` overrides it in tests. */
  cssWidth: number | null = null;
  private ui(ctx: CanvasRenderingContext2D): Ui {
    const canvas = (ctx as { canvas?: { clientWidth?: number } }).canvas;
    const css = this.cssWidth ?? (canvas?.clientWidth || W);
    return hudUi(css);
  }

  private hud(ctx: CanvasRenderingContext2D, ui: Ui, cam: { x: number; z: number; top: number }) {
    // fade the scoreboard when the ball flies behind it
    const L = scoreboard(ui.u);
    const bottom = L.clock.y + L.clock.h + 30;
    const sx = (this.ball.x - cam.x) * cam.z;
    const sy = (this.ball.y - cam.top) * cam.z;
    const behind = sy < bottom && Math.abs(sx - W / 2) < L.clock.w / 2 + L.score[0].w + L.name[0].w;
    this.ballMarker(ctx, sx, sy, bottom - 24, ui);
    ctx.save();
    if (behind) ctx.globalAlpha = 0.4;
    for (const p of this.p) {
      const s = p.side ? 1 : -1;
      const fill = p.f.theme.palette.c1;
      const nr = L.name[p.side];
      const sr = L.score[p.side];
      plate(ctx, nr.x, nr.y, nr.w, nr.h, fill);
      // narrow screens show a short name; long names shrink to fit rather than being cut
      const name = L.compact ? shortName(p.f.alias) : p.f.alias;
      const pad = 12 * ui.u;
      let size = ui.font(19);
      const floor = ui.font(12);
      ctx.font = `${size}px ${HEAD_FONT}`;
      while (size > floor && ctx.measureText(name).width > nr.w - 2 * pad) {
        size--;
        ctx.font = `${size}px ${HEAD_FONT}`;
      }
      ctx.textBaseline = 'middle';
      ctx.textAlign = L.compact ? 'center' : s > 0 ? 'left' : 'right';
      ctx.fillStyle = onFill(fill);
      const tx = L.compact ? nr.x + nr.w / 2 : s > 0 ? nr.x + pad : nr.x + nr.w - pad;
      ctx.fillText(name, tx, nr.y + nr.h / 2 + 1, nr.w - 2 * pad);
      // score box: paper card, big ink numeral, pops and flashes when it changes
      const age = this.scoreFx[p.side];
      const flash = age < 0.9;
      plate(ctx, sr.x, sr.y, sr.w, sr.h, flash ? p.f.theme.palette.c3 : '#fffdf6');
      const pop = age < 0.5 ? 1 + 0.6 * Math.sin((age / 0.5) * Math.PI) : 1;
      const digits = 44 * ui.u;
      ctx.save();
      ctx.translate(sr.x + sr.w / 2, sr.y + sr.h / 2 + 1);
      ctx.scale(pop, pop);
      if (flash) inkText(ctx, String(this.score[p.side]), 0, 0, digits, '#ffffff');
      else {
        // plain ink numeral: an ink outline on ink fill would blot the digit
        ctx.font = `${digits}px ${DISPLAY_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = INK;
        ctx.fillText(String(this.score[p.side]), 0, 2 * ui.u);
      }
      ctx.restore();
    }
    // clock
    const m = Math.floor(Math.ceil(this.time) / 60);
    const sec = Math.ceil(this.time) % 60;
    const late = this.time < 10 && this.phase !== 'over';
    const cr = L.clock;
    plate(ctx, cr.x, cr.y, cr.w, cr.h, INK);
    const pulse = late ? 1 + 0.08 * Math.sin(this.clock * 12) : 1;
    ctx.save();
    ctx.translate(W / 2, cr.y + cr.h * 0.42);
    ctx.scale(pulse, pulse);
    ctx.font = `${34 * ui.u}px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = late ? '#ff4d5e' : '#ffd400';
    ctx.fillText(`${m}:${String(sec).padStart(2, '0')}`, 0, 0);
    ctx.restore();
    ctx.font = `${ui.font(12)}px ${HEAD_FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    const half =
      this.phase === 'over'
        ? 'FULL TIME'
        : this.phase === 'half'
          ? 'HALF TIME'
          : this.halfDone
            ? '2ND HALF'
            : '1ST HALF';
    ctx.fillText(half, W / 2, cr.y + cr.h * 0.84, cr.w - 8);
    ctx.restore();

    // power meters, bottom corners
    for (const p of this.p) {
      const pal = p.f.theme.palette;
      const k = Math.min(ui.u, 1.6);
      const mw = 200 * k;
      const bh = 14 * k;
      const mx = p.side ? W - 26 - mw : 26;
      const y = H - 20 - bh;
      const full = p.meter >= 100;
      ctx.fillStyle = INK;
      ctx.fillRect(mx - 4, y - 4, mw + 8, bh + 8);
      ctx.fillStyle = alpha('#ffffff', 0.15);
      ctx.fillRect(mx, y, mw, bh);
      const fw = (mw * p.meter) / 100;
      const glow = full ? 0.75 + 0.25 * Math.sin(this.clock * 10) : 0.7;
      ctx.fillStyle = full ? alpha(pal.c3, glow) : alpha(pal.c3, 0.7);
      ctx.fillRect(p.side ? mx + mw - fw : mx, y, fw, bh);
      ctx.fillStyle = INK;
      for (let i = 1; i < 4; i++) ctx.fillRect(mx + (mw * i) / 4 - 1, y, 2, bh);
      const locked = full && this.powerLocked();
      const label = locked
        ? L.compact
          ? 'POWER: WAIT'
          : 'POWER: AFTER KICKOFF'
        : full
          ? L.compact
            ? 'POWER READY!'
            : 'POWER SHOT READY!'
          : 'POWER';
      const size = ui.font(full && !locked ? 18 : 14);
      inkText(
        ctx,
        label,
        p.side ? mx + mw : mx,
        y - 6 - size / 2,
        size,
        full && !locked ? readable(brightest(pal.c3, pal.c1), 0.2) : '#ffffff',
        p.side ? 'right' : 'left',
        HEAD_FONT,
      );
    }
  }

  describe(): string {
    const [a, b] = this.p;
    const ballSide = this.ball.x < W / 2 ? `${a.f.alias}'s half` : `${b.f.alias}'s half`;
    const air = this.ball.y < GY - 80 ? 'in the air' : 'on the ground';
    const phase =
      this.phase === 'kickoff'
        ? ` Kick off to ${this.p[this.kicker].f.alias}.`
        : this.phase === 'half'
          ? ' Half time.'
          : '';
    return `${a.f.alias} ${this.score[0]}, ${b.f.alias} ${this.score[1]}. ${Math.ceil(this.time)} seconds left.${phase} Ball in ${ballSide}, ${air}, ${Math.round(Math.abs(this.ball.x - a.x) / 10)} steps ${this.ball.x > a.x ? 'to your right' : 'to your left'}. You attack the right goal.${a.meter >= 100 ? ' Power shot ready.' : ''}`;
  }
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** HUD scale for an on-screen canvas width: every label stays at least 11 CSS px tall. */
export interface Ui {
  /** Scale factor for plates and numerals (1 on a full-size canvas). */
  u: number;
  /** Logical font size for a label designed at `base` px, floored at 11 CSS px. */
  font(base: number): number;
}

export function hudUi(cssWidth: number): Ui {
  const min = (11 * W) / Math.max(120, cssWidth);
  const u = clamp(min / 14, 1, 2.2);
  return { u, font: (base) => Math.max(base * u, min) };
}

/**
 * Phone-size name: initials for several words ("THE LONG SECOND" → "TLS"), otherwise three
 * letters and an ellipsis ("BACKSTITCH" → "BAC…") so it never reads as a button word like "BACK".
 */
export function shortName(alias: string): string {
  const words = alias
    .toUpperCase()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length > 1)
    return words
      .map((w) => w[0])
      .join('')
      .slice(0, 3);
  const w = words[0] ?? alias.toUpperCase();
  return w.length <= 3 ? w : `${w.slice(0, 3)}…`;
}

/**
 * Scoreboard layout, left to right: name | score | clock | score | name. Every box owns its own
 * column, so nothing is ever drawn on top of a number. `u` scales it up for narrow screens, where
 * the name plates turn compact (short names).
 */
export function scoreboard(u = 1) {
  const compact = u > 1.25;
  const CW = 118 * u;
  const SW = 66 * u;
  const NW = compact ? 74 * u : 196;
  const clock: Rect = { x: W / 2 - CW / 2, y: 6, w: CW, h: 62 * u };
  const score: [Rect, Rect] = [
    { x: clock.x - SW, y: 6 + 4 * u, w: SW, h: 54 * u },
    { x: clock.x + CW, y: 6 + 4 * u, w: SW, h: 54 * u },
  ];
  const name: [Rect, Rect] = [
    { x: score[0].x - NW, y: 6 + 10 * u, w: NW, h: 40 * u },
    { x: score[1].x + SW, y: 6 + 10 * u, w: NW, h: 40 * u },
  ];
  return { clock, score, name, compact };
}

export const SCOREBOARD = scoreboard(1);

function capSpeed(b: Ball, max: number) {
  const v = Math.hypot(b.vx, b.vy);
  if (v <= max) return;
  b.vx *= max / v;
  b.vy *= max / v;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
