/** Smash Court — side-view badminton. Rally scoring, first to 11 (or 7), win by 2. */
import type { Fighter } from '~/lib/schema';
import { alpha, INK } from '../engine/color';
import type { Input, PadState } from '../engine/input';
import { clamp, rng } from '../engine/math';
import { H, W } from '../shell/const';
import { arenaLayer, banner, HEAD_FONT, inkText, onFill, plate } from '../shell/hud';
import { DISPLAY_FONT } from '../sprite/backdrop';
import { POSE_LOOP, type PoseId } from '../sprite/poses';
import { drawShuttle } from '../sprite/props';
import { drawFighter, jointsAt } from '../sprite/rig';
import type { Difficulty, Sim, SimEnv } from '../types';
import {
  aimShot,
  COURT_L,
  COURT_R,
  GY,
  gameWinner,
  NET_TOP,
  NET_X,
  placeTarget,
  pointWinner,
  predict,
  type ShotType,
  type Shuttle,
  shotLift,
  stepShuttle,
} from './physics';

const SCALE = 1.32;
const PGRAV = 2100;
const SWING = 0.3;
/** Feet stay planted while the racket is moving, so a held aim direction doesn't drag you out of reach. */
const SWING_MOVE = 0.35;
/** Pause after the shuttle lands before the next serve (the last point lingers longer). */
const POINT_PAUSE = 1.2;

interface Player {
  f: Fighter;
  side: 0 | 1;
  x: number;
  y: number;
  vy: number;
  vx: number;
  facing: 1 | -1;
  swing: number;
  over: boolean;
  hit: boolean;
  walkT: number;
  kind: 'a' | 'b';
  /** Depth intent from the held direction: -1 toward the net (short), 0 neutral, 1 away (deep). */
  aim: -1 | 0 | 1;
  /** Driven by a person (gets timing calls and aim). */
  human: boolean;
  /** Seconds since this player last sprinted (0 = still running). */
  setT: number;
  /** Reach multiplier (bigger on easy for a person, who also gets quicker feet). */
  reachK: number;
  /** `rally` count at this player's last swing — tells a missed return from a clean winner. */
  tried: number;
}

/**
 * CPU levels. speed: footwork multiplier · err: px of misjudged position · react: s before it
 * reads the shot · smash: chance it jumps to smash a high shuttle · place: chance it aims away
 * from you (else random placement) · recover: how far it gets back to base between shots ·
 * wild: placement scatter (can push a shot out) · forced: how badly pressure gets to it (error
 * chance = unforced + forced × pressure²) · unforced: errors on a sitter · bite: how much
 * pressure its own shots put on you (how hard it makes you work: scales your fatigue and
 * mishits) · read: chance it reads a pattern (the same shot, or a strict alternation) and
 * attacks it · assist: your reach multiplier (easy gives beginners a bigger racket zone).
 *
 * There is no "freeze" dice roll: the CPU always goes for the shuttle and swings. It errs when
 * your shot pressures it (distance to cover in the time it has, pace, a line-hugging target,
 * a long rally), and the error is a visible mishit: framed into the net, sprayed long, or a
 * weak floater you can smash. A shot it can't physically reach gets a lunge and a whiff.
 */
export const BAD_AI: Record<
  Difficulty,
  {
    speed: number;
    err: number;
    react: number;
    smash: number;
    place: number;
    recover: number;
    wild: number;
    forced: number;
    unforced: number;
    bite: number;
    read: number;
    assist: number;
  }
> = {
  easy: {
    speed: 0.72,
    err: 62,
    react: 0.38,
    smash: 0.12,
    place: 0,
    recover: 0.45,
    wild: 0.4,
    forced: 0.75,
    unforced: 0.05,
    bite: 0.35,
    read: 0,
    assist: 1.22,
  },
  normal: {
    speed: 0.9,
    err: 30,
    react: 0.22,
    smash: 0.5,
    place: 0.6,
    recover: 0.85,
    wild: 0.18,
    forced: 0.6,
    unforced: 0.015,
    bite: 0.8,
    read: 0.4,
    assist: 1,
  },
  hard: {
    speed: 1.0,
    err: 12,
    react: 0.12,
    smash: 0.72,
    place: 0.92,
    recover: 1,
    wild: 0.07,
    forced: 0.5,
    unforced: 0.005,
    bite: 0.95,
    read: 0.9,
    assist: 1,
  },
};

/**
 * A person's mishit chance = HUMAN_FORCED × q², where q is how badly they met it: late (it
 * had dropped past the racket), early (the swing was nearly over), or stretched (far from the
 * body), plus a little for pace. Get there and time it, and you don't shank it.
 */
export const HUMAN_FORCED = 0.55;
/** A person who never serves gets a high serve played for them after this long (s). */
export const SERVE_CLOCK = 7;
/** Rally length after which both players' legs get heavy (see `legs`). */
export const TIRE_AFTER = 6;
/** Reaction assumed for a person when judging how hard a shot was for them. */
const HUMAN_REACT = 0.25;

const BASE_X = 700;

/** Callout for a shot so the aim reads on screen: tight / plain / deep. */
export function shotName(type: ShotType, depth: number): string {
  const band = depth < 0.3 ? 0 : depth > 0.7 ? 2 : 1;
  const names: Record<ShotType, [string, string, string]> = {
    clear: ['ATTACK CLEAR', 'CLEAR', 'DEEP CLEAR'],
    drop: ['NET DROP', 'DROP', 'LONG DROP'],
    drive: ['FLAT DRIVE', 'DRIVE', 'LONG DRIVE'],
    smash: ['STEEP SMASH!', 'SMASH!', 'LONG SMASH!'],
    'serve-high': ['HIGH SERVE', 'HIGH SERVE', 'DEEP SERVE'],
    'serve-short': ['TIGHT SERVE', 'SHORT SERVE', 'FLICK SERVE'],
  };
  return names[type][band];
}

type Phase = 'serve' | 'rally' | 'point' | 'over';

const reachCenters = (p: Player) => [
  { x: p.x + p.facing * 22, y: p.y - 128, r: 78 * p.reachK },
  { x: p.x + p.facing * 34, y: p.y - 62, r: 62 * p.reachK },
];

export function inReach(p: Player, sx: number, sy: number): boolean {
  return reachCenters(p).some((c) => (c.x - sx) ** 2 + (c.y - sy) ** 2 <= c.r * c.r);
}

