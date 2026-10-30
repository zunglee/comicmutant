import { describe, expect, it } from 'vitest';
import {
  aimShot,
  COURT_L,
  COURT_R,
  GY,
  gameWinner,
  NET_TOP,
  NET_X,
  pointWinner,
  predict,
  type ShotType,
  shotTarget,
  stepShuttle,
} from '~/game/badminton/physics';
import { advance, STEP } from '~/game/engine/loop';
import {
  ATTACKS,
  circleRect,
  damage,
  hurtbox,
  matchWinner,
  rectRect,
  roundWinner,
} from '~/game/fight/rules';
import {
  BALL_R,
  BAR_Y,
  type Ball,
  collide,
  GY as FGY,
  GOAL_DEPTH,
  goalScored,
  stepBall,
  winnerOf,
} from '~/game/football/physics';
import { W } from '~/game/shell/const';

describe('fixed-step loop', () => {
  it('turns frame time into whole 60 Hz steps and keeps the remainder', () => {
    const r = advance(0, 0.05);
    expect(r.steps).toBe(3);
    expect(r.acc).toBeCloseTo(0.05 - 3 * STEP, 6);
  });
  it('caps steps per frame and drops the backlog (no spiral of death)', () => {
    const r = advance(0, 10);
    expect(r.steps).toBe(5);
    expect(r.acc).toBe(0);
  });
  it('ignores negative time', () => {
    expect(advance(0.01, -1)).toEqual({ steps: 0, acc: 0.01 });
  });
});

describe('shuttle physics', () => {
  const fly = (x: number, y: number, v: { vx: number; vy: number }) => {
    const s = { x, y, ...v, angle: 0 };
    let hitNet = false;
    for (let i = 0; i < 600 && s.y < GY; i++) if (stepShuttle(s, 1 / 60)) hitNet = true;
    return { land: s.x, hitNet };
  };

  it('aimed shots clear the net and land near their target from anywhere on the court', () => {
    for (const type of [
      'clear',
      'drop',
      'smash',
      'drive',
      'serve-high',
      'serve-short',
    ] as ShotType[])
      for (const x of [COURT_L + 20, 200, 320, NET_X - 60])
        for (const y of type === 'smash' ? [240, 300, 400] : [360, 400]) {
          const tx = shotTarget(type, 1, 0.5);
          const r = fly(x, y, aimShot(x, y, type, 1, tx));
          expect(r.hitNet, `${type} from ${x},${y}`).toBe(false);
          expect(r.land).toBeGreaterThan(NET_X);
          if (type !== 'smash') expect(Math.abs(r.land - tx)).toBeLessThan(30);
        }
  });

  it('works mirrored for the right-hand player', () => {
    const tx = shotTarget('clear', -1, 0.5);
    const r = fly(760, 360, aimShot(760, 360, 'clear', -1, tx));
    expect(r.land).toBeLessThan(NET_X);
    expect(Math.abs(r.land - tx)).toBeLessThan(30);
  });

  it('high drag gives a low terminal fall speed', () => {
    const s = { x: 100, y: -5000, vx: 0, vy: 0, angle: 0 };
    for (let i = 0; i < 600; i++) stepShuttle(s, 1 / 60, false);
    expect(s.vy).toBeGreaterThan(500);
    expect(s.vy).toBeLessThan(760);
  });

  it('the shuttle flips to fly cork-first', () => {
    const s = { x: 100, y: 300, vx: 600, vy: -400, angle: Math.PI };
    for (let i = 0; i < 30; i++) stepShuttle(s, 1 / 60);
    expect(
      Math.abs(
        Math.atan2(
          Math.sin(s.angle - Math.atan2(s.vy, s.vx)),
          Math.cos(s.angle - Math.atan2(s.vy, s.vx)),
        ),
      ),
    ).toBeLessThan(0.3);
  });

  it('the net stops a low shot', () => {
    const s = { x: NET_X - 30, y: NET_TOP + 40, vx: 500, vy: 0, angle: 0 };
    let net = false;
    for (let i = 0; i < 10; i++) if (stepShuttle(s, 1 / 60) === 'net') net = true;
    expect(net).toBe(true);
    expect(s.x).toBeLessThan(NET_X);
  });

  it('predict() agrees with the simulation', () => {
    const v = aimShot(200, 360, 'clear', 1, 780);
    const p = predict({ x: 200, y: 360, ...v, angle: 0 }, GY);
    expect(Math.abs(p.x - 780)).toBeLessThan(40);
  });

  it('rally scoring rules', () => {
    expect(pointWinner(300, 1)).toBe(1); // landed on the left side → right player
    expect(pointWinner(700, 0)).toBe(0);
    expect(pointWinner(COURT_R + 20, 0)).toBe(1); // hit out by left player
    expect(pointWinner(COURT_L - 20, 1)).toBe(0);
    expect(gameWinner([11, 9], 11)).toBe(0);
    expect(gameWinner([11, 10], 11)).toBeNull();
    expect(gameWinner([10, 12], 11)).toBe(1);
    expect(gameWinner([15, 14], 11)).toBe(0); // hard cap
    expect(gameWinner([7, 3], 7)).toBe(0);
  });
});

