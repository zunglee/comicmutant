/** Ball physics + goal rules for Big Head Football. Pure and unit-tested. */
import { W } from '../shell/const';

export const GY = 478;
export const BALL_R = 17;
export const GRAV = 1450;
export const GOAL_DEPTH = 72;
export const MATCH_TIME = 90;
/** Crossbar height: a 138 px mouth (was 182), so a well-placed keeper can cover it. */
export const BAR_Y = 340;
/** Halfway point of the match clock. */
export const HALF_TIME = MATCH_TIME / 2;

/** Sideways push (px/s²) on a ball resting on a goal roof. */
const ROOF_SLIDE = 1500;
/** Horizontal air drag per second, speed kept per bounce, and rolling friction per 60 Hz frame. */
const AIR_DRAG = 0.34;
const BOUNCE_GRIP = 0.74;
const ROLL = 0.955;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
}

/** Bounce off floor, ceiling, back walls and crossbars. Returns impact speed (for SFX). */
export function stepBall(b: Ball, dt: number): number {
  let impact = 0;
  b.vy += GRAV * dt;
  b.vx *= 1 - AIR_DRAG * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (b.y > GY - BALL_R) {
    b.y = GY - BALL_R;
    if (b.vy > 120) impact = b.vy;
    if (b.vy > 90) {
      b.vy = -b.vy * 0.56;
      b.vx *= BOUNCE_GRIP;
    } else if (b.vy > 0) b.vy = 0;
    b.vx *= ROLL ** (dt * 60);
  }
  if (b.y < BALL_R) {
    b.y = BALL_R;
    b.vy = Math.abs(b.vy) * 0.6;
  }
  if (b.x < BALL_R) {
    b.x = BALL_R;
    impact = Math.max(impact, Math.abs(b.vx));
    b.vx = Math.abs(b.vx) * 0.55;
  }
  if (b.x > W - BALL_R) {
    b.x = W - BALL_R;
    impact = Math.max(impact, Math.abs(b.vx));
    b.vx = -Math.abs(b.vx) * 0.55;
  }
  // crossbars: horizontal segments from the wall to the goal mouth
  for (const [x0, x1] of [
    [0, GOAL_DEPTH],
    [W - GOAL_DEPTH, W],
  ] as const) {
    const cx = Math.max(x0, Math.min(b.x, x1));
    const dx = b.x - cx;
    const dy = b.y - BAR_Y;
    const d = Math.hypot(dx, dy);
    if (d < BALL_R + 4 && d > 0) {
      const nx = dx / d;
      const ny = dy / d;
      b.x = cx + nx * (BALL_R + 4);
      b.y = BAR_Y + ny * (BALL_R + 4);
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= 1.6 * vn * nx;
        b.vy -= 1.6 * vn * ny;
        impact = Math.max(impact, -vn);
      }
      // the goal roof is sloped toward the pitch, so a ball can never come to rest on top of it
      if (ny < -0.3) b.vx += (x0 === 0 ? 1 : -1) * ROOF_SLIDE * dt;
    }
  }
  b.spin += (b.vx / BALL_R) * dt;
  return impact;
}

/** 0 = left player scored (ball in right goal), 1 = right player scored, null = no goal. */
export function goalScored(b: Ball): 0 | 1 | null {
  if (b.y <= BAR_Y + BALL_R * 0.5) return null;
  if (b.x + BALL_R < GOAL_DEPTH) return 1;
  if (b.x - BALL_R > W - GOAL_DEPTH) return 0;
  return null;
}

/**
 * Ball vs a moving body circle: separate and bounce, inheriting `carry` of the body's velocity.
 * Returns false when they do not touch.
 */
export function collide(b: Ball, c: Circle, restitution = 0.75, carry = 0.25): boolean {
  const dx = b.x - c.x;
  const dy = b.y - c.y;
  const d = Math.hypot(dx, dy);
  const min = BALL_R + c.r;
  if (d >= min || d === 0) return false;
  const nx = dx / d;
  const ny = dy / d;
  b.x = c.x + nx * min;
  b.y = c.y + ny * min;
  const rvx = b.vx - c.vx;
  const rvy = b.vy - c.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    b.vx -= (1 + restitution) * vn * nx;
    b.vy -= (1 + restitution) * vn * ny;
  }
  b.vx += c.vx * carry;
  b.vy += Math.min(0, c.vy) * 0.3;
  return true;
}

export function winnerOf(score: [number, number]): 'p1' | 'p2' | 'draw' {
  return score[0] > score[1] ? 'p1' : score[1] > score[0] ? 'p2' : 'draw';
}