export class BadmintonSim implements Sim {
  p: [Player, Player];
  s: Shuttle = { x: 0, y: 0, vx: 0, vy: 0, angle: Math.PI / 2 };
  trail: { x: number; y: number }[] = [];
  phase: Phase = 'serve';
  phaseT = 0;
  server: 0 | 1 = 0;
  last: 0 | 1 | null = null;
  score: [number, number] = [0, 0];
  rally = 0;
  target: number;
  clock = 0;
  banner: { text: string; sub: string; t: number; color: string } | null = null;
  /** Predicted landing x of the shuttle in flight (drawn as a floor marker), and who hit it. */
  landX: number | null = null;
  lastType: ShotType = 'clear';
  /** The shuttle clipped the net since the last hit. */
  netted = false;
  /** Last timing call on a whiffed swing (for tests / a11y). */
  call: 'EARLY!' | 'LATE!' | null = null;
  /** Pressure the shot in flight puts on its receiver (see `pressureOn`). */
  press = { p: 0, reach: 0 };
  /** The shot in flight is a mishit by `side`; `forced` when pressure caused it. */
  mishit: { side: 0 | 1; forced: boolean; by: ShotType; kill: boolean } | null = null;
  /** The side that has a floater coming to it, set up to be put away. */
  sitterFor: 0 | 1 | null = null;
  /** The shot in flight is a smash putting away a sitter. */
  putAway = false;
  /** Shots this rally: who hit what, and how deep it landed (0 tight · 1 mid · 2 deep). */
  shots: { side: 0 | 1; type: ShotType; band: number }[] = [];
  /** Per-point outcome log (for probes / tests): who won it and the banner reason. */
  log: { win: 0 | 1; tag: string }[] = [];
  private env: SimEnv;
  private rand: () => number;
  private ai: {
    tx: number;
    home: number;
    /** An unforced error is planned for this return (kept for probes). */
    miss: boolean;
    /** Planned error for this return, if any. */
    err: 'forced' | 'unforced' | null;
    lunged: boolean;
    /** It has read your pattern this shot (you repeated yourself): early, calm, attacking. */
    read: boolean;
    /** Where it was when it last hit, for recovery. */
    hitX: number;
    smash: boolean;
    decideAt: number;
    planned: boolean;
  };
  private aiP: (typeof BAD_AI)[Difficulty];

  constructor(env: SimEnv, seed = Date.now()) {
    this.env = env;
    this.rand = rng(seed);
    this.target = env.settings.points === '11' ? 11 : 7;
    this.p = [this.mk(env.p1, 0), this.mk(env.p2, 1)];
    this.aiP = BAD_AI[env.difficulty];
    this.ai = {
      tx: BASE_X,
      home: BASE_X,
      miss: false,
      err: null,
      lunged: false,
      read: false,
      hitX: BASE_X,
      smash: false,
      decideAt: -1,
      planned: false,
    };
    this.newServe(0);
    this.banner = {
      text: 'SERVE!',
      sub: `FIRST TO ${this.target}`,
      t: 0,
      color: env.p1.theme.palette.c3,
    };
  }

  private mk(f: Fighter, side: 0 | 1): Player {
    return {
      f,
      side,
      x: side ? 720 : 240,
      y: GY,
      vy: 0,
      vx: 0,
      facing: side ? -1 : 1,
      swing: -1,
      over: true,
      hit: false,
      walkT: 0,
      kind: 'a',
      aim: 0,
      human: side === 0 || this.env.vs !== 'cpu',
      setT: 1,
      reachK: this.env.vs === 'cpu' && side === 0 ? BAD_AI[this.env.difficulty].assist : 1,
      tried: -1,
    };
  }

  private newServe(server: 0 | 1) {
    this.server = server;
    this.phase = 'serve';
    this.phaseT = 0;
    this.last = null;
    this.rally = 0;
    this.trail = [];
    this.landX = null;
    this.netted = false;
    for (const p of this.p) {
      p.x = p.side ? 700 : 260;
      p.y = GY;
      p.vy = 0;
      p.swing = -1;
      p.tried = -1;
    }
    this.ai.planned = false;
    this.ai.decideAt = -1;
    this.ai.home = BASE_X;
    this.ai.hitX = BASE_X;
    this.shots = [];
    this.sitterFor = null;
    this.mishit = null;
    const pr = this.pressure();
    if (pr && this.score[0] + this.score[1] > 0)
      this.banner = { text: pr.text, sub: pr.sub, t: 0, color: pr.color };
  }

  /** Match point / deuce state, for the banner and the HUD tag. */
  pressure(): { text: string; sub: string; color: string } | null {
    const [a, b] = this.score;
    if (a === b && a >= this.target - 1)
      return { text: 'DEUCE!', sub: 'WIN BY TWO', color: '#ffffff' };
    for (const side of [0, 1] as const) {
      const next: [number, number] = [a, b];
      next[side]++;
      if (gameWinner(next, this.target) === side) {
        const f = this.p[side].f;
        return { text: 'MATCH POINT', sub: f.alias, color: f.theme.palette.c3 };
      }
    }
    return null;
  }

  private speed(p: Player) {
    // an easy CPU's opponent also gets quicker feet (reachK > 1 marks the assist)
    return (240 + p.f.stats.speed * 12) * this.legs() * (1 + (p.reachK - 1) * 0.8);
  }

  /** Heavy legs: after TIRE_AFTER shots in a rally both players slow down, so placement bites. */
  legs() {
    return Math.max(0.6, 1 - Math.max(0, this.rally - TIRE_AFTER) * 0.04);
  }

