/** biome-ignore-all lint/style/noNonNullAssertion: tests index values the code under test guarantees. */
import { describe, expect, it } from 'vitest';
import { nameSkeleton } from '~/.server/auth';
import { type Sql, sqliteSql } from '~/.server/db';
import { openSqlite } from '~/.server/db.node';
import {
  allTimeBoard,
  countStart,
  dailyBoard,
  dailySeed,
  HOLD_TOP1,
  issueToken,
  istDay,
  markEnd,
  markTick,
  needsReview,
  ownerTag,
  postRun,
  rankedToday,
  readToken,
  rejectPlayer,
  reviewQueue,
  ruleRun,
  startedToday,
  trustCap,
} from '~/.server/freefall';
import { rng } from '~/game/engine/math';
import { type Ctl, FreefallCore, IDLE, LANES, MAX_STEPS } from '~/game/freefall/core';
import { LEVELS, type Level, makeQuestion } from '~/game/freefall/maths';
import { decodeCtl, encodeCtl, PAUSE, Recorder, replay } from '~/game/freefall/replay';

/** A scripted player: aims for the right lane with probability `acc`, sidesteps rubble if `dodge`. */
function play(seed: number, level: Level, acc: number, dodge = true, qseed = seed) {
  const core = new FreefallCore(seed, level, qseed);
  const rec = new Recorder();
  const r = rng(seed * 7 + 3);
  let gid = -1;
  let aim = 0;
  while (!core.over && core.step < MAX_STEPS) {
    const g = core.gate;
    if (g && g.id !== gid) {
      gid = g.id;
      aim = r() < acc ? g.q.correct : (g.q.correct + 1 + Math.floor(r() * 2)) % 3;
    }
    let target: number = LANES[aim] as number;
    if (dodge && g && g.y - core.depth > 120) {
      for (const d of core.debris) {
        const dy = d.y - core.depth;
        if (!d.hit && dy > 0 && dy < 150 && Math.abs(d.x - core.x) < d.w / 2 + 40)
          target =
            d.x > core.x ? Math.max(25, d.x - d.w / 2 - 50) : Math.min(515, d.x + d.w / 2 + 50);
      }
    }
    const c: Ctl = { ...IDLE, target: Math.round(target), dive: r() < 0.002 };
    rec.record(core.step, c);
    core.update(c);
  }
  return { core, log: rec.log };
}