describe('football physics', () => {
  const ball = (o: Partial<Ball>): Ball => ({ x: W / 2, y: 200, vx: 0, vy: 0, spin: 0, ...o });

  it('bounces with energy loss and settles on the pitch', () => {
    const b = ball({});
    let bounces = 0;
    for (let i = 0; i < 600; i++) if (stepBall(b, 1 / 60) > 0) bounces++;
    expect(bounces).toBeGreaterThan(1);
    expect(b.y).toBeCloseTo(FGY - BALL_R, 5);
    expect(Math.abs(b.vy)).toBeLessThan(1);
  });

  it('detects goals only under the bar', () => {
    expect(goalScored(ball({ x: GOAL_DEPTH - BALL_R - 2, y: FGY - BALL_R }))).toBe(1);
    expect(goalScored(ball({ x: W - GOAL_DEPTH + BALL_R + 2, y: FGY - BALL_R }))).toBe(0);
    expect(goalScored(ball({ x: 20, y: BAR_Y - 40 }))).toBeNull();
    expect(goalScored(ball({ x: W / 2, y: FGY - BALL_R }))).toBeNull();
  });

  it('the crossbar deflects a dropping ball', () => {
    const b = ball({ x: GOAL_DEPTH / 2, y: BAR_Y - 60, vy: 300 });
    for (let i = 0; i < 20; i++) stepBall(b, 1 / 60);
    expect(b.y).toBeLessThan(BAR_Y);
  });

  it('collide() pushes the ball out of a body and reflects it', () => {
    const b = ball({ x: 100, y: 300, vx: -300 });
    const hit = collide(b, { x: 80, y: 300, r: 20, vx: 0, vy: 0 });
    expect(hit).toBe(true);
    expect(b.x - 80).toBeGreaterThanOrEqual(BALL_R + 20 - 1e-6);
    expect(b.vx).toBeGreaterThan(0);
  });

  it('winner from score', () => {
    expect(winnerOf([2, 1])).toBe('p1');
    expect(winnerOf([0, 3])).toBe('p2');
    expect(winnerOf([1, 1])).toBe('draw');
  });
});

describe('brawler rules', () => {
  const s = (power: number, defense: number, special = 5) => ({
    power,
    speed: 5,
    defense,
    special,
  });

  it('damage scales with power, defence and combo length, never below 1', () => {
    const baseHit = damage(10, s(5, 5), s(5, 5), 0);
    expect(damage(10, s(10, 5), s(5, 5), 0)).toBeGreaterThan(baseHit);
    expect(damage(10, s(5, 5), s(5, 10), 0)).toBeLessThan(baseHit);
    expect(damage(10, s(5, 5), s(5, 5), 4)).toBeLessThan(baseHit);
    expect(damage(1, s(1, 1), s(1, 10), 30)).toBe(1);
  });

  it('hit detection: circle vs hurtbox', () => {
    const hb = hurtbox(500, 470, 170, 50, false);
    expect(circleRect(470, 400, 10, hb)).toBe(true);
    expect(circleRect(420, 400, 10, hb)).toBe(false);
    const crouch = hurtbox(500, 470, 170, 50, true);
    expect(circleRect(500, 470 - 150, 8, crouch)).toBe(false); // a high punch whiffs over a crouch
    expect(rectRect(hb, { x: 520, y: 350, w: 10, h: 10 })).toBe(true);
  });

  it('every attack has an active window inside its duration', () => {
    for (const a of Object.values(ATTACKS)) {
      expect(a.active[0]).toBeGreaterThan(0);
      expect(a.active[1]).toBeLessThan(1);
      expect(a.active[1]).toBeGreaterThan(a.active[0]);
    }
  });

  it('round and match winners', () => {
    expect(roundWinner([0, 50], [100, 100])).toBe(1);
    expect(roundWinner([40, 0], [100, 100])).toBe(0);
    expect(roundWinner([50, 50], [100, 100])).toBe(-1);
    expect(roundWinner([60, 70], [100, 140])).toBe(0); // by health fraction on time-out
    expect(matchWinner([2, 1], 3)).toBe(0);
    expect(matchWinner([1, 1], 2)).toBeNull();
    expect(matchWinner([1, 1], 5)).toBe(-1);
  });
});

describe('colour cache', () => {
  it('stays bounded when amounts are animated floats', async () => {
    const { alpha, mixHex, colorCacheSize } = await import('~/game/engine/color');
    for (let i = 0; i < 200_000; i++) {
      alpha('#ff2e4d', Math.random());
      mixHex('#ff2e4d', '#ffffff', Math.random());
    }
    expect(colorCacheSize()).toBeLessThanOrEqual(4000);
    expect(alpha('#000000', 0.12345)).toBe('rgba(0,0,0,0.123)');
  });
});
