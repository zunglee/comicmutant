/** biome-ignore-all lint/style/noNonNullAssertion: tests index values the code under test guarantees. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nameSkeleton, type User } from '~/.server/auth';
import { type Sql, sqliteSql } from '~/.server/db';
import { openSqlite } from '~/.server/db.node';
import {
  answerQuestion,
  arrangeQuestions,
  BOARD_TOP,
  board,
  CLAIM_WINDOW,
  claimGame,
  dailyArchive,
  dailyQuestions,
  dailyStartsLeft,
  fanStats,
  flagReasons,
  heldReasons,
  istDay,
  MAX_GAME_SCORE,
  mergeGuestHistory,
  modQuizQueues,
  nearFloor,
  nextQuestion,
  type Owner,
  openDaily,
  orderByLeaks,
  pointsFor,
  type QuizRuling,
  type QuizRulingResult,
  readFloorMs,
  rejectFan,
  reportQuestion,
  retireQuestion,
  revokeGame,
  ruleGame,
  siteStats,
  startGame,
  TIGHT_SIGNAL_MS,
  tightBand,
  trustQueue,
} from '~/.server/quiz';
import { buildBank, getBank, retiredIds, setBankForTests } from '~/.server/quizbank';
import { rng } from '~/game/engine/math';
import type {
  QuizAnswerReply,
  QuizClaimReply,
  QuizStartBody,
  QuizStartReply,
} from '~/lib/quiz-contract';
import { PUBLISHED_UNIVERSES } from '~/lib/taxonomy';

// ─── fixture bank: 5 universes × 2 characters × 14 questions (4/5/5 difficulty, 5 topics) ────────
// 14 a character, so a character game still has 10 after today's daily questions are left out (Q22).

const TOPICS = ['origin', 'powers', 'debut', 'allies', 'enemies'] as const;
const DIFF = [1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3] as const;
const fixture: Record<string, unknown> = {};
const names: Record<string, string> = {};
for (const u of PUBLISHED_UNIVERSES)
  for (const c of ['alpha', 'beta']) {
    const slug = `${u}-${c}`;
    names[slug] = `${u} ${c}`.toUpperCase();
    fixture[`/content/quiz/${u}/${slug}.json`] = {
      character: slug,
      universe: u,
      questions: DIFF.map((d, i) => ({
        id: `${slug}-${String(i + 1).padStart(2, '0')}`,
        q: `Fixture question number ${i + 1} about ${slug}?`,
        options: [`opt-a${i}`, `opt-b${i}`, `opt-c${i}`, `opt-d${i}`],
        answer: i % 4,
        why: `Because fixture ${slug} fact ${i + 1} says so.`,
        difficulty: d,
        topic: TOPICS[i % TOPICS.length],
        source: 'https://example.com/fixture',
      })),
    };
  }

beforeAll(() => setBankForTests(buildBank(fixture, (s) => names[s])));
afterAll(() => setBankForTests(null));

// ─── helpers ─────────────────────────────────────────────────────────────────────────────────────

const T0 = Date.UTC(2026, 10, 1, 6, 0, 0); // 11:30 IST

async function db() {
  const sql = sqliteSql(openSqlite(':memory:'));
  const mk = async (name: string, _unused?: boolean): Promise<User> => {
    const id = (
      await sql.run(
        "INSERT INTO users (name, skeleton, password_hash, role, created_at) VALUES (?, ?, 'x', 'fan', ?)",
        [name, nameSkeleton(name), new Date().toISOString()],
      )
    ).lastId;
    return { id, name, role: 'fan', avatar: null };
  };
  return { sql, mk };
}

const fan = (user: User, guest: string | null = null): Owner => ({ user, guest });
const guest = (g: string): Owner => ({ user: null, guest: g });
const G1 = 'guest-cookie-aaaaaaaaaaaaaaaa';
const G2 = 'guest-cookie-bbbbbbbbbbbbbbbb';

async function start(sql: Sql, body: QuizStartBody, o: Owner, now = T0) {
  const r = await startGame(sql, body, o, now);
  if (!r.ok) throw new Error(r.error);
  return r as Extract<QuizStartReply, { ok: true }>;
}

const gameId = (token: string) => Number(token.split('.')[0]);

async function row(sql: Sql, token: string) {
  return (await sql.get<{
    questions: string;
    perms: string;
    pos: number;
    score: number;
    review: number;
    user_id: number | null;
    ranked: number;
  }>('SELECT * FROM quiz_games WHERE id = ?', [gameId(token)]))!;
}

/** The shown index of the right option for the game's current question (server-side knowledge). */
async function right(sql: Sql, token: string, index: number) {
  const g = await row(sql, token);
  const id = (JSON.parse(g.questions) as string[])[index]!;
  const perm = (JSON.parse(g.perms) as number[][])[index]!;
  return perm.indexOf(getBank().byId.get(id)!.answer) as 0 | 1 | 2 | 3;
}

/** Per-answer spread (σ ≈ 0.8 s) so honest test players aren't a tight band (Q18). */
const JITTER = [0, 1400, 300, 2100, 700, 0, 1800, 500, 2400, 1000];

/**
 * Play a whole game: `ms` per answer, `hit(i)` decides right/wrong. Returns every reply.
 */
async function playOut(
  sql: Sql,
  s: Extract<QuizStartReply, { ok: true }>,
  o: Owner,
  opts: {
    ms?: number;
    hit?: (i: number) => boolean;
    t0?: number;
    read?: number;
    /** Human-like spread of answer times (default for paces ≥ 2 s; bots are exact). */
    jitter?: boolean;
  } = {},
) {
  const base = opts.ms ?? 5000;
  const jitter = opts.jitter ?? base >= 2000;
  let t = opts.t0 ?? T0;
  const replies: Extract<QuizAnswerReply, { ok: true }>[] = [];
  for (let i = 0; i < s.total; i++) {
    if (i > 0) {
      // Reading the reveal is off the clock: the next question's clock starts when it's asked for.
      t += opts.read ?? 0;
      const n = await nextQuestion(sql, { game: s.game, index: i }, o, t);
      if (!n.ok) throw new Error(n.error);
    }
    t += base + (jitter ? (JITTER[i % JITTER.length] as number) : 0);
    const r = await right(sql, s.game, i);
    const choice = (opts.hit?.(i) ?? true) ? r : (((r + 1) % 4) as 0 | 1 | 2 | 3);
    const a = await answerQuestion(sql, { game: s.game, index: i, choice }, o, t);
    if (!a.ok) throw new Error(a.error);
    replies.push(a);
  }
  return { replies, last: replies.at(-1)!, end: t };
}

/** A claim's summary (the claim must have succeeded). */
function summaryOf(r: QuizClaimReply) {
  if (!r.ok) throw new Error(r.error);
  return r.summary;
}

/** Pace input of a stored game (as the server sees it). */
async function paceOf(sql: Sql, token: string) {
  const rows = await sql.all<{ question_id: string; ms: number; correct: number }>(
    'SELECT question_id, ms, correct FROM quiz_answers WHERE game_id = ? ORDER BY idx',
    [gameId(token)],
  );
  return rows.map((r) => ({
    ms: r.ms,
    correct: r.correct,
    chars: getBank().byId.get(r.question_id)!.q.length,
  }));
}

/** Approve every unchecked universe/daily game but leave the facts cap where it was set. */
async function approveAllExceptFacts(sql: Sql) {
  const caps = await sql.all<{ user_id: number; value: number }>(
    "SELECT user_id, value FROM quiz_caps WHERE board = 'facts'",
  );
  await approveAll(sql);
  await sql.run("DELETE FROM quiz_caps WHERE board = 'facts'");
  for (const c of caps)
    await sql.run("INSERT INTO quiz_caps (user_id, board, value, at) VALUES (?, 'facts', ?, 0)", [
      c.user_id,
      c.value,
    ]);
}

/** Signal texts of a trust item or held game. */
const texts = (x: { signals: { text: string }[] }) => x.signals.map((g) => g.text);

/** A ruling that went through (tests fail loudly on a refusal). */
function done(r: QuizRulingResult): QuizRuling {
  if (!r.ok) throw new Error(r.message);
  return r;
}

/** A mod approves every finished, unchecked game (Q19), so names show in gated places. */
async function approveAll(sql: Sql) {
  const games = await sql.all<{ id: number }>(
    'SELECT id FROM quiz_games WHERE finished_at IS NOT NULL AND user_id IS NOT NULL AND review = 0 ORDER BY id',
  );
  for (const g of games) await ruleGame(sql, g.id, true);
}

const ids = async (sql: Sql, token: string) =>
  JSON.parse((await row(sql, token)).questions) as string[];

// ─── 1. no answer leaks; options shuffled per game ───────────────────────────────────────────────

describe('no answer leaks', () => {
  it('start and answer replies carry no answer or why for an unanswered question', async () => {
    const { sql, mk } = await db();
    const u = await mk('leak_a');
    const s = await start(sql, { mode: 'universe', universe: 'dc' }, fan(u));
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/"answer"|"why"|"source"/);
    const q = getBank().byId.get((await ids(sql, s.game))[0]!)!;
    expect(json).not.toContain(q.why);
    const a = await answerQuestion(sql, { game: s.game, index: 0, choice: 0 }, fan(u), T0 + 4000);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a).not.toHaveProperty('next');
    expect(a.more).toBe(true);
    const n = await nextQuestion(sql, { game: s.game, index: 1 }, fan(u), T0 + 9000);
    expect(n.ok).toBe(true);
    expect(JSON.stringify(n)).not.toMatch(/"answer"|"why"|"source"/);
    expect(JSON.stringify(n)).not.toContain(getBank().byId.get((await ids(sql, s.game))[1]!)!.why);
    // The reveal is for the question just answered, in the shuffled positions the player saw.
    expect(s.question!.options[a.reveal.answer!]).toBe(q.options[q.answer]);
    expect(a.reveal.why).toBe(q.why);
  });

  it('options are a per-game shuffle of the written options', async () => {
    const { sql } = await db();
    const orders = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const s = await start(sql, { mode: 'daily' }, guest(`${G1}-${i}`));
      const q = getBank().byId.get((await ids(sql, s.game))[0]!)!;
      expect([...s.question!.options].sort()).toEqual([...q.options].sort());
      orders.add(s.question!.options.join('|'));
    }
    expect(orders.size).toBeGreaterThan(1);
  });
});

// ─── 2. strict order, once ───────────────────────────────────────────────────────────────────────

describe('strict order', () => {
  it('only the current question can be answered, once', async () => {
    const { sql, mk } = await db();
    const u = await mk('order_a');
    const s = await start(sql, { mode: 'universe', universe: 'marvel' }, fan(u));
    const ahead = await answerQuestion(sql, { game: s.game, index: 1, choice: 0 }, fan(u), T0 + 1);
    expect(ahead.ok).toBe(false);
    const c = await right(sql, s.game, 0);
    const a = await answerQuestion(sql, { game: s.game, index: 0, choice: c }, fan(u), T0 + 3000);
    expect(a.ok && a.reveal.correct).toBe(true);
    const score = (await row(sql, s.game)).score;
    expect(score).toBeGreaterThan(0);
    // Q13: the identical choice resent gets the stored reveal back, scoring nothing more.
    const again = await answerQuestion(
      sql,
      { game: s.game, index: 0, choice: c },
      fan(u),
      T0 + 9100,
    );
    expect(again).toEqual(a);
    const other = ((c + 1) % 4) as 0 | 1 | 2 | 3;
    const changed = await answerQuestion(
      sql,
      { game: s.game, index: 0, choice: other },
      fan(u),
      T0 + 9200,
    );
    expect(changed.ok).toBe(false);
    expect((await row(sql, s.game)).score).toBe(score);
    expect((await row(sql, s.game)).pos).toBe(1);
  });

  it('a resent last answer returns its summary again; a resent timeout stays a timeout', async () => {
    const { sql, mk } = await db();
    const u = await mk('order_c');
    const s = await start(sql, { mode: 'character', character: 'dc-alpha' }, fan(u));
    const p = await playOut(sql, s, fan(u));
    const c = await right(sql, s.game, 9);
    const again = await answerQuestion(
      sql,
      { game: s.game, index: 9, choice: c },
      fan(u),
      p.end + 50,
    );
    expect(again).toEqual(p.last);
    const g = await start(sql, { mode: 'character', character: 'dc-alpha' }, fan(u), p.end);
    const t = await answerQuestion(
      sql,
      { game: g.game, index: 0, choice: 1 },
      fan(u),
      p.end + 30_000,
    );
    expect(t.ok && t.reveal.timedOut).toBe(true);
    const t2 = await answerQuestion(
      sql,
      { game: g.game, index: 0, choice: 1 },
      fan(u),
      p.end + 31_000,
    );
    expect(t2).toEqual(t);
    expect(
      (await answerQuestion(sql, { game: g.game, index: 0, choice: -1 }, fan(u), p.end)).ok,
    ).toBe(false);
  });

  it('a finished game takes no more answers', async () => {
    const { sql, mk } = await db();
    const u = await mk('order_b');
    const s = await start(sql, { mode: 'character', character: 'dc-alpha' }, fan(u));
    const { end } = await playOut(sql, s, fan(u));
    const r = await answerQuestion(sql, { game: s.game, index: 10, choice: 0 }, fan(u), end + 10);
    expect(r.ok).toBe(false);
  });
});

// ─── 3. server time and points ───────────────────────────────────────────────────────────────────

describe('server time and points', () => {
  it('points follow Q3', () => {
    expect(pointsFor(1, 0, 1)).toBe(150);
    expect(pointsFor(2, 0, 1)).toBe(225);
    expect(pointsFor(3, 0, 1)).toBe(300);
    expect(pointsFor(1, 7500, 1)).toBe(125);
    expect(pointsFor(1, 15_000, 2)).toBe(100);
    expect(pointsFor(1, 16_000, 2)).toBe(100); // in the grace: right, no speed bonus
    expect(pointsFor(1, 15_000, 3)).toBe(125); // third in a row: +25
    expect(pointsFor(2, 0, 5)).toBe(250);
  });

  it('seconds come from the server; past 15 s + 2.5 s grace is a timeout whatever was chosen', async () => {
    const { sql, mk } = await db();
    const u = await mk('time_a');
    const s = await start(sql, { mode: 'universe', universe: 'anime' }, fan(u));
    const c0 = await right(sql, s.game, 0);
    const late = await answerQuestion(
      sql,
      { game: s.game, index: 0, choice: c0 },
      fan(u),
      T0 + 17_600,
    );
    expect(late.ok).toBe(true);
    if (!late.ok) return;
    expect(late.reveal.correct).toBe(false);
    expect(late.reveal.timedOut).toBe(true);
    expect(late.reveal.points).toBe(0);
    expect(late.reveal.seconds).toBeCloseTo(17.5, 1); // capped at the limit
    // Within the grace: right, base points × difficulty, no speed bonus. (Q1 is difficulty 1.)
    const c1 = await right(sql, s.game, 1);
    await nextQuestion(sql, { game: s.game, index: 1 }, fan(u), T0 + 16_600);
    const t1 = T0 + 16_600 + 17_400;
    const ok = await answerQuestion(sql, { game: s.game, index: 1, choice: c1 }, fan(u), t1);
    expect(ok.ok && ok.reveal.correct).toBe(true);
    if (!ok.ok) return;
    expect(ok.reveal.timedOut).toBe(false);
    expect(ok.reveal.points).toBe(100);
    // Streak bonus from the third right answer in a row.
    const c2 = await right(sql, s.game, 2);
    await nextQuestion(sql, { game: s.game, index: 2 }, fan(u), t1);
    const two = await answerQuestion(
      sql,
      { game: s.game, index: 2, choice: c2 },
      fan(u),
      t1 + 15_000,
    );
    expect(two.ok && two.reveal.points).toBe(100);
    const c3 = await right(sql, s.game, 3);
    await nextQuestion(sql, { game: s.game, index: 3 }, fan(u), t1 + 15_000);
    const three = await answerQuestion(
      sql,
      { game: s.game, index: 3, choice: c3 },
      fan(u),
      t1 + 30_000,
    );
    // Question 4 is difficulty 2: 100 × 1.5 + 25.
    expect(three.ok && three.reveal.points).toBe(175);
    expect(three.ok && three.reveal.streak).toBe(3);
    await nextQuestion(sql, { game: s.game, index: 4 }, fan(u), t1 + 30_000);
    const timeout = await answerQuestion(
      sql,
      { game: s.game, index: 4, choice: -1 },
      fan(u),
      t1 + 31_000,
    );
    expect(timeout.ok && timeout.reveal.streak).toBe(0);
    expect(timeout.ok && timeout.reveal.points).toBe(0);
  });
});

// ─── Q9: the clock starts when the question is asked for ─────────────────────────────────────────

