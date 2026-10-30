import { describe, expect, it } from 'vitest';
import { BadmintonSim } from '~/game/badminton/sim';
import { Input } from '~/game/engine/input';
import { rng } from '~/game/engine/math';
import { FIGHT_AI, FightAI } from '~/game/fight/ai';
import { FightSim } from '~/game/fight/sim';
import { FootballSim } from '~/game/football/sim';
import { applyResult } from '~/game/records';
import type { Difficulty } from '~/game/types';
import { stubEnv } from './game-helpers';

const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];

// Quiz Duel tests live in test/game-quiz.test.ts.

describe('brawler CPU', () => {
  it('harder CPUs guard more often against the same attacks', () => {
    const guards = DIFFS.map((d) => {
      const ai = new FightAI(FIGHT_AI[d], rng(3));
      let g = 0;
      for (let i = 0; i < 6000; i++) {
        const attacking = i % 60 < 20;
        const it = ai.update(1 / 60, {
          dx: -90,
          oppAir: false,
          oppAttacking: attacking,
          oppHurt: false,
          selfFree: true,
          selfAir: false,
          meter: 0,
          projectileIncoming: false,
          canChain: false,
        });
        if (attacking && it.held.right) g++;
      }
      return g;
    });
    expect(guards[0]).toBeLessThan(guards[1] ?? 0);
    expect(guards[1]).toBeLessThan(guards[2] ?? 0);
  });

  it('a CPU match runs headless and someone takes damage', () => {
    const env = stubEnv({ difficulty: 'hard' });
    const sim = new FightSim(env, 11);
    const input = new Input(true);
    for (let i = 0; i < 60 * 25; i++) {
      // P1 walks in and mashes
      input.press(0, 'right', i % 90 < 40);
      input.press(0, 'a', i % 20 === 0);
      sim.update(1 / 60, input);
      input.endStep();
    }
    const [a, b] = sim.b;
    expect(a.hp < a.max || b.hp < b.max || sim.wins[0] + sim.wins[1] > 0).toBe(true);
  });
});

describe('sports sims', () => {
  it('badminton: the CPU wins points against an idle player', () => {
    const env = stubEnv({ difficulty: 'normal', settings: { points: '7' } });
    const sim = new BadmintonSim(env, 5);
    const input = new Input(true);
    for (let i = 0; i < 60 * 40; i++) {
      // P1 serves when it's their turn, otherwise stands still
      input.press(0, 'a', i % 30 === 0);
      sim.update(1 / 60, input);
      input.endStep();
    }
    expect(sim.score[1]).toBeGreaterThan(0);
  });

  it('football: the match clock runs out and produces a result', () => {
    const env = stubEnv({ difficulty: 'hard' });
    const sim = new FootballSim(env, 9);
    const input = new Input(true);
    for (let i = 0; i < 60 * 400 && env.ended.length === 0; i++) {
      sim.update(1 / 60, input);
      input.endStep();
    }
    expect(env.ended).toHaveLength(1);
    expect(sim.score[1]).toBeGreaterThan(0);
  });
});

describe('records', () => {
  it('folds results into a per-game record', () => {
    let r = applyResult(
      {},
      { game: 'fight', winner: 'p1', score: [2, 0], summary: '' },
      'a',
      'b',
      1,
    );
    r = applyResult(r, { game: 'fight', winner: 'p1', score: [2, 1], summary: '' }, 'a', 'b', 2);
    r = applyResult(r, { game: 'fight', winner: 'p2', score: [0, 2], summary: '' }, 'a', 'b', 3);
    expect(r.fight).toMatchObject({
      played: 3,
      wins: 2,
      losses: 1,
      draws: 0,
      bestMargin: 2,
      bestScore: 2,
      streak: 0,
    });
    expect(r.quiz).toBeUndefined();
  });
});