  update(dt: number, input: Input) {
    this.clock += dt;
    this.phaseT += dt;
    if (this.banner) {
      this.banner.t += dt / 1.3;
      if (this.banner.t >= 1) this.banner = null;
    }
    const pads: [PadState, PadState] = [
      input.pads[0],
      this.env.vs === 'cpu' ? this.cpu(dt) : input.pads[1],
    ];
    for (const p of this.p) this.move(p, pads[p.side], dt);

    if (this.phase === 'serve') {
      const sv = this.p[this.server];
      const hb = jointsAt(sv.f, 'idle', this.clock, {
        x: sv.x,
        y: sv.y,
        scale: SCALE,
        facing: sv.facing,
      }).handB;
      this.s.x = hb.x + sv.facing * 6;
      this.s.y = hb.y + 8;
      this.s.vx = this.s.vy = 0;
      this.s.angle = Math.PI / 2;
      const pad = pads[this.server];
      if (this.phaseT > 0.4 && (pad.pressed.a || pad.pressed.b))
        this.serve(sv, pad.pressed.b ? 'serve-short' : 'serve-high', this.aimOf(sv, pad));
      else if (sv.human && this.phaseT > SERVE_CLOCK) this.serve(sv, 'serve-high', 0);
    } else if (this.phase === 'rally') {
      if (stepShuttle(this.s, dt) === 'net') {
        this.netted = true;
        this.landX = predict(this.s, GY).x;
        this.env.sfx.play('bounce', 0.4);
        this.env.fx.burst(NET_X, this.s.y, 6, ['#ffffff'], { speed: 120, size: 3 });
      }
      this.trail.push({ x: this.s.x, y: this.s.y });
      if (this.trail.length > 12) this.trail.shift();
      for (const p of this.p) this.tryHit(p);
      if (this.s.y >= GY - 4 || this.s.x < -80 || this.s.x > W + 80) this.landed();
    } else if (this.phase === 'point') {
      if (this.s.y < GY - 4) {
        stepShuttle(this.s, dt);
        this.s.y = Math.min(this.s.y, GY - 4);
      }
      if (this.phaseT > (gameWinner(this.score, this.target) !== null ? 2.1 : POINT_PAUSE)) {
        const g = gameWinner(this.score, this.target);
        if (g !== null) {
          this.phase = 'over';
          const wf = this.p[g].f;
          this.env.sfx.play('cheer');
          this.env.end({
            winner: g === 0 ? 'p1' : 'p2',
            score: [this.score[0], this.score[1]],
            summary: `${wf.alias} wins the game ${Math.max(...this.score)}–${Math.min(...this.score)}.`,
          });
        } else this.newServe(this.server);
      }
    }
  }

  private move(p: Player, pad: PadState, dt: number) {
    if (this.phase === 'over' || this.phase === 'point') {
      p.vx = 0;
    } else {
      const dir = (pad.held.right ? 1 : 0) - (pad.held.left ? 1 : 0);
      p.vx = dir * this.speed(p) * (p.human ? 1 : this.aiP.speed);
      if (p.swing >= 0) p.vx *= SWING_MOVE;
      if (dir) p.walkT += dt * dir * p.facing;
      if (pad.pressed.up && p.y >= GY - 0.5) {
        p.vy = -760 - p.f.stats.speed * 10;
        this.env.sfx.play('whoosh', 0.25);
      }
      if (this.phase === 'rally' && p.swing < 0 && (pad.pressed.a || pad.pressed.b)) {
        p.swing = 0;
        p.hit = false;
        p.tried = this.rally;
        p.over = !(pad.pressed.b && this.s.y > p.y - 90);
        p.kind = pad.pressed.b ? 'b' : 'a';
        p.aim = this.aimOf(p, pad);
        this.env.sfx.play('whoosh', 0.4);
      } else if (p.swing >= 0 && !p.hit && dir) p.aim = this.aimOf(p, pad);
    }
    if (p.swing >= 0) {
      p.swing += dt;
      if (p.swing > SWING) {
        p.swing = -1;
        if (!p.hit && p.human && this.phase === 'rally' && this.last !== p.side)
          this.timingCall(p, false);
      }
    }
    const x0 = p.x;
    p.x += p.vx * dt;
    const lo = p.side ? NET_X + 44 : COURT_L - 30;
    const hi = p.side ? COURT_R + 30 : NET_X - 44;
    p.x = clamp(p.x, lo, hi);
    // how long you've been set (not sprinting) — hitting on the run is scrappier
    const running = p.swing < 0 && Math.abs(p.x - x0) > this.speed(p) * 0.5 * dt;
    p.setT = running ? 0 : p.setT + dt;
    if (p.y < GY || p.vy < 0) {
      p.vy += PGRAV * dt;
      p.y += p.vy * dt;
      if (p.y >= GY) {
        p.y = GY;
        p.vy = 0;
      }
    }
  }

  /** Held direction → depth intent: toward the net = short, away = deep, nothing = middle. */
  private aimOf(p: Player, pad: PadState): -1 | 0 | 1 {
    const dir = (pad.held.right ? 1 : 0) - (pad.held.left ? 1 : 0);
    if (!dir) return 0;
    return dir === p.facing ? -1 : 1;
  }

  /** Human depth: the held aim plus a little hand wobble, so it's learnable but not robotic. */
  private humanDepth(aim: -1 | 0 | 1) {
    return clamp((aim + 1) / 2 + (this.rand() - 0.5) * 0.14, 0, 1);
  }

  /**
   * A swing that ended without contact while the shuttle was close: was it early (the
   * shuttle would still come into reach) or late (it's already past / below)?
   */
  private timingCall(p: Player, landed: boolean) {
    const s = this.s;
    const near = Math.hypot(s.x - (p.x + p.facing * 24), s.y - (p.y - 110)) < 240;
    if (!near) return;
    let early = false;
    if (!landed) {
      const c: Shuttle = { ...s };
      for (let i = 0; i < 40 && c.y < GY; i++) {
        if (inReach(p, c.x, c.y)) {
          early = true;
          break;
        }
        stepShuttle(c, 1 / 60);
      }
    }
    this.call = early ? 'EARLY!' : 'LATE!';
    this.env.fx.pop(p.x + p.facing * 10, p.y - 222, this.call, early ? '#7fe3ff' : '#ff8a3d', 28);
  }

  /**
   * How hard the shuttle in flight is for `rc` to return well: ~0 a sitter, ~1 brutal.
   * reach = run needed ÷ run possible in the time left after `react` (> 1: can't get there).
   */
  pressureOn(rc: Player, react: number): { p: number; reach: number } {
    const pr = predict(this.s, GY - 125);
    const spot = pr.x - rc.facing * 18;
    const need = Math.max(0, Math.abs(spot - rc.x) - 36);
    const mul = rc.human ? 1 : this.aiP.speed;
    const reach = need / (this.speed(rc) * mul * Math.max(0.05, pr.t - react));
    const pace = clamp((Math.hypot(this.s.vx, this.s.vy) - 650) / 500, 0, 1);
    const land = Math.abs((this.landX ?? pr.x) - NET_X);
    // only the back line counts: a tight drop's pressure is the run to it, nothing extra
    const line = land > 372 ? 0.1 : 0;
    const base = 1.1 * Math.min(reach, 1.2) + 0.5 * pace + line;
    // the CPU tires in a long rally: a good shot hurts it more and more, and even a plain one
    // starts to tell after a while
    const extra = rc.human ? 0 : Math.max(0, this.rally - TIRE_AFTER);
    return { p: base * (1 + extra * 0.07) + extra * 0.045, reach };
  }

