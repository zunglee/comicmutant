/** Smash Court, driven headlessly: aim, CPU levels, timing calls, and no stuck rallies. */
import { describe, expect, it } from 'vitest';
import { aimShot, GY, gameWinner, NET_X, predict, type ShotType } from '~/game/badminton/physics';
import { BAD_AI, BadmintonSim, SERVE_CLOCK } from '~/game/badminton/sim';
import { Input } from '~/game/engine/input';
import type { Difficulty } from '~/game/types';
import { mockCtx, stubEnv } from './game-helpers';

const DT = 1 / 60;

/** Put the shuttle in P1's hitting zone as if P2 had just played it. */
function stage(sim: BadmintonSim, dx = 22, dy = -128, vx = -60, vy = 60) {
  const p = sim.p[0];
  sim.phase = 'rally';
  sim.last = 1;
  sim.s.x = p.x + dx;
  sim.s.y = p.y + dy;
  sim.s.vx = vx;
  sim.s.vy = vy;
}

/** Swing with `button` while holding `hold`; returns where the shuttle comes down. */
function landing(button: 'a' | 'b', hold: 'left' | 'right' | null, seed = 3): number {
  const env = stubEnv({ vs: 'local' });
  const sim = new BadmintonSim(env, seed);
  const input = new Input(false);
  stage(sim);
  if (hold) input.press(0, hold, true);
  input.press(0, button, true);
  sim.update(DT, input);
  input.endStep();
  input.reset();
  expect(sim.last, 'P1 made contact').toBe(0);
  for (let i = 0; i < 60 * 6 && sim.phase === 'rally'; i++) {
    sim.update(DT, input);
    input.endStep();
  }
  expect(sim.phase).toBe('point');
  return sim.s.x;
}

describe('badminton aim', () => {
  it('the held direction sets the depth: toward the net = tight, away = deep, nothing = middle', () => {
    for (const button of ['a', 'b'] as const) {
      // P1 faces right, so "right" is toward the net
      const tight = landing(button, 'right') - NET_X;
      const mid = landing(button, null) - NET_X;
      const deep = landing(button, 'left') - NET_X;
      expect(tight, `${button}: lands over the net`).toBeGreaterThan(0);
      expect(mid - tight, `${button}: neutral is deeper than tight`).toBeGreaterThan(50);
      expect(deep - mid, `${button}: away is deeper than neutral`).toBeGreaterThan(50);
    }
  });

  it('aim is repeatable: the same input lands within a small window across seeds', () => {
    const xs = [1, 2, 3, 4, 5, 6].map((seed) => landing('a', 'left', seed));
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(40);
  });

  it('a held direction aims the serve as well', () => {
    const serve = (hold: 'left' | 'right' | null) => {
      const env = stubEnv({ vs: 'local' });
      const sim = new BadmintonSim(env, 4);
      const input = new Input(false);
      for (let i = 0; i < 40; i++) sim.update(DT, input);
      if (hold) input.press(0, hold, true);
      input.press(0, 'a', true);
      sim.update(DT, input);
      input.reset();
      expect(sim.phase).toBe('rally');
      return predict(sim.s, GY).x;
    };
    expect(serve('left') - serve('right')).toBeGreaterThan(80);
  });

  it('a smash from the forecourt is much faster than one from the back line', () => {
    const pace = (x: number) => {
      const v = aimShot(x, 180, 'smash', 1, NET_X + 200);
      return Math.hypot(v.vx, v.vy);
    };
    expect(pace(NET_X - 100)).toBeGreaterThan(pace(120) + 250);
  });
});

describe('badminton timing calls', () => {
  it('swinging well before the shuttle arrives calls EARLY!', () => {
    const env = stubEnv({ vs: 'local' });
    const sim = new BadmintonSim(env, 1);
    const input = new Input(false);
    // falling toward P1 from high up and in front: ~0.5 s from reach
    stage(sim, 90, -330, -90, 120);
    input.press(0, 'a', true);
    for (let i = 0; i < 22; i++) {
      sim.update(DT, input);
      input.endStep();
    }
    expect(sim.call).toBe('EARLY!');
  });

  it('swinging after it has dropped past calls LATE!', () => {
    const env = stubEnv({ vs: 'local' });
    const sim = new BadmintonSim(env, 1);
    const input = new Input(false);
    // already below and behind the racket, still falling
    stage(sim, -40, -20, -60, 300);
    input.press(0, 'a', true);
    for (let i = 0; i < 30; i++) {
      sim.update(DT, input);
      input.endStep();
    }
    expect(sim.call).toBe('LATE!');
  });
});