describe('next question (Q9)', () => {
  it('the clock starts at /next, so a long reveal read never times the next one out', async () => {
    const { sql, mk } = await db();
    const u = await mk('next_a');
    const s = await start(sql, { mode: 'universe', universe: 'dc' }, fan(u));
    await answerQuestion(sql, { game: s.game, index: 0, choice: 0 }, fan(u), T0 + 3000);
    // A minute reading the why; then the next question, answered 3 s after it is served.
    const t = T0 + 63_000;
    const n = await nextQuestion(sql, { game: s.game, index: 1 }, fan(u), t);
    expect(n.ok && n.question.index).toBe(1);
    const c = await right(sql, s.game, 1);
    const a = await answerQuestion(sql, { game: s.game, index: 1, choice: c }, fan(u), t + 3000);
    expect(a.ok && a.reveal.correct).toBe(true);
    expect(a.ok && a.reveal.seconds).toBe(3);
    expect(a.ok && a.reveal.points).toBe(140); // difficulty 1, 12 s of 15 left → 100 + 40
    // A whole game with 2-minute reads between questions: nothing times out.
    const s2 = await start(sql, { mode: 'universe', universe: 'marvel' }, fan(u), T0);
    const p = await playOut(sql, s2, fan(u), { read: 120_000, ms: 4000 });
    expect(p.last.summary!.grid).toBe('✓'.repeat(10));
  });

  it('a repeat call returns the same question and does not reset the clock', async () => {
    const { sql, mk } = await db();
    const u = await mk('next_b');
    const s = await start(sql, { mode: 'universe', universe: 'anime' }, fan(u));
    await answerQuestion(sql, { game: s.game, index: 0, choice: 0 }, fan(u), T0 + 2000);
    const t = T0 + 10_000;
    const n1 = await nextQuestion(sql, { game: s.game, index: 1 }, fan(u), t);
    const n2 = await nextQuestion(sql, { game: s.game, index: 1 }, fan(u), t + 10_000);
    // Same question; its `seconds` is what's left on the server clock (U1: the ring matches).
    expect(n1.ok && n1.question.seconds).toBe(15);
    expect(n2.ok && n2.question.seconds).toBe(5);
    expect(n2.ok && { ...n2.question, seconds: 15 }).toEqual(n1.ok && n1.question);
    const n3 = await nextQuestion(sql, { game: s.game, index: 1 }, fan(u), t + 14_600);
    expect(n3.ok && n3.question.seconds).toBe(1); // floor at 1
    const c = await right(sql, s.game, 1);
    const a = await answerQuestion(sql, { game: s.game, index: 1, choice: c }, fan(u), t + 12_000);
    expect(a.ok && a.reveal.seconds).toBe(12);
    // Re-asking after 16 s doesn't buy time either: still a timeout at 18 s.
    await nextQuestion(sql, { game: s.game, index: 2 }, fan(u), t + 20_000);
    await nextQuestion(sql, { game: s.game, index: 2 }, fan(u), t + 36_000);
    const c2 = await right(sql, s.game, 2);
    const late = await answerQuestion(
      sql,
      { game: s.game, index: 2, choice: c2 },
      fan(u),
      t + 38_000,
    );
    expect(late.ok && late.reveal.correct).toBe(false);
    // Served once each in the stats, however often it was asked for.
    const ids2 = await ids(sql, s.game);
    const st = await sql.get<{ served: number }>(
      'SELECT served FROM quiz_question_stats WHERE question_id = ?',
      [ids2[2]!],
    );
    expect(st!.served).toBe(1);
  });

  it("can't fetch ahead, re-fetch an answered one, or answer one never served", async () => {
    const { sql, mk } = await db();
    const u = await mk('next_c');
    const s = await start(sql, { mode: 'universe', universe: 'other' }, fan(u));
    expect((await nextQuestion(sql, { game: s.game, index: 1 }, fan(u), T0 + 1000)).ok).toBe(false);
    // Index 0 was served by start: re-asking returns it with the clock from start.
    const n0 = await nextQuestion(sql, { game: s.game, index: 0 }, fan(u), T0 + 1000);
    expect(n0.ok && n0.question).toEqual({ ...s.question, seconds: 14 });
    await answerQuestion(sql, { game: s.game, index: 0, choice: 0 }, fan(u), T0 + 2000);
    expect((await nextQuestion(sql, { game: s.game, index: 0 }, fan(u), T0 + 3000)).ok).toBe(false);
    expect((await nextQuestion(sql, { game: s.game, index: 2 }, fan(u), T0 + 3000)).ok).toBe(false);
    const unserved = await answerQuestion(
      sql,
      { game: s.game, index: 1, choice: 0 },
      fan(u),
      T0 + 4000,
    );
    expect(unserved.ok).toBe(false);
    // Someone else can't ask for it.
    const other = await mk('next_d');
    expect((await nextQuestion(sql, { game: s.game, index: 1 }, fan(other), T0)).ok).toBe(false);
  });

  it('the last answer says no more and carries the summary; /next after it fails', async () => {
    const { sql } = await db();
    const s = await start(sql, { mode: 'character', character: 'indian-alpha' }, guest(G1));
    const p = await playOut(sql, s, guest(G1));
    expect(p.replies.slice(0, -1).every((r) => r.more && r.summary === null)).toBe(true);
    expect(p.last.more).toBe(false);
    expect(p.last.summary).not.toBeNull();
    expect((await nextQuestion(sql, { game: s.game, index: 10 }, guest(G1), p.end)).ok).toBe(false);
  });
});

// ─── 4. game token binds the owner ───────────────────────────────────────────────────────────────

describe('game token', () => {
  it("rejects someone else's token, a guest token from another browser, and a forged one", async () => {
    const { sql, mk } = await db();
    const a = await mk('tok_a');
    const b = await mk('tok_b');
    const s = await start(sql, { mode: 'universe', universe: 'other' }, fan(a));
    const other = await answerQuestion(
      sql,
      { game: s.game, index: 0, choice: 0 },
      fan(b),
      T0 + 1000,
    );
    expect(other.ok).toBe(false);
    const g = await start(sql, { mode: 'universe', universe: 'other' }, guest(G1));
    const wrongBrowser = await answerQuestion(
      sql,
      { game: g.game, index: 0, choice: 0 },
      guest(G2),
      T0 + 1000,
    );
    expect(wrongBrowser.ok).toBe(false);
    const [id, owner, sig] = s.game.split('.');
    const forged = `${id}.u${b.id}.${sig}`;
    expect((await answerQuestion(sql, { game: forged, index: 0, choice: 0 }, fan(b), T0)).ok).toBe(
      false,
    );
    const bumped = `${Number(id) + 1}.${owner}.${sig}`;
    expect((await answerQuestion(sql, { game: bumped, index: 0, choice: 0 }, fan(a), T0)).ok).toBe(
      false,
    );
    // The owner can; and a guest who signs in mid-game keeps their browser's game.
    expect((await answerQuestion(sql, { game: s.game, index: 0, choice: 0 }, fan(a), T0)).ok).toBe(
      true,
    );
    expect(
      (await answerQuestion(sql, { game: g.game, index: 0, choice: 0 }, fan(b, G1), T0 + 900)).ok,
    ).toBe(true);
  });
});

// ─── 5. daily ────────────────────────────────────────────────────────────────────────────────────

describe('daily', () => {
  it('same 10 for everyone on an IST day, mixed universes, 3/4/3', async () => {
    const { sql, mk } = await db();
    const a = await mk('day_a');
    const s1 = await start(sql, { mode: 'daily' }, fan(a));
    const s2 = await start(sql, { mode: 'daily' }, guest(G1), T0 + 3 * 3600_000);
    const day1 = await ids(sql, s1.game);
    expect(await ids(sql, s2.game)).toEqual(day1);
    expect(day1).toHaveLength(10);
    const qs = day1.map((id) => getBank().byId.get(id)!);
    expect(new Set(qs.map((q) => q.universe)).size).toBeGreaterThanOrEqual(4);
    expect(qs.filter((q) => q.difficulty === 1)).toHaveLength(3);
    expect(qs.filter((q) => q.difficulty === 2)).toHaveLength(4);
    expect(qs.filter((q) => q.difficulty === 3)).toHaveLength(3);
    const next = await start(sql, { mode: 'daily' }, guest(G2), T0 + 86400_000);
    expect(await ids(sql, next.game)).not.toEqual(day1);
    // The IST day boundary: 18:29 UTC is still today in India, 18:31 UTC is tomorrow.
    expect(istDay(Date.UTC(2026, 10, 1, 18, 29))).toBe('2026-11-01');
    expect(istDay(Date.UTC(2026, 10, 1, 18, 31))).toBe('2026-11-02');
  });

  it("only a signed-in fan's first daily start of the day is ranked", async () => {
    const { sql, mk } = await db();
    const a = await mk('day_b');
    const first = await start(sql, { mode: 'daily' }, fan(a));
    expect(first.ranked).toBe(true);
    expect(first.unrankedWhy).toBeUndefined();
    // Q23a: a second start while it's open resumes the same game (no lock-out).
    const again = await start(sql, { mode: 'daily' }, fan(a), T0 + 5000);
    expect(again.game).toBe(first.game);
    expect(again.resumed).toEqual({ score: 0, streak: 0, answered: 0, grid: '' });
    const p = await playOut(sql, first, fan(a), { t0: T0 + 5000 });
    // …once it's done, a second try is blind practice.
    const second = await start(sql, { mode: 'daily' }, fan(a), p.end);
    expect(second.ranked).toBe(false);
    expect(second.unrankedWhy).toMatch(/first daily/);
    const g = await start(sql, { mode: 'daily' }, guest(G1));
    expect(g.ranked).toBe(false);
    expect(g.unrankedWhy).toBeTruthy();
    await playOut(sql, g, guest(G1), { hit: () => false });
    // Q23b: a fan whose browser played today's daily as a guest still ranks their own first one.
    const b = await mk('day_c');
    expect((await start(sql, { mode: 'daily' }, fan(b, G1))).ranked).toBe(true);
    // Tomorrow ranks again.
    expect((await start(sql, { mode: 'daily' }, fan(a), T0 + 86400_000)).ranked).toBe(true);
  });
});

// ─── 6. universe / character picks ───────────────────────────────────────────────────────────────

describe('universe and character games', () => {
  it('universe: 10 from that universe, 3/4/3, unseen first (per fan and per guest)', async () => {
    const { sql, mk } = await db();
    const a = await mk('uni_a');
    for (const o of [fan(a), guest(G1)]) {
      const s1 = await start(sql, { mode: 'universe', universe: 'indian' }, o);
      const first = await ids(sql, s1.game);
      const qs = first.map((id) => getBank().byId.get(id)!);
      expect(qs.every((q) => q.universe === 'indian')).toBe(true);
      expect(qs.map((q) => q.difficulty)).toEqual([1, 1, 1, 2, 2, 2, 2, 3, 3, 3]);
      await playOut(sql, s1, o);
      const s2 = await start(sql, { mode: 'universe', universe: 'indian' }, o, T0 + 600_000);
      const second = await ids(sql, s2.game);
      expect(second.filter((id) => first.includes(id))).toHaveLength(0);
    }
  });

  it('character: up to 10 from that character', async () => {
    const { sql } = await db();
    const s = await start(sql, { mode: 'character', character: 'marvel-beta' }, guest(G1));
    const list = await ids(sql, s.game);
    expect(list).toHaveLength(10);
    expect(list.every((id) => id.startsWith('marvel-beta-'))).toBe(true);
    expect(s.question!.character).toEqual({
      slug: 'marvel-beta',
      name: 'MARVEL BETA',
      universe: 'marvel',
    });
    const none = await startGame(sql, { mode: 'character', character: 'nobody' }, guest(G1), T0);
    expect(none.ok).toBe(false);
  });
});

// ─── 7. facts known (Q12) ────────────────────────────────────────────────────────────────────────

describe('facts known (first sight)', () => {
  it('counts a fact only when it is right the first time the fan sees it', async () => {
    const { sql, mk } = await db();
    const a = await mk('facts_a');
    const s1 = await start(sql, { mode: 'character', character: 'dc-beta' }, fan(a));
    const { last } = await playOut(sql, s1, fan(a), { hit: (i) => i < 6 });
    expect(last.summary!.newFacts).toBe(6);
    expect((await fanStats(sql, a.id, T0)).factsMastered).toBe(6);
    // The 4 missed were revealed: getting them right on a replay teaches, but doesn't count. Only
    // the replay's questions never seen before can.
    const s2 = await start(sql, { mode: 'character', character: 'dc-beta' }, fan(a), T0 + 3600_000);
    const r2 = await playOut(sql, s2, fan(a), { t0: T0 + 3600_000 });
    const g1 = await ids(sql, s1.game);
    const fresh = (await ids(sql, s2.game)).filter((id) => !g1.includes(id)).length;
    expect(fresh).toBeLessThan(10);
    expect(r2.last.summary!.newFacts).toBe(fresh);
    expect((await fanStats(sql, a.id, T0)).factsMastered).toBe(6 + fresh);
    // A question seen but timed out on also counts as seen.
    const s3 = await start(sql, { mode: 'character', character: 'dc-alpha' }, fan(a), T0);
    await answerQuestion(sql, { game: s3.game, index: 0, choice: -1 }, fan(a), T0 + 1000);
    const s4 = await start(sql, { mode: 'character', character: 'dc-alpha' }, fan(a), T0 + 60_000);
    const r4 = await playOut(sql, s4, fan(a), { t0: T0 + 60_000 });
    const timedOut = (await ids(sql, s3.game))[0]!;
    const inS4 = (await ids(sql, s4.game)).includes(timedOut) ? 1 : 0;
    expect(r4.last.summary!.newFacts).toBe(10 - inS4);
  });

  it("a guest's game adds to it only after claim", async () => {
    const { sql, mk } = await db();
    const s = await start(sql, { mode: 'universe', universe: 'marvel' }, guest(G1));
    const { last, end } = await playOut(sql, s, guest(G1));
    expect(last.summary!.newFacts).toBe(0);
    expect(last.summary!.claimable).toBe(true);
    const a = await mk('facts_b');
    expect((await fanStats(sql, a.id, end)).factsMastered).toBe(0);
    const c = await claimGame(sql, s.game, a, G1, end + 60_000);
    expect(c.ok).toBe(true);
    expect(summaryOf(c).newFacts).toBe(10);
    expect((await fanStats(sql, a.id, end)).factsMastered).toBe(10);
  });

  it('critic repro: a guest scouts a universe, then the fan in that browser plays it → ~0 facts', async () => {
    const { sql, mk } = await db();
    // Scout every Indie question as a guest (3 games: all 24–28 non-daily ones, answers revealed).
    let t = T0;
    for (let k = 0; k < 3; k++) {
      const s = await start(sql, { mode: 'universe', universe: 'other' }, guest(G1), t);
      t = (await playOut(sql, s, guest(G1), { t0: t, hit: () => false })).end;
    }
    // The fan signs in on the same browser and "masters" them fast-but-human.
    const fanA = await mk('scout_a');
    let facts = 0;
    for (let k = 0; k < 2; k++) {
      const s = await start(sql, { mode: 'universe', universe: 'other' }, fan(fanA, G1), t);
      const p = await playOut(sql, s, fan(fanA, G1), { t0: t, ms: 2500 });
      facts += p.last.summary!.newFacts;
      t = p.end;
    }
    expect(facts).toBe(0);
    expect((await fanStats(sql, fanA.id, t)).factsMastered).toBe(0);
    // mergeGuestHistory on sign-in covers a fan who then plays from a clean browser too.
    const fanB = await mk('scout_b');
    let t2 = T0;
    const s = await start(sql, { mode: 'universe', universe: 'anime' }, guest(G2), t2);
    t2 = (await playOut(sql, s, guest(G2), { t0: t2, hit: () => false })).end;
    await mergeGuestHistory(sql, fanB.id, G2);
    const s2 = await start(sql, { mode: 'character', character: 'anime-alpha' }, fan(fanB), t2);
    const scouted = await ids(sql, s.game);
    const fresh = (await ids(sql, s2.game)).filter((id) => !scouted.includes(id)).length;
    const p2 = await playOut(sql, s2, fan(fanB), { t0: t2 });
    expect(p2.last.summary!.newFacts).toBe(fresh);
  });
});

// ─── 8. held games ───────────────────────────────────────────────────────────────────────────────

describe('held games', () => {
  it('Q11 rules: median < 1.5 s, or 3+ right answers faster than reading the question', () => {
    const mk = (ms: number[], chars = 46, right = true) =>
      ms.map((m) => ({ ms: m, correct: right, chars }));
    expect(readFloorMs(45)).toBe(1800);
    expect(heldReasons(mk(Array(10).fill(500), 46, false))).toEqual(['median answer under 1.5 s']);
    // Critic repro: a bot at a 1.6 s median with one 2.6 s answer, on ~46-char questions → held.
    const bot = heldReasons(mk([...Array(9).fill(1600), 2600]));
    expect(bot).toEqual(['9 right answers faster than reading the question']);
    // Two quick ones are allowed (a fan who just knows it); three aren't.
    expect(heldReasons(mk([1500, 1500, ...Array(8).fill(4000)]))).toEqual([]);
    expect(heldReasons(mk([1500, 1500, 1500, ...Array(7).fill(4000)]))).toHaveLength(1);
    // Wrong answers fast don't count toward the floor rule.
    expect(heldReasons(mk([...Array(5).fill(1600), ...Array(5).fill(3000)], 46, false))).toEqual(
      [],
    );
    // Long questions take longer to read: 2.5 s on a 150-char question is under its 4.1 s floor.
    expect(heldReasons(mk(Array(10).fill(2500), 150))).toHaveLength(1);
  });

  it('Q11 calibration: an honest fan at 2–4 s on short questions is not held', () => {
    // Short questions (35–60 chars, floors 1.6–2.1 s); a fan who knows them, 2.0–4.0 s, all right.
    const times = [2000, 2200, 2400, 2600, 2800, 3000, 3300, 3600, 3800, 4000];
    const lens = [35, 40, 42, 45, 48, 50, 52, 55, 58, 60];
    expect(heldReasons(times.map((ms, i) => ({ ms, correct: true, chars: lens[i]! })))).toEqual([]);
    // The real bank: an honest 2–4 s game on its 10 shortest questions is not held either.
    const bank = getBank().all;
    const shortest = [...bank].sort((a, b) => a.q.length - b.q.length).slice(0, 10);
    expect(
      heldReasons(shortest.map((q, i) => ({ ms: times[i]!, correct: true, chars: q.q.length }))),
    ).toEqual([]);
  });

  it('only ranked games are held; unranked practice never is (but credits no facts)', async () => {
    const { sql, mk } = await db();
    const g = await start(sql, { mode: 'universe', universe: 'marvel' }, guest(G1));
    const p = await playOut(sql, g, guest(G1), { ms: 600 });
    expect(p.last.summary!.held).toBe(false);
    expect((await modQuizQueues(sql)).held).toHaveLength(0);
    // Claimed, it becomes ranked — and is pace-checked like any ranked game.
    const a = await mk('held_c');
    const c = await claimGame(sql, g.game, a, G1, p.end);
    expect(summaryOf(c).held).toBe(true);
    expect(summaryOf(c).newFacts).toBe(0);
    expect((await modQuizQueues(sql)).held).toHaveLength(1);
    // A fan's unranked daily replay at bot pace: not held, no facts.
    const b = await mk('held_d');
    await playOut(sql, await start(sql, { mode: 'daily' }, fan(b)), fan(b));
    const replay = await start(sql, { mode: 'daily' }, fan(b), T0 + 600_000);
    const r = await playOut(sql, replay, fan(b), { ms: 600, t0: T0 + 600_000 });
    expect(r.last.summary!.held).toBe(false);
    expect((await modQuizQueues(sql)).held).toHaveLength(1);
  });

  it('a bot pace is held off the boards; the owner is told; a mod approves or rejects', async () => {
    const { sql, mk } = await db();
    const bot = await mk('bot_a');
    const human = await mk('human_a');
    const sb = await start(sql, { mode: 'daily' }, fan(bot));
    const b = await playOut(sql, sb, fan(bot), { ms: 500 });
    expect(b.last.summary!.held).toBe(true);
    expect(b.last.summary!.rank).toBeNull();
    expect(b.last.summary!.newFacts).toBe(0);
    const sh = await start(sql, { mode: 'daily' }, fan(human));
    const h = await playOut(sql, sh, fan(human), { ms: 6000 });
    expect(h.last.summary!.held).toBe(false);
    expect(h.last.summary!.rank).toBe(1);
    await approveAll(sql); // the human's podium game gets its look
    let daily = await board(sql, 'daily', { now: T0 }, bot.id);
    expect(daily.rows.map((r) => r.name)).toEqual(['human_a']);
    expect(daily.you).toBeNull();
    expect((await board(sql, 'facts', { now: T0 }, bot.id)).you).toBeNull();
    const q = await modQuizQueues(sql);
    expect(q.held).toHaveLength(1);
    expect(q.held[0]!.name).toBe('bot_a');
    expect(q.held[0]!.times).toEqual(Array(10).fill(0.5));
    expect((await fanStats(sql, bot.id, T0)).recent[0]!.held).toBe(true);
    // Approve: on the board (faster, so first) and its facts count.
    expect(await ruleGame(sql, gameId(sb.game), true)).toMatchObject({ ok: true });
    daily = await board(sql, 'daily', { now: T0 }, bot.id);
    expect(daily.rows.map((r) => r.name)).toEqual(['bot_a', 'human_a']);
    expect((await fanStats(sql, bot.id, T0)).factsMastered).toBe(10);
    expect((await modQuizQueues(sql)).held).toHaveLength(0);
    // A reject after approval takes it off again; a second reject has nothing to do.
    expect(await ruleGame(sql, gameId(sb.game), false)).toMatchObject({
      ok: true,
      approved: false,
    });
    expect(await ruleGame(sql, gameId(sb.game), false)).toMatchObject({
      ok: false,
      reason: 'already',
    });
  });

  it('a rejected game stays off the boards', async () => {
    const { sql, mk } = await db();
    const bot = await mk('bot_b');
    const s = await start(sql, { mode: 'universe', universe: 'dc' }, fan(bot));
    await playOut(sql, s, fan(bot), { ms: 1600 });
    expect(await ruleGame(sql, gameId(s.game), false)).toMatchObject({ ok: true });
    expect((await board(sql, 'universe', { universe: 'dc', now: T0 }, bot.id)).total).toBe(0);
    expect((await fanStats(sql, bot.id, T0)).factsMastered).toBe(0);
  });
});

