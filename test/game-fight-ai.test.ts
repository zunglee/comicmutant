/**
 * Brawler: CPU strength by difficulty (headless seeded matches against scripted bots) and the
 * mechanics the CPU's punishes rely on (press buffer, block lag, block-stun buffering, guard break,
 * projectiles cleared on KO). The loop mirrors GameShell: hit-stop freezes the sim but keeps the
 * frame's presses, and slow-mo scales dt.
 */
import { describe, expect, it } from 'vitest';
import { Input } from '~/game/engine/input';
import { rng } from '~/game/engine/math';
import { type AiView, FIGHT_AI, FightAI } from '~/game/fight/ai';
import { ATTACKS, timeoutWinner } from '~/game/fight/rules';
import { _internals, FightSim, hintCopy } from '~/game/fight/sim';
import type { Difficulty } from '~/game/types';
import type { Fighter } from '~/lib/schema';
import { mockCtx, realFighters, stubEnv } from './game-helpers';

const DT = 1 / 60;
const fighters = realFighters().sort((a, b) => a.slug.localeCompare(b.slug));
const byKind = (k: Fighter['special']['kind']) => {
  const f = fighters.find((x) => x.special.kind === k);
  if (!f) throw new Error(`no fighter with a ${k} special`);
  return f;
};

type Env = ReturnType<typeof stubEnv>;

/** One shell frame: hit-stop freezes the sim (presses survive), otherwise step at fx time scale. */
function frame(sim: FightSim, env: Env, input: Input) {
  env.fx.update(DT);
  if (env.fx.hitstop > 0) env.fx.hitstop--;
  else {
    sim.update(DT * env.fx.timeScale, input);
    input.endStep();
  }
}

type Bot = (sim: FightSim, input: Input, i: number) => void;

/** The critic's dumb bot: walk in, alternate punch / kick, special when it can, never block. */
const dumbBot: Bot = (sim, input, i) => {
  const [a, b] = sim.b;
  const dist = Math.abs(a.x - b.x);
  const toward = b.x > a.x ? 'right' : 'left';
  input.press(0, toward === 'right' ? 'left' : 'right', false);
  input.press(0, toward, dist > 110);
  input.press(0, 'a', dist < 130 && i % 14 === 0);
  input.press(0, 'b', dist < 130 && i % 14 === 7);
  input.press(0, 'c', a.meter >= 50 && i % 30 === 0);
};

/** Button masher: drifts right, jabs every third of a second. */
const mashBot: Bot = (_sim, input, i) => {
  input.press(0, 'right', i % 90 < 40);
  input.press(0, 'a', i % 20 === 0);
};

/** P1's share of decided rounds over a set of seeded matches (several fighter pairings). */
function roundShare(d: Difficulty, bot: Bot): number {
  const won: [number, number] = [0, 0];
  for (let k = 0; k < 6; k++) {
    const p1 = fighters[k] as Fighter;
    const p2 = fighters[(k + 3) % fighters.length] as Fighter;
    for (let seed = 1; seed <= 3; seed++) {
      const env = stubEnv({ difficulty: d, p1, p2 });
      const sim = new FightSim(env, seed);
      const input = new Input(true);
      for (let i = 0; i < 60 * 600 && env.ended.length === 0; i++) {
        bot(sim, input, i);
        frame(sim, env, input);
      }
      expect(env.ended).toHaveLength(1);
      won[0] += sim.wins[0];
      won[1] += sim.wins[1];
    }
  }
  return won[0] / Math.max(1, won[0] + won[1]);
}

describe('brawler CPU strength', () => {
  it('a dumb walk-in bot wins <30% of rounds on normal and <10% on hard', () => {
    const easy = roundShare('easy', dumbBot);
    const normal = roundShare('normal', dumbBot);
    const hard = roundShare('hard', dumbBot);
    expect(normal).toBeLessThan(0.3);
    expect(hard).toBeLessThan(0.1);
    // distinct levels: each step is clearly harder
    expect(easy).toBeGreaterThan(normal + 0.25);
    expect(normal).toBeGreaterThan(hard);
  }, 120_000);

  it('a button masher wins <40% of rounds on normal, and less on hard', () => {
    const easy = roundShare('easy', mashBot);
    const normal = roundShare('normal', mashBot);
    const hard = roundShare('hard', mashBot);
    expect(normal).toBeLessThan(0.4);
    expect(hard).toBeLessThan(normal);
    expect(easy).toBeGreaterThan(normal + 0.2);
  }, 120_000);
});

