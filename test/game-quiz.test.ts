import { describe, expect, it } from 'vitest';
import { Input } from '~/game/engine/input';
import { rng } from '~/game/engine/math';
import {
  answerFit,
  COMBO_AT,
  COMBO_MULT,
  COUNTER_DMG,
  CPU_HURRY,
  comboMult,
  cpuAnswer,
  cpuLock,
  cpuLockAt,
  FIRE_AT,
  HURRY_SLIP,
  MAX_HP,
  POOL_SIZE,
  QUESTION_TIME,
  QUESTIONS,
  QUIZ_AI,
  quizDamage,
  quizWinner,
  sampleQuestions,
  shuffleOptions,
} from '~/game/quiz/logic';
import { QuizSim } from '~/game/quiz/sim';
import type { Difficulty, QuizQ } from '~/game/types';
import { mockCtx, stubEnv } from './game-helpers';

const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];
const DT = 1 / 60;
const input = new Input(true);

const pool = (n = POOL_SIZE): QuizQ[] =>
  Array.from({ length: n }, (_, i) => ({
    q: `Question number ${i}?`,
    options: [`a${i}`, `b${i}`, `c${i}`, `d${i}`],
    answer: i % 4,
    why: `Because ${i}.`,
    name: `Someone ${i % 12}`,
  }));

function run(sim: QuizSim, seconds: number, each?: () => void) {
  for (let k = 0; k < Math.round(seconds / DT); k++) {
    sim.update(DT, input);
    each?.();
  }
}

/** Local 2P so the test controls both answers; P2 never answers unless told to. */
const local = () => stubEnv({ vs: 'local' });