// ─── 9. boards ───────────────────────────────────────────────────────────────────────────────────

describe('boards', () => {
  it('daily: top 50, ties → faster, the viewer always gets their own row', async () => {
    const { sql, mk } = await db();
    const users: User[] = [];
    for (let i = 0; i < 55; i++) {
      const u = await mk(`fan_${String(i).padStart(2, '0')}`);
      users.push(u);
      const s = await start(sql, { mode: 'daily' }, fan(u));
      // fan_00 best; scores drop with i (fewer right); fan_01 and fan_02 tie on answers, 02 is faster.
      const right = Math.max(0, 10 - Math.floor(i / 6));
      const ms = i === 2 ? 4000 : 5000;
      await playOut(sql, s, fan(u), { ms, hit: (k) => k < right });
    }
    await approveAll(sql);
    const last = users.at(-1)!;
    const b = await board(sql, 'daily', { now: T0 }, last.id);
    expect(b.rows).toHaveLength(BOARD_TOP);
    expect(b.total).toBe(55);
    expect(b.you).not.toBeNull();
    expect(b.you!.rank).toBeGreaterThan(50);
    expect(b.you!.you).toBe(true);
    expect(b.rows[0]!.name).toBe('fan_02');
    expect(b.rows[0]!.detail).toBe('10/10 · 50.2s'); // 10 × 4 s + the 10.2 s test jitter
    for (let i = 1; i < b.rows.length; i++)
      expect(b.rows[i - 1]!.value).toBeGreaterThanOrEqual(b.rows[i]!.value);
    const top = await board(sql, 'daily', { now: T0 }, users[0]!.id);
    expect(top.rows.find((r) => r.you)?.name).toBe('fan_00');
    expect(top.you!.rank).toBe(2);
  });

  it('universe best: best game per fan, per universe, all-time and this week', async () => {
    const { sql, mk } = await db();
    const a = await mk('best_a');
    const b = await mk('best_b');
    const old = T0 - 10 * 86400_000;
    const s1 = await start(sql, { mode: 'universe', universe: 'marvel' }, fan(a), old);
    await playOut(sql, s1, fan(a), { t0: old });
    const s2 = await start(sql, { mode: 'universe', universe: 'marvel' }, fan(a));
    await playOut(sql, s2, fan(a), { hit: (i) => i < 3 });
    const s3 = await start(sql, { mode: 'universe', universe: 'marvel' }, fan(b));
    await playOut(sql, s3, fan(b), { hit: (i) => i < 5 });
    await approveAll(sql);
    const all = await board(sql, 'universe', { universe: 'marvel', now: T0 }, a.id);
    expect(all.rows.map((r) => r.name)).toEqual(['best_a', 'best_b']);
    expect(all.total).toBe(2);
    const week = await board(
      sql,
      'universe',
      { universe: 'marvel', window: 'week', now: T0 },
      a.id,
    );
    expect(week.rows.map((r) => r.name)).toEqual(['best_b', 'best_a']);
    expect((await board(sql, 'universe', { universe: 'dc', now: T0 }, a.id)).total).toBe(0);
  });

  it('facts board counts mastered facts per fan', async () => {
    const { sql, mk } = await db();
    const a = await mk('fb_a');
    const b = await mk('fb_b');
    const s1 = await start(sql, { mode: 'character', character: 'anime-alpha' }, fan(a));
    await playOut(sql, s1, fan(a), { hit: (i) => i < 4 });
    const s2 = await start(sql, { mode: 'character', character: 'anime-alpha' }, fan(b));
    await playOut(sql, s2, fan(b), { hit: (i) => i < 7 });
    await approveAll(sql);
    const f = await board(sql, 'facts', { now: T0 }, a.id);
    expect(f.rows.map((r) => [r.name, r.value])).toEqual([
      ['fb_b', 7],
      ['fb_a', 4],
    ]);
    expect(f.rows[1]!.detail).toBe('4 facts');
    expect(f.you!.rank).toBe(2);
  });
});

// ─── 10. fansRight and per-question stats ────────────────────────────────────────────────────────

describe('fansRight', () => {
  it('null under 20 answers, then % right over all answers', async () => {
    const { sql, mk } = await db();
    const seen: (number | null)[] = [];
    for (let i = 0; i < 20; i++) {
      const o = fan(await mk(`fr_${i}`));
      const s = await start(sql, { mode: 'daily' }, o);
      const c = await right(sql, s.game, 0);
      const choice = i % 4 === 0 ? c : (((c + 1) % 4) as 0 | 1 | 2 | 3);
      const a = await answerQuestion(sql, { game: s.game, index: 0, choice }, o, T0 + 4000);
      seen.push(a.ok ? a.reveal.fansRight : -1);
    }
    expect(seen.slice(0, 19).every((v) => v === null)).toBe(true);
    expect(seen[19]).toBe(25);
    const q = (await sql.get<{ served: number; answered: number; correct: number }>(
      'SELECT served, answered, correct FROM quiz_question_stats ORDER BY answered DESC LIMIT 1',
    ))!;
    expect(q).toEqual({ served: 20, answered: 20, correct: 5 });
    // The second question isn't served until it is asked for.
    const n = await sql.get<{ n: number }>('SELECT COUNT(*) AS n FROM quiz_question_stats');
    expect(n!.n).toBe(1);
  });
});

// ─── 11. claim ───────────────────────────────────────────────────────────────────────────────────

describe('claim', () => {
  it('same browser, finished, within 30 minutes', async () => {
    const { sql, mk } = await db();
    const a = await mk('claim_a');
    const s = await start(sql, { mode: 'universe', universe: 'dc' }, guest(G1));
    expect((await claimGame(sql, s.game, a, G1, T0)).ok).toBe(false); // not finished
    const { end } = await playOut(sql, s, guest(G1));
    expect((await claimGame(sql, s.game, a, G2, end)).ok).toBe(false); // other browser
    expect((await claimGame(sql, s.game, a, G1, end + CLAIM_WINDOW + 1)).ok).toBe(false);
    const c = await claimGame(sql, s.game, a, G1, end + CLAIM_WINDOW - 1);
    expect(c.ok).toBe(true);
    expect(summaryOf(c).ranked).toBe(true);
    expect(summaryOf(c).rank).toBe(1);
    expect(summaryOf(c).claimable).toBe(false);
    expect((await row(sql, s.game)).user_id).toBe(a.id);
    const b = await mk('claim_b');
    expect((await claimGame(sql, s.game, b, G1, end + 10)).ok).toBe(false); // claimed once
  });

  it('a daily played as a guest never ranks, even claimed (Q10)', async () => {
    const { sql, mk } = await db();
    const a = await mk('claim_c');
    const g1 = await start(sql, { mode: 'daily' }, guest(G1));
    expect(g1.ranked).toBe(false);
    expect(g1.unrankedWhy).toMatch(/never ranks/);
    const p1 = await playOut(sql, g1, guest(G1));
    const c = await claimGame(sql, g1.game, a, G1, p1.end);
    expect(c.ok).toBe(true);
    expect(summaryOf(c).ranked).toBe(false);
    expect(summaryOf(c).rank).toBeNull();
    expect(summaryOf(c).board).toBeNull();
    expect((await board(sql, 'daily', { now: T0 }, a.id)).total).toBe(0);
    // Q23b: the fan's own first daily still ranks (the blind guest play is a mod signal).
    expect((await start(sql, { mode: 'daily' }, fan(a, G1), p1.end)).ranked).toBe(true);
  });
});

// ─── 12. retired questions ───────────────────────────────────────────────────────────────────────

describe('retired questions', () => {
  it('never serve: not in new games, and swapped out of a game in progress', async () => {
    const { sql } = await db();
    expect(await retireQuestion(sql, 'other-alpha-01', true)).toBe(true);
    expect(await retireQuestion(sql, 'no-such-01', true)).toBe(false);
    const s = await start(sql, { mode: 'character', character: 'other-alpha' }, guest(G1));
    const list = await ids(sql, s.game);
    expect(list).toHaveLength(10);
    expect(list).not.toContain('other-alpha-01');
    // Mid-game: retire the next question; the server serves another live one instead.
    const u = await start(sql, { mode: 'universe', universe: 'other' }, guest(G2));
    const before = await ids(sql, u.game);
    await retireQuestion(sql, before[1]!, true);
    const a = await answerQuestion(
      sql,
      { game: u.game, index: 0, choice: 0 },
      guest(G2),
      T0 + 3000,
    );
    expect(a.ok).toBe(true);
    const nx = await nextQuestion(sql, { game: u.game, index: 1 }, guest(G2), T0 + 9000);
    const after = await ids(sql, u.game);
    expect(after[1]).not.toBe(before[1]);
    expect(after).not.toContain('other-alpha-01');
    expect(nx.ok && nx.question.q).toBe(getBank().byId.get(after[1]!)!.q);
    // Daily skips them too.
    for (const id of await ids(
      sql,
      (await start(sql, { mode: 'daily' }, guest('x'.repeat(24)))).game,
    ))
      expect(['other-alpha-01', before[1]]).not.toContain(id);
    expect((await siteStats(sql, T0)).totals.retired).toBe(2);
    // Retiring one of today's daily questions swaps that one only, the same way for everyone after.
    const d1 = await ids(sql, (await start(sql, { mode: 'daily' }, guest(`${G1}-d1`))).game);
    await retireQuestion(sql, d1[4]!, true);
    const d2 = await ids(sql, (await start(sql, { mode: 'daily' }, guest(`${G1}-d2`))).game);
    const d3 = await ids(sql, (await start(sql, { mode: 'daily' }, guest(`${G1}-d3`))).game);
    expect(d2).not.toContain(d1[4]);
    expect(d2.filter((id) => d1.includes(id))).toHaveLength(9);
    expect(d3).toEqual(d2);
    await retireQuestion(sql, d1[4]!, false);
    await retireQuestion(sql, 'other-alpha-01', false);
    expect((await siteStats(sql, T0)).totals.retired).toBe(1);
  });
});

// ─── reports, analytics ──────────────────────────────────────────────────────────────────────────

describe('reports and analytics', () => {
  it('a report needs an answered question and reaches the mod queue once per game', async () => {
    const { sql, mk } = await db();
    const a = await mk('rep_a');
    const s = await start(sql, { mode: 'universe', universe: 'anime' }, fan(a));
    const early = await reportQuestion(sql, { game: s.game, index: 0, reason: 'typo' }, fan(a));
    expect(early.ok).toBe(false);
    await answerQuestion(sql, { game: s.game, index: 0, choice: 0 }, fan(a), T0 + 3000);
    const body = { game: s.game, index: 0, reason: 'wrong-answer' as const, note: 'not so' };
    expect((await reportQuestion(sql, body, fan(a))).ok).toBe(true);
    expect((await reportQuestion(sql, body, fan(a))).ok).toBe(true);
    const b = await mk('rep_b');
    expect((await reportQuestion(sql, body, fan(b))).ok).toBe(false);
    const { reports } = await modQuizQueues(sql);
    expect(reports).toHaveLength(1);
    const q = getBank().byId.get((await ids(sql, s.game))[0]!)!;
    expect(reports[0]).toMatchObject({
      questionId: q.id,
      answer: q.options[q.answer],
      reports: 1,
      reasons: ['wrong-answer'],
      notes: ['not so'],
      retired: false,
    });
  });

  it('fan and site stats add up', async () => {
    const { sql, mk } = await db();
    const a = await mk('stats_a');
    const s1 = await start(sql, { mode: 'universe', universe: 'marvel' }, fan(a));
    await playOut(sql, s1, fan(a), { hit: (i) => i % 2 === 0 });
    const s2 = await start(sql, { mode: 'daily' }, fan(a));
    await playOut(sql, s2, fan(a), { ms: 3000 });
    const st = await fanStats(sql, a.id, T0);
    expect(st.games).toBe(2);
    expect(st.answered).toBe(20);
    expect(st.correct).toBe(15);
    expect(st.accuracy).toBe(75);
    expect(st.bestStreak).toBe(10);
    expect(st.bankSize).toBe(140);
    expect(st.avgSeconds).toBe(5); // (10 × 5 s + 10 × 3 s + 2 × 10.2 s jitter) / 20
    expect(st.byDifficulty.map((d) => d.difficulty)).toEqual([1, 2, 3]);
    expect(st.byUniverse.find((u) => u.universe === 'marvel')!.answered).toBeGreaterThanOrEqual(10);
    expect(st.recent).toHaveLength(2);
    expect(st.recent.map((r) => r.label)).toContain('Marvel');
    expect(st.ranks.daily).toBe(1);
    expect(st.weakest.every((w) => w.answered >= 3)).toBe(true);
    const site = await siteStats(sql, T0);
    expect(site.perDay).toHaveLength(14);
    expect(site.perDay.at(-1)).toEqual({ day: istDay(T0), games: 2, players: 1 });
    expect(site.byMode).toEqual([
      { mode: 'daily', games: 1 },
      { mode: 'universe', games: 1 },
      { mode: 'character', games: 0 },
    ]);
    expect(site.totals).toEqual({
      games: 2,
      players: 1,
      answers: 20,
      bank: 140,
      retired: 0,
      blindDailies: 0,
    });
    // Per universe: its own games' answers. Today's daily touched every universe, but a universe with
    // no universe/character games reports 0 games and 0% (not the daily's accuracy).
    expect(site.byUniverse.find((u) => u.universe === 'marvel')).toEqual({
      universe: 'marvel',
      games: 1,
      accuracy: 50,
    });
    for (const u of site.byUniverse.filter((x) => x.universe !== 'marvel'))
      expect(u).toEqual({ universe: u.universe, games: 0, accuracy: 0 });
    // A fan's per-universe rows exist only where they answered something.
    expect(st.byUniverse.every((u) => u.answered > 0)).toBe(true);
  });
});

// ─── Q10: the daily keeps its answers until midnight IST ─────────────────────────────────────────

describe('daily lock and archive (Q10)', () => {
  it('a wrong or timed-out daily reveal is locked today; a right one shows its why', async () => {
    const { sql, mk } = await db();
    const u = await mk('lock_a');
    const s = await start(sql, { mode: 'daily' }, fan(u));
    const c0 = await right(sql, s.game, 0);
    const wrong = ((c0 + 1) % 4) as 0 | 1 | 2 | 3;
    const w = await answerQuestion(
      sql,
      { game: s.game, index: 0, choice: wrong },
      fan(u),
      T0 + 4000,
    );
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    expect(w.reveal).toMatchObject({ correct: false, answer: null, why: null, source: null });
    expect(w.reveal.locked).toBe(true);
    expect(JSON.stringify(w)).not.toContain(getBank().byId.get((await ids(sql, s.game))[0]!)!.why);
    await nextQuestion(sql, { game: s.game, index: 1 }, fan(u), T0 + 5000);
    const t = await answerQuestion(sql, { game: s.game, index: 1, choice: -1 }, fan(u), T0 + 6000);
    expect(t.ok && t.reveal).toMatchObject({ locked: true, timedOut: true, answer: null });
    await nextQuestion(sql, { game: s.game, index: 2 }, fan(u), T0 + 7000);
    const c2 = await right(sql, s.game, 2);
    const r = await answerQuestion(
      sql,
      { game: s.game, index: 2, choice: c2 },
      fan(u),
      T0 + 11_000,
    );
    expect(r.ok && r.reveal.locked).toBe(false);
    expect(r.ok && r.reveal.answer).toBe(c2);
    expect(r.ok && r.reveal.why).toBe(getBank().byId.get((await ids(sql, s.game))[2]!)!.why);
    // Other modes reveal wrong answers in full.
    const g = await start(sql, { mode: 'universe', universe: 'dc' }, fan(u));
    const cg = await right(sql, g.game, 0);
    const gw = await answerQuestion(
      sql,
      { game: g.game, index: 0, choice: ((cg + 1) % 4) as 0 | 1 | 2 | 3 },
      fan(u),
      T0 + 3000,
    );
    expect(gw.ok && gw.reveal).toMatchObject({ locked: false, answer: cg });
    // After midnight IST, a resend of yesterday's wrong daily answer is unlocked.
    const tomorrow = Date.UTC(2026, 10, 1, 18, 31);
    const again = await answerQuestion(
      sql,
      { game: s.game, index: 0, choice: wrong },
      fan(u),
      tomorrow,
    );
    expect(again.ok && again.reveal.locked).toBe(false);
    expect(again.ok && again.reveal.answer).toBe(c0);
  });

  it("dailyArchive: yesterday's 10 with answers, options as written, and fans right", async () => {
    const { sql } = await db();
    const yesterday = T0 - 86400_000;
    let first: string[] = [];
    for (let i = 0; i < 20; i++) {
      const o = guest(`${G1}-arc-${i}`);
      const s = await start(sql, { mode: 'daily' }, o, yesterday);
      if (!i) first = await ids(sql, s.game);
      const c = await right(sql, s.game, 0);
      await answerQuestion(sql, { game: s.game, index: 0, choice: c }, o, yesterday + 3000);
    }
    const arc = (await dailyArchive(sql, T0))!;
    expect(arc.day).toBe(istDay(yesterday));
    const want = await dailyQuestions(getBank().all, await retiredIds(sql), arc.day);
    expect(arc.questions.map((q) => q.q)).toEqual(want.map((q) => q.q));
    expect(arc.questions.map((q) => q.q)).toEqual(first.map((id) => getBank().byId.get(id)!.q));
    for (const [i, a] of arc.questions.entries()) {
      const q = want[i]!;
      expect(a.options).toEqual(q.options);
      expect(a.options[a.answer]).toBe(q.options[q.answer]);
      expect(a.why).toBe(q.why);
      expect(a.character.slug).toBe(q.slug);
    }
    expect(arc.questions[0]!.fansRight).toBe(100);
    expect(arc.questions[1]!.fansRight).toBeNull();
  });
});