  /** A mishit off `p`'s racket: a weak floater (forced only), framed into the tape, or long. */
  private mishitShot(
    p: Player,
    forced: boolean,
    how: string | null = null,
  ): { v: { vx: number; vy: number }; type: ShotType } {
    const dir = p.facing;
    const r = this.rand();
    const fx = this.env.fx;
    const text = how ?? (forced ? 'STRETCHED!' : 'SHANKED!');
    fx.pop(p.x + dir * 30, p.y - 230, text, '#ff8a3d', 26);
    if (forced && r < 0.6) {
      // floats up short and high: a sitter for the other side to put away
      const tx = NET_X + dir * (170 + this.rand() * 70);
      this.sitterFor = p.side === 0 ? 1 : 0;
      fx.pop(p.x + dir * 30, p.y - 196, 'SITTER!', '#ffffff', 20);
      return { v: aimShot(this.s.x, this.s.y, 'clear', dir, tx, -1000), type: 'clear' };
    }
    if (r < 0.8) {
      const dx = NET_X - this.s.x;
      const dy = NET_TOP - 20 - this.s.y;
      const k = 820 / Math.max(1, Math.hypot(dx, dy));
      const v = { vx: dx * k, vy: dy * k };
      // too close to (or above) the tape to bury it: it's framed and drops back on this side
      const land = predict({ ...this.s, ...v }, GY).x;
      const inOpp = (land - NET_X) * dir > 0 && land > COURT_L && land < COURT_R;
      if (inOpp) return { v: { vx: -dir * 140, vy: -120 }, type: 'drive' };
      return { v, type: 'drive' };
    }
    const tx = NET_X + dir * (460 + this.rand() * 50);
    return { v: aimShot(this.s.x, this.s.y, 'clear', dir, tx), type: 'clear' };
  }

  private serve(p: Player, type: ShotType, aim: -1 | 0 | 1) {
    const dir = p.facing;
    const depth = p.human ? this.humanDepth(aim) : this.rand() * this.cpuReachOut();
    const tx = placeTarget(type, dir, depth);
    const v = aimShot(this.s.x, this.s.y, type, dir, tx, shotLift(type, depth));
    this.launch(p, v, type, depth);
    p.swing = 0.1;
    p.over = false;
    p.hit = true;
    this.phase = 'rally';
    this.env.announce(`${p.f.alias} serves ${type === 'serve-short' ? 'short' : 'high'}.`);
  }

  private launch(
    p: Player,
    v: { vx: number; vy: number },
    type: ShotType,
    depth: number,
    label?: string,
  ) {
    this.s.vx = v.vx;
    this.s.vy = v.vy;
    this.last = p.side;
    this.lastType = type;
    this.netted = false;
    this.rally++;
    this.landX = predict(this.s, GY).x;
    const rc = this.p[p.side === 0 ? 1 : 0];
    this.press = this.pressureOn(rc, rc.human ? HUMAN_REACT : this.aiP.react);
    if (!p.human) this.press.p *= this.aiP.bite;
    this.ai.lunged = false;
    const far = Math.abs((this.landX ?? NET_X) - NET_X);
    this.shots.push({ side: p.side, type, band: far < 170 ? 0 : far < 300 ? 1 : 2 });
    // putting away a floater: the whole point of making them stretch
    const putAway = type === 'smash' && this.sitterFor === p.side;
    this.putAway = putAway;
    if (putAway) {
      this.press.p += 0.6;
      this.env.fx.pop(this.s.x, this.s.y - 74, 'PUT AWAY!', '#ffffff', 34);
      this.env.fx.slow(0.22, 0.3);
      this.env.fx.shake(0.25);
    }
    if (!this.mishit || this.mishit.side !== p.side) this.sitterFor = null;
    const pal = p.f.theme.palette;
    const fx = this.env.fx;
    if (type === 'smash') {
      this.env.sfx.play('hit', 0.9);
      fx.shake(0.4);
      fx.stop(6);
      fx.flash(0.22, pal.c3);
      fx.pop(this.s.x, this.s.y - 30, 'SMASH!', pal.c3, 42);
      fx.burst(this.s.x, this.s.y, 22, [pal.c3, '#ffffff', pal.c1], { speed: 560, size: 4 });
      fx.burst(this.s.x, this.s.y, 8, ['#ffffff'], {
        kind: 'dot',
        speed: 700,
        dir: Math.atan2(v.vy, v.vx),
        spread: 0.5,
        size: 3,
      });
    } else {
      const soft = type === 'drop' || type === 'serve-short';
      this.env.sfx.play('shuttle', soft ? 0.3 : type === 'drive' ? 0.6 : 0.85);
      fx.burst(this.s.x, this.s.y, soft ? 5 : 9, ['#ffffff', pal.c3], {
        speed: soft ? 160 : 280,
        size: 3,
      });
      if (!this.mishit)
        fx.pop(
          this.s.x,
          this.s.y - 34,
          label ?? shotName(type, depth),
          soft ? '#d8f3ff' : '#ffffff',
          19,
        );
    }
    fx.ring(this.s.x, this.s.y, pal.c3, type === 'smash' ? 64 : type === 'drop' ? 24 : 36);
  }