describe('brawler CPU decisions', () => {
  /** Opponent swings, we block it, they sit in recovery: does the CPU press an attack? */
  function punishRate(d: Difficulty) {
    let punished = 0;
    const N = 400;
    for (let n = 0; n < N; n++) {
      const ai = new FightAI(FIGHT_AI[d], rng(1000 + n));
      let hit = false;
      // they stay stuck in a long recovery; we stay in block-stun so only reactions can press
      for (let f = 0; f < 50; f++) {
        const v: AiView = {
          dx: -110,
          oppAir: false,
          oppAttacking: true,
          oppHurt: false,
          selfFree: true,
          selfAir: false,
          meter: 0,
          projectileIncoming: false,
          canChain: false,
          oppAtkSeq: 1,
          oppAtk: 'punch',
          oppPhase: f < 5 ? 'startup' : f < 10 ? 'active' : 'recovery',
          oppFreeIn: (56 - f) / 60,
          oppBlocked: f >= 6,
          oppWhiffed: false,
          selfBlocking: f >= 6,
          selfReach: 140,
          oppReach: 140,
        };
        const it = ai.update(DT, v);
        if (f >= 6 && it.pressed.a) hit = true;
      }
      if (hit) punished++;
    }
    return punished / N;
  }

  it('punishes blocked attacks at roughly 0.3 / 0.6 / 0.9 by difficulty', () => {
    const rates = (['easy', 'normal', 'hard'] as const).map(punishRate);
    const want = (['easy', 'normal', 'hard'] as const).map((d) => FIGHT_AI[d].punish);
    rates.forEach((r, i) => {
      expect(Math.abs(r - (want[i] ?? 0))).toBeLessThan(0.08);
    });
    expect(rates[0]).toBeLessThan(rates[1] ?? 0);
    expect(rates[1]).toBeLessThan(rates[2] ?? 0);
  });

  it('difficulty knobs are ordered: faster reactions, more blocking, anti-air and spacing', () => {
    const [e, n, h] = [FIGHT_AI.easy, FIGHT_AI.normal, FIGHT_AI.hard];
    expect(e.react).toBeGreaterThan(n.react);
    expect(n.react).toBeGreaterThan(h.react);
    for (const k of [
      'block',
      'guard',
      'punish',
      'spacing',
      'antiAir',
      'special',
      'combo',
    ] as const) {
      expect(e[k]).toBeLessThan(n[k]);
      expect(n[k]).toBeLessThan(h[k]);
    }
    expect(e.mistake).toBeGreaterThan(n.mistake);
    expect(n.mistake).toBeGreaterThan(h.mistake);
  });

  it('picks a round style, so rounds do not all play the same', () => {
    const styles = new Set<string>();
    const ai = new FightAI(FIGHT_AI.normal, rng(5));
    for (let r = 0; r < 30; r++) {
      ai.newRound();
      styles.add(ai.style);
    }
    expect(styles.size).toBe(3);
  });
});

/** Two fighters standing `gap` apart mid-round, CPU switched off so P2 is driven by input. */
function duel(gap: number, p1 = fighters[0] as Fighter, p2 = fighters[1] as Fighter) {
  const env = stubEnv({ vs: 'local', p1, p2 });
  const sim = new FightSim(env, 1);
  const input = new Input(false);
  for (let i = 0; i < 130; i++) frame(sim, env, input);
  expect(sim.phase).toBe('fight');
  const [a, b] = sim.b;
  a.x = 400;
  b.x = 400 + gap;
  return { env, sim, input, a, b };
}

const tap = (input: Input, p: 0 | 1, k: 'a' | 'b' | 'c') => {
  input.press(p, k, true);
  input.press(p, k, false);
};