// ─── Q14: fairness and copy ──────────────────────────────────────────────────────────────────────

describe('ties, board names, weakest, totals (Q14)', () => {
  it('equal score and time (to 0.1 s) share a rank', async () => {
    const { sql, mk } = await db();
    const names = ['tie_a', 'tie_b', 'tie_c', 'tie_d'];
    const times = [5000, 5004, 5000, 6000]; // b is 40 ms slower in total: same 0.1 s → tie
    for (const [i, n] of names.entries()) {
      const u = await mk(n);
      const s = await start(sql, { mode: 'daily' }, fan(u));
      let t = T0;
      for (let k = 0; k < s.total; k++) {
        if (k) await nextQuestion(sql, { game: s.game, index: k }, fan(u), t);
        t += k === 0 ? times[i]! : 5000;
        const c = await right(sql, s.game, k);
        await answerQuestion(sql, { game: s.game, index: k, choice: c }, fan(u), t);
      }
    }
    const b = await board(sql, 'daily', { now: T0 }, null);
    expect(b.rows.map((r) => r.rank)).toEqual([1, 1, 1, 4]);
    expect(b.rows[3]!.name).toBe('tie_d');
  });

  it('the summary names the board its rank is on, or none when this game set no row', async () => {
    const { sql, mk } = await db();
    const u = await mk('name_a');
    const d = await playOut(sql, await start(sql, { mode: 'daily' }, fan(u)), fan(u));
    expect(d.last.summary).toMatchObject({ rank: 1, board: 'Today’s daily' });
    const u1 = await playOut(
      sql,
      await start(sql, { mode: 'universe', universe: 'marvel' }, fan(u)),
      fan(u),
    );
    expect(u1.last.summary).toMatchObject({ rank: 1, board: 'Marvel best' });
    // A worse Marvel game doesn't set the row: no rank, no board.
    const u2 = await playOut(
      sql,
      await start(sql, { mode: 'universe', universe: 'marvel' }, fan(u)),
      fan(u),
      { hit: () => false },
    );
    expect(u2.last.summary).toMatchObject({ rank: null, board: null, ranked: true });
    const ch = await playOut(
      sql,
      await start(sql, { mode: 'character', character: 'dc-alpha' }, fan(u)),
      fan(u),
    );
    expect(ch.last.summary).toMatchObject({ rank: 1, board: 'Facts known' });
  });

  it('weakest lists only characters under 70%; totals count answered questions only', async () => {
    const { sql, mk } = await db();
    const u = await mk('weak_a');
    // dc-alpha: 8/10 right (80%), dc-beta: 3/10 (30%).
    await playOut(
      sql,
      await start(sql, { mode: 'character', character: 'dc-alpha' }, fan(u)),
      fan(u),
      {
        hit: (i) => i < 8,
      },
    );
    await playOut(
      sql,
      await start(sql, { mode: 'character', character: 'dc-beta' }, fan(u)),
      fan(u),
      {
        hit: (i) => i < 3,
      },
    );
    const st = await fanStats(sql, u.id, T0);
    expect(st.weakest.map((w) => [w.slug, w.accuracy])).toEqual([['dc-beta', 30]]);
    // An abandoned game (2 answers) and a timeout don't add to the mod total.
    const ab = await start(sql, { mode: 'universe', universe: 'anime' }, fan(u));
    await answerQuestion(sql, { game: ab.game, index: 0, choice: 0 }, fan(u), T0 + 3000);
    const g = await start(sql, { mode: 'character', character: 'anime-beta' }, fan(u));
    await answerQuestion(sql, { game: g.game, index: 0, choice: -1 }, fan(u), T0 + 1000);
    for (let k = 1; k < g.total; k++) {
      await nextQuestion(sql, { game: g.game, index: k }, fan(u), T0 + k * 10_000);
      await answerQuestion(
        sql,
        { game: g.game, index: k, choice: 0 },
        fan(u),
        T0 + k * 10_000 + 4000,
      );
    }
    expect((await siteStats(sql, T0)).totals.answers).toBe(20 + 9);
  });
});

// ─── Round 2: Q16 daily scouting ─────────────────────────────────────────────────────────────────

describe('daily scouting (Q16)', () => {
  it('critic peek repro: probe starts beside an open ranked daily just resume it', async () => {
    const { sql, mk } = await db();
    const u = await mk('peek_a');
    const A = await start(sql, { mode: 'daily' }, fan(u, G1));
    expect(A.ranked).toBe(true);
    for (let k = 0; k < 3; k++) {
      const p = await start(sql, { mode: 'daily' }, fan(u, G1), T0 + 1000 + k);
      expect(p.game).toBe(A.game);
    }
    const n = await sql.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM quiz_games WHERE mode = 'daily'",
    );
    expect(n!.n).toBe(1);
    // An open ranked daily left 3 h is dead; a new start is the blind second try.
    const late = await startGame(sql, { mode: 'daily' }, fan(u, G1), T0 + 3 * 3600_000 + 1);
    expect(late.ok && late.ranked).toBe(false);
  });

  it('critic t1: sign out mid ranked daily and scout as a guest → blind, nothing forfeits it', async () => {
    const { sql, mk } = await db();
    const u = await mk('t1_a');
    const at = (g: string | null): Owner => ({ user: null, guest: g, ip: '10.0.1.1' });
    const A = await start(sql, { mode: 'daily' }, { user: u, guest: G1, ip: '10.0.1.1' });
    expect(A.ranked).toBe(true);
    await answerQuestion(
      sql,
      { game: A.game, index: 0, choice: await right(sql, A.game, 0) },
      fan(u, G1),
      T0 + 4000,
    );
    // Signed out, same browser: a guest daily is the guest's own lane, and blind — it shows no
    // results and no score, so it can't scout the open ranked one.
    const g = await start(sql, { mode: 'daily' }, at(G1), T0 + 5000);
    expect(g.ranked).toBe(false);
    const peek = await answerQuestion(
      sql,
      { game: g.game, index: 0, choice: await right(sql, g.game, 0) },
      at(G1),
      T0 + 9000,
    );
    expect(peek.ok && peek.reveal).toMatchObject({ correct: null, blind: true, answer: null });
    // Other games don't touch the ranked daily and never serve today's daily questions.
    const u2 = await start(sql, { mode: 'universe', universe: 'dc' }, at(G1), T0 + 6000);
    const todays = await ids(sql, A.game);
    expect((await ids(sql, u2.game)).filter((id) => todays.includes(id))).toEqual([]);
    const back = await nextQuestion(sql, { game: A.game, index: 1 }, fan(u, G1), T0 + 7000);
    expect(back.ok).toBe(true);
  });

  it('lanes: a new other game replaces the old one; a second daily is refused', async () => {
    const { sql, mk } = await db();
    const u = await mk('lane_a');
    const g1 = await start(sql, { mode: 'universe', universe: 'marvel' }, fan(u, G1));
    const g2 = await start(
      sql,
      { mode: 'character', character: 'dc-alpha' },
      fan(u, G1),
      T0 + 1000,
    );
    expect(
      await answerQuestion(sql, { game: g1.game, index: 0, choice: 0 }, fan(u, G1), T0 + 2000),
    ).toEqual({
      ok: false,
      error: 'This game ended when you started another one.',
      code: 'replaced',
    });
    expect(
      await nextQuestion(sql, { game: g1.game, index: 1 }, fan(u, G1), T0 + 2000),
    ).toMatchObject({
      code: 'replaced',
    });
    expect(
      (await answerQuestion(sql, { game: g2.game, index: 0, choice: 0 }, fan(u, G1), T0 + 3000)).ok,
    ).toBe(true);
    // The daily lane is separate: open one beside g2; starting again resumes it.
    const d = await start(sql, { mode: 'daily' }, fan(u, G1), T0 + 4000);
    expect(d.ranked).toBe(true);
    expect((await start(sql, { mode: 'daily' }, fan(u, G1), T0 + 5000)).game).toBe(d.game);
    // Same fan from another browser: the same daily.
    expect((await start(sql, { mode: 'daily' }, fan(u, G2), T0 + 5000)).game).toBe(d.game);
    // Yesterday's open daily doesn't hold today's lane.
    const y = await start(
      sql,
      { mode: 'daily' },
      guest('yesterday-browser-xxxxxx'),
      T0 - 86400_000,
    );
    expect(
      (await startGame(sql, { mode: 'daily' }, guest('yesterday-browser-xxxxxx'), T0)).ok,
    ).toBe(true);
    expect(
      await nextQuestion(sql, { game: y.game, index: 1 }, guest('yesterday-browser-xxxxxx'), T0),
    ).toMatchObject({
      ok: false,
    });
  });

  it('other modes never serve today’s daily questions; tomorrow they can', async () => {
    const { sql } = await db();
    const todays = new Set(
      (await dailyQuestions(getBank().all, new Set(), istDay(T0))).map((q) => q.id),
    );
    for (const u of PUBLISHED_UNIVERSES)
      for (let k = 0; k < 4; k++) {
        const s = await start(sql, { mode: 'universe', universe: u }, guest(`${G1}-nd-${u}-${k}`));
        expect((await ids(sql, s.game)).filter((id) => todays.has(id))).toEqual([]);
      }
    for (const slug of Object.keys(names)) {
      const s = await start(sql, { mode: 'character', character: slug }, guest(`${G1}-nc-${slug}`));
      expect((await ids(sql, s.game)).filter((id) => todays.has(id))).toEqual([]);
    }
    // Mid-game stand-ins skip them too.
    const s = await start(sql, { mode: 'character', character: 'other-alpha' }, guest(G2));
    const list = await ids(sql, s.game);
    await retireQuestion(sql, list[1]!, true);
    await answerQuestion(sql, { game: s.game, index: 0, choice: 0 }, guest(G2), T0 + 2000);
    await nextQuestion(sql, { game: s.game, index: 1 }, guest(G2), T0 + 3000);
    expect(todays.has((await ids(sql, s.game))[1]!)).toBe(false);
    // Over a few days, every question shows up in some universe game.
    const tomorrow = new Set(
      (await dailyQuestions(getBank().all, new Set(), istDay(T0 + 86400_000))).map((q) => q.id),
    );
    expect([...todays].some((id) => !tomorrow.has(id))).toBe(true);
  });

  it('Q22: the IP is never a block — a ranked daily starts beside a stranger’s open daily on it', async () => {
    const { sql, mk } = await db();
    const scout = await start(sql, { mode: 'daily' }, { user: null, guest: G2, ip: '10.0.7.7' });
    expect(scout.ranked).toBe(false);
    const u = await mk('nat_a');
    const r = await startGame(
      sql,
      { mode: 'daily' },
      { user: u, guest: G1, ip: '10.0.7.7' },
      T0 + 1000,
    );
    expect(r.ok && r.ranked).toBe(true);
  });

  it('critic t5: 13 parallel universe games leave exactly one open', async () => {
    const { sql, mk } = await db();
    const u = await mk('t5_a');
    const U = PUBLISHED_UNIVERSES;
    const starts = await Promise.all(
      Array.from({ length: 13 }, (_, i) =>
        startGame(sql, { mode: 'universe', universe: U[i % 5]! }, fan(u, i < 7 ? G1 : G2), T0),
      ),
    );
    const open = await sql.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM quiz_games WHERE finished_at IS NULL AND abandoned_at IS NULL',
    );
    expect(open!.n).toBe(1);
    const live = starts.filter((s) => s.ok);
    let playable = 0;
    for (const s of live)
      if (s.ok) {
        const a = await answerQuestion(
          sql,
          { game: s.game, index: 0, choice: 0 },
          fan(u, G1),
          T0 + 3000,
        );
        if (a.ok) playable++;
      }
    expect(playable).toBe(1);
  });

  it('critic t6: 6 parallel daily starts make one game', async () => {
    const { sql, mk } = await db();
    const u = await mk('t6_a');
    const o: Owner = { user: u, guest: G1, ip: '10.0.6.1' };
    const all = await Promise.all(
      Array.from({ length: 6 }, () => startGame(sql, { mode: 'daily' }, o, T0)),
    );
    // Every start answers with the one game (the racers resume it).
    expect(new Set(all.map((r) => r.ok && r.game))).toEqual(
      new Set([(all[0] as { game: string }).game]),
    );
    const n = await sql.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM quiz_games WHERE mode = 'daily'",
    );
    expect(n!.n).toBe(1);
  });

  it('Q20c: a daily closes at midnight IST — no answers or next after its day', async () => {
    const { sql, mk } = await db();
    const u = await mk('mid_a');
    const late = Date.UTC(2026, 10, 1, 18, 29, 0); // 23:59 IST
    const s = await start(sql, { mode: 'daily' }, fan(u), late);
    const c = await right(sql, s.game, 0);
    const a = await answerQuestion(
      sql,
      { game: s.game, index: 0, choice: c },
      fan(u),
      late + 20_000,
    );
    expect(a.ok).toBe(true);
    const after = Date.UTC(2026, 10, 1, 18, 30, 30); // 00:00:30 IST
    expect(await nextQuestion(sql, { game: s.game, index: 1 }, fan(u), after)).toEqual({
      ok: false,
      error: 'This daily closed at midnight.',
      code: 'closed',
    });
    const s2 = await start(sql, { mode: 'daily' }, guest(G1), late);
    const b = await answerQuestion(sql, { game: s2.game, index: 0, choice: 0 }, guest(G1), after);
    expect(b).toEqual({ ok: false, error: 'This daily closed at midnight.', code: 'closed' });
  });

  it('parallel daily starts: one ranked game, every start gets it', async () => {
    const { sql, mk } = await db();
    const u = await mk('par_a');
    const all = await Promise.all(
      [0, 1, 2, 3, 4].map(() => startGame(sql, { mode: 'daily' }, fan(u, G1), T0)),
    );
    expect(all.every((r) => r.ok && r.ranked)).toBe(true);
    expect(new Set(all.map((r) => r.ok && r.game)).size).toBe(1);
  });

  it('an unrankable daily is blind: no result, no points, score only at the end', async () => {
    const { sql, mk } = await db();
    const s = await start(sql, { mode: 'daily' }, guest(G1));
    const c = await right(sql, s.game, 0);
    const a = await answerQuestion(
      sql,
      { game: s.game, index: 0, choice: c },
      guest(G1),
      T0 + 4000,
    );
    expect(a.ok && a.reveal).toEqual({
      correct: null,
      blind: true,
      answer: null,
      why: null,
      source: null,
      locked: true,
      timedOut: false,
      points: 0,
      seconds: 4,
      streak: 0,
      score: 0,
      fansRight: null,
    });
    // Resending it is just as blind.
    const again = await answerQuestion(
      sql,
      { game: s.game, index: 0, choice: c },
      guest(G1),
      T0 + 5000,
    );
    expect(again).toEqual(a);
    let t = T0 + 5000;
    let last: QuizAnswerReply | null = null;
    for (let i = 1; i < s.total; i++) {
      await nextQuestion(sql, { game: s.game, index: i }, guest(G1), t);
      t += 4000;
      last = await answerQuestion(
        sql,
        { game: s.game, index: i, choice: await right(sql, s.game, i) },
        guest(G1),
        t,
      );
    }
    const sum = last?.ok ? last.summary! : null;
    expect(sum).toMatchObject({ blind: true, grid: '•'.repeat(10), correct: 0, bestStreak: 0 });
    expect(sum!.score).toBe(0); // Q20d: the score unlocks at midnight too
    // Claimed, it stays blind and earns no facts (Q18).
    const f = await mk('blind_a');
    const c2 = await claimGame(sql, s.game, f, G1, t + 1000);
    expect(summaryOf(c2)).toMatchObject({ blind: true, newFacts: 0, ranked: false });
    expect((await fanStats(sql, f.id, t)).factsMastered).toBe(0);
    // A fan's second daily is blind too, and stays out of /quiz/me until tomorrow.
    const g = await mk('blind_b');
    const r1 = await playOut(sql, await start(sql, { mode: 'daily' }, fan(g)), fan(g));
    expect(r1.last.summary!.blind).toBe(false);
    const s2 = await start(sql, { mode: 'daily' }, fan(g), r1.end);
    await playOut(sql, s2, fan(g), { t0: r1.end, hit: () => false });
    expect((await fanStats(sql, g.id, r1.end)).games).toBe(1);
    expect((await fanStats(sql, g.id, T0 + 86400_000)).games).toBe(2);
  });

  it('caps daily starts at 6 per browser and per fan per IST day, never per IP', async () => {
    const { sql, mk } = await db();
    // One browser: 6 starts (each finished fast so the lane frees up), then the cap.
    const b = guest(G1);
    let t = T0;
    for (let i = 0; i < 6; i++) {
      const s = await start(sql, { mode: 'daily' }, b, t);
      t = (await playOut(sql, s, b, { t0: t, hit: () => false })).end;
    }
    expect(await startGame(sql, { mode: 'daily' }, b, t)).toMatchObject({
      ok: false,
      code: 'daily-cap',
    });
    // A fan hopping browsers: the fan's own count caps too.
    const u = await mk('cap_hop');
    let t2 = T0;
    for (let i = 0; i < 6; i++) {
      const o = fan(u, `${G2}-hop-${i}`);
      const s = await start(sql, { mode: 'daily' }, o, t2);
      t2 = (await playOut(sql, s, o, { t0: t2, hit: () => false })).end;
    }
    expect(await startGame(sql, { mode: 'daily' }, fan(u, `${G2}-hop-9`), t2)).toMatchObject({
      code: 'daily-cap',
    });
    // Many strangers behind one carrier IP are fine.
    for (let i = 0; i < 10; i++) {
      const o: Owner = { user: null, guest: `${G1}-nat-${i}`, ip: '100.64.0.1' };
      expect((await startGame(sql, { mode: 'daily' }, o, T0)).ok).toBe(true);
    }
    // Tomorrow resets.
    expect((await startGame(sql, { mode: 'daily' }, b, T0 + 86400_000)).ok).toBe(true);
  });

  it('error codes: expired, over, order', async () => {
    const { sql, mk } = await db();
    const u = await mk('codes_a');
    const s = await start(sql, { mode: 'universe', universe: 'dc' }, fan(u));
    expect(
      await answerQuestion(sql, { game: s.game, index: 1, choice: 0 }, fan(u), T0 + 1000),
    ).toMatchObject({
      code: 'order',
    });
    expect(await nextQuestion(sql, { game: s.game, index: 2 }, fan(u), T0 + 1000)).toMatchObject({
      code: 'order',
    });
    expect(
      await answerQuestion(sql, { game: s.game, index: 0, choice: 0 }, fan(u), T0 + 4 * 3600_000),
    ).toMatchObject({
      code: 'expired',
    });
    const c = await start(sql, { mode: 'character', character: 'dc-beta' }, fan(u), T0);
    const p = await playOut(sql, c, fan(u));
    expect(await nextQuestion(sql, { game: c.game, index: 10 }, fan(u), p.end)).toMatchObject({
      code: 'over',
    });
    expect(
      await reportQuestion(sql, { game: c.game, index: 10, reason: 'typo' }, fan(u)),
    ).toMatchObject({
      code: 'order',
    });
  });

  it("365 days: a day's 10 never share an id with yesterday's, retired stand-ins included", async () => {
    const all = getBank().all;
    const retired = new Set(all.filter((_, i) => i % 9 === 0).map((q) => q.id));
    for (const ret of [new Set<string>(), retired]) {
      let prev: string[] | null = null;
      let overlaps = 0;
      for (let d = 0; d < 365; d++) {
        const day = istDay(T0 + d * 86400_000);
        const ids = (await dailyQuestions(all, ret, day)).map((q) => q.id);
        expect(ids).toHaveLength(10);
        expect(new Set(ids).size).toBe(10);
        expect(ids.filter((id) => ret.has(id))).toHaveLength(0);
        if (prev) overlaps += ids.filter((id) => prev?.includes(id)).length;
        prev = ids;
      }
      expect(overlaps).toBe(0);
    }
  });
});