  private tryHit(p: Player) {
    if (p.swing < 0 || p.hit || this.last === p.side) return;
    const k = p.swing / SWING;
    // an easy CPU's opponent gets a forgiving swing: contact all through the follow-through
    const kMax = p.reachK > 1 ? 0.98 : 0.7;
    if (k < 0.04 || k > kMax) return;
    if (!inReach(p, this.s.x, this.s.y)) return;
    // no reaching over the net: it has to have crossed to your side
    if ((this.s.x - NET_X) * (p.side ? 1 : -1) < -4) return;
    p.hit = true;
    const kind = p.kind;
    const air = p.y < GY - 30;
    let type: ShotType = kind === 'b' ? 'drop' : 'clear';
    if (kind === 'a' && air && this.s.y < p.y - 120) type = 'smash';
    // a floater up over your head: any full swing puts it away, no jump needed
    else if (kind === 'a' && this.sitterFor === p.side && this.s.y < p.y - 140) type = 'smash';
    else if (kind === 'a' && this.s.y > p.y - 110 && this.s.y <= p.y - 60) type = 'drive';
    let depth: number;
    if (!p.human) {
      const c = this.cpuShot(air);
      type = c.type;
      // a gentle CPU keeps it in the middle of the court instead of the back corner
      depth = type === 'smash' ? c.depth : c.depth * this.cpuReachOut();
    } else {
      depth = this.humanDepth(p.aim);
      // a scrappy contact (late, stretched, off a fast one) sprays the length, mostly long
      const c = this.contact(p, k);
      depth += (this.rand() - 0.3) * c.q * 0.6;
    }
    // a clear played from down by your knees is a lift: it can't reach the back line and it
    // hangs up in mid-court, asking to be smashed
    const lift = type === 'clear' && this.s.y > p.y - 60;
    if (lift) depth = Math.min(depth, 0.35 + depth * 0.25);
    p.over = type !== 'drop' || this.s.y < p.y - 100;
    const dir = p.facing;
    let v = aimShot(
      this.s.x,
      this.s.y,
      type,
      dir,
      placeTarget(type, dir, depth),
      lift ? -900 : shotLift(type, depth),
    );
    // errors come from the incoming shot: the CPU decided when it read it; a person errs
    // under the same pressure measure, and when meeting it at the edge of reach
    let err: 'forced' | 'unforced' | null = null;
    let how: string | null = null;
    if (!p.human) err = this.ai.err;
    else {
      const c = this.contact(p, k);
      const work = this.env.vs === 'cpu' ? Math.min(1, this.aiP.bite) : 1;
      if (this.rand() < HUMAN_FORCED * work * c.q * c.q) {
        err = 'forced';
        how = c.how;
      }
    }
    const by = this.lastType;
    const kill = this.putAway;
    this.mishit = null;
    if (err) {
      const m = this.mishitShot(p, err === 'forced', how);
      v = m.v;
      type = m.type;
      this.mishit = { side: p.side, forced: err === 'forced', by, kill };
    }
    this.launch(p, v, type, depth, lift && !err ? 'LIFT' : undefined);
    if (!p.human) this.ai.hitX = p.x;
    this.ai.planned = false;
  }

  /**
   * How well a person met the shuttle: late (it had dropped past the racket), early (the
   * swing was nearly spent), stretched (far out from the body), plus a little for pace.
   */
  private contact(p: Player, k: number): { q: number; how: string } {
    const f = p.facing;
    const ahead = (this.s.x - (p.x + f * 26)) * f;
    const late = Math.max(
      clamp((-ahead - 18) / 40, 0, 1),
      clamp((this.s.y - (p.y - 50)) / 40, 0, 1),
    );
    const early = clamp((k - 0.5) / 0.2, 0, 1);
    const stretch = clamp((Math.abs(ahead) - 50) / 45, 0, 1);
    // still running when you hit it: you only just got there
    const run = clamp(1 - p.setT / 0.4, 0, 1);
    const pace = clamp((Math.hypot(this.s.vx, this.s.vy) - 650) / 500, 0, 1);
    const worst = Math.max(late, early, stretch, run);
    // heavy arms deep in a long rally: the same contact gets scrappier (as for the CPU)
    // (scaled by how hard the CPU makes you work: an easy CPU barely does)
    const bite = this.env.vs === 'cpu' ? this.aiP.bite : 1;
    const tired = Math.max(0, this.rally - TIRE_AFTER) * 0.06 * bite;
    const how =
      worst > 0.2
        ? late === worst
          ? 'LATE!'
          : early === worst
            ? 'EARLY!'
            : run === worst
              ? 'ON THE RUN!'
              : 'STRETCHED!'
        : tired > 0.3
          ? 'TIRED!'
          : 'FRAMED!';
    return { q: worst + 0.9 * pace + tired, how };
  }

  /** How far toward the lines the CPU places (easy keeps it mid-court for beginners). */
  private cpuReachOut() {
    return 0.45 + 0.55 * Math.min(1, this.aiP.bite);
  }

  /** Where the CPU waits between shots: shaded up when you're at the net or keep dropping. */
  private cpuBase(): number {
    const P = this.aiP;
    let base = BASE_X;
    if (Math.abs(this.p[0].x - NET_X) < 170) base -= 55 * P.place;
    const drops = this.shots.filter((s) => s.side === 0 && s.band === 0).length;
    if (drops >= 2) base -= 60 * P.place;
    // it has your pattern: wait where your next shot is going to land
    const next = this.nextBand();
    if (next !== null) base += (next === 0 ? -60 : next === 2 ? 40 : 0) * P.read;
    return base;
  }

  /** The depth band your pattern says comes next, if it's predictable. */
  private nextBand(): number | null {
    if (!this.predictable()) return null;
    const m = this.shots.filter((s) => s.side === 0);
    return this.repeats() >= 3 ? (m.at(-1)?.band ?? null) : (m.at(-2)?.band ?? null);
  }

  /**
   * Is your shot pattern this rally predictable? The same shot three times running, or a
   * strict two-shot alternation (deep, tight, deep, tight) four shots long.
   */
  private predictable(): boolean {
    if (this.repeats() >= 3) return true;
    const m = this.shots.filter((s) => s.side === 0).map((s) => `${s.type}:${s.band}`);
    const n = m.length;
    if (n < 4) return false;
    return m[n - 1] === m[n - 3] && m[n - 2] === m[n - 4] && m[n - 1] !== m[n - 2];
  }

  /** How many times in a row (including this one) you've played this same shot this rally. */
  private repeats(): number {
    const mine = this.shots.filter((s) => s.side === 0);
    const cur = mine.at(-1);
    if (!cur) return 0;
    let n = 0;
    for (let i = mine.length - 1; i >= 0; i--) {
      const s = mine[i];
      if (!s || s.type !== cur.type || s.band !== cur.band) break;
      n++;
    }
    return n;
  }

