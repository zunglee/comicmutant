/**
 * Big Head Football CPU. Works for either side: everything is reasoned in a local frame where
 * "I" attack the goal at x = 0 and defend the goal at x = W, then mirrored back for side 0.
 *
 * Three jobs, picked every reaction tick: keep goal when the ball is coming, recover goal-side of
 * the ball (hopping over it instead of shoving it toward my own net), or attack it.
 */
import type { PadState } from '../engine/input';
import { clamp } from '../engine/math';
import { W } from '../shell/const';
import type { Difficulty } from '../types';
import { BAR_Y, type Ball, GOAL_DEPTH, GY } from './physics';

export interface FootAI {
  /** Run-speed multiplier. */
  speed: number;
  /** Seconds between re-plans (reaction time). */
  react: number;
  /** 0..1, how tightly it lines up on the ball. */
  aim: number;
  /** Chance scale for headers. */
  jump: number;
  /** Chance to spend a full meter when in range. */
  power: number;
  /** 0..1 keeper skill: stance accuracy, how early it drops back, save jumps. */
  keep: number;
  /** Ball must be past this fraction of the pitch (from my attacking goal) before I press it. */
  zone: number;
  /** Shoots when the ball is within this fraction of the pitch from the goal I attack. */
  range: number;
  /** Per-frame chance to strike a ball in reach. */
  kick: number;
  /** Per-frame chance to hop over a ball sitting on my goal side. */
  hop: number;
  /** Goal lead at which it eases off (sits deeper, shoots less, jogs): no runaway scorelines. */
  mercy: number;
  /** Goal lead at which it only minds its own goal. */
  coast: number;
  /** Kick and chip strength factor. */
  shot: number;
  /** Chance to take a long shot or header at an empty net (the opponent is far upfield). */
  openNet: number;
  /** Header strength factor. */
  head: number;
  /** Goal deficit at which it presses harder (faster reactions, keeps tighter, charges power). */
  press: number;
  /**
   * Kickoff discipline: on its own kickoff it plays the ball and then drops back goal-side for
   * this many seconds instead of dribbling at the player waiting to pounce (0 = easy: no).
   */
  settle: number;
}

export const FOOT_AI: Record<Difficulty, FootAI> = {
  easy: {
    speed: 0.5,
    react: 0.8,
    aim: 0.4,
    jump: 0.05,
    power: 0.15,
    keep: 0,
    zone: 0.15,
    range: 0.35,
    kick: 0.12,
    hop: 0.08,
    mercy: 2,
    coast: 3,
    shot: 0.75,
    openNet: 0.1,
    head: 0.6,
    press: 3,
    settle: 0,
  },
  normal: {
    speed: 0.9,
    react: 0.25,
    aim: 0.65,
    jump: 0.45,
    power: 0.5,
    keep: 0.55,
    zone: 0.3,
    range: 0.45,
    kick: 0.2,
    hop: 0.2,
    mercy: 3,
    coast: 5,
    shot: 0.95,
    openNet: 0.3,
    head: 0.7,
    press: 2,
    settle: 1.4,
  },
  hard: {
    speed: 1,
    react: 0.15,
    aim: 0.4,
    jump: 0.9,
    power: 1,
    keep: 0.6,
    zone: 0.42,
    range: 0.58,
    kick: 0.4,
    hop: 0.6,
    mercy: 5,
    coast: 7,
    shot: 1.05,
    openNet: 0.6,
    head: 1,
    press: 99,
    settle: 0.8,
  },
};

/** What the AI can see of a player. */
export interface AIBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  meter: number;
  kick: number;
}

export type AIMode = 'keep' | 'recover' | 'attack' | 'hold';

/** An opponent standing within this many px of its own goal line counts as camped/parked. */
const CAMP = 100;

const blankPad = (): PadState => ({
  held: { left: false, right: false, up: false, down: false, a: false, b: false, c: false },
  pressed: { left: false, right: false, up: false, down: false, a: false, b: false, c: false },
});

export class FootballAI {
  mode: AIMode = 'hold';
  /** Run-speed factor the sim applies on top of P.speed (drops while easing off). */
  pace = 1;
  /** Power-meter charge factor the sim applies (rises while pressing from behind). */
  charge = 1;
  /** Seconds left of dropping back after my own kickoff tap. */
  private settleT = 0;
  private target = W * 0.7;
  private timer = 0;
  private keepErr = 0;
  private jitter = 0;
  /** How long the ball has been dawdling; a dead ball is always worth going for. */
  private slowT = 0;
  /** How long a camped keeper has been walling me out. */
  private blockT = 0;

  constructor(
    readonly P: FootAI,
    private rand: () => number,
  ) {}

  /**
   * Kickoff: walk onto the ball and play it, no shot off the spot; then (P.settle) drop back
   * goal-side instead of dribbling at the player waiting to pounce.
   */
  private takeKickoff(side: 0 | 1, me: AIBody, ball: Ball): PadState {
    const pad = blankPad();
    const lr = (me.x - ball.x) * (side ? 1 : -1); // > 0: ball in front of me
    if (lr > 20) pad.held[side ? 'left' : 'right'] = true;
    this.mode = 'hold';
    return pad;
  }