describe('badminton CPU', () => {
  type ShotFn = { cpuShot(air: boolean): { type: ShotType; depth: number } };

  it('a hard CPU plays away from you; an easy one barely reads you', () => {
    const readRate = (d: Difficulty) => {
      const sim = new BadmintonSim(stubEnv({ difficulty: d }), 11);
      const shot = (sim as unknown as ShotFn).cpuShot.bind(sim);
      let away = 0;
      const N = 300;
      for (let i = 0; i < N; i++) {
        sim.p[0].x = NET_X - 90; // you rushed the net → deep is right
        const a = shot(false);
        if (a.type === 'clear' && a.depth > 0.6) away++;
        sim.p[0].x = 110; // you're at the back → tight is right
        const b = shot(false);
        if (b.type === 'drop' && b.depth < 0.45) away++;
      }
      return away / (2 * N);
    };
    const easy = readRate('easy');
    const hard = readRate('hard');
    expect(hard).toBeGreaterThan(0.85);
    expect(easy).toBeLessThan(0.45);
  });

  it('levels are strictly ordered on every dial', () => {
    const [e, n, h] = (['easy', 'normal', 'hard'] as const).map((d) => BAD_AI[d]);
    if (!e || !n || !h) throw new Error('missing level');
    expect(e.react > n.react && n.react > h.react).toBe(true);
    expect(e.speed < n.speed && n.speed <= h.speed).toBe(true);
    expect(e.forced > n.forced && n.forced > h.forced).toBe(true);
    expect(e.unforced > n.unforced && n.unforced > h.unforced).toBe(true);
    expect(e.bite < n.bite && n.bite < h.bite).toBe(true);
    expect(e.place < n.place && n.place < h.place).toBe(true);
    expect(e.smash < n.smash && n.smash < h.smash).toBe(true);
  });
});

/**
 * P1 plays one staged shot at a CPU standing at `cpuX`; returns how the CPU's reply went:
 * 'error' (mishit, lunge-whiff, or never got there) or 'ok' (a clean return).
 */
function cpuReply(seed: number, cpuX: number, button: 'a' | 'b', hold: 'left' | 'right' | null) {
  const env = stubEnv({ difficulty: 'hard' });
  const sim = new BadmintonSim(env, seed);
  const input = new Input(true);
  stage(sim);
  sim.p[1].x = cpuX;
  if (hold) input.press(0, hold, true);
  input.press(0, button, true);
  sim.update(DT, input);
  input.endStep();
  input.reset();
  let swung = false;
  for (let i = 0; i < 60 * 6 && sim.phase === 'rally' && sim.last === 0; i++) {
    sim.update(DT, input);
    input.endStep();
    if (sim.p[1].swing >= 0) swung = true;
  }
  const clean = sim.phase === 'rally' && sim.last === 1 && !sim.mishit;
  return { result: clean ? 'ok' : 'error', swung };
}

describe('badminton CPU errors come from your shot, not a dice roll', () => {
  it('a tight drop with the CPU at the back line breaks it far more often than a sitter', () => {
    const rate = (cpuX: number, button: 'a' | 'b', hold: 'left' | 'right' | null) => {
      let err = 0;
      let swung = 0;
      const N = 120;
      for (let seed = 1; seed <= N; seed++) {
        const r = cpuReply(seed, cpuX, button, hold);
        if (r.result === 'error') err++;
        if (r.swung) swung++;
      }
      return { err: err / N, swung: swung / N };
    };
    // neutral clear landing about where the CPU waits
    const sitter = rate(790, 'a', null);
    // tight drop while it is camped on the back line
    const stretch = rate(880, 'b', 'right');
    // measured: sitter ≈ 0.02, stretch ≈ 0.2
    expect(sitter.err).toBeLessThan(0.06);
    expect(stretch.err).toBeGreaterThan(0.12);
    expect(stretch.err).toBeGreaterThan(sitter.err * 5);
    // it never just freezes: it goes for every shot, reachable or not
    expect(sitter.swung).toBe(1);
    expect(stretch.swung).toBeGreaterThan(0.95);
  });

  it('pressure rises with distance to cover, pace and a long rally', () => {
    const sim = new BadmintonSim(stubEnv({ difficulty: 'hard' }), 1);
    const cpu = sim.p[1];
    sim.phase = 'rally';
    sim.last = 0;
    Object.assign(sim.s, { x: 300, y: 300, vx: 520, vy: -500 });
    // this shot comes down around x≈620
    cpu.x = 610;
    const near = sim.pressureOn(cpu, 0).p;
    cpu.x = 880;
    const far = sim.pressureOn(cpu, 0).p;
    expect(far).toBeGreaterThan(near + 0.2);
    sim.rally = 22;
    expect(sim.pressureOn(cpu, 0).p).toBeGreaterThan(far * 1.5);
  });
});