  /**
   * CPU shot + placement at contact. With probability `place` it reads where you stand and
   * goes the other way (you at the net → deep clear; you at the back → tight drop);
   * otherwise it picks a shot and a depth at random.
   */
  private cpuShot(air: boolean): { type: ShotType; depth: number } {
    const P = this.aiP;
    const smart = this.rand() < P.place;
    const scatter = (this.rand() * 2 - 1) * P.wild;
    // a floater, or a shot it saw coming, met high in the forecourt: kill it
    const high = this.s.y < NET_TOP - 20 && Math.abs(this.s.x - NET_X) < 220;
    if (high && (this.ai.read || this.sitterFor === 1))
      return { type: 'smash', depth: 0.15 + this.rand() * 0.3 };
    if (this.ai.smash && air)
      return { type: 'smash', depth: (smart ? this.rand() * 0.35 : this.rand()) + scatter };
    const opp = Math.abs(this.p[0].x - NET_X);
    if (this.ai.read) {
      // it saw your pattern: answer a parade of clears with a tight drop, drops with a push deep
      const yours = this.shots.filter((s) => s.side === 0).at(-1);
      if (yours && yours.band === 2) return { type: 'drop', depth: this.rand() * 0.2 };
      return { type: 'clear', depth: 0.85 + this.rand() * 0.15 };
    }
    if (smart) {
      const deep = opp < 200 ? true : opp > 290 ? false : this.rand() < 0.5;
      return deep
        ? { type: 'clear', depth: 0.72 + this.rand() * 0.28 + scatter }
        : { type: 'drop', depth: this.rand() * 0.3 + Math.abs(scatter) };
    }
    return { type: this.rand() < 0.35 ? 'drop' : 'clear', depth: this.rand() + scatter };
  }

  private landed() {
    const x = this.s.x;
    const win = pointWinner(x, this.last);
    const lose = win === 0 ? 1 : 0;
    // a receiver mid-swing when it hit the floor was late
    const rcv = this.p[lose];
    if (rcv.human && rcv.swing >= 0 && !rcv.hit && this.last !== lose) this.timingCall(rcv, true);
    this.score[win]++;
    this.phase = 'point';
    this.phaseT = 0;
    this.server = win;
    this.landX = null;
    const wf = this.p[win].f;
    const out = x < COURT_L || x > COURT_R;
    const hitter = this.last === null ? null : this.p[this.last].f.alias;
    const ownSide = this.last !== null && (x < NET_X ? 0 : 1) === this.last;
    const lost = this.p[lose].f.alias;
    const err = this.mishit && this.mishit.side === this.last ? this.mishit : null;
    const swung = this.p[lose].tried === this.rally;
    // call: the pop at the landing spot · tag: the banner's short reason · why: spoken
    const { call, tag, why } =
      (out || ownSide) && err
        ? err.forced
          ? err.kill
            ? { call: 'PUT AWAY!', tag: 'PUT AWAY', why: `${wf.alias} put the sitter away` }
            : err.by === 'smash'
              ? { call: 'SMASH WINNER!', tag: 'SMASH WINNER', why: `${wf.alias} smash forced it` }
              : { call: 'FORCED ERROR!', tag: 'FORCED ERROR', why: `${wf.alias} forced the error` }
          : { call: out ? 'OUT!' : 'NET!', tag: 'UNFORCED ERROR', why: `${hitter} gave it away` }
        : out
          ? { call: 'OUT!', tag: 'OUT', why: `${hitter} hit it out` }
          : ownSide
            ? this.netted
              ? { call: 'NET!', tag: 'INTO THE NET', why: `${hitter} found the net` }
              : { call: 'SHORT!', tag: 'FELL SHORT', why: `${hitter} came up short` }
            : this.putAway
              ? { call: 'PUT AWAY!', tag: 'PUT AWAY', why: `${wf.alias} put the sitter away` }
              : this.lastType === 'smash'
                ? { call: 'SMASH WINNER!', tag: 'SMASH WINNER', why: `${wf.alias} smash winner` }
                : swung && (this.press.reach > 0.9 || this.press.p > 0.5)
                  ? { call: 'STRETCHED!', tag: 'STRETCHED', why: `${wf.alias} stretched ${lost}` }
                  : swung
                    ? { call: 'WINNER!', tag: 'MISSED RETURN', why: `${lost} missed the return` }
                    : { call: 'WINNER!', tag: 'CLEAN WINNER', why: `${wf.alias} clean winner` };
    this.log.push({ win, tag });
    const fx = this.env.fx;
    if (gameWinner(this.score, this.target) !== null) fx.slow(0.7, 0.35);
    fx.burst(clamp(x, 10, W - 10), GY, 14, ['#ffffff', wf.theme.palette.c3], {
      kind: 'dot',
      speed: 220,
      dir: -Math.PI / 2,
      spread: Math.PI,
      g: 500,
      size: 5,
    });
    fx.pop(
      clamp(x, 90, W - 90),
      GY - 80,
      call,
      (out || ownSide) && !err?.forced ? '#ff5a4d' : wf.theme.palette.c3,
      38,
    );
    this.env.sfx.play(this.rally > 6 ? 'cheer' : 'kick', 0.6);
    this.banner = {
      text: `${this.score[0]} – ${this.score[1]}`,
      sub: `POINT ${wf.alias.slice(0, 14)} · ${tag}`.toUpperCase(),
      t: 0.1,
      color: wf.theme.palette.c3,
    };
    this.env.announce(
      `Point ${wf.alias}: ${why}. ${this.p[0].f.alias} ${this.score[0]}, ${this.p[1].f.alias} ${this.score[1]}.`,
    );
  }