  think(
    side: 0 | 1,
    me: AIBody,
    opp: AIBody,
    ball: Ball,
    dt: number,
    lead = 0,
    kickoff = false,
  ): PadState {
    const pad = blankPad();
    const P = this.P;
    if (kickoff) {
      this.settleT = P.settle;
      return this.takeKickoff(side, me, ball);
    }
    this.settleT = Math.max(0, this.settleT - dt);
    const easing = lead >= P.mercy;
    // a camped opponent is not playing: keep the ball alive rather than parking a bus of my own
    const camped = (side ? opp.x : W - opp.x) < GOAL_DEPTH + CAMP;
    const coasting = lead >= P.coast && !camped;
    // the mirror of easing off: well behind on easy/normal it wakes up, so no 22-0 farces
    // (a beginner never leads by three, so this costs them nothing)
    const pressing = lead <= -P.press;
    this.pace = easing ? 0.8 : pressing ? Math.max(1, 0.9 / P.speed) : 1;
    this.charge = pressing ? 3 : 1;
    const react = pressing ? Math.min(P.react * 0.6, 0.3) : P.react;
    const keep = pressing ? Math.max(Math.min(1, P.keep + 0.15), 0.5) : P.keep;
    const zone = easing ? Math.max(P.zone, 0.7) : pressing ? Math.max(0, P.zone - 0.1) : P.zone;
    const kickP = easing ? P.kick * 0.35 : P.kick;
    const L = (x: number) => (side ? x : W - x);
    const LV = (v: number) => (side ? v : -v);
    const bx = L(ball.x);
    const bvx = LV(ball.vx);
    const mx = L(me.x);
    const ox = L(opp.x);
    const h = GY - ball.y; // ball centre height above the pitch
    const ground = me.y >= GY - 0.5;
    const mouth = W - GOAL_DEPTH; // my goal line, local frame
    const ahead = bx - mx; // > 0: the ball is between me and my own goal
    const lr = mx - bx; // > 0: the ball is in front of me (kickable side)

    this.slowT = Math.hypot(ball.vx, ball.vy) < 90 ? this.slowT + dt : 0;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = react * (0.7 + this.rand() * 0.6);
      this.keepErr = (1 - keep) * (this.rand() - 0.3) * 120;
      this.jitter = (1 - P.aim) * (this.rand() - 0.5) * 70;
      const px = bx + bvx * 0.45;
      let keepX = clamp(mouth - 30 - this.keepErr, mouth - 150, mouth - 16);
      // never let the opponent camp between me and my own line
      if (ox > keepX - 30 && ox > mouth - 140) keepX = Math.min(mouth + 4, ox + 48);
      const oppLive = bx - ox > -10 && bx - ox < 110 && h < 110;
      const incoming = bvx > 140 && px > W * (0.75 - keep * 0.25);
      const near = Math.abs(bx - mx) < Math.abs(bx - ox) - 30 || this.slowT > 0.9;
      if (bx > mouth && h > GY - BAR_Y) {
        // ball up on my goal roof: guard the mouth, it will roll off to me
        this.mode = 'keep';
        this.target = keepX;
      } else if (ahead > -8) {
        this.mode = 'recover';
        this.target = bx + 58;
      } else if (
        (incoming || (oppLive && bx > W * (0.62 - keep * 0.25)) || bx > W - 220) &&
        !(near && Math.abs(bvx) < 260 && bx < mouth - 70)
      ) {
        this.mode = 'keep';
        this.target = bx > W - 320 ? keepX : Math.min(keepX, Math.max(bx + 130, W * 0.62));
      } else if (oppLive && !near && bx > W * 0.2) {
        // the opponent has it at its feet: shadow goal-side instead of diving in
        this.mode = 'keep';
        this.target = Math.min(keepX, bx + 100 + 70 * keep);
      } else if (bx > W * zone || near || ox < GOAL_DEPTH + CAMP) {
        // (a keeper camped on its line is no threat: go and take the ball off it)
        this.mode = 'attack';
        this.target = bx + 28 + this.jitter;
      } else {
        this.mode = 'hold';
        this.target = Math.min(clamp(bx + 260, W * 0.55, W * 0.72), keepX);
      }
      // just tapped off: drop into a shape goal-side of the ball rather than chase it
      if (this.settleT > 0 && ahead < -8) {
        this.mode = 'keep';
        this.target = Math.min(keepX, Math.max(bx + 220, W * 0.6));
      }
      // easing off: stay in my own half; well clear, just mind the goal
      if (coasting) {
        this.mode = 'keep';
        this.target = keepX;
      } else if (easing && !camped) this.target = Math.max(this.target, W * 0.5);
      this.target = clamp(this.target, GOAL_DEPTH, W - GOAL_DEPTH + 8);
    }