describe('brawler mechanics', () => {
  it('a press a few frames before the chain window is buffered and chains', () => {
    const { env, sim, input, a } = duel(110);
    tap(input, 0, 'a');
    frame(sim, env, input);
    let i = 0;
    while (!a.hit && i++ < 30) frame(sim, env, input);
    expect(a.hit).toBe(true);
    // pressed during hit-stop, well before the cancel window opens at half the punch
    expect(a.st).toBeLessThan(0.5 * ATTACKS.punch.dur);
    tap(input, 0, 'b');
    let chained = false;
    for (let k = 0; k < 30; k++) {
      frame(sim, env, input);
      if (a.atk === 'kick') chained = true;
    }
    expect(chained).toBe(true);
  });

  it('a blocked attack costs the attacker extra recovery and cannot be chained', () => {
    const { env, sim, input, a, b } = duel(110);
    input.press(1, 'right', true); // P2 faces left: right = back = guard
    tap(input, 0, 'a');
    frame(sim, env, input);
    let i = 0;
    while (!a.hit && i++ < 30) frame(sim, env, input);
    expect(b.state).toBe('block');
    expect(a.blocked).toBe(true);
    expect(a.lag).toBeGreaterThan(0.05);
    tap(input, 0, 'b');
    let frames = 0;
    let kicked = false;
    while (a.state === 'attack' && frames++ < 120) {
      frame(sim, env, input);
      if (a.atk === 'kick' && a.seq === 2) kicked = true;
    }
    expect(kicked).toBe(false); // no chain off a blocked hit
    expect(b.hp).toBeLessThan(b.max); // chip damage
  });

  it('a press made in block-stun fires on the first free frame (punish)', () => {
    const { env, sim, input, a, b } = duel(110);
    input.press(1, 'right', true);
    tap(input, 0, 'a');
    frame(sim, env, input);
    let i = 0;
    while (b.state !== 'block' && i++ < 30) frame(sim, env, input);
    expect(b.state).toBe('block');
    tap(input, 1, 'a'); // pressed while still blocking
    input.press(1, 'right', false);
    const states: string[] = [];
    for (let k = 0; k < 40; k++) {
      frame(sim, env, input);
      states.push(b.state);
    }
    const firstOut = states.findIndex((s) => s !== 'block');
    expect(states[firstOut]).toBe('attack');
    // and it lands: the blocked attacker is still recovering
    let landed = false;
    for (let k = 0; k < 30; k++) {
      frame(sim, env, input);
      if (a.state === 'hurt') landed = true;
    }
    expect(landed).toBe(true);
  });

  it('the uppercut hits a standing opponent up close (not only jumpers)', () => {
    const { env, sim, input, b } = duel(90);
    input.press(0, 'down', true);
    tap(input, 0, 'a');
    for (let k = 0; k < 50; k++) frame(sim, env, input);
    expect(b.hp).toBeLessThan(b.max);
  });

  it('repeatedly blocking breaks the guard into a stagger', () => {
    const { env, sim, input, a, b } = duel(100);
    input.press(1, 'right', true);
    let broke = false;
    for (let n = 0; n < 8 && !broke; n++) {
      a.x = b.x - 100;
      tap(input, 0, 'b');
      for (let k = 0; k < 42; k++) {
        frame(sim, env, input);
        if (b.state === 'hurt') broke = true;
      }
    }
    expect(broke).toBe(true);
    expect(b.guard).toBe(0);
  });

  it('projectiles are cleared at the KO and never hit the winner', () => {
    const { env, sim, input, a, b } = duel(110, fighters[0] as Fighter, byKind('projectile'));
    // an orb from P2 is in flight toward P1 when P1 lands the KO
    sim.shots.push({ owner: 1, x: a.x + 600, y: a.y - 100, vx: -300, t: 0, alive: true });
    b.hp = 0.5;
    tap(input, 0, 'a');
    let i = 0;
    while (sim.phase === 'fight' && i++ < 60) frame(sim, env, input);
    expect(sim.phase).toBe('roundEnd');
    expect(sim.shots).toHaveLength(0);
    const hp = a.hp;
    for (let k = 0; k < 120; k++) frame(sim, env, input);
    expect(a.hp).toBe(hp);
    expect(a.state).toBe('win');
  });

  it('the next round opens with a ROUND banner naming the leader', () => {
    const env = stubEnv({ vs: 'local' });
    const sim = new FightSim(env, 2);
    const input = new Input(false);
    for (let i = 0; i < 130; i++) frame(sim, env, input);
    const [a, b] = sim.b;
    a.x = 400;
    b.x = 510;
    b.hp = 0.5;
    tap(input, 0, 'a');
    for (let i = 0; i < 60 * 4.5; i++) frame(sim, env, input);
    expect(sim.round).toBe(2);
    expect(sim.banner?.text ?? '').toMatch(/ROUND 2|FIGHT/);
    expect(env.said.some((s) => s.startsWith('Round 2'))).toBe(true);
  });

  it('a teleport onto a cornered opponent lands on the open side, facing them', () => {
    const { env, sim, input, a, b } = duel(300, byKind('teleport'), fighters[1] as Fighter);
    a.x = 600;
    b.x = 900; // pinned in the right corner
    a.meter = 100;
    tap(input, 0, 'c');
    for (let k = 0; k < 45; k++) frame(sim, env, input);
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(60);
    expect(a.facing).toBe(b.x > a.x ? 1 : -1);
  });

  it('a time-out with level health goes to the busier fighter on points', () => {
    expect(timeoutWinner([50, 90], [100, 100], [0, 0])).toEqual({ winner: 1, by: 'health' });
    expect(timeoutWinner([80, 80.5], [100, 100], [9, 4])).toEqual({ winner: 0, by: 'points' });
    expect(timeoutWinner([80, 80], [100, 100], [3, 3])).toEqual({ winner: -1, by: 'draw' });
    const { env, sim, input, a, b } = duel(300);
    a.hp = b.hp = 50;
    a.max = b.max = 100;
    a.pts = 2;
    b.pts = 7;
    sim.timer = 0.05;
    for (let k = 0; k < 10; k++) frame(sim, env, input);
    expect(sim.phase).toBe('roundEnd');
    expect(sim.wins).toEqual([0, 1]);
    expect(sim.banner?.text).toBe('TIME!');
    expect(sim.banner?.sub).toMatch(/WINS ON POINTS/);
  });
});