describe('quiz damage', () => {
  it('fast answers hit harder; six fast right answers K.O., five do not', () => {
    expect(quizDamage(0.5)).toBeGreaterThan(quizDamage(8));
    expect(quizDamage(8)).toBeGreaterThan(quizDamage(QUESTION_TIME));
    let hp = MAX_HP;
    for (let s = 1; s <= 5; s++) hp -= quizDamage(1, s);
    expect(hp).toBeGreaterThan(0);
    hp -= quizDamage(1, 6);
    expect(hp).toBeLessThanOrEqual(0);
    expect(quizWinner([40, 0])).toBe('p1');
    expect(quizWinner([20, 20])).toBe('draw');
  });

  it('six fast right answers knock the other fighter out in the sim', () => {
    const env = local();
    const qs = pool(QUESTIONS);
    const sim = new QuizSim(env, qs, 1);
    for (let i = 0; i < 6; i++) {
      run(sim, 0.5);
      sim.answer(0, qs[i]?.answer ?? 0);
      run(sim, QUESTION_TIME + 2.5); // P2 never answers: a timeout gives no counter-hit
      if (sim.snap.ko !== null) break;
      expect(sim.snap.busy).toBe(false);
      sim.next();
    }
    expect(sim.snap.ko).toBe(1);
    expect(sim.snap.hp[1]).toBe(0);
    expect(sim.snap.asked).toBe(6);
    run(sim, 3);
    expect(sim.snap.phase).toBe('over');
    expect(env.ended).toHaveLength(1);
    expect(env.ended[0]?.winner).toBe('p1');
    expect(env.ended[0]?.summary).toMatch(/K\.O\. on question 6/);
    expect(env.ended[0]?.summary).toMatch(/6\/6 right/);
    expect(sim.snap.stats[0]).toMatchObject({ right: 6, bestStreak: 6 });
    expect(sim.snap.stats[0].fastest).toBeCloseTo(0.5, 5);
  });

  it('a wrong answer deals no damage and triggers the miss state', () => {
    const env = local();
    const qs = pool(QUESTIONS);
    const sim = new QuizSim(env, qs, 2);
    const q = qs[0] as QuizQ;
    run(sim, 1);
    sim.answer(0, (q.answer + 1) % 4);
    sim.answer(1, (q.answer + 2) % 4);
    expect(sim.snap.phase).toBe('reveal');
    expect(sim.snap.outcome?.[0]).toMatchObject({ ok: false, dmg: 0, timedOut: false });
    expect(env.fx.pops.map((p) => p.text)).toContain('MISS!');
    run(sim, 3);
    expect(sim.snap.hp).toEqual([MAX_HP, MAX_HP]);
    expect(sim.snap.streak[0]).toBe(0);
    // a right answer pops the damage number
    sim.next();
    run(sim, 1);
    sim.answer(0, qs[1]?.answer ?? 0);
    run(sim, 0.2);
    expect(sim.snap.phase).toBe('ask'); // P2 hasn't answered yet (local)
    run(sim, QUESTION_TIME);
    const dmg = sim.snap.outcome?.[0].dmg ?? 0;
    expect(dmg).toBeGreaterThan(0);
    expect(sim.snap.hp[1]).toBe(MAX_HP - dmg);
    expect(sim.snap.outcome?.[1].timedOut).toBe(true);
  });

  it('streaks build: ×2 from 3 in a row, ON FIRE at 5, reset (and COMBO BROKEN) on a miss', () => {
    expect([1, 2, 3, 5].map(comboMult)).toEqual([1, 1, COMBO_MULT, COMBO_MULT]);
    expect(quizDamage(1, 3)).toBe(quizDamage(1, 1) * COMBO_MULT);
    const env = local();
    const qs = pool(QUESTIONS);
    const sim = new QuizSim(env, qs, 6);
    const pops = () => env.fx.pops.map((p) => p.text);
    const untilReveal = () => {
      while (sim.snap.phase === 'ask') sim.update(DT, input);
    };
    // P2 never answers (timeouts give no counters), so only P1's streak drives the damage.
    for (let i = 0; i < FIRE_AT; i++) {
      run(sim, 1);
      sim.answer(0, qs[i]?.answer ?? 0);
      untilReveal();
      const strike = sim.snap.strikes.find((k) => k.who === 0);
      expect(strike?.mult).toBe(i + 1 >= COMBO_AT ? COMBO_MULT : 1);
      if (i + 1 >= COMBO_AT) expect(pops().some((t) => t.includes('COMBO'))).toBe(true);
      if (i + 1 === FIRE_AT) expect(pops()).toContain('ON FIRE!');
      run(sim, 3);
      sim.next();
    }
    expect(sim.snap.ko).toBeNull(); // 10+10+20+20+20 = 80
    expect(sim.snap.hp[1]).toBe(MAX_HP - 80);
    expect(sim.snap.streak[0]).toBe(FIRE_AT);
    run(sim, 1);
    sim.answer(0, ((qs[FIRE_AT]?.answer ?? 0) + 1) % 4);
    untilReveal();
    expect(sim.snap.streak[0]).toBe(0);
    expect(pops()).toContain('COMBO BROKEN');
  });

  it('a wrong answer hands the opponent a counter-hit; a double miss does not', () => {
    const env = local();
    const qs = pool(QUESTIONS);
    const sim = new QuizSim(env, qs, 4);
    const q = qs[0] as QuizQ;
    run(sim, 1);
    sim.answer(1, q.answer);
    sim.answer(0, (q.answer + 1) % 4);
    const o = sim.snap.outcome;
    expect(o?.[0]).toMatchObject({ ok: false, dmg: 0, counter: 0 });
    expect(o?.[1]).toMatchObject({ ok: true, counter: COUNTER_DMG });
    // the panel's hit strip: P2's hit, then its counter, both pending until they land
    expect(sim.snap.strikes.map((k) => [k.who, k.counter, k.state])).toEqual([
      [1, false, 'pending'],
      [1, true, 'pending'],
    ]);
    run(sim, 3);
    expect(sim.snap.strikes.every((k) => k.state === 'landed')).toBe(true);
    expect(sim.snap.strikes[1]?.hpAfter).toBe(sim.snap.hp[0]);
    expect(sim.snap.hp[0]).toBe(MAX_HP - (o?.[1].dmg ?? 0) - COUNTER_DMG);
    expect(sim.snap.hp[1]).toBe(MAX_HP);
    expect(sim.snap.stats[1].dealt).toBe((o?.[1].dmg ?? 0) + COUNTER_DMG);
    // blind instant guessing (1 in 4) loses HP on average
    expect(0.25 * quizDamage(0) - 0.75 * COUNTER_DMG).toBeLessThan(0);
  });

  it('the idle canvas before Start shows a title card', () => {
    const sim = new QuizSim(stubEnv(), pool(QUESTIONS), 5);
    const m = mockCtx();
    sim.render(m.ctx);
    expect(m.calls.some((c) => c.startsWith('fillText(QUIZ DUEL'))).toBe(true);
    expect(m.calls.some((c) => c.includes('WRONG ANSWERS GET COUNTERED'))).toBe(true);
    sim.update(DT, input);
    const m2 = mockCtx();
    sim.render(m2.ctx);
    expect(m2.calls.some((c) => c.startsWith('fillText(QUIZ DUEL,'))).toBe(false);
    expect(m.nan).toEqual([]);
  });

  it('renders every phase without NaN', () => {
    const env = stubEnv({ difficulty: 'hard' });
    const sim = new QuizSim(env, pool(QUESTIONS), 3);
    const m = mockCtx();
    let frame = 0;
    // every 6th frame (10 fps) still hits every phase; full 60 fps is slow with the mock context
    const draw = () => {
      if (frame++ % 6 === 0) sim.render(m.ctx);
    };
    for (let i = 0; i < 40 && sim.snap.phase !== 'over'; i++) {
      sim.answer(0, sim.snap.q?.answer ?? 0);
      run(sim, 2, draw);
      sim.next();
      run(sim, 6, draw);
    }
    sim.render(m.ctx);
    expect(sim.snap.phase).toBe('over');
    expect(m.nan).toEqual([]);
    expect(env.ended).toHaveLength(1);
  }, 20_000);
});