describe('freefall maths', () => {
  it('every question has its answer exactly once among three distinct whole-number options', () => {
    for (const level of LEVELS) {
      const r = rng(11);
      for (let i = 0; i < 4000; i++) {
        const q = makeQuestion(r, level, Math.floor(i / 400));
        expect(new Set(q.options).size).toBe(3);
        expect(q.options[q.correct]).toBe(q.answer);
        expect(q.options.filter((o) => o === q.answer)).toHaveLength(1);
        for (const o of q.options) expect(Number.isInteger(o)).toBe(true);
        if (level !== 'hard') for (const o of q.options) expect(o).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('answers are actually right (spot-check by evaluating the text)', () => {
    const r = rng(5);
    for (const level of LEVELS)
      for (let i = 0; i < 1500; i++) {
        const q = makeQuestion(r, level, 4);
        const t = q.text;
        const rules: [RegExp, (n: number[]) => number][] = [
          [/^(-?\d+) \+ (\d+) × (\d+)$/, ([a, b, c]) => a! + b! * c!],
          [/^(\d+) \+ (\d+)$/, ([a, b]) => a! + b!],
          [/^(-?\d+) − (\d+)$/, ([a, b]) => a! - b!],
          [/^(\d+) × (\d+)$/, ([a, b]) => a! * b!],
          [/^(\d+) ÷ (\d+)$/, ([a, b]) => a! / b!],
          [/^\? \+ (\d+) = (\d+)$/, ([a, b]) => b! - a!],
          [/^½ of (\d+)$/, ([a]) => a! / 2],
          [/^(\d+)²$/, ([a]) => a! * a!],
          [/^√(\d+)$/, ([a]) => Math.sqrt(a!)],
          [/^(\d+)% of (\d+)$/, ([a, b]) => (a! * b!) / 100],
        ];
        let v: number | null = null;
        for (const [re, f] of rules) {
          const m = t.match(re);
          if (m) {
            v = f(m.slice(1).map(Number));
            break;
          }
        }
        expect(v, t).toBe(q.answer);
      }
  });

  it('the answer is the smallest, middle or largest option equally often', () => {
    for (const level of LEVELS) {
      const r = rng(21);
      const rank = [0, 0, 0];
      const N = 6000;
      for (let i = 0; i < N; i++) {
        const q = makeQuestion(r, level, i % 7);
        rank[[...q.options].sort((a, b) => a - b).indexOf(q.answer)]! += 1;
      }
      for (const k of rank) expect(k / N).toBeGreaterThan(0.28);
      for (const k of rank) expect(k / N).toBeLessThan(0.39);
    }
  });

  it('no rule on the gaps between options beats a guess', () => {
    for (const level of LEVELS) {
      const r = rng(31);
      const N = 12000;
      let outer = 0;
      const buckets = new Map<string, number[]>();
      for (let i = 0; i < N; i++) {
        const q = makeQuestion(r, level, i % 7);
        const [x, y, z] = [...q.options].sort((u, v) => u - v) as [number, number, number];
        const g1 = y - x;
        const g2 = z - y;
        // "Take the outer one of the two closest."
        if ((g1 < g2 ? x : z) === q.answer) outer++;
        // A learned rule on the gap pattern (ratio + whether the tight gap is a ±1/±2 slip).
        const key = `${Math.round(Math.log2(g1 / g2) * 2)}|${Math.min(g1, g2) <= 2}`;
        const slot = [x, y, z].indexOf(q.answer);
        const b = buckets.get(key) ?? [0, 0, 0];
        b[slot] = (b[slot] ?? 0) + 1;
        buckets.set(key, b);
      }
      let best = 0;
      for (const b of buckets.values()) best += Math.max(...b);
      expect(outer / N).toBeLessThan(0.4);
      expect(best / N).toBeLessThan(0.42);
    }
  });

  it('no option is impossible for its sum (below an addend, above a dividend, …)', () => {
    for (const level of LEVELS) {
      const r = rng(77);
      for (let i = 0; i < 8000; i++) {
        const q = makeQuestion(r, level, i % 7);
        const n = (q.text.match(/\d+/g) ?? []).map(Number);
        const t = q.text;
        for (const o of q.options) {
          if (/^\d+ \+ \d+$/.test(t)) expect(o, t).toBeGreaterThan(Math.max(n[0]!, n[1]!));
          if (/^\d+ × \d+$/.test(t)) expect(o, t).toBeGreaterThan(Math.max(n[0]!, n[1]!));
          if (/^\d+ − \d+$/.test(t) && q.answer >= 0) expect(o, t).toBeLessThan(n[0]!);
          if (/^\d+ − \d+$/.test(t) && q.answer < 0) expect(o, t).toBeLessThan(0);
          // The dividend (28 ÷ 4) or the whole (½ of 94) bounds the answer.
          if (/^\d+ ÷ \d+$/.test(t) || /^½ of/.test(t)) expect(o, t).toBeLessThan(n[0]!);
          if (/% of/.test(t)) expect(o, t).toBeLessThan(n[1]!);
          if (/^\d+ × \d+$/.test(t) && q.answer % 10 === 0) expect(o % 10, t).toBe(0);
          if (q.answer >= 10) expect(o, t).toBeGreaterThanOrEqual(0.4 * q.answer);
          if (/^\d+ \+ \d+ × \d+$/.test(t))
            expect(o, t).toBeGreaterThan(Math.max(n[0]!, n[1]! * n[2]!));
          if (/^\d+ − \d+$/.test(t) && q.answer < 0) expect(o, t).toBeGreaterThan(-n[1]!);
          if (q.answer >= 0) expect(o, t).toBeGreaterThan(0);
        }
      }
    }
  });

  it('from 30 up on Class 5–6 and 7+, the ones digit alone rarely picks the answer', () => {
    for (const level of ['normal', 'hard'] as const) {
      const r = rng(13);
      let big = 0;
      let alone = 0;
      for (let i = 0; i < 12000; i++) {
        const q = makeQuestion(r, level, i % 7);
        // Squares and sums whose range leaves no room for tens traps are D15's accepted cases.
        if (Math.abs(q.answer) < 30 || q.text.includes('²')) continue;
        big++;
        const d = (x: number) => Math.abs(x) % 10;
        if (q.options.filter((o) => d(o) === d(q.answer)).length === 1) alone++;
      }
      // The rest are D15's accepted cases: order-of-operations and negative sums whose own range
      // (8 + 9 × 3 can't be under 28) leaves no room for traps a ten out.
      expect(alone / big).toBeLessThan(0.33);
    }
  });

  it('traps stay tempting: no option absurdly far from the answer', () => {
    const r = rng(9);
    for (const level of LEVELS)
      for (let i = 0; i < 2000; i++) {
        const q = makeQuestion(r, level, i % 5);
        const near = Math.max(20, Math.floor(Math.abs(q.answer) * 0.6));
        // (Squares offer neighbouring squares, which grow apart: that's the point of them.)
        // (Tens-family options on Class 5–6 and 7+ may sit 30 out: 10 + 20 is the narrowest.)
        const tens = level !== 'easy' ? 30 : 0;
        if (!q.text.includes('²'))
          for (const o of q.options)
            if (o !== -q.answer)
              expect(Math.abs(o - q.answer)).toBeLessThanOrEqual(Math.max(near, tens));
      }
  });
});

describe('freefall core', () => {
  it('is deterministic: same seed + inputs → identical run', () => {
    const a = play(42, 'normal', 0.85);
    const b = play(42, 'normal', 0.85);
    expect(a.core.summary()).toEqual(b.core.summary());
    expect(a.log).toEqual(b.log);
  });

  it('different seeds give different towers', () => {
    const a = new FreefallCore(1, 'normal');
    const b = new FreefallCore(2, 'normal');
    expect(a.gate?.q.text === b.gate?.q.text && a.gate?.y === b.gate?.y).toBe(false);
  });

  it('flying through the right opening scores and builds a streak; wrong costs a heart', () => {
    const core = new FreefallCore(7, 'easy');
    const g = core.gate!;
    while (core.gate === g) core.update({ ...IDLE, target: LANES[g.q.correct] as number });
    expect(g.state).toBe('ok');
    expect(core.correct).toBe(1);
    expect(core.streak).toBe(1);
    const h = core.hearts;
    const g2 = core.gate!;
    const wrong = (g2.q.correct + 1) % 3;
    while (core.gate === g2) core.update({ ...IDLE, target: LANES[wrong] as number });
    expect(g2.state).toBe('wrong');
    expect(core.hearts).toBe(h - 1);
    expect(core.misses.at(-1)).toEqual({
      text: g2.q.text,
      answer: g2.q.answer,
      picked: g2.q.options[wrong],
    });
  });

  it('the run remembers what ended it', () => {
    const core = new FreefallCore(3, 'normal');
    while (!core.over) {
      const g = core.gate;
      core.update({ ...IDLE, target: g ? (LANES[(g.q.correct + 1) % 3] as number) : 270 });
    }
    expect(core.summary().cause).toMatch(/wrong|rubble/);
    expect(core.summary().hits).toBe(core.hits);
  });

  it('the wall between openings counts as a miss', () => {
    const core = new FreefallCore(8, 'normal');
    const g = core.gate!;
    while (core.gate === g) core.update({ ...IDLE, target: 180 });
    expect(g.state).toBe('wall');
  });

  it('every run ends, and the difficulty ladder holds (good > sloppy > guessing)', () => {
    for (const level of LEVELS) {
      const avg = (acc: number) => {
        let s = 0;
        for (let i = 0; i < 8; i++) s += play(500 + i, level, acc).core.score;
        return s / 8;
      };
      const good = avg(0.95);
      const sloppy = avg(0.7);
      const guess = avg(1 / 3);
      expect(good).toBeGreaterThan(sloppy);
      expect(sloppy).toBeGreaterThan(guess * 1.5);
    }
  });

  it('a guesser goes down fast; a good player lasts minutes', () => {
    let guess = 0;
    let good = 0;
    for (let i = 0; i < 8; i++) {
      guess += play(900 + i, 'normal', 1 / 3, false).core.step;
      good += play(900 + i, 'normal', 0.95).core.step;
    }
    expect(guess / 8 / 60).toBeLessThan(40);
    expect(good / 8 / 60).toBeGreaterThan(60);
  });
});

describe('freefall replay', () => {
  it('controls round-trip through the log encoding', () => {
    for (const c of [
      IDLE,
      { steer: -1, target: -1, dive: true, brake: false },
      { steer: 1, target: 540, dive: false, brake: true },
      { steer: 0, target: 0, dive: true, brake: true },
    ] as Ctl[])
      expect(decodeCtl(encodeCtl(c))).toEqual(c);
  });

  it('replaying the log reproduces the score exactly', () => {
    for (const level of LEVELS) {
      const { core, log } = play(77, level, 0.8);
      const r = replay(77, level, log);
      expect(r.ok && r.summary).toEqual(core.summary());
    }
  });

  it('the same log on another seed or level does not reproduce the score', () => {
    const { core, log } = play(31, 'normal', 0.9);
    const other = replay(32, 'normal', log);
    expect(other.ok && other.summary.score === core.summary().score).toBe(false);
  });

  it('rejects malformed and forged logs', () => {
    const { log } = play(12, 'easy', 0.8);
    expect(replay(12, 'easy', [...log, 5]).ok).toBe(false); // odd length
    expect(replay(12, 'easy', [...log, 99_999, encodeCtl(IDLE)]).ok).toBe(false); // after the end
    expect(replay(12, 'easy', [0, 9_999_999]).ok).toBe(false); // bad code
    expect(replay(12, 'easy', [0, encodeCtl(IDLE), 0, encodeCtl(IDLE)]).ok).toBe(false); // Δ 0
    expect(replay(12, 'easy', [-1, 0]).ok).toBe(false);
  });
});

/** Post as the client does: the end ping at game over (game time after the token), then the run. */
async function post(
  sql: Sql,
  userId: number,
  token: string,
  log: readonly number[],
  at: number,
  guest: string | null = null,
  ping = true,
) {
  const t = await readToken(token, at);
  if (ping && t) {
    const r = replay(t.seed, t.level, log, t.qseed);
    if (r.ok) {
      // A progress ping every 10 s of play, then the end ping, all on real time.
      const ms = (step: number) => t.issuedAt + (step * 1000) / 60 + 200;
      for (let k = 600; k < r.summary.steps; k += 600) await markTick(sql, token, k, ms(k));
      await markEnd(sql, token, r.summary.steps, ms(r.summary.steps) + 300);
    }
  }
  return postRun(sql, userId, token, log, at, guest);
}

async function db() {
  const sql = sqliteSql(openSqlite(':memory:'));
  const mk = async (name: string) =>
    (
      await sql.run(
        "INSERT INTO users (name, skeleton, password_hash, created_at) VALUES (?, ?, 'x', ?)",
        [name, nameSkeleton(name), new Date().toISOString()],
      )
    ).lastId;
  return { sql, a: await mk('diver_a'), b: await mk('diver_b') };
}

/** A real run for the token's seed, played to the end. */
function runForSync(seed: number, qseed: number) {
  return play(seed, 'normal', 0.75, false, qseed);
}

async function runFor(token: string) {
  const t = (await readToken(token))!;
  // 75% right: a normal player (a 30-streak, which holds a run for review, is vanishingly rare).
  // No rubble dodging: a normal player takes knocks (a long hitless run is held for review).
  return play(t.seed, t.level, 0.75, false, t.qseed);
}

describe('freefall server', () => {
  it('the daily seed is shared by everyone and changes by day and level', async () => {
    const day = istDay();
    expect(await dailySeed(day, 'normal')).toBe(await dailySeed(day, 'normal'));
    expect(await dailySeed(day, 'normal')).not.toBe(await dailySeed(day, 'easy'));
    expect(await dailySeed('2026-01-01', 'normal')).not.toBe(
      await dailySeed('2026-01-02', 'normal'),
    );
    const t1 = await issueToken('daily', 'hard');
    const t2 = await issueToken('daily', 'hard');
    expect(t1.seed).toBe(t2.seed);
  });

  it('tokens verify, and tampering or expiry breaks them', async () => {
    const { token } = await issueToken('practice', 'easy');
    expect(await readToken(token)).not.toBeNull();
    expect(await readToken(token.replace(/^practice\./, 'daily.'))).toBeNull();
    expect(await readToken(token.replace(/\.(\d+)\.(\d{13})\.(\d+)\./, '.1.$2.$3.'))).toBeNull();
    expect(await readToken(token.replace(/\.(\d{13})\.(\d+)\./, '.$1.9.'))).toBeNull();
    expect(await readToken(token, Date.now() + 4 * 3600_000)).toBeNull();
  });

  it('posts a verified run with the server-computed score and ranks it', async () => {
    const { sql, a } = await db();
    const start = Date.now();
    const { token } = await issueToken('daily', 'normal', start, 1, `u${a}`);
    const { core, log } = await runFor(token);
    const at = start + core.step * 17 + 1000;
    const r = await post(sql, a, token, log, at);
    expect(r).toMatchObject({ ok: true, stored: true, score: core.score, rank: 1, of: 1 });
    // Posting the same daily run again doesn't add a row.
    expect(await post(sql, a, token, log, at)).toMatchObject({ stored: false });
    for (const q of (await reviewQueue(sql)).rows) await ruleRun(sql, q.id, true);
    expect((await dailyBoard(sql, 'normal', istDay(start))).total).toBe(1);
  });

  it('a practice token posts once', async () => {
    const { sql, a } = await db();
    const start = Date.now();
    const { token } = await issueToken('practice', 'normal', start, 0, `u${a}`);
    const { core, log } = await runFor(token);
    const at = start + core.step * 17 + 1000;
    expect((await post(sql, a, token, log, at)).ok).toBe(true);
    expect((await post(sql, a, token, log, at)).ok).toBe(false);
  });

  it('refuses a run that claims more game time than has passed', async () => {
    const { sql, a } = await db();
    const start = Date.now();
    const { token } = await issueToken('practice', 'easy', start, 0, `u${a}`);
    const { log } = await runFor(token);
    expect(await post(sql, a, token, log, start + 2000)).toMatchObject({ ok: false });
  });

  it('only the first daily run per level counts; practice goes to the all-time board', async () => {
    const { sql, a, b } = await db();
    const t0 = Date.now();
    const later = t0 + 3600_000;
    const d1 = await issueToken('daily', 'easy', t0, 1, `u${a}`);
    const d2 = await issueToken('daily', 'easy', t0 + 1, 1, `u${a}`);
    const r1 = await runFor(d1.token);
    await post(sql, a, d1.token, r1.log, later);
    const again = await post(sql, a, d2.token, (await runFor(d2.token)).log, later);
    expect(again).toMatchObject({ ok: true, stored: false, reason: 'ranked-already' });

    const p = await issueToken('practice', 'easy', t0, 0, `u${b}`);
    const pr = await runFor(p.token);
    await post(sql, b, p.token, pr.log, later);

    // Podium runs on an empty board are held for a mod first; approve them as a mod would.
    for (const r of (await reviewQueue(sql)).rows) await ruleRun(sql, r.id, true);
    const today = await dailyBoard(sql, 'easy', d1.day);
    expect(today.total).toBe(1);
    expect(today.rows[0]?.name).toBe('diver_a');
    const ever = await allTimeBoard(sql, 'easy');
    expect(ever.map((x) => x.name).sort()).toEqual(['diver_a', 'diver_b']);
    expect(ever[0]!.score).toBeGreaterThanOrEqual(ever[1]!.score);
    expect(await rankedToday(sql, a, d1.day)).toEqual({ easy: r1.core.score });
    expect(await rankedToday(sql, b, d1.day)).toEqual({});
  });

  it('a forged log for a real token is rejected', async () => {
    const { sql, a } = await db();
    const t0 = Date.now();
    const { token } = await issueToken('practice', 'hard', t0, 0, `u${a}`);
    const r = await post(sql, a, token, [0, encodeCtl(IDLE), 50, 99_999_999], t0 + 600_000);
    expect(r.ok).toBe(false);
    const none = await (sql as Sql).get<{ n: number }>('SELECT COUNT(*) AS n FROM freefall_runs');
    expect(none?.n).toBe(0);
  });

  it("only the first start of today's tower can rank", async () => {
    const { sql, a } = await db();
    const t0 = Date.now();
    const day = istDay(t0);
    const who = ['g:device-1'];
    expect(await countStart(sql, who, 'normal', day)).toBe(1);
    expect(await countStart(sql, [...who, `u:${a}`], 'normal', day)).toBe(2);
    expect(await countStart(sql, [`u:${a}`], 'normal', day)).toBe(2);
    expect(await startedToday(sql, who, day)).toEqual({ normal: 2 });
    const second = await issueToken('daily', 'normal', t0, 2, `u${a}`);
    const r = await runFor(second.token);
    expect(await post(sql, a, second.token, r.log, t0 + 3600_000)).toMatchObject({
      ok: true,
      stored: false,
      reason: 'not-first',
    });
  });

  it('a superhuman run is held for review, off the boards, until a mod approves it', async () => {
    const base = {
      score: 5000,
      asked: 30,
      correct: 27,
      hits: 2,
      saved: 3,
      people: 10,
      pauses: 0,
      cause: 'wrong',
      level: 'normal',
    } as const;
    expect(needsReview(base)).toBe(false);
    expect(needsReview({ ...base, score: 22_725 })).toBe(true); // past what people reach
    expect(needsReview({ ...base, asked: 84, correct: 81 })).toBe(true); // 96% over 84 sums
    expect(needsReview({ ...base, asked: 30, correct: 30 })).toBe(false); // too short to judge
    expect(needsReview({ ...base, cause: 'ground' })).toBe(true);
    expect(needsReview({ ...base, hits: 0 })).toBe(false); // 30 clean sums happen to strong players
    expect(needsReview({ ...base, hits: 0, asked: 40, correct: 36 })).toBe(true); // 40, not one knock
    expect(needsReview({ ...base, hits: 0, asked: 12, correct: 10 })).toBe(false);
    expect(needsReview({ ...base, level: 'hard', score: 9645 })).toBe(true); // round-3 forgery
    expect(needsReview({ ...base, saved: 48, people: 50 })).toBe(true); // round-4 forgery swept everyone
    expect(needsReview({ ...base, saved: 12, people: 20 })).toBe(false); // an honest chaser
    expect(needsReview({ ...base, pauses: 7 })).toBe(true);
    expect(needsReview({ ...base, pauses: 6 })).toBe(false);
    const { sql, a } = await db();
    const t0 = Date.now();
    // A perfect, rubble-dodging script (braking when rubble is close); a few towers until one is clean.
    const script = (seed: number) => {
      const core = new FreefallCore(seed, 'easy');
      const rec = new Recorder();
      // Long enough that four closing crashes still leave it ≥ 95% right.
      while (!core.over && core.asked < 90) {
        const g = core.gate!;
        const want = LANES[g.q.correct] as number;
        // Look-ahead: the x nearest the right lane that no drifting rubble will cover soon.
        const unsafe = (x: number) =>
          core.debris.some((d) => {
            const dy = d.y - core.depth;
            if (d.hit || dy < -30 || dy > 260) return false;
            const at = d.x + (d.vx * Math.max(0, dy)) / core.vy;
            return Math.abs(at - x) < d.w / 2 + 34;
          });
        let target = want;
        if (g.y - core.depth > 70 && unsafe(want)) {
          let best = Number.POSITIVE_INFINITY;
          for (let x = 24; x <= 516; x += 12)
            if (!unsafe(x) && Math.abs(x - want) < Math.abs(best - want)) best = x;
          if (Number.isFinite(best)) target = best;
        }
        const c = { ...IDLE, target: Math.round(target), brake: unsafe(core.x) };
        rec.record(core.step, c);
        core.update(c);
      }
      // Then crash into walls to end the run.
      while (!core.over) {
        const c = { ...IDLE, target: 180 };
        rec.record(core.step, c);
        core.update(c);
      }
      return { s: core.summary(), log: rec.log };
    };
    let token = '';
    let run = script(1);
    for (let i = 0; i < 40; i++) {
      const t = await issueToken('practice', 'easy', t0, 0, `u${a}`);
      token = t.token;
      run = script(t.seed);
      if (needsReview({ ...run.s, level: 'easy' })) break;
    }
    const s = run.s;
    const rec = { log: run.log };
    expect(needsReview({ ...s, level: 'easy' })).toBe(true);
    const posted = await post(sql, a, token, rec.log, t0 + 3600_000);
    expect(posted).toMatchObject({ ok: true, stored: true, review: true });
    // On the board in its place, but without a name until a mod has looked.
    expect(await allTimeBoard(sql, 'easy')).toMatchObject([{ name: null, pending: true }]);
    const q = (await reviewQueue(sql)).rows;
    expect(q).toHaveLength(1);
    await ruleRun(sql, q[0]!.id, true);
    expect(await allTimeBoard(sql, 'easy')).toHaveLength(1);
  });

  it('a run posts only for whoever started it; a guest run follows the guest into their account', async () => {
    const { sql, a, b } = await db();
    const t0 = Date.now();
    const asGuest = await issueToken('practice', 'normal', t0, 0, await ownerTag(null, 'cookie-1'));
    const run = await runFor(asGuest.token);
    const at = t0 + 3600_000;
    // Someone else (other account, no matching cookie) can't post it.
    expect(await post(sql, b, asGuest.token, run.log, at, 'cookie-2')).toMatchObject({
      ok: false,
    });
    // The same browser, now signed in, can.
    expect(await post(sql, a, asGuest.token, run.log, at, 'cookie-1')).toMatchObject({
      ok: true,
      stored: true,
    });
    // A fan's token can't be posted by another fan.
    const mine = await issueToken('practice', 'normal', t0, 0, `u${a}`);
    const r2 = await runFor(mine.token);
    expect(await post(sql, b, mine.token, r2.log, at)).toMatchObject({ ok: false });
  });

  it("a guest's look at today's tower never ranks", async () => {
    const { sql, a } = await db();
    const t0 = Date.now();
    const g = await issueToken('daily', 'easy', t0, 0, await ownerTag(null, 'cookie-9'));
    const run = await runFor(g.token);
    expect(await post(sql, a, g.token, run.log, t0 + 3600_000, 'cookie-9')).toMatchObject({
      ok: true,
      stored: false,
      reason: 'not-first',
    });
  });

  it("today's tower is shared, its sums are not (no learning it off by heart)", async () => {
    const t0 = Date.now();
    const a1 = await issueToken('daily', 'normal', t0, 1, 'u1');
    const a2 = await issueToken('daily', 'normal', t0, 1, 'u2');
    expect(a1.seed).toBe(a2.seed);
    expect(a1.qseed).not.toBe(a2.qseed);
    const c1 = new FreefallCore(a1.seed, 'normal', a1.qseed);
    const c2 = new FreefallCore(a2.seed, 'normal', a2.qseed);
    expect(c1.gate?.y).toBe(c2.gate?.y);
    expect(c1.debris.map((d) => d.x)).toEqual(c2.debris.map((d) => d.x));
    expect(c1.gate?.q.text === c2.gate?.q.text && c1.gate?.q.correct === c2.gate?.q.correct).toBe(
      false,
    );
    // The replay needs the run's own sum seed.
    const run = play(a1.seed, 'normal', 0.8, true, a1.qseed);
    const ok = replay(a1.seed, 'normal', run.log, a1.qseed);
    expect(ok.ok && ok.summary.score).toBe(run.core.score);
  });

  it("a big run from an unchecked player shows without a name until a mod looks; then they're trusted", async () => {
    const { sql, a, b } = await db();
    const t0 = Date.now();
    const at = t0 + 3600_000;
    // A modest run (under the bar) and a big one (over it), neither suspicious.
    let low: { token: string; log: number[]; score: number } | null = null;
    let high: { token: string; log: number[]; score: number } | null = null;
    for (let i = 0; i < 160 && !(low && high); i++) {
      const t = await issueToken('practice', 'normal', t0, 0, `u${i % 2 ? a : b}`);
      const run = play(t.seed, 'normal', i % 2 ? 0.92 : 0.5, i % 2 === 1, t.qseed);
      const s = run.core.summary();
      if (needsReview({ ...s, level: 'normal' })) continue;
      const entry = { token: t.token, log: run.log, score: s.score };
      if (i % 2 && s.score > HOLD_TOP1.normal && !high) high = entry;
      if (!(i % 2) && s.score <= HOLD_TOP1.normal && !low) low = entry;
    }
    expect(low && high).toBeTruthy();
    expect(await post(sql, b, low!.token, low!.log, at)).toMatchObject({
      review: false,
      pending: false,
    });
    expect(await post(sql, a, high!.token, high!.log, at)).toMatchObject({
      review: false,
      pending: true,
      rank: 1,
    });
    // Strangers see the place without the name; its owner sees their own row.
    let board = await allTimeBoard(sql, 'normal', 10, 'diver_b');
    expect(board[0]).toMatchObject({ name: null, pending: true, score: high!.score });
    expect(board[1]).toMatchObject({ name: 'diver_b', mine: true, pending: false });
    expect((await allTimeBoard(sql, 'normal', 10, 'diver_a'))[0]).toMatchObject({ mine: true });
    // It's in the mod queue; approving shows the name and makes diver_a trusted.
    const q = (await reviewQueue(sql)).rows;
    const row = q.find((r) => r.score === high!.score);
    expect(row).toBeTruthy();
    await ruleRun(sql, row!.id, true);
    board = await allTimeBoard(sql, 'normal', 10, null);
    expect(board[0]).toMatchObject({ name: 'diver_a', pending: false });
    expect(await trustCap(sql, a, 'normal')).toBeGreaterThan(high!.score);
    // (What trust then covers — and doesn't — is the next test.)
  });

  it('the wall clock catches no end ping, slow motion, made-up pauses and missing pings', async () => {
    const { sql, a } = await db();
    const t0 = Date.now();
    const why = async (
      ticks: (steps: number) => [number, number][],
      end: ((steps: number) => number) | null,
      pauseAt?: { step: number; s: number },
      postAt?: (steps: number) => number,
    ) => {
      const t = await issueToken('practice', 'normal', t0, 0, `u${a}`);
      // A longer run (it dodges), so a 2× slow-down is far past the margins.
      const run = play(t.seed, 'normal', 0.85, true, t.qseed);
      let log = run.log;
      if (pauseAt) {
        // Splice a logged pause into the run's log at a step.
        const out: number[] = [];
        let step = 0;
        let done = false;
        for (let i = 0; i < log.length; i += 2) {
          const next = step + (log[i] as number);
          if (!done && next >= pauseAt.step) {
            out.push(
              pauseAt.step - step,
              PAUSE + pauseAt.s,
              next - pauseAt.step,
              log[i + 1] as number,
            );
            done = true;
          } else out.push(log[i] as number, log[i + 1] as number);
          step = next;
        }
        log = out;
      }
      const steps = run.core.step;
      for (const [k, at] of ticks(steps)) await markTick(sql, t.token, k, at);
      if (end) await markEnd(sql, t.token, steps, end(steps));
      const r = await postRun(sql, a, t.token, log, postAt ? postAt(steps) : t0 + 7200_000);
      if (!(r.ok && r.stored)) return 'not stored';
      const row = await sql.get<{ reasons: string | null }>(
        'SELECT reasons FROM freefall_runs ORDER BY id DESC LIMIT 1',
      );
      // Only the wall clock's reasons (a long dodging run may trip score rules too).
      return (row?.reasons ?? '')
        .split('; ')
        .filter((x) => /clock|end|slower|pause times|pings/.test(x))
        .join('; ');
    };
    const real = (k: number) => t0 + (k * 1000) / 60;
    const every = (steps: number, f: (k: number) => number) => {
      const out: [number, number][] = [];
      for (let k = 600; k < steps; k += 600) out.push([k, f(k)]);
      return out;
    };
    // Honest: real-time ticks and end.
    expect(
      await why(
        (n) => every(n, real),
        (n) => real(n) + 300,
      ),
    ).toBe('');
    // No end ping.
    // A lost end ping with progress pings up to the end, posted promptly: the last ping dates the
    // end — fine.
    expect(
      await why(
        (n) => every(n, real),
        null,
        undefined,
        (n) => real(n) + 20_000,
      ),
    ).toBe('');
    // …but posted long after that estimate, the pings may have run ahead of the play: flagged.
    expect(await why((n) => every(n, real), null)).toMatch(/posted long after/);
    // No end ping, no pings, and a post long after: can't be dated.
    expect(await why(() => [], null)).toMatch(/no end time/);
    // Slow motion at 2× (ticks and end honest about the wall clock, which ran twice as long).
    expect(
      await why(
        (n) => every(n, (k) => t0 + (k * 2000) / 60),
        (n) => t0 + (n * 2000) / 60,
      ),
    ).toMatch(/slower than real time/);
    // An early end ping (sent a second after the start) doesn't excuse anything.
    expect(
      await why(
        (n) => every(n, real),
        () => t0 + 1000,
      ),
    ).toMatch(/ahead of the clock/);
    // No progress pings on a short run: fine (a flaky connection drops pings; the end ping and
    // totals still check it).
    expect(
      await why(
        () => [],
        (n) => real(n) + 300,
      ),
    ).toMatch(/^(|no progress pings)$/);
    // Pinging very often buys no slack: 0.5× slow motion with a ping every 2 s is still caught.
    expect(
      await why(
        (n) => {
          const out: [number, number][] = [];
          for (let k = 120; k < n; k += 120) out.push([k, t0 + (k * 2000) / 60]);
          return out;
        },
        (n) => t0 + (n * 2000) / 60,
      ),
    ).toMatch(/slower than real time/);
    // A claimed 100 s pause that never happened (the clock shows no gap).
    expect(
      await why(
        (n) => every(n, real),
        (n) => real(n) + 300,
        { step: 900, s: 100 },
      ),
    ).toMatch(/pause times/);
  });

  it('pauses are logged, counted by the replay, and a heavily paused run is held', async () => {
    const core = new FreefallCore(5, 'normal');
    const rec = new Recorder();
    while (!core.over) {
      const g = core.gate;
      const c = { ...IDLE, target: g ? (LANES[(g.q.correct + 1) % 3] as number) : 270 };
      if (core.step === 100 || core.step === 200) rec.pause(core.step);
      rec.record(core.step, c);
      core.update(c);
    }
    const r = replay(5, 'normal', rec.log);
    expect(r.ok && r.summary.pauses).toBe(2);
    expect(r.ok && r.summary.score).toBe(core.score);
  });

  it("trust covers runs up to 30% above a player's best checked score — not a sudden record", async () => {
    const { sql, a } = await db();
    const t0 = Date.now();
    const at = t0 + 7200_000;
    // Seed an approved run for diver_a at normal: 8,000.
    await sql.run(
      `INSERT INTO freefall_runs (user_id, mode, level, day, seed, qseed, score, floors, correct, asked,
         saved, people, pauses, best, steps, hits, review, token, created_at)
       VALUES (?, 'practice', 'normal', '2026-01-01', 1, 1, 8000, 1, 1, 1, 0, 0, 0, 1, 1, 1, 3, 'seed-tok', ?)`,
      [a, new Date(t0).toISOString()],
    );
    expect(await trustCap(sql, a, 'normal')).toBeCloseTo(10_400);
    expect(await trustCap(sql, a, 'hard')).toBe(0);
    const rows = async (score: number) => {
      await sql.run(
        `INSERT INTO freefall_runs (user_id, mode, level, day, seed, qseed, score, floors, correct, asked,
           saved, people, pauses, best, steps, hits, review, token, created_at)
         VALUES (?, 'practice', 'normal', '2026-01-01', 1, 1, ?, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, ?, ?)`,
        [a, score, `tok-${score}`, new Date(at).toISOString()],
      );
      return allTimeBoard(sql, 'normal', 10, null);
    };
    // Best-per-player board: within the cap, named.
    expect((await rows(10_000))[0]).toMatchObject({
      name: 'diver_a',
      pending: false,
      score: 10_000,
    });
    // A record far above it: unnamed, back in the queue.
    expect((await rows(20000))[0]).toMatchObject({ name: null, pending: true, score: 20000 });
    expect((await reviewQueue(sql)).rows.map((r) => r.score)).toContain(20000);
  });

  it('a blip of a pause (under 3 s) leaves no trace in the log', () => {
    const rec = new Recorder();
    rec.record(0, { ...IDLE, steer: 1 });
    rec.pause(50);
    rec.resume(); // immediately
    rec.record(80, IDLE);
    expect(rec.log).toEqual([0, encodeCtl({ ...IDLE, steer: 1 }), 80, encodeCtl(IDLE)]);
  });

  it("a rejected run resets that player's trust at that level", async () => {
    const { sql, a } = await db();
    const ins = (score: number, review: number, tok: string) =>
      sql.run(
        `INSERT INTO freefall_runs (user_id, mode, level, day, seed, qseed, score, floors, correct, asked,
           saved, people, pauses, best, steps, hits, review, token, created_at)
         VALUES (?, 'practice', 'hard', '2026-01-01', 1, 1, ?, 1, 1, 1, 0, 0, 0, 1, 1, 1, ?, ?, ?)`,
        [a, score, review, tok, new Date().toISOString()],
      );
    await ins(6000, 3, 'ok-1');
    expect(await trustCap(sql, a, 'hard')).toBeCloseTo(7800);
    await ins(9000, 2, 'bad-1');
    expect(await trustCap(sql, a, 'hard')).toBe(0);
  });

  it("withheld rows don't push a forged run into the named window, and #1 has a lower bar", async () => {
    const sql = sqliteSql(openSqlite(':memory:'));
    const day = istDay();
    const mk = async (name: string) =>
      (
        await sql.run(
          "INSERT INTO users (name, skeleton, password_hash, created_at) VALUES (?, ?, 'x', ?)",
          [name, nameSkeleton(name), new Date().toISOString()],
        )
      ).lastId;
    const run = (uid: number, score: number, review: number) =>
      sql.run(
        `INSERT INTO freefall_runs (user_id, mode, level, day, seed, qseed, score, floors, correct, asked,
           saved, people, pauses, best, steps, hits, review, token, created_at)
         VALUES (?, 'daily', 'hard', ?, 1, 1, ?, 1, 1, 1, 0, 0, 0, 1, 1, 1, ?, ?, ?)`,
        [uid, day, score, review, `t-${uid}-${score}`, new Date().toISOString()],
      );
    // Three sock puppets held for review on top, a forger just under HOLD_TOP1, honest players below.
    for (const [i, sc] of [10_216, 10_103, 9_659].entries()) await run(await mk(`sock${i}`), sc, 1);
    const forger = await mk('forger');
    await run(forger, 4_400, 0);
    await run(await mk('honest_a'), 2_300, 0);
    await run(await mk('honest_b'), 1_900, 0);
    const board = (await dailyBoard(sql, 'hard', day)).rows;
    // The puppets show unnamed; the forger (untrusted, above the #1 bar) is withheld too; the first
    // name on the board is an honest player's.
    // Three unnamed rows are listed (so puppets can't blank a board); the forger's withheld run is
    // folded into a "+1 more" row; the first name shown is an honest player's.
    expect(board.slice(0, 3).map((r) => r.name)).toEqual([null, null, null]);
    expect(board[3]).toMatchObject({ more: 1, rank: 4 }); // the forger, folded and unnamed
    expect(board[4]).toMatchObject({ name: 'honest_a', rank: 5 });
    expect(board.find((r) => r.name === 'forger')).toBeUndefined();
    // Once a mod has approved the forger's 4,400, the name shows.
    await sql.run('UPDATE freefall_runs SET review = 3 WHERE user_id = ?', [forger]);
    expect((await dailyBoard(sql, 'hard', day)).rows[3]).toMatchObject({ name: 'forger' });
  });

  it('one account posting hundreds of runs leaves the all-time board intact', async () => {
    const sql = sqliteSql(openSqlite(':memory:'));
    const mk = async (name: string) =>
      (
        await sql.run(
          "INSERT INTO users (name, skeleton, password_hash, created_at) VALUES (?, ?, 'x', ?)",
          [name, nameSkeleton(name), new Date().toISOString()],
        )
      ).lastId;
    const run = (uid: number, score: number, review: number, tok: string) =>
      sql.run(
        `INSERT INTO freefall_runs (user_id, mode, level, day, seed, qseed, score, floors, correct, asked,
           saved, people, pauses, best, steps, hits, review, token, created_at)
         VALUES (?, 'practice', 'normal', '2026-01-01', 1, 1, ?, 1, 1, 1, 0, 0, 0, 1, 1, 1, ?, ?, ?)`,
        [uid, score, review, tok, new Date().toISOString()],
      );
    const spam = await mk('spammer');
    for (let i = 0; i < 400; i++) await run(spam, 20_000 + i, 0, `spam-${i}`);
    for (let i = 0; i < 12; i++) await run(await mk(`player${i}`), 1000 + i * 100, 0, `p-${i}`);
    const board = await allTimeBoard(sql, 'normal');
    // One unnamed spammer row; every honest player still on the board by name.
    expect(board.filter((r) => r.name === null)).toHaveLength(1);
    expect(board.filter((r) => r.name?.startsWith('player'))).toHaveLength(9);
  });

  it("a forged run between the bars at today's #2 stays unnamed until a mod looks", async () => {
    const sql = sqliteSql(openSqlite(':memory:'));
    const day = istDay();
    const mk = async (name: string) =>
      (
        await sql.run(
          "INSERT INTO users (name, skeleton, password_hash, created_at) VALUES (?, ?, 'x', ?)",
          [name, nameSkeleton(name), new Date().toISOString()],
        )
      ).lastId;
    const run = (uid: number, score: number, review: number) =>
      sql.run(
        `INSERT INTO freefall_runs (user_id, mode, level, day, seed, qseed, score, floors, correct, asked,
           saved, people, pauses, best, steps, hits, review, token, created_at)
         VALUES (?, 'daily', 'normal', ?, 1, 1, ?, 1, 1, 1, 0, 0, 0, 1, 1, 1, ?, ?, ?)`,
        [uid, day, score, review, `t-${uid}`, new Date().toISOString()],
      );
    await run(await mk('champ'), 6000, 3); // a checked #1
    await run(await mk('forger'), 4809, 0); // p75–p90, untrusted
    await run(await mk('kid'), 1500, 0);
    const rows = (await dailyBoard(sql, 'normal', day)).rows;
    expect(rows.map((r) => r.name)).toEqual(['champ', null, 'kid']);
  });

  it('a network drop at game over (no end ping, a retried post) does not hold an honest run', async () => {
    const { sql, a } = await db();
    const t0 = Date.now();
    const t = await issueToken('practice', 'normal', t0, 0, `u${a}`);
    const run = runForSync(t.seed, t.qseed);
    const steps = run.core.step;
    // Pings every 10 s until 20 s before the end, then nothing; the post is retried 60 s later.
    for (let k = 600; k < steps - 1200; k += 600)
      await markTick(sql, t.token, k, t0 + (k * 1000) / 60);
    const r = await postRun(sql, a, t.token, run.log, t0 + (steps * 1000) / 60 + 60_000);
    expect(r).toMatchObject({ ok: true, stored: true, review: false });
  });

  it('the board lists every run in its real place: a "+N more" row, and your own run always', async () => {
    const sql = sqliteSql(openSqlite(':memory:'));
    const day = istDay();
    const mk = async (name: string) =>
      (
        await sql.run(
          "INSERT INTO users (name, skeleton, password_hash, created_at) VALUES (?, ?, 'x', ?)",
          [name, nameSkeleton(name), new Date().toISOString()],
        )
      ).lastId;
    const run = (uid: number, score: number, review: number) =>
      sql.run(
        `INSERT INTO freefall_runs (user_id, mode, level, day, seed, qseed, score, floors, correct, asked,
           saved, people, pauses, best, steps, hits, review, token, created_at)
         VALUES (?, 'daily', 'normal', ?, 1, 1, ?, 1, 1, 1, 0, 0, 0, 1, 1, 1, ?, ?, ?)`,
        [uid, day, score, review, `t-${uid}`, new Date().toISOString()],
      );
    // Six held puppets on top, an honest strong player (unchecked, so withheld), then named players.
    for (let i = 0; i < 6; i++) await run(await mk(`puppet${i}`), 20_000 - i, 1);
    await run(await mk('strong'), 5_182, 0);
    for (let i = 0; i < 8; i++) await run(await mk(`kid${i}`), 2_000 - i * 100, 0);
    const { rows, total } = await dailyBoard(sql, 'normal', day, 10, 'strong');
    expect(total).toBe(15);
    // Three unnamed rows listed, then one "+4 more" row (three puppets + the strong run), at rank 4.
    expect(rows.slice(0, 3).map((r) => r.name)).toEqual([null, null, null]);
    // …but the viewer's own run is never folded away: it shows as "You" at its real rank.
    const mine = rows.find((r) => r.mine);
    expect(mine).toMatchObject({ rank: 7, pending: true, name: 'strong' });
    const more = rows.find((r) => r.more > 0);
    expect(more).toMatchObject({ rank: 4, more: 3 });
    expect(rows.find((r) => r.name === 'kid0')).toMatchObject({ rank: 8 });
  });

  it('reject-all takes a player off the boards, approved runs included', async () => {
    const { sql, a } = await db();
    await sql.run(
      `INSERT INTO freefall_runs (user_id, mode, level, day, seed, qseed, score, floors, correct, asked,
         saved, people, pauses, best, steps, hits, review, token, created_at)
       VALUES (?, 'practice', 'normal', '2026-01-01', 1, 1, 5951, 1, 1, 1, 0, 0, 0, 1, 1, 1, 3, 'ap', ?)`,
      [a, new Date().toISOString()],
    );
    expect((await allTimeBoard(sql, 'normal'))[0]).toMatchObject({ name: 'diver_a' });
    await rejectPlayer(sql, a);
    expect(await allTimeBoard(sql, 'normal')).toHaveLength(0);
    expect(await trustCap(sql, a, 'normal')).toBe(0);
  });

  it('31 puppets on top fold into one row; the named board below is untouched', async () => {
    const sql = sqliteSql(openSqlite(':memory:'));
    const day = istDay();
    const mk = async (name: string) =>
      (
        await sql.run(
          "INSERT INTO users (name, skeleton, password_hash, created_at) VALUES (?, ?, 'x', ?)",
          [name, nameSkeleton(name), new Date().toISOString()],
        )
      ).lastId;
    const run = (uid: number, score: number, review: number) =>
      sql.run(
        `INSERT INTO freefall_runs (user_id, mode, level, day, seed, qseed, score, floors, correct, asked,
           saved, people, pauses, best, steps, hits, review, token, created_at)
         VALUES (?, 'daily', 'easy', ?, 1, 1, ?, 1, 1, 1, 0, 0, 0, 1, 1, 1, ?, ?, ?)`,
        [uid, day, score, review, `t-${uid}`, new Date().toISOString()],
      );
    for (let i = 0; i < 31; i++) await run(await mk(`pup${i}`), 9_000 + i, 1);
    for (let i = 0; i < 12; i++) await run(await mk(`kid${i}`), 3_000 - i * 100, 0);
    const { rows } = await dailyBoard(sql, 'easy', day);
    expect(rows.filter((r) => r.name === null && r.more === 0)).toHaveLength(3);
    expect(rows.find((r) => r.more > 0)).toMatchObject({ more: 28, rank: 4 });
    // Ten places listed (three unnamed, seven named at their real ranks); the folded 28 take none.
    const named = rows.filter((r) => r.name);
    expect(named).toHaveLength(7);
    expect(named[0]).toMatchObject({ name: 'kid0', rank: 32 });
  });

  it('a practice post reports the row the owner will find: their best, withheld or not', async () => {
    const { sql, a } = await db();
    // diver_a's best at normal: an unchecked 9,955 (withheld on the all-time board).
    await sql.run(
      `INSERT INTO freefall_runs (user_id, mode, level, day, seed, qseed, score, floors, correct, asked,
         saved, people, pauses, best, steps, hits, review, token, created_at)
       VALUES (?, 'practice', 'normal', '2026-01-01', 1, 1, 9955, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 'best', ?)`,
      [a, new Date().toISOString()],
    );
    // …and a checked 4,000 (approved), so a modest new run isn't on the board at all.
    await sql.run(
      `INSERT INTO freefall_runs (user_id, mode, level, day, seed, qseed, score, floors, correct, asked,
         saved, people, pauses, best, steps, hits, review, token, created_at)
       VALUES (?, 'practice', 'normal', '2026-01-01', 1, 1, 4000, 1, 1, 1, 0, 0, 0, 1, 1, 1, 3, 'ok4k', ?)`,
      [a, new Date().toISOString()],
    );
    const t0 = Date.now();
    const t = await issueToken('practice', 'normal', t0, 0, `u${a}`);
    const run = runForSync(t.seed, t.qseed); // a modest run, well below the best
    const r = await post(sql, a, t.token, run.log, t0 + 3600_000);
    expect(r).toMatchObject({ ok: true, stored: true, rank: 1, pending: true, best: false });
  });
});