describe('badminton: your errors come from how you met it', () => {
  const swingAt = (seed: number, dx: number, dy: number) => {
    const env = stubEnv({ vs: 'local' });
    const sim = new BadmintonSim(env, seed);
    const input = new Input(false);
    stage(sim, dx, dy);
    input.press(0, 'a', true);
    sim.update(DT, input);
    expect(sim.last).toBe(0);
    return sim.mishit !== null;
  };

  it('a well-met shot is never shanked; a late one often is', () => {
    let clean = 0;
    let late = 0;
    for (let seed = 1; seed <= 80; seed++) {
      if (swingAt(seed, 40, -128)) clean++;
      if (swingAt(seed, -22, -100)) late++;
    }
    expect(clean).toBe(0);
    expect(late).toBeGreaterThan(10);
  });
});

describe('badminton CPU reads patterns', () => {
  type Priv = { repeats(): number; cpuBase(): number };
  it('repeating a tight drop gets read, and it shades up to the net', () => {
    const sim = new BadmintonSim(stubEnv({ difficulty: 'hard' }), 2);
    const priv = sim as unknown as Priv;
    const base0 = priv.cpuBase();
    const drop = { side: 0 as const, type: 'drop' as const, band: 0 };
    const reply = { side: 1 as const, type: 'clear' as const, band: 2 };
    sim.shots = [drop, reply, drop, reply, drop];
    expect(priv.repeats()).toBe(3);
    expect(priv.cpuBase()).toBeLessThan(base0 - 40);
    sim.shots = [drop, reply, { side: 0, type: 'clear', band: 2 }];
    expect(priv.repeats()).toBe(1);
  });
});

describe('badminton easy is kind to beginners', () => {
  it('a chase-and-mash player wins at least 40% of matches on easy', () => {
    let wins = 0;
    let p1 = 0;
    let all = 0;
    const N = 10;
    for (let seed = 1; seed <= N; seed++) {
      const env = stubEnv({ difficulty: 'easy' });
      const sim = new BadmintonSim(env, seed);
      const input = new Input(true);
      for (let i = 0; i < 60 * 600 && env.ended.length === 0; i++) {
        const me = sim.p[0];
        const tx = sim.s.x - 30;
        input.press(0, 'right', tx > me.x + 10);
        input.press(0, 'left', tx < me.x - 10);
        input.press(0, 'a', i % 10 === 0);
        input.press(0, 'up', i % 37 === 0);
        sim.update(DT, input);
        input.endStep();
      }
      if (env.ended[0]?.winner === 'p1') wins++;
      p1 += sim.score[0];
      all += sim.score[0] + sim.score[1];
    }
    expect(wins / N).toBeGreaterThanOrEqual(0.4);
    expect(p1 / all).toBeGreaterThan(0.45);
  });

  it('only easy widens your reach', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const sim = new BadmintonSim(stubEnv({ difficulty: d }), 1);
      expect(sim.p[0].reachK > 1).toBe(d === 'easy');
      expect(sim.p[1].reachK).toBe(1);
    }
  });
});

describe('badminton hard reads alternation too', () => {
  type Priv = { predictable(): boolean };
  it('deep, tight, deep, tight is a pattern; a mixed sequence is not', () => {
    const sim = new BadmintonSim(stubEnv({ difficulty: 'hard' }), 2);
    const priv = sim as unknown as Priv;
    const deep = { side: 0 as const, type: 'clear' as const, band: 2 };
    const tight = { side: 0 as const, type: 'drop' as const, band: 0 };
    const cpu = { side: 1 as const, type: 'clear' as const, band: 2 };
    sim.shots = [deep, cpu, tight, cpu, deep, cpu, tight];
    expect(priv.predictable()).toBe(true);
    sim.shots = [deep, cpu, tight, cpu, tight, cpu, deep];
    expect(priv.predictable()).toBe(false);
  });
});

describe('badminton pacing', () => {
  it('defaults to first to 7, with a cap at 10', () => {
    const sim = new BadmintonSim(stubEnv(), 1);
    expect(sim.target).toBe(7);
    sim.score = [9, 9];
    expect(sim.pressure()?.text).toBe('DEUCE!');
    expect(gameWinner([10, 9], 7)).toBe(0);
    expect(gameWinner([8, 7], 7)).toBeNull();
  });

  it('an idle server gets a serve played for them', () => {
    const env = stubEnv({ vs: 'local' });
    const sim = new BadmintonSim(env, 1);
    const input = new Input(false);
    for (let i = 0; i < 60 * (SERVE_CLOCK + 0.5) && sim.phase === 'serve'; i++)
      sim.update(DT, input);
    expect(sim.phase).toBe('rally');
  });
});

/**
 * A human-like scripted P1: reads the shot after `react` s, runs to a slightly-off spot,
 * swings when the shuttle is close (50% chance per frame), serves when it's their turn.
 */