describe('quiz CPU', () => {
  it('accuracy and speed both rise with difficulty', () => {
    const acc: number[] = [];
    const speed: number[] = [];
    for (const d of DIFFS) {
      const rand = rng(42);
      let right = 0;
      let t = 0;
      const N = 4000;
      for (let i = 0; i < N; i++) {
        const r = cpuAnswer(d, i % 4, 4, rand);
        if (r.choice === i % 4) right++;
        t += r.delay;
        expect(r.choice).toBeGreaterThanOrEqual(0);
        expect(r.choice).toBeLessThan(4);
        expect(r.delay).toBeGreaterThanOrEqual(QUIZ_AI[d].min);
        expect(r.delay).toBeLessThan(QUESTION_TIME);
      }
      expect(Math.abs(right / N - QUIZ_AI[d].accuracy)).toBeLessThan(0.04);
      acc.push(right / N);
      speed.push(t / N);
    }
    expect(acc[0]).toBeLessThan(acc[1] ?? 0);
    expect(acc[1]).toBeLessThan(acc[2] ?? 0);
    expect(speed[0]).toBeGreaterThan(speed[1] ?? 0);
    expect(speed[1]).toBeGreaterThan(speed[2] ?? 0);
  });

  it('once P1 has locked in, the CPU answers within about a second', () => {
    expect(cpuLockAt(9, null)).toBe(9);
    expect(cpuLockAt(9, 2)).toBe(2 + CPU_HURRY);
    expect(cpuLockAt(2.5, 2)).toBe(2.5);
    for (let seed = 1; seed <= 20; seed++) {
      const env = stubEnv({ difficulty: 'easy' }); // slowest CPU: 6–12 s
      const sim = new QuizSim(env, pool(QUESTIONS), seed);
      run(sim, 0.5);
      sim.answer(0, 0);
      let waited = 0;
      while (sim.snap.phase === 'ask') {
        sim.update(DT, input);
        waited += DT;
      }
      expect(waited).toBeLessThanOrEqual(CPU_HURRY + 0.05);
      // hurrying keeps the CPU's planned think time, so it never gains speed damage from it
      expect(sim.snap.answers[1]?.time ?? 0).toBeGreaterThanOrEqual(QUIZ_AI.easy.min);
    }
  });

  it('a rushed CPU keeps its planned time and slips more often', () => {
    const rand = rng(11);
    const plan = { choice: 2, delay: 9 };
    let right = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const l = cpuLock(plan, 1, 2, 4, rand);
      expect(l.hurried).toBe(true);
      expect(l.time).toBe(9);
      if (l.choice === 2) right++;
    }
    expect(Math.abs(right / N - (1 - HURRY_SLIP))).toBeLessThan(0.03);
    // not rushed: the plan stands
    expect(cpuLock(plan, null, 2, 4, rand)).toEqual({ choice: 2, time: 9, hurried: false });
    expect(cpuLock(plan, 8.5, 2, 4, rand)).toEqual({ choice: 2, time: 9, hurried: false });
    // a hurried CPU's speed damage comes from its own planned delay, not from P1's speed
    expect(quizDamage(9)).toBeLessThan(quizDamage(2));
  });

  it('an idle player (never answers) loses to the easy CPU — timeouts earn no counter-hits', () => {
    let cpuWins = 0;
    const N = 12;
    for (let seed = 1; seed <= N; seed++) {
      const env = stubEnv({ difficulty: 'easy' });
      const sim = new QuizSim(env, pool(QUESTIONS), seed);
      for (let k = 0; k < 60 * 400 && sim.snap.phase !== 'over'; k++) sim.update(DT, input);
      expect(sim.snap.phase).toBe('over');
      expect(sim.snap.stats[0].dealt).toBe(0);
      expect(env.ended[0]?.winner).not.toBe('p1');
      if (env.ended[0]?.winner === 'p2') cpuWins++;
    }
    expect(cpuWins).toBeGreaterThanOrEqual(N - 1);
  }, 20_000);

  it('a full CPU match plays through to a result decided by HP', () => {
    const env = stubEnv({ difficulty: 'normal' });
    const sim = new QuizSim(env, pool(QUESTIONS), 7);
    for (let i = 0; i < 60 && sim.snap.phase !== 'over'; i++) {
      run(sim, 4);
      sim.answer(0, (sim.snap.q?.answer ?? 0) + (i % 3 === 0 ? 1 : 0)); // some wrong
      run(sim, 8); // auto-advance kicks in after the read time
    }
    expect(env.ended).toHaveLength(1);
    const r = env.ended[0];
    expect(r?.score).toEqual(sim.snap.hp);
    expect(r?.winner).toBe(quizWinner(sim.snap.hp));
  });
});