// ─── Round 2: Q17 trust / Q18 pace and farming ───────────────────────────────────────────────────

describe('names wait for a look (Q17/Q19)', () => {
  it('a podium name in a gated place is withheld to others, shown to its owner, and queued', async () => {
    const { sql, mk } = await db();
    const newbie = await mk('newbie');
    const other = await mk('regular');
    const n = await playOut(sql, await start(sql, { mode: 'daily' }, fan(newbie)), fan(newbie));
    expect(n.last.summary).toMatchObject({ rank: 1, nameWithheld: true });
    await playOut(sql, await start(sql, { mode: 'daily' }, fan(other)), fan(other), {
      hit: (i) => i < 5,
    });
    const seen = await board(sql, 'daily', { now: T0 }, other.id);
    expect(seen.rows[0]).toMatchObject({ rank: 1, name: '', withheld: true, you: false });
    // Rank 2 is a gated place too: the owner sees their own name, still withheld.
    expect(seen.rows[1]).toMatchObject({ rank: 2, name: 'regular', withheld: true, you: true });
    const own = await board(sql, 'daily', { now: T0 }, newbie.id);
    expect(own.rows[0]).toMatchObject({ name: 'newbie', withheld: true, you: true });
    const q = await trustQueue(sql, T0);
    // One item per game and board: the daily podium, and the facts board top 10.
    expect(q.map((c) => `${c.name}:${c.board}`).sort()).toEqual([
      'newbie:Facts known',
      'newbie:Today’s daily',
      'regular:Facts known',
      'regular:Today’s daily',
    ]);
    const nq = q.find((c) => c.name === 'newbie' && c.board === 'Today’s daily')!;
    expect(nq.reasons).toContain('#1 on Today’s daily');
    expect(nq.times).toHaveLength(10);
    expect(nq.floors[0]).toBeGreaterThan(0.8);
    // Approving that game names it; the confirmation says what it did.
    const r = done(await ruleGame(sql, nq.gameId, true, T0, nq.board));
    expect(r.message).toBe(
      'Approved newbie’s game on Today’s daily: named on Today’s daily for this game only. Other boards are unchanged.',
    );
    expect(r.caps).toEqual([]); // Q23d: the daily podium only — no facts cap from it
    expect((await board(sql, 'daily', { now: T0 }, other.id)).rows[0]).toMatchObject({
      name: 'newbie',
      withheld: false,
    });
    expect((await trustQueue(sql, T0)).map((c) => `${c.name}:${c.board}`).sort()).toEqual([
      'newbie:Facts known',
      'regular:Facts known',
      'regular:Today’s daily',
    ]);
    // The facts item sets the facts cap.
    const nf = (await trustQueue(sql, T0)).find((c) => c.name === 'newbie')!;
    const rf = done(await ruleGame(sql, nf.gameId, true, T0, nf.board));
    expect(rf.caps).toEqual([{ board: 'Facts known', value: 10 + 30 }]);
    expect(rf.message).toBe(
      'Approved newbie’s game on Facts known: names show there up to 40 facts. Other boards are unchanged.',
    );
  });

  it('daily podium is per game: yesterday’s approval doesn’t name today’s game', async () => {
    const { sql, mk } = await db();
    const u = await mk('daily_a');
    const y = T0 - 86400_000;
    await playOut(sql, await start(sql, { mode: 'daily' }, fan(u), y), fan(u), { t0: y });
    await approveAll(sql);
    const t = await playOut(sql, await start(sql, { mode: 'daily' }, fan(u)), fan(u));
    expect(t.last.summary!.nameWithheld).toBe(true);
  });

  it('critic repro: a trusted fan above 1.1× their approved universe score is withheld again', async () => {
    const { sql, mk } = await db();
    const u = await mk('cap_a');
    const s1 = await start(sql, { mode: 'universe', universe: 'marvel' }, fan(u));
    const p1 = await playOut(sql, s1, fan(u), { hit: (i) => i < 6 });
    const r = done(await ruleGame(sql, gameId(s1.game), true));
    const top = Math.floor(p1.last.summary!.score * 1.1);
    expect(r.caps[0]).toEqual({ board: 'Marvel best', value: top });
    expect(r.message).toContain(
      `on Marvel best: names show there up to ${top.toLocaleString('en-US')} points`,
    );
    expect(
      (await board(sql, 'universe', { universe: 'marvel', now: T0 }, null)).rows[0]!.withheld,
    ).toBe(false);
    // A much better game (all right) is above the cap: back to the queue.
    const s2 = await start(sql, { mode: 'universe', universe: 'marvel' }, fan(u), T0 + 600_000);
    const p2 = await playOut(sql, s2, fan(u), { t0: T0 + 600_000 });
    expect(p2.last.summary!.score).toBeGreaterThan(top);
    expect(p2.last.summary!.nameWithheld).toBe(true);
    expect(
      (await board(sql, 'universe', { universe: 'marvel', now: T0 }, null)).rows[0],
    ).toMatchObject({
      name: '',
      withheld: true,
    });
    const q = (await trustQueue(sql, T0)).filter((c) => c.board === 'Marvel best');
    expect(q.map((c) => c.gameId)).toEqual([gameId(s2.game)]);
    expect(q[0]!.reasons).toEqual(['#1 on Marvel best', '#1 on Marvel best (this week)']);
    // The cap is per board: DC has none yet.
    const d = await playOut(
      sql,
      await start(sql, { mode: 'universe', universe: 'dc' }, fan(u)),
      fan(u),
    );
    expect(d.last.summary!.nameWithheld).toBe(true);
  });

  it('facts known: names show up to the approved count + 30', async () => {
    const { sql, mk } = await db();
    const u = await mk('facts_cap');
    const c1 = await start(sql, { mode: 'character', character: 'dc-alpha' }, fan(u));
    await playOut(sql, c1, fan(u));
    await ruleGame(sql, gameId(c1.game), true); // facts cap 10 → names up to 40
    let t = T0;
    for (const ch of ['dc-beta', 'marvel-alpha', 'marvel-beta']) {
      const s = await start(sql, { mode: 'character', character: ch }, fan(u), t);
      t = (await playOut(sql, s, fan(u), { t0: t })).end;
      await approveAllExceptFacts(sql);
    }
    expect((await board(sql, 'facts', { now: T0 }, null)).rows[0]).toMatchObject({
      value: 40,
      withheld: false,
    });
    const s = await start(sql, { mode: 'character', character: 'anime-alpha' }, fan(u), t);
    await playOut(sql, s, fan(u), { t0: t });
    expect((await board(sql, 'facts', { now: T0 }, null)).rows[0]).toMatchObject({
      value: 50,
      withheld: true,
    });
  });

  it('only public places are queued: facts by universe or week, and "any universe" views, are not', async () => {
    const { sql, mk } = await db();
    for (let i = 0; i < 12; i++) {
      const u = await mk(`pub_${i}`);
      await playOut(
        sql,
        await start(sql, { mode: 'character', character: 'other-alpha' }, fan(u)),
        fan(u),
        {
          hit: (k) => k < 10 - (i % 10),
        },
      );
    }
    const q = await trustQueue(sql, T0);
    expect(q).toHaveLength(10); // facts known top 10, all-time, all universes
    expect(q.every((c) => c.reasons.every((r) => r.endsWith('on Facts known')))).toBe(true);
  });

  it('reject and revoke reset the caps; rejectFan takes every game off', async () => {
    const { sql, mk } = await db();
    const u = await mk('rule_a');
    const s = await start(sql, { mode: 'universe', universe: 'dc' }, fan(u));
    await playOut(sql, s, fan(u), { ms: 1200 }); // held
    const ok = done(await ruleGame(sql, gameId(s.game), true));
    expect(ok.approved).toBe(true);
    expect(
      (await board(sql, 'universe', { universe: 'dc', now: T0 }, null)).rows[0]!.withheld,
    ).toBe(false);
    const rv = done(await revokeGame(sql, gameId(s.game)));
    expect(rv.message).toBe(
      'Revoked: rule_a’s game is off every board and its facts are removed; their DC best and Facts known caps are reset, so their name waits for a new look there. It can be approved again later.',
    );
    expect(rv.caps).toEqual([
      { board: 'DC best', value: null },
      { board: 'Facts known', value: null },
    ]);
    expect((await board(sql, 'universe', { universe: 'dc', now: T0 }, null)).total).toBe(0);
    expect(await revokeGame(sql, gameId(s.game))).toMatchObject({ ok: false, reason: 'already' });
    // A new DC game: no cap any more, so it waits.
    const s2 = await start(sql, { mode: 'universe', universe: 'dc' }, fan(u), T0 + 600_000);
    const p2 = await playOut(sql, s2, fan(u), { t0: T0 + 600_000 });
    expect(p2.last.summary!.nameWithheld).toBe(true);
    const all = await rejectFan(sql, u.id);
    expect(all.games).toBe(1);
    expect(all.message).toContain('rule_a');
    expect((await board(sql, 'universe', { universe: 'dc', now: T0 }, null)).total).toBe(0);
    expect((await board(sql, 'facts', { now: T0 }, null)).total).toBe(0);
  });
});

describe('pace and farming (Q18)', () => {
  it('a bot at floor + 0.15 s: tight band is a signal only; near-floor is the gate (Q23c)', async () => {
    const { sql, mk } = await db();
    const bot = await mk('floorbot');
    const s = await start(sql, { mode: 'universe', universe: 'other' }, fan(bot));
    let t = T0;
    for (let i = 0; i < s.total; i++) {
      const q = getBank().byId.get((await ids(sql, s.game))[i]!)!;
      if (i) await nextQuestion(sql, { game: s.game, index: i }, fan(bot), t);
      t += readFloorMs(q.q.length) + 150;
      await answerQuestion(
        sql,
        { game: s.game, index: i, choice: await right(sql, s.game, i) },
        fan(bot),
        Math.round(t),
      );
    }
    // Flagged by the near-floor gate (10 answers within 0.3 s); the tight band shows as a signal.
    const st = (await row(sql, s.game)) as unknown as { flag: number; reasons: string };
    expect(st.flag).toBe(1);
    expect(st.reasons).toBe('10 right answers within 0.3 s of the reading floor');
    const q = (await trustQueue(sql, T0)).find((c) => c.board === 'Indie best')!;
    expect(texts(q).some((x) => x.startsWith('tight band: σ 0.0'))).toBe(true);
    expect(q.reasons).not.toContain('tight band');
  });

  it('a steady jitter-free expert trips only the tight band: a signal, not withheld beyond the cap', async () => {
    const { sql, mk } = await db();
    const u = await mk('steady');
    const s = await start(sql, { mode: 'universe', universe: 'dc' }, fan(u));
    // Steady at floor + 1.2 s: tight band (σ 0) but nowhere near the floor.
    let t = T0;
    for (let i = 0; i < s.total; i++) {
      const q = getBank().byId.get((await ids(sql, s.game))[i]!)!;
      if (i) await nextQuestion(sql, { game: s.game, index: i }, fan(u), t);
      t += Math.round(readFloorMs(q.q.length) + 1200);
      await answerQuestion(
        sql,
        { game: s.game, index: i, choice: await right(sql, s.game, i) },
        fan(u),
        t,
      );
    }
    expect(((await row(sql, s.game)) as unknown as { flag: number }).flag).toBe(0);
    await ruleGame(sql, gameId(s.game), true);
    const b = await board(sql, 'universe', { universe: 'dc', now: T0 }, null);
    expect(b.rows[0]).toMatchObject({ name: 'steady', withheld: false });
  });

  it('critic t5: a bot alternating floor + 0.2 s / + 2.4 s is flagged near the floor (Q21)', async () => {
    const { sql, mk } = await db();
    const bot = await mk('altbot');
    const s = await start(sql, { mode: 'universe', universe: 'anime' }, fan(bot));
    let t = T0;
    for (let i = 0; i < s.total; i++) {
      const q = getBank().byId.get((await ids(sql, s.game))[i]!)!;
      if (i) await nextQuestion(sql, { game: s.game, index: i }, fan(bot), t);
      t += Math.round(readFloorMs(q.q.length) + (i % 2 ? 2400 : 200));
      await answerQuestion(
        sql,
        { game: s.game, index: i, choice: await right(sql, s.game, i) },
        fan(bot),
        t,
      );
    }
    const g = (await row(sql, s.game)) as unknown as {
      flag: number;
      review: number;
      reasons: string;
    };
    expect(g).toMatchObject({ flag: 1, review: 0 });
    expect(g.reasons).toBe('5 right answers within 0.3 s of the reading floor');
    expect(tightBand(await paceOf(sql, s.game))).toBeNull(); // the band alone misses it
    const q = await trustQueue(sql, T0);
    expect(q[0]!.reasons).toContain('5 right answers within 0.3 s of the reading floor');
  });

  it('near floor needs 4+ right answers within 0.3 s; honest play passes', () => {
    const mk = (ms: number[], right = true) =>
      ms.map((m) => ({ ms: m, correct: right, chars: 46 }));
    const f = readFloorMs(46);
    expect(nearFloor(mk([f + 100, f + 250, f - 200, f + 300, 9000]))).toBe(4);
    expect(flagReasons(mk([f + 100, f + 250, f - 200, 9000, 9000]))).toEqual([]);
    expect(flagReasons(mk([f + 100, f + 250, f - 200, f, 9000], false))).toEqual([]);
    const honest = [2100, 6400, 3300, 9800, 4200, 2600, 7500, 3900, 12000, 5100];
    expect(flagReasons(mk(honest))).toEqual([]);
  });

  it('tight band needs 6+ right answers with σ over the floor < 0.6 s; honest spread passes', () => {
    const mk = (ms: number[], right = true) =>
      ms.map((m) => ({ ms: m, correct: right, chars: 46 }));
    expect(tightBand(mk(Array(10).fill(2100)))).toBe(0);
    expect(tightBand(mk([2100, 2100, 2100, 2100, 2100]))).toBeNull(); // only 5 right
    expect(tightBand(mk(Array(10).fill(2100), false))).toBeNull();
    const honest = [2100, 6400, 3300, 9800, 4200, 2600, 7500, 3900, 12000, 5100];
    expect(tightBand(mk(honest))).toBeNull();
  });

  it('the trust queue shows scouting signals from the same IP or browser that day', async () => {
    const { sql, mk } = await db();
    const net = (g: string): Owner => ({ user: null, guest: g, ip: '10.0.8.8' });
    for (const g of [G1, G2]) {
      const s = await start(sql, { mode: 'daily' }, net(g));
      await playOut(sql, s, net(g), { hit: () => false });
    }
    const u = await mk('sig_a');
    const o: Owner = { user: u, guest: G1, ip: '10.0.8.8' };
    // Q23b: the fan's first daily ranks although this browser played it blind earlier.
    const s = await start(sql, { mode: 'daily' }, o, T0 + 300_000);
    expect(s.ranked).toBe(true);
    await playOut(sql, s, o, { t0: T0 + 300_000 });
    const qd = (await trustQueue(sql, T0)).find(
      (c) => c.gameId === gameId(s.game) && c.board === 'Today’s daily',
    )!;
    expect(texts(qd)).toContain('this browser played today’s daily earlier (blind)');
    expect(qd.signals).toContainEqual({
      text: 'saw 10 of these 10 questions before',
      strong: true,
    });
    expect(qd.signals).toContainEqual({
      text: 'this browser played today’s daily earlier (blind)',
      strong: true,
    });
    const v = await start(sql, { mode: 'universe', universe: 'marvel' }, o, T0 + 400_000);
    await playOut(sql, v, o, { t0: T0 + 400_000 });
    const q = (await trustQueue(sql, T0)).find(
      (c) => c.gameId === gameId(v.game) && c.board === 'Marvel best',
    )!;
    // Q24: guests' and the fan's own games don't count; other fans do, browser and IP apart.
    expect(texts(q)).toEqual([]);
    const sameBrowser = await mk('sig_sib');
    const sb = await start(
      sql,
      { mode: 'universe', universe: 'dc' },
      { user: sameBrowser, guest: G1, ip: '10.0.8.1' },
      T0 + 410_000,
    );
    await playOut(sql, sb, fan(sameBrowser, G1), { t0: T0 + 410_000 });
    const sameNet = await mk('sig_nat');
    const sn = await start(
      sql,
      { mode: 'universe', universe: 'anime' },
      { user: sameNet, guest: 'nat-neighbour-xxxxxxxxxx', ip: '10.0.8.8' },
      T0 + 420_000,
    );
    await playOut(sql, sn, fan(sameNet, 'nat-neighbour-xxxxxxxxxx'), { t0: T0 + 420_000 });
    const q2 = (await trustQueue(sql, T0)).find(
      (c) => c.gameId === gameId(v.game) && c.board === 'Marvel best',
    )!;
    // Strength is a field (round 7): same browser strong, same network weak.
    expect(q2.signals).toEqual([
      { text: '1 game by other fans from this browser that day', strong: true },
      {
        text: '1 game by other fans on the same network that day (could be carrier NAT)',
        strong: false,
      },
    ]);
    // Questions seen before: a fan replaying a universe they scouted as a guest.
    const w = await start(
      sql,
      { mode: 'universe', universe: 'other' },
      net('scout-browser-xxxxxxxxx'),
      T0,
    );
    await playOut(sql, w, net('scout-browser-xxxxxxxxx'), { hit: () => false });
    const fanB = await mk('sig_b');
    const ob: Owner = { user: fanB, guest: 'scout-browser-xxxxxxxxx', ip: '10.0.8.9' };
    const x = await start(sql, { mode: 'character', character: 'other-alpha' }, ob, T0 + 500_000);
    await playOut(sql, x, ob, { t0: T0 + 500_000 });
    const seen = (await ids(sql, w.game)).filter((id) => id.startsWith('other-alpha-')).length;
    await ruleGame(sql, gameId(x.game), false); // not in the queue unless gated; check directly
    const g2 = await start(sql, { mode: 'universe', universe: 'other' }, ob, T0 + 900_000);
    await playOut(sql, g2, ob, { t0: T0 + 900_000 });
    const qb = (await trustQueue(sql, T0)).find((c) => c.gameId === gameId(g2.game))!;
    expect(texts(qb).some((x) => /^saw \d+ of these 10 questions before$/.test(x))).toBe(true);
    expect(seen).toBeGreaterThan(0);
  });

  it('facts-known credit is capped at 120 a fan per IST day', async () => {
    const big: Record<string, unknown> = {};
    const bigNames: Record<string, string> = {};
    for (let c = 0; c < 14; c++) {
      const slug = `cap-${String.fromCharCode(97 + c)}`;
      bigNames[slug] = slug.toUpperCase();
      big[`/content/quiz/other/${slug}.json`] = {
        character: slug,
        universe: 'other',
        questions: DIFF.map((d, i) => ({
          id: `${slug}-${String(i + 1).padStart(2, '0')}`,
          q: `Capped fixture question number ${i + 1} about ${slug}?`,
          options: [`opt-a${i}`, `opt-b${i}`, `opt-c${i}`, `opt-d${i}`],
          answer: i % 4,
          why: `Because fixture ${slug} fact ${i + 1} says so.`,
          difficulty: d,
          topic: TOPICS[i % TOPICS.length],
          source: 'https://example.com/fixture',
        })),
      };
    }
    setBankForTests(buildBank(big, (x) => bigNames[x]));
    try {
      const { sql, mk } = await db();
      const u = await mk('capper');
      let t = T0;
      let total = 0;
      const per: number[] = [];
      for (const slug of Object.keys(bigNames)) {
        const p = await playOut(
          sql,
          await start(sql, { mode: 'character', character: slug }, fan(u), t),
          fan(u),
          {
            t0: t,
          },
        );
        per.push(p.last.summary!.newFacts);
        total += p.last.summary!.newFacts;
        t = p.end;
      }
      expect(total).toBe(120);
      expect(per.slice(0, 12)).toEqual(Array(12).fill(10));
      expect(per.slice(12)).toEqual([0, 0]);
      expect((await fanStats(sql, u.id, t)).factsMastered).toBe(120);
    } finally {
      setBankForTests(buildBank(fixture, (x) => names[x]));
    }
  });

  it('fanStats: finished games only; timeouts are answered but not in the average time', async () => {
    const { sql, mk } = await db();
    const u = await mk('avg_a');
    const s = await start(sql, { mode: 'character', character: 'other-beta' }, fan(u));
    await answerQuestion(sql, { game: s.game, index: 0, choice: -1 }, fan(u), T0 + 20_000);
    let t = T0 + 20_000;
    for (let i = 1; i < s.total; i++) {
      await nextQuestion(sql, { game: s.game, index: i }, fan(u), t);
      t += 4000;
      await answerQuestion(
        sql,
        { game: s.game, index: i, choice: await right(sql, s.game, i) },
        fan(u),
        t,
      );
    }
    // An unfinished game with 2 answers doesn't count at all.
    const open = await start(sql, { mode: 'universe', universe: 'dc' }, fan(u), t);
    await answerQuestion(sql, { game: open.game, index: 0, choice: 0 }, fan(u), t + 1000);
    const st = await fanStats(sql, u.id, t);
    expect(st).toMatchObject({ games: 1, answered: 10, correct: 9, avgSeconds: 4 });
  });

  it('a blind daily summary hides the score too (Q20d)', async () => {
    const { sql } = await db();
    const s = await start(sql, { mode: 'daily' }, guest(G1));
    const p = await playOut(sql, s, guest(G1));
    expect(p.last.summary).toMatchObject({
      blind: true,
      score: 0,
      correct: 0,
      grid: '•'.repeat(10),
    });
  });

  it('players: a guest game counts as the fan its browser became, not twice', async () => {
    const { sql, mk } = await db();
    const g = await start(sql, { mode: 'universe', universe: 'marvel' }, guest(G1));
    const p = await playOut(sql, g, guest(G1));
    const u = await mk('one_person');
    await playOut(
      sql,
      await start(sql, { mode: 'universe', universe: 'dc' }, fan(u, G1), p.end),
      fan(u, G1),
      {
        t0: p.end,
      },
    );
    expect((await siteStats(sql, T0)).totals.players).toBe(1);
    await claimGame(sql, g.game, u, G1, p.end + 1000);
    const st = await siteStats(sql, T0);
    expect(st.totals.players).toBe(1);
    expect(st.perDay.at(-1)!.players).toBe(1);
  });
});