function playMatch(d: Difficulty, seed: number, react = 0.3, points = '7') {
  const env = stubEnv({ difficulty: d, settings: { points } });
  const sim = new BadmintonSim(env, seed);
  const input = new Input(true);
  let rnd = seed * 7919;
  const r = () => {
    rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
    return rnd / 0x7fffffff;
  };
  let seenAt = -1;
  let seenRally = -1;
  let tx = 260;
  let rallyStart = 0;
  let serveStart = 0;
  let longestRally = 0;
  let longestServe = 0;
  for (let i = 0; i < 60 * 900 && env.ended.length === 0; i++) {
    const t = i / 60;
    const me = sim.p[0];
    if (sim.phase === 'rally' && sim.last === 1) {
      if (seenRally !== sim.rally) {
        seenRally = sim.rally;
        seenAt = t;
      }
      if (t - seenAt > react && t - seenAt < react + 0.02)
        tx = predict(sim.s, GY - 125).x - 18 + (r() * 2 - 1) * 45;
    } else tx = 260; // back to base between shots, like a person
    input.press(0, 'right', tx > me.x + 10);
    input.press(0, 'left', tx < me.x - 10);
    const dist = Math.hypot(sim.s.x - (me.x + 22), sim.s.y - (me.y - 110));
    input.press(
      0,
      'a',
      (sim.phase === 'serve' && i % 30 === 0) ||
        (sim.phase === 'rally' && sim.last === 1 && dist < 90 && me.swing < 0 && r() < 0.5),
    );
    const before = sim.phase;
    sim.update(DT, input);
    input.endStep();
    if (!Number.isFinite(sim.s.x) || !Number.isFinite(sim.s.y)) throw new Error('shuttle NaN');
    if (before !== 'serve' && sim.phase === 'serve') serveStart = t;
    if (before === 'serve' && sim.phase !== 'serve')
      longestServe = Math.max(longestServe, t - serveStart);
    if (before !== 'rally' && sim.phase === 'rally') rallyStart = t;
    if (sim.phase === 'rally') longestRally = Math.max(longestRally, t - rallyStart);
  }
  return { env, sim, longestRally, longestServe };
}

describe('badminton matches (scripted human-like P1)', () => {
  it('hard wins clearly more rallies than easy against the same player', () => {
    const share = (d: Difficulty) => {
      let cpu = 0;
      let all = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const { sim } = playMatch(d, seed);
        cpu += sim.score[1];
        all += sim.score[0] + sim.score[1];
      }
      return cpu / all;
    };
    const easy = share('easy');
    const normal = share('normal');
    const hard = share('hard');
    // measured: easy ≈ 0.27, normal ≈ 0.62, hard ≈ 0.76
    expect(easy).toBeLessThan(0.35);
    expect(normal).toBeGreaterThan(easy + 0.2);
    expect(hard).toBeGreaterThan(normal + 0.08);
  });

  it('no stuck states: every match finishes and every rally ends within 90 s', () => {
    for (const d of ['easy', 'normal', 'hard'] as const)
      for (const react of [0.15, 0.3]) {
        for (let seed = 1; seed <= 4; seed++) {
          const { env, longestRally, longestServe } = playMatch(d, seed, react);
          expect(env.ended, `${d} seed ${seed}`).toHaveLength(1);
          expect(longestRally, `${d} react ${react} seed ${seed}`).toBeLessThan(90);
          expect(longestServe).toBeLessThan(3);
        }
      }
  });

  it('points come with a reason, and match point / deuce are called', () => {
    const { env, sim } = playMatch('normal', 2, 0.3, '11');
    const reasons = env.said.filter((m) => m.startsWith('Point '));
    expect(reasons.length).toBe(sim.score[0] + sim.score[1]);
    for (const m of reasons)
      expect(m).toMatch(
        /hit it out|found the net|came up short|missed the return|smash winner|clean winner|forced the error|gave it away|stretched|put the sitter away|smash forced it/,
      );
    sim.score = [10, 9];
    expect(sim.pressure()?.text).toBe('MATCH POINT');
    sim.score = [10, 10];
    expect(sim.pressure()?.text).toBe('DEUCE!');
    sim.score = [3, 2];
    expect(sim.pressure()).toBeNull();
  });

  it('renders every phase without NaN', () => {
    const env = stubEnv({ difficulty: 'hard', settings: { points: '7' } });
    const sim = new BadmintonSim(env, 9);
    const input = new Input(true);
    const m = mockCtx();
    for (let i = 0; i < 60 * 30; i++) {
      input.press(0, 'a', i % 30 === 0);
      sim.update(DT, input);
      input.endStep();
      if (i % 20 === 0) sim.render(m.ctx);
    }
    expect(m.nan).toEqual([]);
    expect(m.calls.length).toBeGreaterThan(100);
  });
});