    // --- movement, with the own-goal guard ---
    const dx = this.target - mx;
    let dir = Math.abs(dx) > 8 ? Math.sign(dx) : 0;
    if (dir > 0 && ahead > -4 && ahead < 118 && h < 230) {
      // the ball sits between me and my net: never shove it goalward
      if (!ground)
        dir = GY - me.y > h + 6 ? 1 : 0; // airborne: carry on only once the feet clear it
      else if (h < 78 && ahead > 46 && ahead < 125 && ground && this.rand() < P.hop) {
        pad.pressed.up = true; // hop over it
      } else if (ahead < 48 && h < 120)
        dir = -1; // too close: back off to make room
      else dir = 0;
    }
    // the opponent stands between me and where I need to be: leapfrog it
    if (
      dir > 0 &&
      ground &&
      ox > mx &&
      ox - mx < 90 &&
      this.mode !== 'attack' &&
      this.rand() < P.hop
    )
      pad.pressed.up = true;

    // a keeper camped on its line: keep the ball alive, save the meter, chip once walled out
    const parked = ox < GOAL_DEPTH + CAMP;
    this.blockT = parked && this.mode === 'attack' && bx < W * 0.6 ? this.blockT + dt : 0;

    if (dir) pad.held[dir > 0 === (side === 1) ? 'right' : 'left'] = true;

    // --- strike (coasting: no shots or hoofs, it just blocks and lets the game come back) ---
    if (!coasting && me.kick < 0 && lr > 10 && lr < 84 && h < 74 && parked && bx < W * 0.6) {
      const gap = bx - GOAL_DEPTH;
      if (me.meter >= 100 && gap < 520 && !easing)
        pad.pressed.c = true; // power shot bowls the keeper over
      else if (this.rand() < kickP)
        // chip from range once walled out, otherwise test the keeper and play the rebound
        pad.pressed[this.blockT > 1 && gap > 190 && gap < 430 ? 'b' : 'a'] = true;
    } else if (!coasting && me.kick < 0 && lr > 10 && lr < 84 && h < 74 && this.rand() < P.kick) {
      const clearing = bx > W - 300;
      const longEmpty = ox > GOAL_DEPTH + 300 && bx > GOAL_DEPTH + 260;
      const inRange =
        bx < W * P.range &&
        (!easing || this.rand() < 0.35) &&
        (!longEmpty || this.rand() < P.openNet);
      const oppBlock = ox < bx && bx - ox < 210 && opp.y >= GY - 2;
      if (inRange) {
        if (me.meter >= 100 && !easing && (pressing || this.rand() < P.power)) pad.pressed.c = true;
        else if (oppBlock && bx - ox > 45 && this.rand() < 0.45) pad.pressed.b = true;
        else pad.pressed.a = true;
      } else if (clearing) pad.pressed.b = true; // hoof it high and long, not along the deck
      // otherwise keep dribbling: the body carries the ball forward
    }

    // --- back-heel flick when the ball sits behind me ---
    if (me.kick < 0 && ahead > -6 && ahead < 78 && h < 84 && this.rand() < P.kick * 1.5)
      pad.pressed.a = true;

    // --- headers and saves: jump only when a jump now actually meets the ball ---
    if (ground && !pad.pressed.up) {
      const meet = jumpMeets(bx, bvx, h, -ball.vy, mx);
      const oppStriking = Math.abs(bx - ox) < 90 && h < 120;
      if (meet && !oppStriking) {
        // would the ball sail over me if I stayed down?
        const over = meet.passH > 165;
        // an empty net from distance is a gift the lower levels mostly decline
        const longEmpty = ox > GOAL_DEPTH + 300 && bx > GOAL_DEPTH + 260;
        const attackHead =
          bx < W * (P.range + 0.12) && lr > -10 && (!longEmpty || this.rand() < P.openNet);
        if (over && bvx > 60 && this.rand() < 0.15 + keep * 0.6) pad.pressed.up = true;
        else if (attackHead && this.rand() < P.jump * 0.3) pad.pressed.up = true;
      }
    }
    return pad;
  }
}

/**
 * Would a jump started now bring my head onto the ball (local frame, heights up from the pitch)?
 * Returns the ball height as it passes my x when it does.
 */
function jumpMeets(bx: number, bvx: number, h: number, bvy: number, mx: number) {
  const JV = 880;
  const PG = 2200;
  const BG = 1450;
  let passH = -1;
  for (let t = 1 / 30; t <= 0.5; t += 1 / 30) {
    const x = bx + bvx * t;
    const y = h + bvy * t - 0.5 * BG * t * t;
    if (y < 17) return null;
    const head = 128 + Math.max(0, JV * t - 0.5 * PG * t * t);
    if (passH < 0 && (x - mx) * Math.sign(bvx || 1) >= 0) passH = y;
    if (Math.abs(x - mx) < 34 && Math.abs(y - head) < 34)
      return { t, passH: passH < 0 ? y : passH };
  }
  return null;
}