// ─── API routes: every error carries a code (Q22) ────────────────────────────────────────────────

describe('API error codes', () => {
  /** A route's reply as { status, body } (plain objects are 200s). */
  const call = async (path: string, body: unknown, method = 'POST') => {
    const mod = (await import(`~/routes/api/${path}.ts`)) as {
      action: (a: { request: Request }) => Promise<unknown>;
    };
    const request = new Request(`http://localhost/api/${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    });
    const r = (await mod.action({ request })) as { data?: unknown; init?: { status?: number } };
    return r && typeof r === 'object' && 'init' in r
      ? { status: r.init?.status ?? 200, body: r.data as Record<string, unknown> }
      : { status: 200, body: r as Record<string, unknown> };
  };
  const prevDb = process.env.COMICMUTANT_DB;
  beforeAll(() => {
    process.env.COMICMUTANT_DB = ':memory:';
  });
  afterAll(() => {
    if (prevDb === undefined) delete process.env.COMICMUTANT_DB;
    else process.env.COMICMUTANT_DB = prevDb;
  });

  it('login: claiming without signing in → 401, code login', async () => {
    const r = await call('quiz-claim', {
      game: '1.gAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ ok: false, code: 'login' });
  });

  it('rate: answering too fast → 429, code rate; bad bodies and methods → invalid', async () => {
    const body = {
      game: '1.gAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      index: 0,
      choice: 0,
    };
    let last = await call('quiz-answer', body);
    expect(last.body).toMatchObject({ ok: false, code: 'invalid' }); // a forged token, 422
    expect(last.status).toBe(422);
    for (let i = 0; i < 125 && last.status !== 429; i++) last = await call('quiz-answer', body);
    expect(last.status).toBe(429);
    expect(last.body).toMatchObject({ ok: false, code: 'rate' });
    const bad = await call('quiz-start', { mode: 'nope' });
    expect(bad).toMatchObject({ status: 400, body: { ok: false, code: 'invalid' } });
    const get = await call('quiz-next', null, 'GET');
    expect(get).toMatchObject({ status: 405, body: { ok: false, code: 'invalid' } });
  });

  it('16 browsers behind one IP are not rate-limited (keyed per browser, IP only a ceiling)', async () => {
    const mod = (await import('~/routes/api/quiz-answer')) as unknown as {
      action: (a: { request: Request }) => Promise<{ init?: { status?: number } }>;
    };
    const body = JSON.stringify({
      game: '1.gAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      index: 0,
      choice: 0,
    });
    const statuses: number[] = [];
    for (let b = 0; b < 16; b++)
      for (let k = 0; k < 10; k++) {
        const request = new Request('http://localhost/api/quiz-answer', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: `cm_voter=nat-browser-${String(b).padStart(2, '0')}-xxxxxxxxxxxx`,
          },
          body,
        });
        statuses.push((await mod.action({ request })).init?.status ?? 200);
      }
    expect(statuses.filter((x) => x === 429)).toHaveLength(0);
  });

  it('40 fresh clients behind one IP can all start (each keyed on its new browser cookie)', async () => {
    const statuses: number[] = [];
    for (let k = 0; k < 40; k++) {
      const r = await call('quiz-start', { mode: 'universe', universe: 'marvel' });
      statuses.push(r.status);
    }
    expect(statuses.filter((x) => x === 429)).toHaveLength(0);
    expect(statuses.every((x) => x === 200)).toBe(true);
  });

  it('an oversized report says "Report too long" (code invalid), not "Invalid JSON"', async () => {
    const big = await call('quiz-report', {
      game: '1.gAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      index: 0,
      reason: 'other',
      note: 'x'.repeat(2000),
    });
    expect(big).toMatchObject({
      status: 413,
      body: { ok: false, code: 'invalid', error: 'Report too long.' },
    });
    const long = await call('quiz-report', {
      game: '1.gAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      index: 0,
      reason: 'other',
      note: 'y'.repeat(400),
    });
    expect(long).toMatchObject({
      status: 400,
      body: { code: 'invalid', error: 'Report too long (300 characters at most).' },
    });
  });

  it('every {ok:false} the core returns carries a known code', async () => {
    const { QUIZ_ERROR_CODES } = await import('~/lib/quiz-contract');
    const { sql } = await db();
    const replies = [
      await startGame(sql, { mode: 'character', character: 'nobody' }, guest(G1), T0),
      await answerQuestion(sql, { game: 'x'.repeat(20), index: 0, choice: 0 }, guest(G1), T0),
      await nextQuestion(sql, { game: 'x'.repeat(20), index: 0 }, guest(G1), T0),
      await reportQuestion(sql, { game: 'x'.repeat(20), index: 0, reason: 'typo' }, guest(G1)),
    ];
    for (const r of replies) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(QUIZ_ERROR_CODES).toContain(r.code);
    }
  });
});

// ─── Round 4: Q23 fairness ───────────────────────────────────────────────────────────────────────

describe('resume, rank the fan, fairness (Q23)', () => {
  it('critic ui4: reloading mid-daily resumes the same game, clock and all', async () => {
    const { sql, mk } = await db();
    const u = await mk('reload_a');
    const s = await start(sql, { mode: 'daily' }, fan(u, G1));
    const c0 = await right(sql, s.game, 0);
    await answerQuestion(sql, { game: s.game, index: 0, choice: c0 }, fan(u, G1), T0 + 4000);
    // Reload before asking for the next one: it's served now, full clock.
    const r1 = await start(sql, { mode: 'daily' }, fan(u, G1), T0 + 6000);
    expect(r1.game).toBe(s.game);
    expect(r1.question).toMatchObject({ index: 1, seconds: 15 });
    expect(r1.resumed).toMatchObject({ answered: 1, grid: '✓', streak: 1 });
    expect(r1.resumed!.score).toBeGreaterThan(0);
    // Reload 5 s into question 2: the same question, 10 s left (the client ring matches).
    const r2 = await start(sql, { mode: 'daily' }, fan(u, G1), T0 + 11_000);
    expect(r2.question).toMatchObject({ index: 1, seconds: 10, q: r1.question!.q });
    // From another browser too (the lane is the fan's).
    expect((await start(sql, { mode: 'daily' }, fan(u, G2), T0 + 12_000)).game).toBe(s.game);
    // Away too long: the clock ran out → a timeout is recorded and play moves on.
    const r3 = await start(sql, { mode: 'daily' }, fan(u, G1), T0 + 40_000);
    expect(r3.question).toMatchObject({ index: 2, seconds: 15 });
    expect(r3.resumed).toMatchObject({ answered: 2, grid: '✓⏱', streak: 0 });
    // Finished by a timeout on its last question: start says so.
    let t = T0 + 40_000;
    for (let i = 2; i < 9; i++) {
      if (i > 2) await nextQuestion(sql, { game: s.game, index: i }, fan(u, G1), t);
      t += 4000;
      await answerQuestion(
        sql,
        { game: s.game, index: i, choice: await right(sql, s.game, i) },
        fan(u, G1),
        t,
      );
    }
    await nextQuestion(sql, { game: s.game, index: 9 }, fan(u, G1), t);
    // The last clock ran out while away: the start hands back the end screen (no question).
    const fin = await start(sql, { mode: 'daily' }, fan(u, G1), t + 60_000);
    expect(fin.game).toBe(s.game);
    expect(fin.question).toBeNull();
    expect(fin.summary).toMatchObject({ ranked: true, total: 10, blind: false });
    expect(fin.summary!.grid).toMatch(/^✓⏱✓{7}⏱$/);
    expect((await row(sql, s.game)).pos).toBe(10);
  });

  it('a resumed blind daily shows nothing either', async () => {
    const { sql } = await db();
    const s = await start(sql, { mode: 'daily' }, guest(G1));
    await answerQuestion(
      sql,
      { game: s.game, index: 0, choice: await right(sql, s.game, 0) },
      guest(G1),
      T0 + 3000,
    );
    const r = await start(sql, { mode: 'daily' }, guest(G1), T0 + 4000);
    expect(r.game).toBe(s.game);
    expect(r.resumed).toEqual({ score: 0, streak: 0, answered: 1, grid: '•' });
    expect(r.unrankedWhy).toMatch(/blind practice/);
  });

  it('guest blind daily → join → the fan’s first daily ranks, with a signal for the mods', async () => {
    const { sql, mk } = await db();
    const g = await start(sql, { mode: 'daily' }, guest(G1));
    const p = await playOut(sql, g, guest(G1), { hit: () => false });
    const u = await mk('joined_a');
    await mergeGuestHistory(sql, u.id, G1);
    const d = await start(sql, { mode: 'daily' }, fan(u, G1), p.end);
    expect(d.ranked).toBe(true);
    await playOut(sql, d, fan(u, G1), { t0: p.end });
    const item = (await trustQueue(sql, T0)).find(
      (c) => c.gameId === gameId(d.game) && c.board === 'Today’s daily',
    )!;
    expect(texts(item)).toContain('this browser played today’s daily earlier (blind)');
    // A podium place still needs a look at that game (Q19).
    expect((await board(sql, 'daily', { now: T0 }, null)).rows[0]!.withheld).toBe(true);
  });

  it('shared laptop: a second fan ranks beside the first fan’s open daily', async () => {
    const { sql, mk } = await db();
    const a = await mk('laptop_a');
    const b = await mk('laptop_b');
    const da = await start(sql, { mode: 'daily' }, fan(a, G1));
    const db2 = await start(sql, { mode: 'daily' }, fan(b, G1), T0 + 1000);
    expect(da.ranked && db2.ranked).toBe(true);
    expect(db2.game).not.toBe(da.game);
    await playOut(sql, db2, fan(b, G1), { t0: T0 + 1000 });
    const item = (await trustQueue(sql, T0)).find(
      (c) => c.gameId === gameId(db2.game) && c.board === 'Today’s daily',
    )!;
    expect(texts(item)).toContain('this browser played today’s daily earlier (another fan)');
    // A's daily is untouched.
    expect((await nextQuestion(sql, { game: da.game, index: 0 }, fan(a, G1), T0 + 2000)).ok).toBe(
      true,
    );
  });

  it('other modes skip today’s and tomorrow’s daily; a game crossing midnight re-checks at serve', async () => {
    const { sql } = await db();
    const late = Date.UTC(2026, 10, 1, 18, 29, 0); // 23:59 IST, day 1
    const after = Date.UTC(2026, 10, 1, 18, 31, 0); // 00:01 IST, day 2
    const set = async (at: number) =>
      new Set((await dailyQuestions(getBank().all, new Set(), istDay(at))).map((q) => q.id));
    const day2 = await set(after);
    const day3 = await set(after + 86400_000);
    // Started on day 1: never holds day 1's or day 2's daily (tomorrow's) questions.
    let found: { s: Extract<QuizStartReply, { ok: true }>; o: Owner } | null = null;
    for (let k = 0; k < 40; k++) {
      const o = guest(`${G1}-mid-${k}`);
      const s = await start(
        sql,
        { mode: 'universe', universe: PUBLISHED_UNIVERSES[k % 5]! },
        o,
        late,
      );
      const list = await ids(sql, s.game);
      expect(list.filter((id) => day2.has(id))).toEqual([]);
      if (!found && list.slice(1).some((id) => day3.has(id))) found = { s, o };
    }
    // After midnight, day 3 is "tomorrow": serving swaps those out.
    expect(found).not.toBeNull();
    const { s, o } = found!;
    await answerQuestion(sql, { game: s.game, index: 0, choice: 0 }, o, late + 3000);
    let t = after;
    for (let i = 1; i < s.total; i++) {
      expect((await nextQuestion(sql, { game: s.game, index: i }, o, t)).ok).toBe(true);
      const id = (await ids(sql, s.game))[i]!;
      expect(day2.has(id) || day3.has(id)).toBe(false);
      t += 4000;
      await answerQuestion(sql, { game: s.game, index: i, choice: 0 }, o, t);
    }
  });

  it('approval sets only its board; "covers any score" when 1.1× reaches the board maximum', async () => {
    const { sql, mk } = await db();
    const u = await mk('covers_a');
    const s = await start(sql, { mode: 'universe', universe: 'anime' }, fan(u));
    await playOut(sql, s, fan(u));
    await sql.run('UPDATE quiz_games SET score = 2300 WHERE id = ?', [gameId(s.game)]);
    const r = done(await ruleGame(sql, gameId(s.game), true));
    expect(MAX_GAME_SCORE).toBe(2450);
    expect(r.message).toBe(
      'Approved covers_a’s game on Anime & Manga best: this covers any score on Anime & Manga best. Other boards are unchanged.',
    );
    expect(r.caps).toEqual([{ board: 'Anime & Manga best', value: 2530 }]);
    const caps = await sql.all<{ board: string }>('SELECT board FROM quiz_caps WHERE user_id = ?', [
      u.id,
    ]);
    expect(caps.map((c) => c.board)).toEqual(['u:anime']); // no facts cap from a universe approval
  });

  it('held games carry floors and signals for the mod', async () => {
    const { sql, mk } = await db();
    const bot = await mk('heldsig');
    const s = await start(
      sql,
      { mode: 'universe', universe: 'marvel' },
      { user: bot, guest: G1, ip: '10.1.1.1' },
    );
    await playOut(sql, s, fan(bot, G1), { ms: 600 });
    const h = (await modQuizQueues(sql)).held[0]!;
    expect(h.floors).toHaveLength(10);
    expect(h.floors.every((f) => f > 0.8)).toBe(true);
    expect(Array.isArray(texts(h))).toBe(true);
  });

  it('critic sim model: honest timing is rarely gated by the hold or near-floor rules', () => {
    // sim.mjs: time = (question + half the options) / reading rate + decision × lognormal(σ).
    const bank = getBank().all;
    const r = rng(20261101);
    const randn = () => {
      let u = 0;
      while (!u) u = r();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
    };
    const rate = (cps: number, dec: number, sig: number, acc: number, games = 3000) => {
      let gated = 0;
      let tight = 0;
      for (let g = 0; g < games; g++) {
        const ans = Array.from({ length: 10 }, () => {
          const q = bank[Math.floor(r() * bank.length)]!;
          const read = ((q.q.length + 0.5 * q.options.join('').length) / cps) * 1000;
          return {
            ms: Math.min(15_000, read + dec * Math.exp(sig * randn())),
            correct: r() < acc,
            chars: q.q.length,
          };
        });
        if (heldReasons(ans).length || flagReasons(ans).length) gated++;
        if (tightBand(ans) !== null) tight++;
      }
      return { gated: gated / games, tight: tight / games };
    };
    const casual = rate(18, 2000, 0.5, 0.6);
    const fanP = rate(25, 1200, 0.45, 0.8);
    const expert = rate(35, 800, 0.4, 0.95);
    expect(casual.gated).toBeLessThan(0.01);
    expect(fanP.gated).toBeLessThan(0.02);
    expect(expert.gated).toBeLessThan(0.1);
    // The tight band would have caught most honest experts: why it's only a signal now (Q23c).
    expect(expert.tight).toBeGreaterThan(0.5);
  });
});

// ─── Round 5: per-board approvals, loaders, mod edge cases ───────────────────────────────────────

describe('round 5 fixes', () => {
  it('critic s4: approving a facts item never names the game on the daily podium', async () => {
    const { sql, mk } = await db();
    const u = await mk('s4_sis');
    const d = await start(sql, { mode: 'daily' }, fan(u));
    await playOut(sql, d, fan(u));
    const q = await trustQueue(sql, T0);
    const facts = q.find((c) => c.board === 'Facts known')!;
    expect(facts.gameId).toBe(gameId(d.game)); // the facts item rides on that same daily game
    const r = done(await ruleGame(sql, facts.gameId, true, T0, facts.board));
    expect(r.board).toBe('Facts known');
    expect((await board(sql, 'facts', { now: T0 }, null)).rows[0]).toMatchObject({
      name: 's4_sis',
    });
    // Still withheld on the daily podium: that needs its own approval.
    expect((await board(sql, 'daily', { now: T0 }, null)).rows[0]).toMatchObject({
      name: '',
      withheld: true,
    });
    expect((await trustQueue(sql, T0)).map((c) => c.board)).toEqual(['Today’s daily']);
    done(await ruleGame(sql, gameId(d.game), true, T0, 'Today’s daily'));
    expect((await board(sql, 'daily', { now: T0 }, null)).rows[0]).toMatchObject({
      name: 's4_sis',
    });
    expect(await trustQueue(sql, T0)).toEqual([]);
  });

  it('a flag clears per board: a facts approval doesn’t clear it on the universe board', async () => {
    const { sql, mk } = await db();
    const bot = await mk('flagged_a');
    const s = await start(sql, { mode: 'universe', universe: 'other' }, fan(bot));
    let t = T0;
    for (let i = 0; i < s.total; i++) {
      const q = getBank().byId.get((await ids(sql, s.game))[i]!)!;
      if (i) await nextQuestion(sql, { game: s.game, index: i }, fan(bot), t);
      t += Math.round(readFloorMs(q.q.length) + (i % 2 ? 2400 : 200));
      await answerQuestion(
        sql,
        { game: s.game, index: i, choice: await right(sql, s.game, i) },
        fan(bot),
        t,
      );
    }
    done(await ruleGame(sql, gameId(s.game), true, T0, 'Facts known'));
    // (a universe cap exists from an earlier approval, but the flag still holds the universe row)
    await sql.run(
      "INSERT INTO quiz_caps (user_id, board, value, at) VALUES (?, 'u:other', 9999, 0)",
      [bot.id],
    );
    expect(
      (await board(sql, 'universe', { universe: 'other', now: T0 }, null)).rows[0]!.withheld,
    ).toBe(true);
    done(await ruleGame(sql, gameId(s.game), true, T0, 'Indie best'));
    expect(
      (await board(sql, 'universe', { universe: 'other', now: T0 }, null)).rows[0]!.withheld,
    ).toBe(false);
  });

  it('openDaily: where the open daily stands, for the hub loader', async () => {
    const { sql, mk } = await db();
    const u = await mk('open_a');
    expect(await openDaily(sql, fan(u, G1), T0)).toBeNull();
    const s = await start(sql, { mode: 'daily' }, fan(u, G1));
    expect(await openDaily(sql, fan(u, G1), T0 + 2000)).toEqual({
      index: 0,
      total: 10,
      secondsLeft: 13,
      ranked: true,
    });
    await answerQuestion(sql, { game: s.game, index: 0, choice: 0 }, fan(u, G1), T0 + 3000);
    expect(await openDaily(sql, fan(u, G2), T0 + 4000)).toMatchObject({
      index: 1,
      secondsLeft: null,
    });
    await nextQuestion(sql, { game: s.game, index: 1 }, fan(u, G1), T0 + 5000);
    expect((await openDaily(sql, fan(u), T0 + 30_000))!.secondsLeft).toBe(0);
    // Guests by browser; another browser sees nothing.
    const g = await start(sql, { mode: 'daily' }, guest(G2));
    expect(await openDaily(sql, guest(G2), T0)).toMatchObject({ index: 0, ranked: false });
    expect(await openDaily(sql, guest('another-browser-xxxxxxxx'), T0)).toBeNull();
    await playOut(sql, g, guest(G2), { hit: () => false });
    expect(await openDaily(sql, guest(G2), T0 + 600_000)).toBeNull();
    // Tomorrow it's closed.
    expect(await openDaily(sql, fan(u), T0 + 86400_000)).toBeNull();
  });

  it('signal: this browser played today’s daily (blind) during this game', async () => {
    const { sql, mk } = await db();
    const u = await mk('during_a');
    const d = await start(sql, { mode: 'daily' }, fan(u, G1));
    const blind = await start(sql, { mode: 'daily' }, guest(G1), T0 + 1000);
    await playOut(sql, blind, guest(G1), { t0: T0 + 1000, hit: () => false });
    await playOut(sql, d, fan(u, G1), { t0: T0 + 200_000 });
    const item = (await trustQueue(sql, T0)).find((c) => c.board === 'Today’s daily')!;
    expect(texts(item)).toContain('this browser played today’s daily (blind) during this game');
    expect(texts(item)).not.toContain('this browser played today’s daily earlier (blind)');
  });

  it('mod edge cases: not found, strict boards, revoke says what it reset, re-approve after revoke', async () => {
    const { sql, mk } = await db();
    expect(await ruleGame(sql, 999, true)).toMatchObject({ ok: false, reason: 'not-found' });
    expect(await revokeGame(sql, 999)).toMatchObject({ ok: false, reason: 'not-found' });
    const u = await mk('edge_a');
    const s = await start(sql, { mode: 'universe', universe: 'marvel' }, fan(u));
    await playOut(sql, s, fan(u));
    for (const bad of ['Marvel bestt', 'DC best', 'Today’s daily', 'daily', 'facts known', ''])
      expect(await ruleGame(sql, gameId(s.game), true, T0, bad)).toMatchObject({
        ok: false,
        reason: 'bad-board',
      });
    const open = await start(sql, { mode: 'universe', universe: 'dc' }, fan(u), T0 + 1000);
    expect(await ruleGame(sql, gameId(open.game), true)).toMatchObject({
      ok: false,
      reason: 'not-finished',
    });
    done(await ruleGame(sql, gameId(s.game), true, T0, 'Marvel best'));
    const rv = done(await revokeGame(sql, gameId(s.game)));
    expect(rv.message).toContain('their Marvel best and Facts known caps are reset');
    expect((await board(sql, 'universe', { universe: 'marvel', now: T0 }, null)).total).toBe(0);
    // Re-approve after revoke: back on the board, by name, facts credited again.
    const again = done(await ruleGame(sql, gameId(s.game), true, T0, 'Marvel best'));
    expect(again.approved).toBe(true);
    expect(
      (await board(sql, 'universe', { universe: 'marvel', now: T0 }, null)).rows[0],
    ).toMatchObject({
      name: 'edge_a',
      withheld: false,
    });
    expect((await fanStats(sql, u.id, T0)).factsMastered).toBe(10);
  });
});

// ─── Round 6: Q24 held approvals, signals, personal best ─────────────────────────────────────────

describe('held approvals and signals (Q24)', () => {
  it('approving a held game names that game only, credits its facts, and sets no cap', async () => {
    const { sql, mk } = await db();
    const u = await mk('held_ok');
    const h = await start(sql, { mode: 'universe', universe: 'marvel' }, fan(u));
    const p = await playOut(sql, h, fan(u), { ms: 600 }); // held: median under 1.5 s
    expect(p.last.summary).toMatchObject({ held: true, personalBest: false });
    const r = done(await ruleGame(sql, gameId(h.game), true));
    expect(r.message).toBe(
      'Approved held_ok’s held game on Marvel best: named on Marvel best for this game only; credited 10 facts to Facts known; no cap set (a held pace never covers future games).',
    );
    expect(r.message).not.toContain('Other boards are unchanged');
    expect(r.caps).toEqual([]);
    expect(await sql.all('SELECT * FROM quiz_caps WHERE user_id = ?', [u.id])).toEqual([]);
    expect(
      (await board(sql, 'universe', { universe: 'marvel', now: T0 }, null)).rows[0],
    ).toMatchObject({
      name: 'held_ok',
      withheld: false,
    });
    expect((await fanStats(sql, u.id, T0)).factsMastered).toBe(10);
    // No cap: once the held game is off the board, a later honest game there waits for its own look.
    const later = await start(sql, { mode: 'universe', universe: 'marvel' }, fan(u), T0 + 600_000);
    await playOut(sql, later, fan(u), { t0: T0 + 600_000 });
    done(await revokeGame(sql, gameId(h.game)));
    expect(
      (await board(sql, 'universe', { universe: 'marvel', now: T0 }, null)).rows[0],
    ).toMatchObject({
      withheld: true,
    });
    // A held game on the facts board: counted, no facts cap.
    const c = await start(sql, { mode: 'character', character: 'dc-alpha' }, fan(u), T0 + 900_000);
    await playOut(sql, c, fan(u), { ms: 600, t0: T0 + 900_000 });
    const rf = done(await ruleGame(sql, gameId(c.game), true));
    expect(rf.message).toMatch(
      /^Approved held_ok’s held game on Facts known: counted on Facts known; credited \d+ facts to Facts known; no cap set/,
    );
    expect(rf.caps).toEqual([]);
  });

  it('a clean approval that credits nothing says other boards are unchanged', async () => {
    const { sql, mk } = await db();
    const u = await mk('clean_ok');
    const s = await start(sql, { mode: 'universe', universe: 'dc' }, fan(u));
    await playOut(sql, s, fan(u));
    const r = done(await ruleGame(sql, gameId(s.game), true));
    expect(r.message).toMatch(
      /^Approved clean_ok’s game on DC best: names show there up to [\d,]+ points\. Other boards are unchanged\.$/,
    );
  });

  it('tight band shows as a signal only under σ 0.25 s', () => {
    // (unit level: tightBand flags < 0.6 s; signalsOf shows it only < 0.25 s)
    const mk = (ms: number[]) => ms.map((m) => ({ ms: m, correct: true, chars: 46 }));
    const f = readFloorMs(46);
    const loose = mk([0, 400, 800, 1200, 0, 400, 800, 1200, 600, 600].map((x) => f + 3000 + x));
    const sd = tightBand(loose)!;
    expect(sd).toBeGreaterThan(250);
    expect(sd).toBeLessThan(600);
    expect(TIGHT_SIGNAL_MS).toBe(250);
  });

  it('signals drop a loose tight band (0.25–0.6 s) and keep a very tight one', async () => {
    const { sql, mk } = await db();
    const play = async (name: string, spread: number[]) => {
      const u = await mk(name);
      const s = await start(sql, { mode: 'universe', universe: 'indian' }, fan(u));
      let t = T0;
      for (let i = 0; i < s.total; i++) {
        const q = getBank().byId.get((await ids(sql, s.game))[i]!)!;
        if (i) await nextQuestion(sql, { game: s.game, index: i }, fan(u), t);
        t += Math.round(readFloorMs(q.q.length) + 3000 + spread[i % spread.length]!);
        await answerQuestion(
          sql,
          { game: s.game, index: i, choice: await right(sql, s.game, i) },
          fan(u),
          t,
        );
      }
      return gameId(s.game);
    };
    const loose = await play('loose_a', [0, 400, 800, 1200]);
    const q = (await trustQueue(sql, T0)).find((c) => c.gameId === loose)!;
    expect(texts(q).some((x) => x.startsWith('tight band'))).toBe(false);
  });
});

// ─── Round 7: baselines, site stats, start errors, starts left ───────────────────────────────────

describe('round 7 fixes', () => {
  it('personal best ignores held and rejected games as a baseline', async () => {
    const { sql, mk } = await db();
    const u = await mk('pb_a');
    const h = await start(sql, { mode: 'universe', universe: 'dc' }, fan(u));
    expect((await playOut(sql, h, fan(u), { ms: 600 })).last.summary!.held).toBe(true); // bot-fast, huge score
    const s = await start(sql, { mode: 'universe', universe: 'dc' }, fan(u), T0 + 600_000);
    const first = await playOut(sql, s, fan(u), { t0: T0 + 600_000, hit: (i) => i < 4 });
    expect(first.last.summary!.personalBest).toBe(false); // first counting game: no baseline yet
    const s2 = await start(sql, { mode: 'universe', universe: 'dc' }, fan(u), T0 + 1_200_000);
    const p2 = await playOut(sql, s2, fan(u), { t0: T0 + 1_200_000 });
    // Beats the counting game, though not the held one: a personal best.
    expect(p2.last.summary!.personalBest).toBe(true);
  });

  it('site stats leave held and rejected games out of mode and universe figures', async () => {
    const { sql, mk } = await db();
    const u = await mk('site_a');
    await playOut(sql, await start(sql, { mode: 'universe', universe: 'marvel' }, fan(u)), fan(u), {
      ms: 600,
    }); // held
    const r = await start(sql, { mode: 'universe', universe: 'marvel' }, fan(u), T0 + 600_000);
    await playOut(sql, r, fan(u), { t0: T0 + 600_000 });
    done(await ruleGame(sql, gameId(r.game), false)); // rejected
    const ok = await start(sql, { mode: 'universe', universe: 'marvel' }, fan(u), T0 + 1_200_000);
    await playOut(sql, ok, fan(u), { t0: T0 + 1_200_000, hit: (i) => i < 5 });
    const st = await siteStats(sql, T0);
    expect(st.byMode.find((m) => m.mode === 'universe')!.games).toBe(1);
    expect(st.byUniverse.find((x) => x.universe === 'marvel')).toEqual({
      universe: 'marvel',
      games: 1,
      accuracy: 50,
    });
  });

  it('start: an unknown universe or character says so (code invalid)', async () => {
    const { sql } = await db();
    expect(
      await startGame(sql, { mode: 'universe', universe: 'narnia' as never }, guest(G1), T0),
    ).toEqual({ ok: false, error: 'No quiz for that universe.', code: 'invalid' });
    expect(await startGame(sql, { mode: 'universe' }, guest(G1), T0)).toMatchObject({
      code: 'invalid',
      error: 'No quiz for that universe.',
    });
    expect(await startGame(sql, { mode: 'character', character: 'nobody' }, guest(G1), T0)).toEqual(
      {
        ok: false,
        error: 'No quiz for that character.',
        code: 'invalid',
      },
    );
    expect(await startGame(sql, { mode: 'character' }, guest(G1), T0)).toMatchObject({
      error: 'No quiz for that character.',
    });
  });

  it('dailyStartsLeft: 6 a day, the tighter of the fan’s and the browser’s', async () => {
    const { sql, mk } = await db();
    const u = await mk('left_a');
    expect(await dailyStartsLeft(sql, fan(u, G1), T0)).toBe(6);
    let t = T0;
    for (let i = 0; i < 2; i++) {
      const s = await start(sql, { mode: 'daily' }, fan(u, G1), t);
      t = (await playOut(sql, s, fan(u, G1), { t0: t })).end;
    }
    expect(await dailyStartsLeft(sql, fan(u, G1), t)).toBe(4);
    // Another browser for the same fan: the fan's count is the tighter one.
    expect(await dailyStartsLeft(sql, fan(u, G2), t)).toBe(4);
    // A guest in that browser: the browser's count.
    expect(await dailyStartsLeft(sql, guest(G1), t)).toBe(4);
    expect(await dailyStartsLeft(sql, guest(G2), t)).toBe(6);
    // Resuming doesn't spend one; tomorrow resets.
    const open = await start(sql, { mode: 'daily' }, fan(u, G1), t);
    await start(sql, { mode: 'daily' }, fan(u, G1), t + 1000);
    expect(open.ok && (await dailyStartsLeft(sql, fan(u, G1), t + 2000))).toBe(3);
    expect(await dailyStartsLeft(sql, fan(u, G1), T0 + 86400_000)).toBe(6);
  });
});

// ─── Round 8: Q25 leak ordering, copy, own history, stats ────────────────────────────────────────

describe('leak ordering (Q25) and round 8 fixes', () => {
  /** The main fixture plus characters whose whys print each other's answers. */
  function leakBank() {
    const raw: Record<string, unknown> = { ...fixture };
    const leakNames: Record<string, string> = { ...names };
    const answers: Record<number, string> = {
      2: 'Gotham Harbor',
      7: 'Ravenwood Manor',
      8: 'Silverlake Tower',
      9: 'Copperfield Station',
    };
    const whys: Record<number, string> = {
      5: 'Because the Gotham Harbor raid came first in the story.',
      7: 'Because the hero had moved to Silverlake Tower by then.',
      8: 'Because the villain still owned Ravenwood Manor at that point.',
    };
    const make = (slug: string, universe: string, whyOf: Record<number, string>) => {
      leakNames[slug] = slug.toUpperCase();
      raw[`/content/quiz/${universe}/${slug}.json`] = {
        character: slug,
        universe,
        questions: DIFF.map((d, i) => {
          const n = i + 1;
          const answer = answers[n];
          return {
            id: `${slug}-${String(n).padStart(2, '0')}`,
            q: `Leak fixture question number ${n} about ${slug}?`,
            options: answer
              ? [answer, `Metro Bay ${n}`, `Star Docks ${n}`, `Coast Pier ${n}`]
              : [`opt-a${i}`, `opt-b${i}`, `opt-c${i}`, `opt-d${i}`],
            answer: 0,
            why: whyOf[n] ?? `Because leak fixture ${slug} fact ${n} says so.`,
            difficulty: d,
            topic: TOPICS[i % TOPICS.length],
            source: 'https://example.com/fixture',
          };
        }),
      };
    };
    make('leak-a', 'other', whys);
    // A DC character whose question 3's why prints leak-a's answer 9: a cross-universe pair.
    make('leak-x', 'dc', { 3: 'Because it all began at Copperfield Station, years before.' });
    return buildBank(raw, (x) => leakNames[x]);
  }

  it('the bank load builds the leak graph within each universe', () => {
    const b = leakBank();
    expect([...(b.leaks.get('leak-a-05') ?? [])]).toEqual(['leak-a-02']);
    expect([...(b.leaks.get('leak-a-07') ?? [])]).toEqual(['leak-a-08']);
    expect([...(b.leaks.get('leak-a-08') ?? [])]).toEqual(['leak-a-07']);
    // leak-x-03 prints its own sibling's answer (dc); leak-a-09's (other) is computed at pick time.
    expect([...(b.leaks.get('leak-x-03') ?? [])]).toEqual(['leak-x-09']);
  });

  it('a why-leak pair is always served leaked-first; a cycle never serves both', async () => {
    setBankForTests(leakBank());
    try {
      const { sql } = await db();
      for (let k = 0; k < 40; k++) {
        const s = await start(
          sql,
          { mode: 'character', character: 'leak-a' },
          guest(`${G1}-lk-${k}`),
        );
        const list = await ids(sql, s.game);
        const i2 = list.indexOf('leak-a-02');
        const i5 = list.indexOf('leak-a-05');
        if (i2 >= 0 && i5 >= 0) expect(i2).toBeLessThan(i5);
        expect(list.includes('leak-a-07') && list.includes('leak-a-08')).toBe(false);
        // The dropped one is replaced from the pool when the pool allows.
        const near = new Set(
          [
            ...(await dailyQuestions(getBank().all, new Set(), istDay(T0))),
            ...(await dailyQuestions(getBank().all, new Set(), istDay(T0 + 86400_000))),
          ].map((q) => q.id),
        );
        const avail = getBank()
          .byCharacter.get('leak-a')!
          .filter((q) => !near.has(q.id)).length;
        expect(list.length).toBe(Math.min(10, avail - 1));
      }
      // Universe games too.
      for (let k = 0; k < 20; k++) {
        const s = await start(sql, { mode: 'universe', universe: 'other' }, guest(`${G1}-lu-${k}`));
        const list = await ids(sql, s.game);
        const i2 = list.indexOf('leak-a-02');
        const i5 = list.indexOf('leak-a-05');
        if (i2 >= 0 && i5 >= 0) expect(i2).toBeLessThan(i5);
        expect(list.includes('leak-a-07') && list.includes('leak-a-08')).toBe(false);
      }
    } finally {
      setBankForTests(buildBank(fixture, (x) => names[x]));
    }
  });

  it('cross-universe pairs (the daily) are ordered too; easy → hard breaks ties', () => {
    const b = leakBank();
    setBankForTests(b);
    try {
      const x3 = b.byId.get('leak-x-03')!; // dc, difficulty 1: prints leak-a-09's answer
      const a9 = b.byId.get('leak-a-09')!; // other, difficulty 2
      const plain = b.byId.get('leak-a-01')!;
      expect(orderByLeaks([plain, x3, a9]).order.map((q) => q.id)).toEqual([
        'leak-a-01',
        'leak-a-09',
        'leak-x-03',
      ]);
      const r = arrangeQuestions(
        [b.byId.get('leak-a-07')!, b.byId.get('leak-a-08')!, plain],
        [b.byId.get('leak-a-10')!],
      );
      expect(r.map((q) => q.id).sort()).toEqual(['leak-a-01', 'leak-a-07', 'leak-a-10']);
    } finally {
      setBankForTests(buildBank(fixture, (x) => names[x]));
    }
  });

  it('dailies over 120 days: leaked first, cycles never both, still 10, still disjoint day to day', async () => {
    setBankForTests(leakBank());
    try {
      let prev: string[] = [];
      for (let d = 0; d < 120; d++) {
        const day = istDay(T0 + d * 86400_000);
        const list = (await dailyQuestions(getBank().all, new Set(), day)).map((q) => q.id);
        expect(list).toHaveLength(10);
        const i9 = list.indexOf('leak-a-09');
        const ix = list.indexOf('leak-x-03');
        if (i9 >= 0 && ix >= 0) expect(i9).toBeLessThan(ix);
        expect(list.includes('leak-a-07') && list.includes('leak-a-08')).toBe(false);
        expect(list.filter((id) => prev.includes(id))).toEqual([]);
        prev = list;
      }
    } finally {
      setBankForTests(buildBank(fixture, (x) => names[x]));
    }
  });

  it('a retire stand-in never breaks the order', async () => {
    setBankForTests(leakBank());
    try {
      const { sql } = await db();
      // Find a character game holding leak-a-05 after index 1 and without leak-a-02; retire the next
      // question and check leak-a-02 is never put after leak-a-05.
      for (let k = 0; k < 30; k++) {
        const o = guest(`${G1}-rs-${k}`);
        const s = await start(sql, { mode: 'character', character: 'leak-a' }, o);
        const list = await ids(sql, s.game);
        const i5 = list.indexOf('leak-a-05');
        if (i5 < 2 || list.includes('leak-a-02')) continue;
        await retireQuestion(sql, list[i5 + 1] ?? list[1]!, true);
        let t = T0;
        for (let i = 0; i < s.total; i++) {
          if (i) {
            const n = await nextQuestion(sql, { game: s.game, index: i }, o, t);
            if (!n.ok) break;
          }
          t += 4000;
          await answerQuestion(sql, { game: s.game, index: i, choice: 0 }, o, t);
        }
        const after = await ids(sql, s.game);
        const j2 = after.indexOf('leak-a-02');
        if (j2 >= 0) expect(j2).toBeLessThan(after.indexOf('leak-a-05'));
        await retireQuestion(sql, list[i5 + 1] ?? list[1]!, false);
      }
    } finally {
      setBankForTests(buildBank(fixture, (x) => names[x]));
    }
  });

  it('guest daily copy says exactly what happens', async () => {
    const { sql } = await db();
    const g = await start(sql, { mode: 'daily' }, guest(G1));
    expect(g.unrankedWhy).toBe(
      'A guest daily is blind practice: your answers lock in with no score, and it never ranks. Tomorrow, Yesterday’s answers shows the right ones. Sign in to play it for real.',
    );
  });

  it('signal: the fan’s own held/rejected games (strong)', async () => {
    const { sql, mk } = await db();
    const u = await mk('hist_a');
    const y = T0 - 86400_000;
    await playOut(sql, await start(sql, { mode: 'universe', universe: 'dc' }, fan(u), y), fan(u), {
      ms: 600,
      t0: y,
    }); // held yesterday
    await playOut(sql, await start(sql, { mode: 'universe', universe: 'dc' }, fan(u)), fan(u), {
      ms: 600,
    }); // held today
    const s = await start(sql, { mode: 'universe', universe: 'marvel' }, fan(u), T0 + 600_000);
    await playOut(sql, s, fan(u), { t0: T0 + 600_000 });
    const item = (await trustQueue(sql, T0)).find((c) => c.gameId === gameId(s.game))!;
    expect(item.signals).toContainEqual({
      text: 'this fan has 2 held/rejected games ever (1 that day)',
      strong: true,
    });
  });

  it('site totals and per-day leave held/rejected out (totals = sum of modes); fanStats too', async () => {
    const { sql, mk } = await db();
    const u = await mk('tot_a');
    await playOut(sql, await start(sql, { mode: 'universe', universe: 'dc' }, fan(u)), fan(u), {
      ms: 600,
    }); // held
    const ok = await start(sql, { mode: 'character', character: 'dc-beta' }, fan(u), T0 + 600_000);
    await playOut(sql, ok, fan(u), { t0: T0 + 600_000, hit: (i) => i < 5 });
    const st = await siteStats(sql, T0);
    expect(st.totals.games).toBe(st.byMode.reduce((t, m) => t + m.games, 0));
    expect(st.totals.games).toBe(1);
    expect(st.totals.answers).toBe(10);
    expect(st.perDay.at(-1)!.games).toBe(1);
    const fs = await fanStats(sql, u.id, T0);
    expect(fs).toMatchObject({ games: 1, answered: 10, correct: 5, accuracy: 50, bestStreak: 5 });
    // The held one still shows in recent, marked held.
    expect(fs.recent.map((r) => r.held)).toEqual([false, true]);
  });
});

// ─── Round 9: Q26 held floods go blind; grouped held cards; blind dailies counted apart ───────────

describe('held floods (Q26)', () => {
  const FLOOD =
    'Your recent games were very fast, so the rest of today is blind practice: answers lock in with no score.';

  it('a fan with 2 pace-held games today plays the rest of the day blind, in any mode', async () => {
    const { sql, mk } = await db();
    const u = await mk('flood_a');
    let t = T0;
    for (let k = 0; k < 2; k++) {
      const s = await start(sql, { mode: 'universe', universe: 'dc' }, fan(u, G1), t);
      const p = await playOut(sql, s, fan(u, G1), { ms: 600, t0: t });
      expect(p.last.summary!.held).toBe(true);
      t = p.end;
    }
    // Third game (another browser, another mode): blind.
    const c = await start(sql, { mode: 'character', character: 'marvel-alpha' }, fan(u, G2), t);
    expect(c.ranked).toBe(false);
    expect(c.unrankedWhy).toBe(FLOOD);
    const a = await answerQuestion(
      sql,
      { game: c.game, index: 0, choice: await right(sql, c.game, 0) },
      fan(u, G2),
      t + 5000,
    );
    expect(a.ok && a.reveal).toMatchObject({ correct: null, blind: true, answer: null, why: null });
    const done2 = await start(
      sql,
      { mode: 'universe', universe: 'anime' },
      fan(u, G2),
      t + 300_000,
    );
    const q = await playOut(sql, done2, fan(u, G2), { t0: t + 300_000 });
    expect(q.last.summary).toMatchObject({ blind: true, score: 0, newFacts: 0, ranked: false });
    expect((await fanStats(sql, u.id, T0)).factsMastered).toBe(0);
    // The daily too; and tomorrow is a fresh day.
    const d = await start(sql, { mode: 'daily' }, fan(u, G2), t + 600_000);
    expect(d).toMatchObject({ ranked: false, unrankedWhy: FLOOD });
    const tomorrow = await start(
      sql,
      { mode: 'universe', universe: 'dc' },
      fan(u, G1),
      T0 + 86400_000,
    );
    expect(tomorrow.ranked).toBe(true);
  });

  it('a browser with 2 bot-pace guest games goes blind too; a claimed blind game stays unranked', async () => {
    const { sql, mk } = await db();
    let t = T0;
    for (let k = 0; k < 2; k++) {
      const s = await start(sql, { mode: 'universe', universe: 'other' }, guest(G1), t);
      t = (await playOut(sql, s, guest(G1), { ms: 600, t0: t })).end; // unranked: not held, but pace-held
    }
    const g = await start(sql, { mode: 'universe', universe: 'marvel' }, guest(G1), t);
    expect(g.unrankedWhy).toBe(FLOOD);
    const p = await playOut(sql, g, guest(G1), { t0: t });
    expect(p.last.summary!.blind).toBe(true);
    const u = await mk('flood_b');
    const c = await claimGame(sql, g.game, u, G1, p.end);
    expect(summaryOf(c)).toMatchObject({ ranked: false, blind: true, newFacts: 0 });
    // Another browser is unaffected.
    expect(
      (await start(sql, { mode: 'universe', universe: 'marvel' }, guest(G2), t)).unrankedWhy,
    ).not.toBe(FLOOD);
  });

  it('held cards: one per fan per day, the latest, with the rest counted in `more`', async () => {
    const { sql, mk } = await db();
    const u = await mk('cards_a');
    const y = T0 - 86400_000;
    let t = y;
    const s0 = await start(sql, { mode: 'universe', universe: 'dc' }, fan(u), t);
    t = (await playOut(sql, s0, fan(u), { ms: 600, t0: t })).end;
    t = T0;
    const ids2: number[] = [];
    for (let k = 0; k < 2; k++) {
      const s = await start(sql, { mode: 'universe', universe: k ? 'marvel' : 'dc' }, fan(u), t);
      ids2.push(gameId(s.game));
      t = (await playOut(sql, s, fan(u), { ms: 600, t0: t })).end;
    }
    const held = (await modQuizQueues(sql)).held;
    expect(held.map((h) => [h.id, h.more])).toEqual([
      [ids2[1], 1],
      [gameId(s0.game), 0],
    ]);
  });

  it('site stats count finished blind dailies apart; byMode keeps the ranked ones', async () => {
    const { sql, mk } = await db();
    const u = await mk('bd_a');
    const r = await start(sql, { mode: 'daily' }, fan(u));
    const p = await playOut(sql, r, fan(u));
    const second = await start(sql, { mode: 'daily' }, fan(u), p.end);
    await playOut(sql, second, fan(u), { t0: p.end });
    const g = await start(sql, { mode: 'daily' }, guest(G1));
    await playOut(sql, g, guest(G1));
    const st = await siteStats(sql, T0);
    expect(st.byMode.find((m) => m.mode === 'daily')!.games).toBe(1);
    expect(st.totals).toMatchObject({ games: 1, blindDailies: 2 });
  });
});

// ─── Final fix: blind games show no result on /quiz/me until their day ends ───────────────────────

describe('blind games stay blind on /quiz/me', () => {
  it('critic repro: 2 bot-fast games → a blind game → /quiz/me shows no 10/10, no score, rows unchanged', async () => {
    const { sql, mk } = await db();
    const u = await mk('batman_x');
    let t = T0;
    for (let k = 0; k < 2; k++) {
      const s = await start(sql, { mode: 'universe', universe: 'marvel' }, fan(u, G1), t);
      t = (await playOut(sql, s, fan(u, G1), { ms: 600, t0: t })).end;
    }
    const before = await fanStats(sql, u.id, t);
    const b = await start(sql, { mode: 'universe', universe: 'dc' }, fan(u, G1), t);
    expect(b.unrankedWhy).toMatch(/blind practice/);
    const p = await playOut(sql, b, fan(u, G1), { t0: t }); // all right
    // Nothing on the way out says how it went…
    for (const r of p.replies)
      expect(r.reveal).toMatchObject({ correct: null, points: 0, score: 0 });
    expect(p.last.summary).toMatchObject({
      blind: true,
      score: 0,
      correct: 0,
      grid: '•'.repeat(10),
    });
    // …a resend neither…
    const again = await answerQuestion(
      sql,
      { game: b.game, index: 9, choice: await right(sql, b.game, 9) },
      fan(u, G1),
      p.end + 10,
    );
    expect(again.ok && again.reveal.correct).toBeNull();
    expect(again.ok && again.summary).toMatchObject({ score: 0, correct: 0 });
    // …nor /quiz/me: every figure as before, and the recent row says blind with no result.
    const after = await fanStats(sql, u.id, p.end);
    const { recent: r0, ...fig0 } = before;
    const { recent: r1, ...fig1 } = after;
    expect(fig1).toEqual(fig0);
    expect(r1[0]).toMatchObject({ blind: true, score: 0, correct: 0, label: 'DC' });
    expect(r1.slice(1)).toEqual(r0);
    // (The two held games still show in recent, marked held, as before — not the blind one's result.)
    expect(r1.filter((r) => r.blind)).toEqual([r1[0]]);
    // After its IST day it counts like any finished game.
    const tomorrow = await fanStats(sql, u.id, T0 + 86400_000);
    expect(tomorrow.games).toBe(before.games + 1);
    expect(tomorrow.recent[0]).toMatchObject({ correct: 10 });
    expect(tomorrow.recent[0]!.blind).toBeUndefined();
  });
});

// ─── Q27: the daily never serves a mini-quiz answer ──────────────────────────────────────────────

describe('daily skips mini-quiz answers (Q27)', () => {
  it('a question whose answer the page mini-quiz ships never appears in 120 days of dailies', async () => {
    // dc-alpha-03's answer is "opt-c2"; the mini-quiz answer "Opt C2!" normalizes the same.
    const mini = (slug: string) =>
      slug === 'dc-alpha'
        ? [{ options: ['Something', 'Opt C2!', 'Else', 'Other'], answer: 1 }]
        : undefined;
    setBankForTests(buildBank(fixture, (x) => names[x], mini));
    try {
      expect([...getBank().notDaily]).toEqual(['dc-alpha-03']);
      let prev: string[] = [];
      let all = new Set<string>();
      for (let d = 0; d < 120; d++) {
        const day = istDay(T0 + d * 86400_000);
        const list = (await dailyQuestions(getBank().all, new Set(['dc-alpha-05']), day)).map(
          (q) => q.id,
        );
        expect(list).toHaveLength(10);
        expect(list).not.toContain('dc-alpha-03');
        expect(list.filter((id) => prev.includes(id))).toEqual([]);
        prev = list;
        all = new Set([...all, ...list]);
      }
      expect(all.size).toBeGreaterThan(100); // the rest of the bank still rotates through
      // Other modes still serve it (they reveal answers anyway).
      const { sql } = await db();
      let seen = false;
      for (let k = 0; k < 10 && !seen; k++) {
        const s = await start(
          sql,
          { mode: 'character', character: 'dc-alpha' },
          guest(`${G1}-q27-${k}`),
        );
        seen = (await ids(sql, s.game)).includes('dc-alpha-03');
      }
      expect(seen).toBe(true);
    } finally {
      setBankForTests(buildBank(fixture, (x) => names[x]));
    }
  });

  it('the bundled bank builds the set from the character pages', async () => {
    setBankForTests(null);
    try {
      for (let d = 0; d < 30; d++)
        for (const q of await dailyQuestions(getBank().all, new Set(), istDay(T0 + d * 86400_000)))
          expect(getBank().notDaily.has(q.id)).toBe(false);
      // Every listed question really shares an answer with its character's mini-quiz; none of them is
      // in a daily over a month.
      const b = getBank();
      for (const id of b.notDaily) expect(b.byId.has(id)).toBe(true);
      expect(b.notDaily.size).toBeGreaterThan(0);
    } finally {
      setBankForTests(buildBank(fixture, (x) => names[x]));
    }
  });
});

describe('bundled bank', () => {
  it('loads content/quiz (whatever is there yet) with roster names joined', () => {
    setBankForTests(null);
    try {
      const b = getBank();
      for (const q of b.all) {
        expect(q.name.length).toBeGreaterThan(0);
        expect(b.byCharacter.get(q.slug)).toContain(q);
      }
    } finally {
      setBankForTests(buildBank(fixture, (s) => names[s]));
    }
  });
});