describe('brawler coaching', () => {
  it('teaches block after two hits taken, punish after a block, once per session', () => {
    _internals.resetHints();
    const { env, sim, input, a, b } = duel(110);
    for (let n = 0; n < 2; n++) {
      b.x = a.x + 110;
      tap(input, 1, 'a');
      for (let k = 0; k < 40; k++) frame(sim, env, input);
    }
    expect(sim.hint?.id).toBe('block');
    for (let k = 0; k < 60 * 4; k++) frame(sim, env, input);
    expect(sim.hint).toBeNull();
    input.press(0, 'left', true); // P1 faces right: left = back = guard
    b.x = a.x + 110;
    tap(input, 1, 'a');
    for (let k = 0; k < 20; k++) frame(sim, env, input);
    expect(a.state === 'block' || sim.hint !== null).toBe(true);
    expect(sim.hint?.id).toBe('punish');
    // a second match in the same session stays quiet
    const again = duel(110);
    for (let n = 0; n < 2; n++) {
      again.b.x = again.a.x + 110;
      tap(again.input, 1, 'a');
      for (let k = 0; k < 40; k++) frame(again.sim, again.env, again.input);
    }
    expect(again.a.hp).toBeLessThan(again.a.max);
    expect(again.sim.hint).toBeNull();
  });

  it('tips name the touch buttons on a phone and the keys on a keyboard', () => {
    expect(hintCopy('block', true, 1).text).toBe('HOLD ◀ TO BLOCK');
    expect(hintCopy('block', true, -1).text).toBe('HOLD ▶ TO BLOCK');
    expect(hintCopy('block', false, 1).sub).toMatch(/\bA\b/);
    expect(hintCopy('punish', true, 1).sub).toMatch(/PUNCH/);
    expect(hintCopy('punish', true, 1).sub).not.toMatch(/\(F\)/);
    expect(hintCopy('punish', false, 1).sub).toMatch(/\(F\)/);
    _internals.resetHints();
    const { env, sim, input, a, b } = duel(110);
    sim.touch = true;
    for (let n = 0; n < 2; n++) {
      b.x = a.x + 110;
      tap(input, 1, 'a');
      for (let k = 0; k < 40; k++) frame(sim, env, input);
    }
    expect(sim.hint?.text).toBe('HOLD ◀ TO BLOCK');
  });

  it('enlarges HUD lettering when the canvas is drawn phone-small', () => {
    const env = stubEnv();
    const sim = new FightSim(env, 1);
    const m = mockCtx();
    (m.ctx as unknown as { canvas: { clientWidth: number } }).canvas = { clientWidth: 960 };
    sim.render(m.ctx);
    expect(sim.ui).toBe(1);
    (m.ctx as unknown as { canvas: { clientWidth: number } }).canvas = { clientWidth: 500 };
    sim.render(m.ctx);
    // smallest HUD text (16 canvas px) lands at ≥ 11 css px on a 500 px canvas
    expect(16 * sim.ui * (500 / 960)).toBeGreaterThanOrEqual(11);
    expect(m.nan).toHaveLength(0);
  });

  it('a running combo keeps a single counter label that updates', () => {
    const { env, sim, input, a } = duel(110);
    let best = 0;
    let most = 0;
    // mash punch / kick so the string chains; buffered presses land in the cancel windows
    for (let k = 0; k < 90; k++) {
      if (k % 6 === 0) tap(input, 0, k % 12 === 0 ? 'a' : 'b');
      frame(sim, env, input);
      best = Math.max(best, a.combo);
      most = Math.max(most, env.fx.pops.filter((q) => q.text.endsWith(' HITS!')).length);
    }
    expect(best).toBeGreaterThanOrEqual(3);
    expect(most).toBe(1);
  });
});