describe('quiz sampling', () => {
  it('different Starts get different question sets, and replays prefer unasked ones', () => {
    const p = pool();
    const recent = new Set<string>();
    const sets: string[][] = [];
    for (let s = 0; s < 3; s++) {
      const qs = sampleQuestions(p, QUESTIONS, rng(100 + s), recent);
      expect(qs).toHaveLength(QUESTIONS);
      expect(new Set(qs.map((q) => q.q)).size).toBe(QUESTIONS);
      for (const q of qs) recent.add(q.q);
      sets.push(qs.map((q) => q.q));
    }
    // 30 questions, 10 per Start: three Starts cover the pool with no repeats
    expect(new Set(sets.flat()).size).toBe(POOL_SIZE);
    // even without the recent list, two seeds give different sets / orders
    const a = sampleQuestions(p, QUESTIONS, rng(1)).map((q) => q.q);
    const b = sampleQuestions(p, QUESTIONS, rng(2)).map((q) => q.q);
    expect(a).not.toEqual(b);
  });

  it('prefers one question per character', () => {
    const qs = sampleQuestions(pool(), QUESTIONS, rng(9));
    expect(new Set(qs.map((q) => q.name)).size).toBe(QUESTIONS);
  });

  it('long answers step the font down instead of breaking mid-word', () => {
    expect(answerFit('Kakarot')).toBe('');
    expect(answerFit('Naseeruddin Shah')).toBe('text-sm');
    expect(answerFit('Samuthirakani')).toBe('text-xs');
    expect(answerFit('Insurance money from the Jupiter Circus')).toBe('text-xs');
    expect(answerFit('Self-Embodiment of Perfection')).toBe('text-xs');
  });

  it('shuffling options keeps the right answer right', () => {
    const rand = rng(5);
    let moved = 0;
    for (const q of pool()) {
      const s = shuffleOptions(q, rand);
      expect(s.options[s.answer]).toBe(q.options[q.answer]);
      expect([...s.options].sort()).toEqual([...q.options].sort());
      if (s.answer !== q.answer) moved++;
    }
    expect(moved).toBeGreaterThan(10);
  });
});