  /** CPU opponent (right side). */
  private cpu(dt: number): PadState {
    const me = this.p[1];
    const P = this.aiP;
    const pad: PadState = {
      held: { left: false, right: false, up: false, down: false, a: false, b: false, c: false },
      pressed: { left: false, right: false, up: false, down: false, a: false, b: false, c: false },
    };
    void dt;
    if (this.phase === 'serve' && this.server === 1) {
      if (this.phaseT > 0.7) pad.pressed[this.rand() < 0.3 ? 'b' : 'a'] = true;
      return pad;
    }
    this.ai.home = this.ai.hitX + (this.cpuBase() - this.ai.hitX) * P.recover;
    let tx = this.ai.home;
    if (this.phase === 'rally') {
      const incoming = this.last === 0;
      if (incoming && !this.ai.planned) {
        if (this.ai.decideAt < 0) this.ai.decideAt = this.clock + P.react;
        if (this.clock >= this.ai.decideAt) {
          const pr = predict(this.s, GY - 125);
          // play the same shot twice running and it reads the third one coming
          this.ai.read = this.predictable() && this.rand() < P.read;
          if (this.ai.read) this.env.fx.pop(me.x, me.y - 236, 'READ IT!', '#ffffff', 22);
          const miss = (this.rand() * 2 - 1) * P.err * (this.ai.read ? 0.3 : 1);
          this.ai.tx = clamp(pr.x + miss + 18, NET_X + 50, COURT_R + 20);
          // will it get this one back clean? depends on how good your shot was (time to cover
          // the distance now it has read it, pace, a back-line target, rally length)
          const pz = this.pressureOn(me, 0);
          if (this.ai.read) pz.p *= 0.35;
          const chance = P.unforced + P.forced * pz.p * pz.p;
          this.ai.err = this.rand() < chance ? (pz.p > 0.3 ? 'forced' : 'unforced') : null;
          this.ai.miss = this.ai.err === 'unforced';
          this.ai.lunged = false;
          // a thinking CPU won't waste a smash from the back line, where it has lost its pace
          const fromBack = pr.x > COURT_R - 100 && this.rand() < P.place;
          const sitter = this.sitterFor === 1;
          const keen = sitter || this.ai.read ? P.smash + 0.3 : P.smash;
          this.ai.smash = !fromBack && this.rand() < keen;
          this.ai.planned = true;
          this.ai.decideAt = -1;
        }
      }
      if (incoming && this.ai.planned) tx = this.ai.tx;
      if (incoming && this.ai.planned) {
        const close = Math.abs(this.s.x - me.x) < 110;
        if (
          this.ai.smash &&
          close &&
          this.s.vy > 0 &&
          this.s.y < GY - 235 &&
          this.s.y > GY - 300 &&
          me.y >= GY - 1
        )
          pad.pressed.up = true;
        if (
          me.swing < 0 &&
          inReach(me, this.s.x + this.s.vx * 0.06, this.s.y + this.s.vy * 0.06) &&
          this.s.x > NET_X - 20
        ) {
          pad.pressed.a = true;
        } else if (
          // can't get there: a last-ditch lunge as it drops past (a visible whiff)
          me.swing < 0 &&
          !this.ai.lunged &&
          this.s.vy > 0 &&
          this.s.y > GY - 110 &&
          Math.abs(this.s.x - me.x) < 190 &&
          this.s.x > NET_X
        ) {
          this.ai.lunged = true;
          me.tried = this.rally;
          pad.pressed.a = true;
        }
      }
    }
    const dx = tx - me.x;
    if (Math.abs(dx) > 12) pad.held[dx > 0 ? 'right' : 'left'] = true;
    return pad;
  }

  render(ctx: CanvasRenderingContext2D) {
    const fx = this.env.fx;
    const [a, b] = this.p;
    const bg = arenaLayer(a.f, b.f, W, H, GY, 'court');
    ctx.save();
    const o = fx.offset();
    ctx.translate(o.x, o.y);
    if (bg) ctx.drawImage(bg, 0, 0);
    // court lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(COURT_L, GY + 30);
    ctx.lineTo(COURT_R, GY + 30);
    for (const x of [COURT_L, COURT_R, NET_X - 110, NET_X + 110]) {
      ctx.moveTo(x, GY + 6);
      ctx.lineTo(x - (x - W / 2) * 0.12, GY + 60);
    }
    ctx.stroke();
    // serve spot under the server
    if (this.phase === 'serve') {
      const sv = this.p[this.server];
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * 6);
      ctx.fillStyle = alpha(sv.f.theme.palette.c3, 0.25 + pulse * 0.2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(sv.x, GY + 8, 46, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // predicted landing spot
    if (this.phase === 'rally' && this.landX !== null && this.last !== null) {
      const col = this.p[this.last].f.theme.palette.c3;
      const lx = clamp(this.landX, 8, W - 8);
      const k = 0.5 + 0.5 * Math.sin(this.clock * 10);
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.fillStyle = alpha(col, 0.22);
      ctx.beginPath();
      ctx.ellipse(lx, GY + 10, 24 + k * 4, 7 + k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx - 9, GY + 6);
      ctx.lineTo(lx + 9, GY + 14);
      ctx.moveTo(lx + 9, GY + 6);
      ctx.lineTo(lx - 9, GY + 14);
      ctx.stroke();
      ctx.restore();
    }
    // shuttle floor shadow
    if (this.s.y < GY) {
      ctx.fillStyle = alpha(INK, 0.35);
      ctx.beginPath();
      ctx.ellipse(this.s.x, GY + 4, 10 + (GY - this.s.y) * 0.02, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    this.drawNet(ctx, true);
    for (const p of this.p) this.drawPlayer(ctx, p);
    this.drawNet(ctx, false);
    // shuttle + trail
    if (this.phase === 'rally' && this.trail.length > 1) {
      ctx.lineCap = 'round';
      for (let i = 1; i < this.trail.length; i++) {
        const p0 = this.trail[i - 1];
        const p1 = this.trail[i];
        if (!p0 || !p1) continue;
        ctx.strokeStyle = alpha('#ffffff', (i / this.trail.length) * 0.6);
        ctx.lineWidth = (i / this.trail.length) * 6;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }
    // up among the score plates the shuttle is drawn over the HUD instead (below)
    const overHud = this.s.y < 90;
    if (!overHud) this.drawShuttleTop(ctx);
    fx.drawParticles(ctx);
    fx.drawPops(ctx, DISPLAY_FONT);
    ctx.restore();
    fx.drawFlash(ctx, W, H);
    this.hud(ctx);
    if (overHud) {
      ctx.save();
      ctx.translate(o.x, o.y);
      this.drawShuttleTop(ctx);
      ctx.restore();
    }
    if (this.banner)
      banner(ctx, W, H, this.banner.text, this.banner.sub, this.banner.t, this.banner.color);
  }

  /** The shuttle, plus an arrow on the top edge while it's above the screen. */
  private drawShuttleTop(ctx: CanvasRenderingContext2D) {
    drawShuttle(ctx, this.s.x, Math.max(this.s.y, 14), this.s.angle, 1.3);
    if (this.s.y >= 0) return;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.s.x, 4);
    ctx.lineTo(this.s.x - 9, 18);
    ctx.lineTo(this.s.x + 9, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  /**
   * The net, seen slightly off-axis so it reads as a mesh panel: back post (far sideline) up and
   * right, front post down and left, the white tape at NET_TOP across the middle of the panel.
   */
  private drawNet(ctx: CanvasRenderingContext2D, back: boolean) {
    const D = 16; // half the panel's apparent depth
    const top = NET_TOP;
    const low = GY - 18; // bottom cord of the mesh
    const at = (f: number, y: number) => ({ x: NET_X + D - 2 * D * f, y: y - D + 2 * D * f });
    const post = (f: number) => {
      const a = at(f, top - 6);
      const b = at(f, GY + 2);
      ctx.fillStyle = INK;
      ctx.fillRect(a.x - 4, a.y, 8, b.y - a.y);
      ctx.fillStyle = alpha('#ffffff', 0.35);
      ctx.fillRect(a.x - 1, a.y + 4, 2, b.y - a.y - 8);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, 9, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    ctx.save();
    if (back) {
      post(0);
      // mesh panel
      const tl = at(0, top);
      const tr = at(1, top);
      const br = at(1, low);
      const bl = at(0, low);
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.fillStyle = alpha(INK, 0.3);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = alpha('#ffffff', 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = top + 8; y < low + 2 * D; y += 9) {
        const a = at(0, y);
        const b = at(1, y);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      for (let f = 0; f <= 1.001; f += 0.2) {
        const a = at(f, top);
        const b = at(f, low);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.restore();
      // bottom cord
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bl.x, bl.y);
      ctx.lineTo(br.x, br.y);
      ctx.stroke();
      ctx.restore();
      return;
    }
    post(1);
    // the tape: thick white band with an ink outline
    const a = at(0, top);
    const b = at(1, top);
    ctx.beginPath();
    ctx.moveTo(a.x + 4, a.y - 7);
    ctx.lineTo(b.x - 4, b.y - 7);
    ctx.lineTo(b.x - 4, b.y + 5);
    ctx.lineTo(a.x + 4, a.y + 5);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, p: Player) {
    const air = p.y < GY - 1;
    let pose: PoseId = 'idle';
    let t = this.clock + p.side * 0.4;
    if (p.swing >= 0) {
      const k = p.swing / SWING;
      if (p.over) {
        pose = 'smash';
        t = (0.3 + k * 0.42) * (POSE_LOOP.smash ?? 1);
      } else {
        pose = 'serve';
        t = (0.34 + k * 0.4) * (POSE_LOOP.serve ?? 1);
      }
    } else if (air) {
      pose = 'jump';
      t = (p.vy < 0 ? 0.42 : 0.6) * (POSE_LOOP.jump ?? 1);
    } else if (Math.abs(p.vx) > 10) {
      pose = Math.abs(p.vx) > 300 ? 'run' : 'walk';
      t = p.walkT * (pose === 'run' ? 0.9 : 1.2);
    } else if (this.phase === 'point' && this.p[this.server] === p) {
      pose = 'celebrate';
      t = this.phaseT;
    }
    if (this.phase === 'over') {
      const g = gameWinner(this.score, this.target);
      pose = g === p.side ? 'victory' : 'hurt';
      t = g === p.side ? this.clock : 0.5;
    }
    drawFighter(ctx, p.f, pose, t, {
      x: p.x,
      y: p.y,
      scale: SCALE,
      facing: p.facing,
      prop: 'racket',
      noLift: air || pose === 'smash',
    });
    if (this.phase === 'serve' && this.server === p.side) {
      const col = p.f.theme.palette.c3;
      if (p.human) {
        // big enough to read on a phone (the canvas is scaled to ~40% there); aiming is
        // explained in the controls list and the start blurb
        const bob = Math.sin(this.clock * 5) * 3;
        inkText(ctx, 'YOUR SERVE!', p.x, p.y - 268 + bob, 40, col);
        inkText(
          ctx,
          'SWING: HIGH · DROP: SHORT',
          p.x,
          p.y - 228,
          24,
          '#ffffff',
          'center',
          HEAD_FONT,
        );
        // first serves of the match: the one thing the start screen no longer spells out
        if (this.score[0] + this.score[1] < 3)
          inkText(
            ctx,
            'AIM: HOLD TO NET = TIGHT · BACK = DEEP',
            p.x,
            p.y - 198,
            19,
            p.f.theme.palette.c3,
            'center',
            HEAD_FONT,
          );
      } else inkText(ctx, 'SERVING', p.x, p.y - 228, 26, col, 'center', HEAD_FONT);
    }
  }

  private hud(ctx: CanvasRenderingContext2D) {
    const [a, b] = this.p;
    for (const p of this.p) {
      const x0 = p.side ? W / 2 + 8 : W / 2 - 8 - 200;
      const fill = p.f.theme.palette.c1;
      plate(ctx, x0, 16, 200, 48, fill);
      ctx.font = `20px ${HEAD_FONT}`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = onFill(fill);
      ctx.textAlign = p.side ? 'left' : 'right';
      ctx.fillText(p.f.alias.slice(0, 14), p.side ? x0 + 12 : x0 + 188, 40);
      inkText(ctx, String(this.score[p.side]), p.side ? x0 + 200 + 34 : x0 - 34, 40, 48, '#ffffff');
      if (this.server === p.side) {
        ctx.fillStyle = p.f.theme.palette.c3;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.side ? x0 + 190 : x0 + 10, 24, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    const pr = this.phase === 'over' ? null : this.pressure();
    if (pr) {
      const k = 0.5 + 0.5 * Math.sin(this.clock * 5);
      const label = pr.text === 'DEUCE!' ? 'DEUCE · WIN BY TWO' : `MATCH POINT · ${pr.sub}`;
      inkText(ctx, label, W / 2, 84, 17 + k * 2, pr.color, 'center', HEAD_FONT);
    } else inkText(ctx, `FIRST TO ${this.target}`, W / 2, 82, 16, '#ffffff', 'center', HEAD_FONT);
    // clear of the shell's Sound / Full / Pause buttons (bottom-centre desktop, top-centre touch)
    if (this.rally >= 4 && this.phase === 'rally')
      inkText(ctx, `RALLY ${this.rally}`, W / 2, 112, 22, a.f.theme.palette.c3);
    void b;
  }

  describe(): string {
    const [a, b] = this.p;
    const side = this.s.x < NET_X ? `${a.f.alias}'s side` : `${b.f.alias}'s side`;
    const height = this.s.y < GY - 250 ? 'high' : this.s.y < GY - 120 ? 'head height' : 'low';
    const state =
      this.phase === 'serve'
        ? `${this.p[this.server].f.alias} to serve.`
        : this.phase === 'rally'
          ? `Shuttle on ${side}, ${height}, moving ${this.s.vx > 0 ? 'right' : 'left'}. You are ${Math.round(Math.abs(this.s.x - a.x) / 10)} steps ${this.s.x > a.x ? 'left of' : 'right of'} it.`
          : '';
    return `Score: ${a.f.alias} ${this.score[0]}, ${b.f.alias} ${this.score[1]}. First to ${this.target}. ${state}`;
  }
}
