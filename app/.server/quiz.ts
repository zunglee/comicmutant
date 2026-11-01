/**
 * Fact Frenzy rules (reports/quiz-design.md Q1–Q23). The server keeps the answers and the clock: a game
 * is a row holding its question ids, each question's option shuffle and the one question that may be
 * answered now. The browser holds only a signed game id (`<id>.<owner>.<sig>`) that also names who
 * started it, so nobody else can answer, report or claim it. Points, streaks and timing are worked out
 * here from server timestamps; nothing the client says about time is trusted. Today's daily keeps a
 * wrong answer locked until midnight IST (Q10), and "facts known" counts only first-sight right
 * answers (Q12), tracked per fan and per guest browser in quiz_seen. A daily that can't rank is blind
 * (Q16). A fan (or, for guests, a browser) has two lanes, one open daily and one open other game; a
 * new other game ends the previous one, a daily start resumes your open daily (Q23a), and the IP is
 * never a block (Q22). Names
 * in a board's top places wait for a mod's look, per game on the daily podium and up to a per-board
 * cap elsewhere (Q19); a suspiciously even or near-floor pace sends a game to the trust queue (Q18/Q21).
 */
import { rng } from '~/game/engine/math';
import {
  type BoardId,
  type BoardRow,
  type DailyArchive,
  type FanStats,
  type HeldGame,
  type OpenDaily,
  QUESTION_SECONDS,
  QUESTIONS_PER_GAME,
  QUIZ_MODES,
  type QuizAnswerBody,
  type QuizAnswerReply,
  type QuizClaimReply,
  type QuizError,
  type QuizErrorCode,
  type QuizMode,
  type QuizNextBody,
  type QuizNextReply,
  type QuizQuestionView,
  type QuizReportBody,
  type QuizReveal,
  type QuizSignal,
  type QuizStartBody,
  type QuizStartReply,
  type QuizSummary,
  type ReportRow,
  type SiteStats,
  type TrustCheck,
} from '~/lib/quiz-contract';
import { PUBLISHED_UNIVERSES, type PublishedUniverse, UNIVERSE_LABEL } from '~/lib/taxonomy';
import { currentUser, type User } from './auth';
import type { Sql } from './db';
import { istDay } from './freefall';
import { allow, clientIp, hmac } from './guard';
import { type BankEntry, getBank, leaksAnswer, liveBank, retiredIds } from './quizbank';
import { guestId } from './voter';

export { istDay };

/** Network grace on top of the 15 s: an answer later than this is a timeout whatever it chose. */
export const GRACE_MS = 2500;
const LIMIT_MS = QUESTION_SECONDS * 1000 + GRACE_MS;
/** A guest's finished game can be claimed by joining within this window. */
export const CLAIM_WINDOW = 30 * 60_000;
/** A game left open longer than this can't be answered any more. */
const GAME_TTL = 3 * 3600_000;
/** Rows a board shows (the viewer's own row comes back too, wherever it is). */
export const BOARD_TOP = 50;
/** Answers a question needs before "x% of fans got this" shows. */
export const FANS_RIGHT_MIN = 20;
const WEEK = 7 * 86400_000;

/** Review states of a game (same numbers as Freefall's runs). */
export const REVIEW = { clean: 0, held: 1, rejected: 2, approved: 3 } as const;

/** Difficulty plan of a 10-question game: 3 casual, 4 regular, 3 deep cuts (Q2). */
const PLAN: readonly (1 | 2 | 3)[] = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3];
const MULT = { 1: 1, 2: 1.5, 3: 2 } as const;

/** Who is playing: the signed-in fan and/or the browser's guest cookie (raw id). */
export interface Owner {
  user: User | null;
  guest: string | null;
  /** Client IP (start only): kept for the mods' scouting signals, never a block (Q22). */
  ip?: string;
}

/** Q22: daily starts per browser and per fan per IST day. */
export const DAILY_STARTS = 6;
/** Q18: facts-known credit per fan per IST day. */
export const FACTS_PER_DAY = 120;
/** Q17: places on each board where a name waits for a trusted fan. */
export const GATED = { daily: 3, universe: 3, facts: 10 } as const;
/** Q18: tight band — at least this many right answers whose time over the floor varies this little. */
export const TIGHT_MIN_RIGHT = 6;
export const TIGHT_SIGMA_MS = 600;
/** Q24: the tight band is shown to mods only when it's this tight. */
export const TIGHT_SIGNAL_MS = 250;
/** Q21 near floor: this many right answers within NEAR_FLOOR_MS of their reading floor flag a game. */
export const NEAR_FLOOR_MIN = 4;
export const NEAR_FLOOR_MS = 300;
/** Q19 trust caps: a universe-board name shows up to 1.1 × the last approved score there; facts up
 * to the count at the last approval + 30. */
export const CAP_MARGIN = 1.1;
export const FACTS_CAP_SLACK = 30;
/** Q18 flag states on a game. */
const FLAG = { none: 0, flagged: 1, cleared: 2 } as const;

// ─── tokens ──────────────────────────────────────────────────────────────────────────────────────

async function guestTag(guest: string): Promise<string> {
  return `g${(await hmac(`qz-guest:${guest}`)).slice(0, 16)}`;
}

/** Owner tags this request may act as (a fan who started as a guest keeps their browser's games). */
async function tagsOf(o: Owner): Promise<string[]> {
  const out: string[] = [];
  if (o.user) out.push(`u${o.user.id}`);
  if (o.guest) out.push(await guestTag(o.guest));
  return out;
}

async function signGame(id: number, owner: string): Promise<string> {
  return `${id}.${owner}.${await hmac(`qz-game:${id}.${owner}`)}`;
}

async function readGameToken(token: string): Promise<{ id: number; owner: string } | null> {
  const m = /^(\d{1,12})\.(u\d{1,12}|g[A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{32})$/.exec(token);
  if (!m) return null;
  const [, id, owner, sig] = m as unknown as [string, string, string, string];
  if (sig !== (await hmac(`qz-game:${id}.${owner}`))) return null;
  return { id: Number(id), owner };
}

// ─── rows ────────────────────────────────────────────────────────────────────────────────────────

interface GameRow {
  id: number;
  user_id: number | null;
  owner: string;
  mode: QuizMode;
  universe: PublishedUniverse | null;
  character: string | null;
  day: string;
  questions: string;
  perms: string;
  total: number;
  pos: number;
  served_at: number;
  score: number;
  correct: number;
  streak: number;
  best_streak: number;
  total_ms: number;
  attempt: number;
  ranked: number;
  review: number;
  reasons: string | null;
  new_facts: number;
  created_at: number;
  finished_at: number | null;
  /** Guest tag of the browser that started it (Q16a). */
  browser: string | null;
  flag: number;
  /** Keyed hash of the client IP at start (Q20, Q21). */
  ip: string | null;
  /** Set when another start ended it (Q20a): it can't be answered any more. */
  abandoned_at: number | null;
  ruled_at: number | null;
  /** Q26: played blind (the fan or browser's games were held for pace twice that day). */
  blind: number;
  /** Q26: this game's own pace tripped the hold rules (ranked or not). */
  pace_held: number;
}

/** An open game: not finished, not abandoned. */
const OPEN = 'finished_at IS NULL AND abandoned_at IS NULL';

/** An error reply with its stable code (Q22). */
export const fail = (error: string, code: QuizErrorCode): QuizError => ({ ok: false, error, code });
const isError = (v: unknown): v is QuizError =>
  typeof v === 'object' && v !== null && (v as { ok?: unknown }).ok === false;

/** Q23d: the per-IP ceiling (carrier NAT puts thousands of fans behind one IP). */
export const IP_CEILING_PER_MIN = 600;

/**
 * Rate limit for a quiz route: keyed on the fan, else the browser (Q23d), with a high per-IP ceiling
 * against floods. True when the request may go ahead.
 */
export async function quizRate(
  sql: Sql,
  route: string,
  who: { user: { id: number } | null; guest: string | null; ip: string },
  max: number,
  windowMs: number,
): Promise<boolean> {
  // (Every start issues a guest cookie first, so the IP key is only for cookie-less callers.)
  const key = who.user ? `u${who.user.id}` : who.guest ? `g${who.guest}` : `ip${who.ip}`;
  if (!(await allow(sql, `qz-${route}:${key}`, max, windowMs))) return false;
  return allow(sql, `qz-${route}-ip:${who.ip}`, IP_CEILING_PER_MIN, 60_000);
}

/**
 * A route's JSON body, small and parsed, or the error reply to send (with its status). guard's
 * readJson throws a `data()` response; this turns it into a coded reply.
 */
export async function quizBody(
  request: Request,
  max: number,
  tooLong = 'Request too large.',
): Promise<{ ok: true; body: unknown } | { ok: false; reply: QuizError; status: number }> {
  if (request.method !== 'POST')
    return { ok: false, reply: fail('POST only', 'invalid'), status: 405 };
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json'))
    return { ok: false, reply: fail('Expected JSON.', 'invalid'), status: 415 };
  // Read with a hard cap ourselves, so "too large" isn't reported as bad JSON.
  const big = { ok: false as const, reply: fail(tooLong, 'invalid'), status: 413 };
  if (Number(request.headers.get('content-length') ?? 0) > max) return big;
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    if (!reader) break;
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return big;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    buf.set(c, at);
    at += c.byteLength;
  }
  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(buf)) };
  } catch {
    return { ok: false, reply: fail('Invalid JSON.', 'invalid'), status: 400 };
  }
}

/** A daily that can't rank is blind (Q16b): a guest's, or a fan's second or later try. */
const isBlind = (g: { mode: QuizMode; ranked: number; blind?: number }) =>
  g.blind === 1 || (g.mode === 'daily' && g.ranked !== 1);

/** Q26: this many pace-held games in an IST day make the rest of that day blind (fan or browser). */
export const HELD_FLOOD = 2;
/** SQL twin of isBlind for a `g` alias. */
const BLIND_SQL = "(g.blind = 1 OR (g.mode = 'daily' AND g.ranked != 1))";

interface AnswerRow {
  idx: number;
  question_id: string;
  /** Option index as written; -1 = timed out. */
  choice: number;
  /** The shown position the player sent (-1 = none), for a resend (Q13). */
  sent: number | null;
  correct: number;
  ms: number;
  points: number;
}

const getGame = (sql: Sql, id: number) =>
  sql.get<GameRow>('SELECT * FROM quiz_games WHERE id = ?', [id]);

/** The game behind a token, only for whoever started it. */
async function ownedGame(sql: Sql, token: string, o: Owner): Promise<GameRow | QuizError> {
  const t = await readGameToken(token);
  if (!t) return fail('That game id is not valid. Start a new game.', 'invalid');
  if (!(await tagsOf(o)).includes(t.owner))
    return fail('That game was started by someone else.', 'invalid');
  const g = await getGame(sql, t.id);
  if (!g || g.owner !== t.owner) return fail('That game was started by someone else.', 'invalid');
  return g;
}

const answersOf = (sql: Sql, gameId: number) =>
  sql.all<AnswerRow>(
    `SELECT idx, question_id, choice, sent, correct, ms, points FROM quiz_answers
      WHERE game_id = ? ORDER BY idx`,
    [gameId],
  );

// ─── picking questions ───────────────────────────────────────────────────────────────────────────

/** FNV-1a over a string → u32 (seed derivation; not a security property). */
function u32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0 || 1;
}

const randomU32 = () => crypto.getRandomValues(new Uint32Array(1))[0] || 1;

function shuffle<T>(list: T[], rand: () => number): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j] as T, list[i] as T];
  }
  return list;
}

/**
 * Up to n questions: the difficulty plan first (slots a pool can't fill are topped up from any
 * difficulty), unseen before seen, spread over universes and then characters, random within that.
 * Ordered easy → hard.
 */
export function pickQuestions(
  pool: readonly BankEntry[],
  n: number,
  rand: () => number,
  seen: ReadonlySet<string> = new Set(),
): BankEntry[] {
  const left = shuffle([...pool], rand);
  const out: BankEntry[] = [];
  const uses = new Map<string, number>();
  const take = (want?: 1 | 2 | 3) => {
    let best = -1;
    let cost = Number.POSITIVE_INFINITY;
    for (const [i, q] of left.entries()) {
      if (want && q.difficulty !== want) continue;
      const c =
        (seen.has(q.id) ? 1000 : 0) +
        10 * (uses.get(`u:${q.universe}`) ?? 0) +
        3 * (uses.get(`c:${q.slug}`) ?? 0);
      if (c < cost) {
        cost = c;
        best = i;
      }
    }
    if (best < 0) return false;
    const [q] = left.splice(best, 1) as [BankEntry];
    out.push(q);
    for (const k of [`u:${q.universe}`, `c:${q.slug}`]) uses.set(k, (uses.get(k) ?? 0) + 1);
    return true;
  };
  for (const d of PLAN) if (out.length < n) take(d);
  while (out.length < n) if (!take()) break;
  return out.sort((a, b) => a.difficulty - b.difficulty);
}

// ─── Q25: serve the leaked question first ────────────────────────────────────────────────────────

/** Does `a` (text or `why`) print `b`'s answer? The bank's graph within a universe; computed across. */
function leaks(a: BankEntry, b: BankEntry): boolean {
  const bank = getBank();
  if (a.universe === b.universe) return bank.leaks.get(a.id)?.has(b.id) ?? false;
  return leaksAnswer(a, b, bank.terms.get(b.id) ?? []);
}

/**
 * Order a game so every question comes before any question whose text or `why` prints its answer
 * (a stable topological sort; the given order — easy → hard — breaks ties). `stuck` lists what a
 * cycle kept from being placed (empty when the order is complete).
 */
export function orderByLeaks(qs: readonly BankEntry[]): { order: BankEntry[]; stuck: BankEntry[] } {
  const left = [...qs];
  const order: BankEntry[] = [];
  while (left.length) {
    // The first question none of whose leaked-by-it answers are still unplaced.
    const i = left.findIndex((a) => !left.some((b) => b !== a && leaks(a, b)));
    if (i < 0) return { order, stuck: left };
    order.push(...left.splice(i, 1));
  }
  return { order, stuck: [] };
}

/**
 * A game's final order (Q25): leaked questions first. Each cycle (A prints B's answer and B prints
 * A's) loses its later member; then the game is topped back up to its size from `candidates` (in the
 * order given, the dropped difficulties first), taking only questions that keep it acyclic. With no
 * fit left the game is shorter.
 */
export function arrangeQuestions(
  picked: readonly BankEntry[],
  candidates: readonly BankEntry[],
): BankEntry[] {
  const size = picked.length;
  let qs = sortByDifficulty([...picked]);
  const dropped: BankEntry[] = [];
  for (;;) {
    const r = orderByLeaks(qs);
    if (!r.stuck.length) break;
    // Drop the latest stuck question that is part of the knot (it leaks another stuck one).
    const knot = [...r.stuck].reverse().find((a) => r.stuck.some((b) => b !== a && leaks(a, b)));
    const drop = knot ?? (r.stuck.at(-1) as BankEntry);
    dropped.push(drop);
    qs = qs.filter((q) => q !== drop);
  }
  if (!dropped.length) return orderByLeaks(qs).order;
  const want = new Set(dropped.map((d) => d.difficulty));
  const pool = candidates
    .filter((c) => !dropped.includes(c) && !qs.includes(c))
    .sort((a, b) => Number(!want.has(a.difficulty)) - Number(!want.has(b.difficulty)));
  for (const c of pool) {
    if (qs.length >= size) break;
    const next = sortByDifficulty([...qs, c]);
    if (!orderByLeaks(next).stuck.length) qs = next;
  }
  return orderByLeaks(qs).order;
}

const sortByDifficulty = (qs: BankEntry[]) => qs.sort((a, b) => a.difficulty - b.difficulty);

/** Neighbouring IST days of a `YYYY-MM-DD` day. */
const shiftDay = (day: string, by: number) =>
  istDay(Date.parse(`${day}T12:00:00+05:30`) + by * 86400_000);

/** Days before this one have no "yesterday" to avoid; the chain of daily sets starts here. */
const DAILY_ANCHOR = '2026-10-01';

/** The seeded base sets per day, each drawn without the day before's (cached per bank). */
let chain: {
  bank: readonly BankEntry[];
  sorted: BankEntry[];
  days: Map<string, BankEntry[]>;
} | null = null;

async function baseDaily(all: readonly BankEntry[], day: string): Promise<BankEntry[]> {
  if (!chain || chain.bank !== all) {
    // Q27: the daily pool never holds a question whose answer the character page's mini-quiz ships.
    const notDaily = getBank().notDaily;
    chain = {
      bank: all,
      sorted: all.filter((q) => !notDaily.has(q.id)).sort((a, b) => (a.id < b.id ? -1 : 1)),
      days: new Map(),
    };
  }
  const c = chain;
  const pick = async (d: string, avoid: readonly BankEntry[]) => {
    const pool = avoid.length ? c.sorted.filter((q) => !avoid.includes(q)) : c.sorted;
    return pickQuestions(pool, QUESTIONS_PER_GAME, rng(u32(await hmac(`qz-daily:${d}`))));
  };
  if (day <= DAILY_ANCHOR) {
    const hit = c.days.get(day);
    if (hit) return hit;
    const set = await pick(day, []);
    c.days.set(day, set);
    return set;
  }
  // Walk back to a known day (or the anchor), then forward: each day avoids the one before.
  const todo: string[] = [];
  let d = day;
  while (!c.days.has(d) && d > DAILY_ANCHOR) {
    todo.push(d);
    d = shiftDay(d, -1);
  }
  let prev = c.days.get(d) ?? (await baseDaily(all, d));
  for (const t of todo.reverse()) {
    prev = await pick(t, prev);
    c.days.set(t, prev);
  }
  return prev;
}

/**
 * Today's 10: the same for everyone on an IST day, unguessable before the day starts, and never one of
 * yesterday's (Q16d). Drawn from the whole bank so retiring one question mid-day swaps only that one.
 * A stand-in for a retired question is never in yesterday's, today's or tomorrow's set, and stand-ins
 * of neighbouring days come from opposite halves of the bank (by id hash), so they never meet either.
 */
export async function dailyQuestions(
  all: readonly BankEntry[],
  retired: ReadonlySet<string>,
  day: string,
): Promise<BankEntry[]> {
  const picked = await baseDaily(all, day);
  const near = new Set(
    [
      ...(await baseDaily(all, shiftDay(day, -1))),
      ...picked,
      ...(await baseDaily(all, shiftDay(day, 1))),
    ].map((q) => q.id),
  );
  const parity = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400_000) & 1;
  const sorted = (chain as NonNullable<typeof chain>).sorted;
  const out: BankEntry[] = [];
  for (const q of picked) {
    if (!retired.has(q.id)) {
      out.push(q);
      continue;
    }
    const free = sorted.filter(
      (c) =>
        !retired.has(c.id) && !near.has(c.id) && (u32(c.id) & 1) === parity && !out.includes(c),
    );
    const same = free.filter((c) => c.difficulty === q.difficulty);
    const from = same.length ? same : free;
    const sub = from[u32(`${day}:${q.id}`) % Math.max(1, from.length)];
    if (sub) out.push(sub);
  }
  // Q25 (cross-universe pairs too): leaked first; a cycle swaps one for a stand-in, picked by the
  // same rule (never near, this day's half of the bank, in a seeded order) so everyone gets it.
  sortByDifficulty(out);
  const first = orderByLeaks(out);
  if (!first.stuck.length) return first.order;
  const standIns = sorted
    .filter((c) => !retired.has(c.id) && !near.has(c.id) && (u32(c.id) & 1) === parity)
    .sort((a, b) => u32(`${day}:${a.id}`) - u32(`${day}:${b.id}`));
  return arrangeQuestions(out, standIns);
}

/**
 * Q22/Q23d: the daily questions other modes must not serve on `day` — that day's and the next day's
 * (so a game crossing midnight can't preview tomorrow's daily either).
 */
async function dailyIdsNear(sql: Sql, day: string): Promise<Set<string>> {
  const retired = await retiredIds(sql);
  const all = getBank().all;
  return new Set(
    [
      ...(await dailyQuestions(all, retired, day)),
      ...(await dailyQuestions(all, retired, shiftDay(day, 1))),
    ].map((q) => q.id),
  );
}

/** Unseen questions before seen ones (stable). */
const unseenFirst = (qs: BankEntry[], seen: ReadonlySet<string>) => [
  ...qs.filter((q) => !seen.has(q.id)),
  ...qs.filter((q) => seen.has(q.id)),
];

/** Question ids this player has been shown before (as the fan, or in this browser). */
async function seenIds(sql: Sql, o: Owner): Promise<Set<string>> {
  const tags = await tagsOf(o);
  const rows = await sql.all<{ question_id: string }>(
    'SELECT DISTINCT question_id FROM quiz_seen WHERE who IN (?, ?)',
    [tags[0] ?? '', tags[1] ?? ''],
  );
  return new Set(rows.map((r) => r.question_id));
}

/**
 * Fold a guest browser's seen-history into a fan's (Q12): what that browser was shown counts as seen
 * by the fan, keeping the earliest sighting. Call on sign-in and join when a guest cookie is present
 * (claim and every signed-in start do it too).
 */
export async function mergeGuestHistory(sql: Sql, userId: number, guest: string): Promise<void> {
  await sql.run(
    `INSERT INTO quiz_seen (who, question_id, first_game, at)
       SELECT ?, question_id, first_game, at FROM quiz_seen WHERE who = ?
     ON CONFLICT (who, question_id) DO UPDATE SET
       first_game = CASE WHEN excluded.at < quiz_seen.at THEN excluded.first_game ELSE quiz_seen.first_game END,
       at = MIN(quiz_seen.at, excluded.at)`,
    [`u${userId}`, await guestTag(guest)],
  );
}

function view(
  q: BankEntry,
  perm: readonly number[],
  index: number,
  seconds: number = QUESTION_SECONDS,
): QuizQuestionView {
  return {
    index,
    q: q.q,
    options: perm.map((i) => q.options[i] as string) as QuizQuestionView['options'],
    difficulty: q.difficulty,
    topic: q.topic,
    character: { slug: q.slug, name: q.name, universe: q.universe },
    seconds,
  };
}

/** A question reached the player: count it, and note the first time this owner ever saw it. */
async function markServed(sql: Sql, id: string, g: { id: number; owner: string }, now: number) {
  await sql.run(
    `INSERT INTO quiz_question_stats (question_id, served) VALUES (?, 1)
     ON CONFLICT (question_id) DO UPDATE SET served = served + 1`,
    [id],
  );
  await sql.run(
    `INSERT INTO quiz_seen (who, question_id, first_game, at) VALUES (?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
    [g.owner, id, g.id, now],
  );
}

// ─── start ───────────────────────────────────────────────────────────────────────────────────────

const GUEST_WHY = 'Playing as a guest: join or sign in within 30 minutes of finishing to rank it.';
const GUEST_DAILY_WHY =
  'A guest daily is blind practice: your answers lock in with no score, and it never ranks. Tomorrow, Yesterday’s answers shows the right ones. Sign in to play it for real.';
const REPLAY_WHY =
  'Only your first daily each day ranks. This one is blind practice: your answers lock in with no score. Tomorrow, Yesterday’s answers shows the right ones.';
const CLOSED_DAILY = 'This daily closed at midnight.';
const FLOOD_WHY =
  'Your recent games were very fast, so the rest of today is blind practice: answers lock in with no score.';
const ABANDONED = 'This game ended when you started another one.';

/**
 * Q23a: hand back an open daily where it stands — same token, the current question with its clock
 * still running from when it was first served. A clock that already ran out is recorded as a timeout
 * and play moves on.
 */
async function resume(sql: Sql, gameId: number, o: Owner, now: number): Promise<QuizStartReply> {
  let g = (await getGame(sql, gameId)) as GameRow;
  const game = await signGame(g.id, g.owner);
  if (g.served_at && now - g.served_at > LIMIT_MS) {
    const t = await answerQuestion(sql, { game, index: g.pos, choice: -1 }, o, now);
    if (!t.ok) return t;
    g = (await getGame(sql, gameId)) as GameRow;
    // The clock ran out on its last question: the game is over — hand back its end screen.
    if (g.finished_at !== null)
      return {
        ok: true,
        game,
        mode: 'daily',
        total: g.total,
        ranked: g.ranked === 1,
        ...(g.ranked === 1
          ? {}
          : { unrankedWhy: g.user_id === null ? GUEST_DAILY_WHY : REPLAY_WHY }),
        question: null,
        summary: t.summary ?? (await summarize(sql, g, now)),
      };
  }
  const n = await nextQuestion(sql, { game, index: g.pos }, o, now);
  if (!n.ok) return n;
  g = (await getGame(sql, gameId)) as GameRow;
  const blind = isBlind(g);
  const answers = await answersOf(sql, g.id);
  return {
    ok: true,
    game,
    mode: 'daily',
    total: g.total,
    ranked: g.ranked === 1,
    ...(g.ranked === 1
      ? {}
      : { unrankedWhy: g.blind ? FLOOD_WHY : g.user_id === null ? GUEST_DAILY_WHY : REPLAY_WHY }),
    question: n.question,
    resumed: {
      score: blind ? 0 : g.score,
      streak: blind ? 0 : g.streak,
      answered: g.pos,
      grid: answers
        .map((a) => (blind ? '•' : a.choice === -1 ? '⏱' : a.correct ? '✓' : '✗'))
        .join(''),
    },
  };
}

/** The request's player: signed-in fan, guest cookie and client IP (as the quiz routes read them). */
export async function ownerFromRequest(sql: Sql, request: Request): Promise<Owner> {
  return { user: await currentUser(sql, request), guest: guestId(request), ip: clientIp(request) };
}

/**
 * For loaders: this player's open daily today, if any — where it stands, so the hub can offer
 * "Resume your daily" (a start then resumes it, Q23a). Nothing is served or recorded here.
 */
export async function openDaily(sql: Sql, o: Owner, now = Date.now()): Promise<OpenDaily | null> {
  const browser = o.guest ? await guestTag(o.guest) : null;
  if (!o.user && !browser) return null;
  const g = await sql.get<GameRow>(
    `SELECT * FROM quiz_games WHERE ${OPEN} AND mode = 'daily' AND day = ? AND created_at > ? AND
       ${o.user ? 'user_id = ?' : 'user_id IS NULL AND browser = ?'} LIMIT 1`,
    [istDay(now), now - GAME_TTL, o.user ? o.user.id : (browser as string)],
  );
  if (!g) return null;
  return {
    index: g.pos,
    total: g.total,
    secondsLeft: g.served_at
      ? Math.max(0, Math.ceil((QUESTION_SECONDS * 1000 - (now - g.served_at)) / 1000))
      : null,
    ranked: g.ranked === 1,
  };
}

/** For the hub: daily starts left today for this fan and browser (the tighter of the two caps). */
export async function dailyStartsLeft(sql: Sql, o: Owner, now = Date.now()): Promise<number> {
  const browser = o.guest ? await guestTag(o.guest) : null;
  const keys = [o.user ? `u:${o.user.id}` : null, browser ? `b:${browser}` : null].filter(
    (k): k is string => k !== null,
  );
  let used = 0;
  for (const who of keys) {
    const r = await sql.get<{ n: number }>(
      'SELECT n FROM quiz_daily_starts WHERE who = ? AND day = ?',
      [who, istDay(now)],
    );
    used = Math.max(used, r?.n ?? 0);
  }
  return Math.max(0, DAILY_STARTS - used);
}

export async function startGame(
  sql: Sql,
  body: QuizStartBody,
  o: Owner,
  now = Date.now(),
): Promise<QuizStartReply> {
  const tags = await tagsOf(o);
  const owner = tags[0];
  if (!owner) return fail('No player.', 'invalid');
  if (!(QUIZ_MODES as readonly string[]).includes(body.mode))
    return fail('Unknown mode.', 'invalid');
  // A fan playing in a browser that played as a guest has seen what it saw.
  if (o.user && o.guest) await mergeGuestHistory(sql, o.user.id, o.guest);
  const live = await liveBank(sql);
  const day = istDay(now);
  const daily = body.mode === 'daily';
  const todays = await dailyQuestions(getBank().all, await retiredIds(sql), day);
  // Q22: other modes never serve today's (or tomorrow's) daily questions.
  const near = await dailyIdsNear(sql, day);
  const notToday = (pool: readonly BankEntry[]) => pool.filter((q) => !near.has(q.id));
  let picked: BankEntry[];
  let universe: PublishedUniverse | null = null;
  let character: string | null = null;
  if (daily) {
    picked = todays;
  } else if (body.mode === 'universe') {
    if (!body.universe || !(PUBLISHED_UNIVERSES as readonly string[]).includes(body.universe))
      return fail('No quiz for that universe.', 'invalid');
    universe = body.universe;
    const pool = notToday(live.byUniverse.get(universe) ?? []);
    const seen = await seenIds(sql, o);
    picked = arrangeQuestions(
      pickQuestions(pool, QUESTIONS_PER_GAME, rng(randomU32()), seen),
      unseenFirst(shuffle([...pool], rng(randomU32())), seen),
    );
  } else {
    const all = (body.character && live.byCharacter.get(body.character)) || [];
    if (!all.length) return fail('No quiz for that character.', 'invalid');
    character = body.character ?? null;
    universe = all[0]?.universe ?? null;
    const pool = notToday(all);
    const seen = await seenIds(sql, o);
    picked = arrangeQuestions(
      pickQuestions(pool, QUESTIONS_PER_GAME, rng(randomU32()), seen),
      unseenFirst(shuffle([...pool], rng(randomU32())), seen),
    );
  }
  const first = picked[0];
  if (!first) return fail('No questions here yet. Try another quiz.', 'invalid');

  const browser = o.guest ? await guestTag(o.guest) : null;
  const ip = o.ip !== undefined ? await hmac(`qz-ip:${o.ip}`) : null;
  // Q22/Q23b lanes belong to the fan (any browser), or for a guest to the browser.
  const lane = o.user ? 'user_id = ?' : 'user_id IS NULL AND browser = ?';
  const laneArg = o.user ? o.user.id : (browser ?? '');
  // A daily that can't be played any more (expired, or its day is over) never holds its lane.
  await sql.run(
    `UPDATE quiz_games SET abandoned_at = ?
      WHERE ${OPEN} AND mode = 'daily' AND (day != ? OR created_at <= ?) AND ${lane}`,
    [now, day, now - GAME_TTL, laneArg],
  );
  const openDaily = () =>
    sql.get<{ id: number }>(
      `SELECT id FROM quiz_games WHERE ${OPEN} AND mode = 'daily' AND ${lane} LIMIT 1`,
      [laneArg],
    );
  // Daily: which start of today this is. A fan's first daily ranks whatever the browser did earlier
  // (Q23b: that's a scouting signal for the mods, not a block); a guest's daily never ranks (Q10).
  let attempt = 1;
  if (daily) {
    // Q23a: your own open daily resumes; it never locks you out.
    const open = await openDaily();
    if (open) return resume(sql, open.id, o, now);
    // A few daily starts per fan and per browser each day (never per IP: carrier NAT, Q22).
    for (const key of [o.user ? `u:${o.user.id}` : null, browser ? `b:${browser}` : null]) {
      if (!key) continue;
      const r = await sql.get<{ n: number }>(
        `INSERT INTO quiz_daily_starts (who, day, n) VALUES (?, ?, 1)
         ON CONFLICT (who, day) DO UPDATE SET n = n + 1 RETURNING n`,
        [key, day],
      );
      if ((r?.n ?? 1) > DAILY_STARTS)
        return fail('That’s all your daily starts for today. Back tomorrow!', 'daily-cap');
    }
    const r = await sql.get<{ n: number }>(
      o.user
        ? `SELECT COUNT(*) AS n FROM quiz_games WHERE mode = 'daily' AND day = ? AND owner = ?`
        : `SELECT COUNT(*) AS n FROM quiz_games
            WHERE mode = 'daily' AND day = ? AND user_id IS NULL AND browser = ?`,
      [day, o.user ? `u${o.user.id}` : (browser ?? '')],
    );
    attempt = (r?.n ?? 0) + 1;
  }
  // Q26: two pace-held games today (by this fan or in this browser) make the rest of the day blind.
  const flood = await sql.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM quiz_games
      WHERE day = ? AND pace_held = 1 AND (user_id = ? OR browser = ?)`,
    [day, o.user?.id ?? -1, browser ?? ''],
  );
  const blind = (flood?.n ?? 0) >= HELD_FLOOD;
  const ranked = !blind && !!o.user && (!daily || attempt === 1);
  const perms = picked.map(() => shuffle([0, 1, 2, 3], () => randomU32() / 2 ** 32));
  // A new other game ends the previous one in its lane (it reads 'replaced'); a daily never ends
  // another daily (an open one resumes above, and a racing one is resumed through the lane index).
  const replace = () =>
    sql.run(
      `UPDATE quiz_games SET abandoned_at = ? WHERE ${OPEN} AND mode != 'daily' AND ${lane}`,
      [now, laneArg],
    );
  const insert = () =>
    sql.run(
      `INSERT INTO quiz_games (user_id, owner, mode, universe, character, day, questions, perms, total,
                               served_at, attempt, ranked, created_at, browser, ip, blind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        o.user?.id ?? null,
        owner,
        body.mode,
        universe,
        character,
        day,
        JSON.stringify(picked.map((q) => q.id)),
        JSON.stringify(perms),
        picked.length,
        now,
        attempt,
        ranked ? 1 : 0,
        now,
        browser,
        ip,
        blind ? 1 : 0,
      ],
    );
  let ins: { lastId: number } | null = null;
  for (let tries = 0; tries < 5 && !ins; tries++) {
    if (!daily) await replace();
    try {
      ins = await insert();
    } catch (e) {
      if (!String(e).includes('UNIQUE')) throw e;
      if (daily) {
        const open = await openDaily();
        return open ? resume(sql, open.id, o, now) : fail('Busy — try again in a moment.', 'other');
      }
    }
  }
  if (!ins) return fail('Busy — try again in a moment.', 'other');
  await markServed(sql, first.id, { id: ins.lastId, owner }, now);
  return {
    ok: true,
    game: await signGame(ins.lastId, owner),
    mode: body.mode,
    total: picked.length,
    ranked,
    ...(ranked
      ? {}
      : {
          unrankedWhy: blind
            ? FLOOD_WHY
            : o.user
              ? REPLAY_WHY
              : body.mode === 'daily'
                ? GUEST_DAILY_WHY
                : GUEST_WHY,
        }),
    question: view(first, perms[0] as number[], 0),
  };
}

// ─── answer ──────────────────────────────────────────────────────────────────────────────────────

/** Q3: (100 + speed bonus 0–50 over the 15 s) × difficulty, +25 for each answer of a 3+ streak. */
export function pointsFor(difficulty: 1 | 2 | 3, ms: number, streak: number): number {
  const left = Math.min(1, Math.max(0, (QUESTION_SECONDS * 1000 - ms) / (QUESTION_SECONDS * 1000)));
  return Math.round((100 + 50 * left) * MULT[difficulty]) + (streak >= 3 ? 25 : 0);
}

/** Q11: the least time a right answer needs — 0.8 s plus a skim of the question at 45 chars/s. */
export const readFloorMs = (chars: number) => 800 + (chars / 45) * 1000;
/** Right answers faster than their reading floor that hold a ranked game. */
export const UNDER_FLOOR_HOLD = 3;

/** Q5/Q11: why a finished game's pace looks inhuman (empty = fine). */
export function heldReasons(
  answers: readonly { ms: number; correct: number | boolean; chars: number }[],
) {
  if (!answers.length) return [];
  const ms = answers.map((a) => a.ms).sort((a, b) => a - b);
  const mid = ms.length >> 1;
  const median =
    ms.length % 2 ? (ms[mid] as number) : ((ms[mid - 1] as number) + (ms[mid] as number)) / 2;
  const why: string[] = [];
  if (median < 1500) why.push('median answer under 1.5 s');
  const fast = answers.filter((a) => a.correct && a.ms < readFloorMs(a.chars)).length;
  if (fast >= UNDER_FLOOR_HOLD) why.push(`${fast} right answers faster than reading the question`);
  return why;
}

/**
 * Q18 tight band: σ (ms) of the time over the reading floor across right answers, when at least
 * TIGHT_MIN_RIGHT of them vary by less than TIGHT_SIGMA_MS (a script waiting floor + a constant);
 * null when the pace looks human.
 */
export function tightBand(
  answers: readonly { ms: number; correct: number | boolean; chars: number }[],
): number | null {
  const over = answers.filter((a) => a.correct).map((a) => a.ms - readFloorMs(a.chars));
  if (over.length < TIGHT_MIN_RIGHT) return null;
  const mean = over.reduce((t, x) => t + x, 0) / over.length;
  const sd = Math.sqrt(over.reduce((t, x) => t + (x - mean) ** 2, 0) / over.length);
  return sd < TIGHT_SIGMA_MS ? sd : null;
}

/** Q21: right answers within NEAR_FLOOR_MS of their reading floor (a script waiting the floor). */
export function nearFloor(
  answers: readonly { ms: number; correct: number | boolean; chars: number }[],
): number {
  return answers.filter((a) => a.correct && Math.abs(a.ms - readFloorMs(a.chars)) <= NEAR_FLOOR_MS)
    .length;
}

/**
 * Why a ranked game's pace goes to the trust queue (Q21 near floor). The tight band is only a signal
 * for the mods now (Q23c: honest experts trip it, jitter bots don't).
 */
export function flagReasons(
  answers: readonly { ms: number; correct: number | boolean; chars: number }[],
): string[] {
  const why: string[] = [];
  const near = nearFloor(answers);
  if (near >= NEAR_FLOOR_MIN) why.push(`${near} right answers within 0.3 s of the reading floor`);
  return why;
}

const paceInput = async (sql: Sql, gameId: number) => {
  const bank = getBank();
  return (await answersOf(sql, gameId)).map((a) => ({
    ms: a.ms,
    correct: a.correct,
    chars: bank.byId.get(a.question_id)?.q.length ?? 0,
  }));
};

const fansRight = (s: { answered: number; correct: number } | undefined) =>
  s && s.answered >= FANS_RIGHT_MIN ? Math.round((s.correct / s.answered) * 100) : null;

/** A stand-in for a question retired mid-game: same pool, not already in the game, same difficulty first. */
async function substitute(
  sql: Sql,
  g: GameRow,
  ids: readonly string[],
  pos: number,
  was: BankEntry | undefined,
  now: number,
) {
  // Q25: a stand-in at `pos` must not have had its answer printed by a question already shown, nor
  // print the answer of one still to come.
  const bank = getBank();
  const before = ids.slice(0, pos).flatMap((id) => bank.byId.get(id) ?? []);
  const after = ids.slice(pos + 1).flatMap((id) => bank.byId.get(id) ?? []);
  const safe = (c: BankEntry) =>
    !before.some((b) => leaks(b, c)) && !after.some((a) => leaks(c, a));
  if (g.mode === 'daily') {
    // The day's stand-in, the same one later players get.
    const today = await dailyQuestions(bank.all, await retiredIds(sql), g.day);
    const free = today.filter((q) => !ids.includes(q.id) && safe(q));
    return free.find((q) => q.difficulty === was?.difficulty) ?? free[0] ?? null;
  }
  const live = await liveBank(sql);
  const pool =
    g.mode === 'universe'
      ? (live.byUniverse.get(g.universe as PublishedUniverse) ?? [])
      : (live.byCharacter.get(g.character ?? '') ?? []);
  // Never one of today's or tomorrow's daily questions (Q22).
  const near = await dailyIdsNear(sql, istDay(now));
  const free = pool.filter((q) => !ids.includes(q.id) && !near.has(q.id) && safe(q));
  return free.find((q) => q.difficulty === was?.difficulty) ?? free[0] ?? null;
}

/**
 * The reveal for an answered question. Today's daily keeps a wrong or timed-out answer locked until
 * midnight IST (Q10): right or wrong only. A right one still shows its `why` (it teaches nothing new).
 * A blind daily (Q16b) says nothing at all: no result, no points, no answer.
 */
function revealOf(
  g: GameRow,
  q: BankEntry,
  perm: readonly number[],
  a: { choice: number; correct: boolean; ms: number; points: number },
  streak: number,
  score: number,
  stats: { answered: number; correct: number } | undefined,
  now: number,
): QuizReveal {
  if (isBlind(g))
    return {
      correct: null,
      blind: true,
      answer: null,
      why: null,
      source: null,
      locked: true,
      timedOut: a.choice === -1,
      points: 0,
      seconds: Math.round(a.ms / 10) / 100,
      streak: 0,
      score: 0,
      fansRight: null,
    };
  const locked = g.mode === 'daily' && !a.correct && istDay(now) === g.day;
  return {
    correct: a.correct,
    blind: false,
    answer: locked ? null : perm.indexOf(q.answer),
    why: locked ? null : q.why,
    source: locked ? null : q.source,
    locked,
    timedOut: a.choice === -1,
    points: a.points,
    seconds: Math.round(a.ms / 10) / 100,
    streak,
    score,
    fansRight: fansRight(stats),
  };
}

const statsOf = (sql: Sql, id: string) =>
  sql.get<{ answered: number; correct: number }>(
    'SELECT answered, correct FROM quiz_question_stats WHERE question_id = ?',
    [id],
  );

/**
 * A lost reply resent (Q13): the identical choice for an answered question gets the stored reveal
 * back (and the summary, if it was the last); a different choice is refused. Nothing is re-scored.
 */
async function resend(
  sql: Sql,
  g: GameRow,
  body: QuizAnswerBody,
  now: number,
): Promise<QuizAnswerReply> {
  const answers = await answersOf(sql, g.id);
  const a = answers.find((x) => x.idx === body.index);
  const ids: string[] = JSON.parse(g.questions);
  const perm = (JSON.parse(g.perms) as number[][])[body.index];
  const q = getBank().byId.get(a?.question_id ?? '');
  if (!a || !q || !perm || a.sent !== body.choice)
    return fail('That question is already answered.', 'order');
  const upTo = answers.filter((x) => x.idx <= a.idx);
  let streak = 0;
  for (const x of upTo) streak = x.correct ? streak + 1 : 0;
  const score = upTo.reduce((t, x) => t + x.points, 0);
  const reveal = revealOf(
    g,
    q,
    perm,
    { ...a, correct: !!a.correct },
    streak,
    score,
    await statsOf(sql, q.id),
    now,
  );
  const last = g.finished_at !== null && a.idx === ids.length - 1;
  return { ok: true, reveal, more: !last, summary: last ? await summarize(sql, g, now) : null };
}

export async function answerQuestion(
  sql: Sql,
  body: QuizAnswerBody,
  o: Owner,
  now = Date.now(),
): Promise<QuizAnswerReply> {
  const g = await ownedGame(sql, body.game, o);
  if (isError(g)) return g;
  if (![-1, 0, 1, 2, 3].includes(body.choice)) return fail('Pick an option.', 'invalid');
  if (body.index < g.pos) return resend(sql, g, body, now);
  if (g.finished_at !== null) return fail('This game is over.', 'over');
  if (g.abandoned_at !== null) return fail(ABANDONED, 'replaced');
  // Q20c: a daily is played on its own IST day only.
  if (g.mode === 'daily' && istDay(now) !== g.day) return fail(CLOSED_DAILY, 'closed');
  if (now - g.created_at > GAME_TTL) return fail('This game has expired.', 'expired');
  if (body.index !== g.pos) return fail('That is not the current question.', 'order');
  // Its clock starts when it is served (start, or /next): an unserved question can't be answered.
  if (!g.served_at) return fail('Ask for that question first.', 'order');
  const ids: string[] = JSON.parse(g.questions);
  const perms: number[][] = JSON.parse(g.perms);
  const q = getBank().byId.get(ids[g.pos] ?? '');
  const perm = perms[g.pos];
  if (!q || !perm) return fail('That question is gone. Start a new game.', 'other');

  const elapsed = Math.max(0, now - g.served_at);
  const timedOut = body.choice === -1 || elapsed > LIMIT_MS;
  const picked = timedOut ? -1 : (perm[body.choice] as number);
  const correct = picked === q.answer;
  const streak = correct ? g.streak + 1 : 0;
  const points = correct ? pointsFor(q.difficulty, elapsed, streak) : 0;
  const ms = Math.min(elapsed, LIMIT_MS);
  // The answer row is the lock: (game, index) is the primary key, so a replayed call scores nothing.
  const ins = await sql.run(
    `INSERT INTO quiz_answers (game_id, idx, question_id, choice, sent, correct, ms, points, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
    [g.id, g.pos, q.id, picked, body.choice, correct ? 1 : 0, ms, points, now],
  );
  if (!ins.changes) {
    // A resend racing its original: answer it like any other resend.
    const fresh = (await getGame(sql, g.id)) as GameRow;
    return fresh.pos > body.index
      ? resend(sql, fresh, body, now)
      : fail('That question is already answered.', 'order');
  }
  await sql.run(
    `INSERT INTO quiz_question_stats (question_id, answered, correct, total_ms) VALUES (?, 1, ?, ?)
     ON CONFLICT (question_id) DO UPDATE SET answered = answered + 1,
       correct = correct + excluded.correct, total_ms = total_ms + excluded.total_ms`,
    [q.id, correct ? 1 : 0, ms],
  );
  // The next question isn't served here (Q9): its clock starts when the player asks for it.
  const done = g.pos + 1 >= ids.length;
  await sql.run(
    `UPDATE quiz_games SET pos = pos + 1, served_at = 0, score = score + ?, correct = correct + ?,
            streak = ?, best_streak = MAX(best_streak, ?), total_ms = total_ms + ?, finished_at = ?
      WHERE id = ? AND pos = ? AND abandoned_at IS NULL`,
    [points, correct ? 1 : 0, streak, streak, ms, done ? now : null, g.id, g.pos],
  );
  const reveal = revealOf(
    g,
    q,
    perm,
    { choice: picked, correct, ms, points },
    streak,
    g.score + points,
    await statsOf(sql, q.id),
    now,
  );
  let summary: QuizSummary | null = null;
  if (done) summary = await finish(sql, (await getGame(sql, g.id)) as GameRow, now);
  return { ok: true, reveal, more: !done, summary };
}

/**
 * Serve question `index`, the one after the last answered (Q9). The first call stamps its clock; a
 * repeat returns the same question with the clock still running from that first call. A question
 * retired since the game started is swapped for a live one here (or dropped if none is left).
 */
export async function nextQuestion(
  sql: Sql,
  body: QuizNextBody,
  o: Owner,
  now = Date.now(),
): Promise<QuizNextReply> {
  const g = await ownedGame(sql, body.game, o);
  if (isError(g)) return g;
  if (g.finished_at !== null) return fail('This game is over.', 'over');
  if (g.abandoned_at !== null) return fail(ABANDONED, 'replaced');
  if (g.mode === 'daily' && istDay(now) !== g.day) return fail(CLOSED_DAILY, 'closed');
  if (now - g.created_at > GAME_TTL) return fail('This game has expired.', 'expired');
  if (body.index < g.pos) return fail('That question is already answered.', 'order');
  if (body.index > g.pos) return fail('Answer the current question first.', 'order');
  const bank = getBank();
  const ids: string[] = JSON.parse(g.questions);
  const perms: number[][] = JSON.parse(g.perms);
  if (!g.served_at) {
    const retired = await retiredIds(sql);
    // Q23d: checked against TODAY's daily at serve time, so a game crossing midnight never serves
    // the new day's daily questions.
    const todays = g.mode === 'daily' ? new Set<string>() : await dailyIdsNear(sql, istDay(now));
    const bad = (id: string) => retired.has(id) || todays.has(id);
    let changed = false;
    while (g.pos < ids.length && bad(ids[g.pos] as string)) {
      changed = true;
      const sub = await substitute(sql, g, ids, g.pos, bank.byId.get(ids[g.pos] as string), now);
      if (sub) ids[g.pos] = sub.id;
      else {
        ids.splice(g.pos, 1);
        perms.splice(g.pos, 1);
      }
    }
    if (g.pos >= ids.length) {
      // Nothing live left to ask: the game ends at what was answered.
      await sql.run(
        'UPDATE quiz_games SET questions = ?, perms = ?, total = ?, finished_at = ? WHERE id = ? AND pos = ?',
        [JSON.stringify(ids), JSON.stringify(perms), ids.length, now, g.id, g.pos],
      );
      await finish(sql, (await getGame(sql, g.id)) as GameRow, now);
      return fail('No questions left. That game is over.', 'over');
    }
    // Only the first call stamps the clock (served_at = 0 → now); a racing repeat reads it back.
    const r = await sql.run(
      `UPDATE quiz_games SET served_at = ?, questions = ?, perms = ?, total = ?
        WHERE id = ? AND pos = ? AND served_at = 0 AND abandoned_at IS NULL`,
      [now, JSON.stringify(ids), JSON.stringify(perms), ids.length, g.id, g.pos],
    );
    if (r.changes) await markServed(sql, ids[g.pos] as string, g, now);
    else if (changed) {
      const fresh = (await getGame(sql, g.id)) as GameRow;
      return serveView(fresh, now);
    }
  }
  return serveView(
    {
      ...g,
      questions: JSON.stringify(ids),
      perms: JSON.stringify(perms),
      served_at: g.served_at || now,
    },
    now,
  );
}

/**
 * The current question as the player sees it. `seconds` is what's left on the server clock (whole
 * seconds, at least 1), so a repeat /next or a resumed daily shows the ring where the server has it.
 */
function serveView(g: GameRow, now: number): QuizNextReply {
  const ids: string[] = JSON.parse(g.questions);
  const perms: number[][] = JSON.parse(g.perms);
  const q = getBank().byId.get(ids[g.pos] ?? '');
  const perm = perms[g.pos];
  if (!q || !perm) return fail('That question is gone. Start a new game.', 'other');
  const left = g.served_at
    ? QUESTION_SECONDS * 1000 - (now - g.served_at)
    : QUESTION_SECONDS * 1000;
  return { ok: true, question: view(q, perm, g.pos, Math.max(1, Math.ceil(left / 1000))) };
}

/** Epoch ms of the start of an IST day. */
const dayStart = (day: string) => Date.parse(`${day}T00:00:00+05:30`);

/**
 * Facts known (Q12): credit the game's right answers to its fan, but only for questions this game
 * was the fan's first-ever sight of (their own history plus any guest browser merged into it), at
 * most FACTS_PER_DAY a fan per IST day (Q18). Blind dailies credit nothing. Returns how many were added.
 */
async function master(sql: Sql, g: GameRow, now = Date.now()): Promise<number> {
  if (g.user_id === null || isBlind(g)) return 0;
  const bank = getBank();
  const from = dayStart(istDay(now));
  const today = await sql.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM quiz_mastered WHERE user_id = ? AND at >= ? AND at < ?',
    [g.user_id, from, from + 86400_000],
  );
  let room = FACTS_PER_DAY - (today?.n ?? 0);
  let added = 0;
  for (const a of await answersOf(sql, g.id)) {
    if (!a.correct) continue;
    if (room <= 0) break;
    const r = await sql.run(
      `INSERT INTO quiz_mastered (user_id, question_id, universe, game_id, at)
         SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM quiz_seen
                                              WHERE who = ? AND question_id = ? AND first_game = ?)
       ON CONFLICT DO NOTHING`,
      [
        g.user_id,
        a.question_id,
        bank.byId.get(a.question_id)?.universe ?? 'other',
        g.id,
        now,
        `u${g.user_id}`,
        a.question_id,
        g.id,
      ],
    );
    added += r.changes;
    room -= r.changes;
  }
  await sql.run('UPDATE quiz_games SET new_facts = ? WHERE id = ?', [added, g.id]);
  return added;
}

/**
 * Settle a game that can now count: hold a ranked game with an inhuman pace for a mod (Q11), else
 * credit its facts. A ranked game with a suspiciously even pace (Q18 tight band) still counts but is
 * flagged for the trust queue, and its name waits in gated places until a mod clears it. An unranked
 * game is never held (no queue, no "held" copy), but an inhuman pace there credits no facts either.
 */
async function settle(sql: Sql, g: GameRow, now: number): Promise<void> {
  const input = await paceInput(sql, g.id);
  const why = heldReasons(input);
  if (why.length) {
    await sql.run('UPDATE quiz_games SET pace_held = 1 WHERE id = ?', [g.id]);
    g.pace_held = 1;
  }
  if (why.length && g.ranked === 1) {
    await sql.run('UPDATE quiz_games SET review = ?, reasons = ? WHERE id = ?', [
      REVIEW.held,
      why.join('; '),
      g.id,
    ]);
    g.review = REVIEW.held;
    return;
  }
  if (why.length) return;
  const flags = g.ranked === 1 ? flagReasons(input) : [];
  if (flags.length) {
    const reason = flags.join('; ');
    await sql.run('UPDATE quiz_games SET flag = ?, reasons = ? WHERE id = ?', [
      FLAG.flagged,
      reason,
      g.id,
    ]);
    g.flag = FLAG.flagged;
    g.reasons = reason;
  }
  g.new_facts = await master(sql, g, now);
}

/** Game over: settle it and build the summary. */
async function finish(sql: Sql, g: GameRow, now: number): Promise<QuizSummary> {
  await settle(sql, g, now);
  return summarize(sql, g, now);
}

async function summarize(sql: Sql, g: GameRow, now: number): Promise<QuizSummary> {
  const answers = await answersOf(sql, g.id);
  const held = g.review === REVIEW.held;
  const onBoard = g.ranked === 1 && g.user_id !== null && (g.review === 0 || g.review === 3);
  // The rank is shown only where this game set the player's row (Q14): their daily, their universe
  // best when this game is it, or the facts board when it added facts.
  let rank: number | null = null;
  let boardName: string | null = null;
  let row: Ranked | undefined;
  const kind: BoardId = g.mode === 'character' ? 'facts' : g.mode;
  if (onBoard && g.user_id !== null) {
    if (g.mode === 'daily') {
      row = (await dailyRows(sql, g.day)).find((r) => r.game_id === g.id);
      boardName = g.day === istDay(now) ? 'Today’s daily' : `Daily ${g.day}`;
    } else if (g.mode === 'universe') {
      row = (await universeRows(sql, g.universe ?? undefined, 0)).find((r) => r.game_id === g.id);
      boardName = boardOf(g);
    } else if (g.new_facts > 0) {
      row = (await factsRows(sql, undefined, 0)).find((r) => r.user_id === g.user_id);
      boardName = 'Facts known';
    }
    rank = row?.rank ?? null;
    if (rank === null) boardName = null;
  }
  // Q17/Q19: in a gated place, the name waits for a mod's look.
  const nameWithheld = row ? withheldAt(await gateState(sql), kind, row) : false;
  const blind = isBlind(g);
  // A personal best beats an earlier finished game of the same kind that counts (held or rejected
  // games are no baseline; a first game isn't one).
  const prev = await sql.get<{ best: number | null }>(
    `SELECT MAX(score) AS best FROM quiz_games
      WHERE id != ? AND finished_at IS NOT NULL AND review IN (0, 3) AND mode = ?
        AND COALESCE(universe, '') = ? AND COALESCE(character, '') = ?
        AND ${g.user_id !== null ? 'user_id = ?' : 'owner = ?'}`,
    [g.id, g.mode, g.universe ?? '', g.character ?? '', g.user_id ?? g.owner],
  );
  // A blind daily shows nothing until midnight (Q16b, Q20d): no score, count, streak or results.
  return {
    score: blind ? 0 : g.score,
    correct: blind ? 0 : g.correct,
    total: g.total,
    bestStreak: blind ? 0 : g.best_streak,
    newFacts: held || blind ? 0 : g.new_facts,
    ranked: g.ranked === 1,
    rank,
    board: boardName,
    held,
    // A held game is never a personal best (Q24).
    personalBest: !blind && !held && prev?.best != null && g.score > prev.best,
    grid: answers
      .map((a) => (blind ? '•' : a.choice === -1 ? '⏱' : a.correct ? '✓' : '✗'))
      .join(''),
    claimable: g.user_id === null && g.finished_at !== null && now - g.finished_at <= CLAIM_WINDOW,
    nameWithheld,
    blind,
  };
}

// ─── claim / report ──────────────────────────────────────────────────────────────────────────────

/**
 * A guest who just joined attaches their finished game (same browser, within 30 minutes). A universe
 * or character game ranks (and is pace-checked like any ranked game); a daily played as a guest never
 * ranks, since it could have been a scout (Q10). The browser's seen-history merges into the fan's.
 */
export async function claimGame(
  sql: Sql,
  game: string,
  user: User,
  guest: string | null,
  now = Date.now(),
): Promise<QuizClaimReply> {
  const t = await readGameToken(game);
  if (!t) return fail('That game id is not valid.', 'invalid');
  if (!guest || t.owner !== (await guestTag(guest)))
    return fail('That game was played in another browser.', 'invalid');
  const g = await getGame(sql, t.id);
  if (!g || g.owner !== t.owner) return fail('That game was played elsewhere.', 'invalid');
  if (g.user_id !== null)
    return fail(g.user_id === user.id ? 'Already yours.' : 'Already claimed.', 'other');
  if (g.finished_at === null) return fail('Finish the game first.', 'order');
  if (now - g.finished_at > CLAIM_WINDOW)
    return fail('Too late to claim that game (30 minutes).', 'expired');
  // A blind game (a guest daily, or a held-flood day, Q26) stays unranked.
  const ranked = g.mode !== 'daily' && g.blind !== 1;
  const upd = await sql.run(
    'UPDATE quiz_games SET user_id = ?, ranked = ? WHERE id = ? AND user_id IS NULL',
    [user.id, ranked ? 1 : 0, g.id],
  );
  if (!upd.changes) return fail('Already claimed.', 'other');
  await mergeGuestHistory(sql, user.id, guest);
  g.user_id = user.id;
  g.ranked = ranked ? 1 : 0;
  // A claimed guest daily is blind and earns no facts (Q18); settle() skips it.
  if (g.review === REVIEW.clean) await settle(sql, g, now);
  return { ok: true, summary: await summarize(sql, g, now) };
}

/** "This fact looks wrong": only for a question this player has answered (seen the reveal). */
export async function reportQuestion(
  sql: Sql,
  body: QuizReportBody,
  o: Owner,
  now = Date.now(),
): Promise<{ ok: true } | QuizError> {
  const g = await ownedGame(sql, body.game, o);
  if (isError(g)) return g;
  if (!Number.isInteger(body.index) || body.index < 0 || body.index >= g.pos)
    return fail('Answer that question first.', 'order');
  const a = await sql.get<{ question_id: string }>(
    'SELECT question_id FROM quiz_answers WHERE game_id = ? AND idx = ?',
    [g.id, body.index],
  );
  if (!a) return fail('Answer that question first.', 'order');
  await sql.run(
    `INSERT INTO quiz_reports (question_id, game_id, idx, user_id, reason, note, at)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
    [
      a.question_id,
      g.id,
      body.index,
      o.user?.id ?? null,
      body.reason,
      body.note?.trim().slice(0, 300) || null,
      now,
    ],
  );
  return { ok: true };
}

// ─── boards ──────────────────────────────────────────────────────────────────────────────────────

interface Ranked {
  user_id: number;
  /** The game behind the row (daily and universe boards). */
  game_id?: number;
  /** Universe of that game (universe boards: whose cap applies). */
  universe?: PublishedUniverse | null;
  name: string;
  value: number;
  detail: string;
  rank: number;
}

/** Total time as boards show and compare it: 0.1 s steps (Q14). */
const tenths = (ms: number) => Math.round(ms / 100);

function clock(ms: number): string {
  const t = tenths(ms);
  const s = (t % 600) / 10;
  return t >= 600 ? `${Math.floor(t / 600)}m ${s.toFixed(1)}s` : `${s.toFixed(1)}s`;
}

/** Equal keys share a rank ("1, 2, 2, 4"); rows come in board order. */
function shareRanks<T>(rows: T[], key: (r: T) => string): (T & { rank: number })[] {
  let prev: string | null = null;
  let rank = 0;
  return rows.map((r, i) => {
    const k = key(r);
    if (k !== prev) rank = i + 1;
    prev = k;
    return { ...r, rank };
  });
}

const BOARDABLE = `g.ranked = 1 AND g.finished_at IS NOT NULL AND g.review IN (0, 3) AND u.banned = 0`;

interface GameBoardRow {
  id: number;
  universe: PublishedUniverse | null;
  user_id: number;
  name: string;
  score: number;
  correct: number;
  total: number;
  total_ms: number;
}

const gameRanked = (rows: GameBoardRow[]): Ranked[] =>
  shareRanks(rows, (r) => `${r.score}:${tenths(r.total_ms)}`).map((r) => ({
    user_id: r.user_id,
    game_id: r.id,
    universe: r.universe,
    name: r.name,
    value: r.score,
    detail: `${r.correct}/${r.total} · ${clock(r.total_ms)}`,
    rank: r.rank,
  }));

/** Today's first attempts: score, ties → faster total time (to 0.1 s); equal both → same rank. */
async function dailyRows(sql: Sql, day: string): Promise<Ranked[]> {
  const rows = await sql.all<GameBoardRow>(
    `SELECT g.id, g.universe, g.user_id, u.name, g.score, g.correct, g.total, g.total_ms
       FROM quiz_games g JOIN users u ON u.id = g.user_id
      WHERE g.mode = 'daily' AND g.day = ? AND ${BOARDABLE}
      ORDER BY g.score DESC, ROUND(g.total_ms / 100.0) ASC, g.id ASC`,
    [day],
  );
  return gameRanked(rows);
}

/** Each fan's best universe-mode game (in one universe, or any), since `since`. */
async function universeRows(
  sql: Sql,
  universe: PublishedUniverse | undefined,
  since: number,
): Promise<Ranked[]> {
  const rows = await sql.all<GameBoardRow>(
    `SELECT * FROM (
       SELECT g.id, g.universe, g.user_id, u.name, g.score, g.correct, g.total, g.total_ms,
              ROW_NUMBER() OVER (PARTITION BY g.user_id
                                 ORDER BY g.score DESC, ROUND(g.total_ms / 100.0) ASC, g.id ASC) AS rn
         FROM quiz_games g JOIN users u ON u.id = g.user_id
        WHERE g.mode = 'universe' AND (? IS NULL OR g.universe = ?) AND g.finished_at >= ?
          AND ${BOARDABLE})
      WHERE rn = 1 ORDER BY score DESC, ROUND(total_ms / 100.0) ASC, id ASC`,
    [universe ?? null, universe ?? null, since],
  );
  return gameRanked(rows);
}

/** Live facts known per fan; equal counts share a rank (listed by who got there first). */
async function factsRows(
  sql: Sql,
  universe: PublishedUniverse | undefined,
  since: number,
): Promise<Ranked[]> {
  const rows = await sql.all<{ user_id: number; name: string; n: number }>(
    `SELECT m.user_id, u.name, COUNT(*) AS n, MAX(m.at) AS last
       FROM quiz_mastered m JOIN users u ON u.id = m.user_id
      WHERE u.banned = 0 AND m.at >= ? AND (? IS NULL OR m.universe = ?)
        AND m.question_id NOT IN (SELECT question_id FROM quiz_retired)
      GROUP BY m.user_id ORDER BY n DESC, last ASC, m.user_id ASC`,
    [since, universe ?? null, universe ?? null],
  );
  return shareRanks(rows, (r) => String(r.n)).map((r) => ({
    user_id: r.user_id,
    name: r.name,
    value: r.n,
    detail: `${r.n} fact${r.n === 1 ? '' : 's'}`,
    rank: r.rank,
  }));
}

/**
 * What a gated place needs to know (Q19): which games a mod approved (the daily podium is per game),
 * each fan's caps per board, and which games carry an uncleared pace flag (Q18/Q21).
 */
interface GateState {
  /** `${gameId}:${board}` — a mod approved this game on this board (Q19, per board since round 5). */
  approved: Set<string>;
  /** `${userId}:${board}` → cap value; board = `u:<universe>` or `facts`. */
  caps: Map<string, number>;
  flaggedGames: Set<number>;
  /** Fan → their flagged games. */
  flaggedFans: Map<number, number[]>;
}

async function gateState(sql: Sql): Promise<GateState> {
  const approved = await sql.all<{ game_id: number; board: string }>(
    'SELECT game_id, board FROM quiz_approvals',
  );
  const caps = await sql.all<{ user_id: number; board: string; value: number }>(
    'SELECT user_id, board, value FROM quiz_caps',
  );
  const flagged = await sql.all<{ id: number; user_id: number | null }>(
    'SELECT id, user_id FROM quiz_games WHERE flag = 1',
  );
  return {
    approved: new Set(approved.map((r) => `${r.game_id}:${r.board}`)),
    caps: new Map(caps.map((c) => [`${c.user_id}:${c.board}`, c.value])),
    flaggedGames: new Set(flagged.map((r) => r.id)),
    flaggedFans: flagged.reduce((m, r) => {
      if (r.user_id !== null) m.set(r.user_id, [...(m.get(r.user_id) ?? []), r.id]);
      return m;
    }, new Map<number, number[]>()),
  };
}

/**
 * Is this row's name withheld (Q17/Q19)? Only in a gated place, and every check is per board: the
 * daily podium needs that very game approved *on the daily*; a universe board needs the score within
 * 1.1 × the fan's last approved score on that board; facts known needs the count within the count at
 * the last facts approval + 30. A flagged game waits on each board until approved there (facts: while
 * the fan has a flagged game not approved on facts).
 */
function withheldAt(gate: GateState, kind: BoardId, r: Ranked): boolean {
  if (r.rank > GATED[kind]) return false;
  const ok = (gameId: number | undefined) => gate.approved.has(`${gameId ?? -1}:${kind}`);
  if (kind === 'daily') return !ok(r.game_id);
  if (kind === 'universe') {
    // Approved on this board: that game is named (a held game's approval names only it, Q24).
    if (ok(r.game_id)) return false;
    if (gate.flaggedGames.has(r.game_id ?? -1)) return true;
    const cap = gate.caps.get(`${r.user_id}:u:${r.universe}`);
    return cap === undefined || r.value > cap * CAP_MARGIN;
  }
  if (gate.flaggedFans.get(r.user_id)?.some((id) => !ok(id))) return true;
  const cap = gate.caps.get(`${r.user_id}:facts`);
  return cap === undefined || r.value > cap + FACTS_CAP_SLACK;
}

/** The board a game's approval sets a cap on (the daily podium is per game). */
function boardOf(g: { mode: QuizMode; universe: string | null }): string {
  if (g.mode === 'daily') return 'Today’s daily';
  if (g.mode === 'universe')
    return `${UNIVERSE_LABEL[g.universe as PublishedUniverse] ?? 'Universe'} best`;
  return 'Facts known';
}

async function boardList(
  sql: Sql,
  id: BoardId,
  opts: { universe?: PublishedUniverse; window?: 'all' | 'week'; now?: number },
): Promise<Ranked[]> {
  const now = opts.now ?? Date.now();
  const since = opts.window === 'week' ? now - WEEK : 0;
  return id === 'daily'
    ? dailyRows(sql, istDay(now))
    : id === 'universe'
      ? universeRows(sql, opts.universe, since)
      : factsRows(sql, opts.universe, since);
}

/**
 * A leaderboard (Q4): the top 50, how many are on it, and the viewer's own row wherever it sits.
 * `now` picks today's IST day and the week window (defaults to the clock). Every game keeps its real
 * place; in a gated place an unchecked name reads as withheld to everyone but its owner (Q17).
 */
export async function board(
  sql: Sql,
  id: BoardId,
  opts: { universe?: PublishedUniverse; window?: 'all' | 'week'; now?: number },
  viewerId: number | null,
): Promise<{ rows: BoardRow[]; total: number; you: BoardRow | null }> {
  const list = await boardList(sql, id, opts);
  const gate = await gateState(sql);
  const perRank = new Map<number, number>();
  for (const r of list) perRank.set(r.rank, (perRank.get(r.rank) ?? 0) + 1);
  const out = (r: Ranked): BoardRow => {
    const you = r.user_id === viewerId;
    const withheld = withheldAt(gate, id, r);
    return {
      rank: r.rank,
      name: withheld && !you ? '' : r.name,
      value: r.value,
      detail: r.detail,
      you,
      withheld,
      tied: (perRank.get(r.rank) ?? 0) > 1,
    };
  };
  const mine = viewerId === null ? undefined : list.find((r) => r.user_id === viewerId);
  return {
    rows: list.slice(0, BOARD_TOP).map(out),
    total: list.length,
    you: mine ? out(mine) : null,
  };
}

// ─── analytics ───────────────────────────────────────────────────────────────────────────────────

const pct = (right: number, of: number) => (of ? Math.round((right / of) * 100) : 0);

function labelOf(g: {
  mode: QuizMode;
  universe: string | null;
  character: string | null;
  day: string;
}) {
  if (g.mode === 'daily') return `Daily · ${g.day}`;
  if (g.mode === 'universe') return UNIVERSE_LABEL[g.universe as PublishedUniverse] ?? 'Universe';
  return getBank().byCharacter.get(g.character ?? '')?.[0]?.name ?? g.character ?? 'Character';
}

/** Loader data for /quiz/me. */
export async function fanStats(sql: Sql, userId: number, now = Date.now()): Promise<FanStats> {
  const bank = getBank();
  // Finished games only (Q18). Today's blind games — blind dailies and held-flood games (Q26) — show
  // no result anywhere until their IST day ends: out of every figure, and in the recent list as
  // "blind" with no score.
  const blindNow = `(${BLIND_SQL} AND g.day = ?)`;
  const listed = 'g.user_id = ? AND g.finished_at IS NOT NULL';
  // Figures leave out held and rejected games too (like the personal best); the recent list keeps
  // them, marked held, so the fan sees what's waiting for a look.
  const counted = `${listed} AND NOT ${blindNow} AND g.review IN (0, 3)`;
  const today = istDay(now);
  const answers = await sql.all<{
    question_id: string;
    correct: number;
    ms: number;
    choice: number;
  }>(
    `SELECT a.question_id, a.correct, a.ms, a.choice FROM quiz_answers a
       JOIN quiz_games g ON g.id = a.game_id WHERE ${counted}`,
    [userId, today],
  );
  const g = await sql.get<{ games: number; best: number | null }>(
    `SELECT COUNT(*) AS games, MAX(g.best_streak) AS best FROM quiz_games g WHERE ${counted}`,
    [userId, today],
  );
  const facts = await sql.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM quiz_mastered
      WHERE user_id = ? AND question_id NOT IN (SELECT question_id FROM quiz_retired)`,
    [userId],
  );
  const tally = <K>() => new Map<K, { answered: number; correct: number }>();
  const byU = tally<PublishedUniverse>();
  const byT = tally<string>();
  const byD = tally<1 | 2 | 3>();
  const byC = tally<string>();
  const add = <K>(m: Map<K, { answered: number; correct: number }>, k: K, right: boolean) => {
    const t = m.get(k) ?? { answered: 0, correct: 0 };
    t.answered++;
    if (right) t.correct++;
    m.set(k, t);
  };
  let correct = 0;
  let ms = 0;
  let timed = 0;
  for (const a of answers) {
    correct += a.correct;
    // Timeouts count as answered (and wrong) but not toward the average time.
    if (a.choice !== -1) {
      ms += a.ms;
      timed++;
    }
    const q = bank.byId.get(a.question_id);
    if (!q) continue;
    add(byU, q.universe, !!a.correct);
    add(byT, q.topic, !!a.correct);
    add(byD, q.difficulty, !!a.correct);
    add(byC, q.slug, !!a.correct);
  }
  const recent = await sql.all<{
    finished_at: number;
    mode: QuizMode;
    universe: string | null;
    character: string | null;
    day: string;
    score: number;
    correct: number;
    total: number;
    review: number;
    blind_now: number;
  }>(
    `SELECT g.finished_at, g.mode, g.universe, g.character, g.day, g.score, g.correct, g.total,
            g.review, ${blindNow} AS blind_now FROM quiz_games g
      WHERE ${listed} ORDER BY g.finished_at DESC, g.id DESC LIMIT 10`,
    [today, userId],
  );
  const daily = await board(sql, 'daily', { now }, userId);
  const factsBoard = await board(sql, 'facts', { now }, userId);
  return {
    games: g?.games ?? 0,
    answered: answers.length,
    correct,
    accuracy: pct(correct, answers.length),
    bestStreak: g?.best ?? 0,
    factsMastered: facts?.n ?? 0,
    bankSize: (await liveBank(sql)).all.length,
    avgSeconds: timed ? Math.round(ms / timed / 100) / 10 : 0,
    byUniverse: [...byU].map(([universe, t]) => ({
      universe,
      answered: t.answered,
      accuracy: pct(t.correct, t.answered),
    })),
    byTopic: [...byT].map(([topic, t]) => ({
      topic,
      answered: t.answered,
      accuracy: pct(t.correct, t.answered),
    })),
    byDifficulty: ([1, 2, 3] as const)
      .filter((d) => byD.has(d))
      .map((difficulty) => {
        const t = byD.get(difficulty) as { answered: number; correct: number };
        return { difficulty, answered: t.answered, accuracy: pct(t.correct, t.answered) };
      }),
    // Only characters the fan is actually weak on (under 70%).
    weakest: [...byC]
      .filter(([, t]) => t.answered >= 3 && pct(t.correct, t.answered) < 70)
      .map(([slug, t]) => ({
        slug,
        name: bank.byCharacter.get(slug)?.[0]?.name ?? slug,
        answered: t.answered,
        accuracy: pct(t.correct, t.answered),
      }))
      .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered)
      .slice(0, 5),
    recent: recent.map((r) => ({
      at: r.finished_at,
      mode: r.mode,
      label: labelOf(r),
      score: r.blind_now ? 0 : r.score,
      correct: r.blind_now ? 0 : r.correct,
      total: r.total,
      held: r.review === REVIEW.held,
      ...(r.blind_now ? { blind: true } : {}),
    })),
    ranks: { daily: daily.you?.rank ?? null, facts: factsBoard.you?.rank ?? null },
  };
}

/** Loader data for /mod/quiz (finished games only). */
export async function siteStats(sql: Sql, now = Date.now()): Promise<SiteStats> {
  const bank = getBank();
  const days = Array.from({ length: 14 }, (_, i) => istDay(now - (13 - i) * 86400_000));
  // One player per person: a claimed game counts as its fan, and so does an unclaimed guest game from
  // a browser that later played signed in.
  const players = `COUNT(DISTINCT COALESCE('u' || g.user_id,
    (SELECT 'u' || x.user_id FROM quiz_games x WHERE x.browser = g.owner AND x.user_id IS NOT NULL
      LIMIT 1),
    g.owner))`;
  const perDay = await sql.all<{ day: string; games: number; players: number }>(
    `SELECT g.day, COUNT(*) AS games, ${players} AS players FROM quiz_games g
      WHERE g.finished_at IS NOT NULL AND g.review IN (0, 3) AND NOT ${BLIND_SQL} AND g.day >= ?
      GROUP BY g.day`,
    [days[0] as string],
  );
  const modes = await sql.all<{ mode: QuizMode; games: number }>(
    `SELECT g.mode, COUNT(*) AS games FROM quiz_games g
      WHERE g.finished_at IS NOT NULL AND g.review IN (0, 3) AND NOT ${BLIND_SQL} GROUP BY g.mode`,
  );
  // Per mode and universe: games that count (held, rejected and blind left out), and their accuracy.
  const universes = await sql.all<{
    universe: string;
    games: number;
    answered: number;
    correct: number;
  }>(
    `SELECT g.universe, COUNT(*) AS games, SUM(a.answered) AS answered, SUM(a.correct) AS correct
       FROM quiz_games g
       JOIN (SELECT game_id, COUNT(*) AS answered, SUM(correct) AS correct FROM quiz_answers
              GROUP BY game_id) a ON a.game_id = g.id
      WHERE g.finished_at IS NOT NULL AND g.universe IS NOT NULL AND g.review IN (0, 3)
        AND NOT ${BLIND_SQL}
      GROUP BY g.universe`,
  );
  const stats = await sql.all<{ question_id: string; answered: number; correct: number }>(
    'SELECT question_id, answered, correct FROM quiz_question_stats WHERE answered > 0',
  );
  const rated: { id: string; q: string; answered: number; accuracy: number }[] = [];
  for (const s of stats) {
    const q = bank.byId.get(s.question_id);
    if (!q) continue;
    if (s.answered >= FANS_RIGHT_MIN)
      rated.push({ id: q.id, q: q.q, answered: s.answered, accuracy: pct(s.correct, s.answered) });
  }
  const totals = await sql.get<{ games: number; players: number }>(
    `SELECT COUNT(*) AS games, ${players} AS players FROM quiz_games g
      WHERE g.finished_at IS NOT NULL AND g.review IN (0, 3) AND NOT ${BLIND_SQL}`,
  );
  // Questions actually answered (a choice made) in finished games that count: abandoned, held and
  // rejected games and timeouts don't inflate it. (Totals match the per-mode sum.)
  const answers = await sql.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM quiz_answers a JOIN quiz_games g ON g.id = a.game_id
      WHERE g.finished_at IS NOT NULL AND g.review IN (0, 3) AND NOT ${BLIND_SQL} AND a.choice != -1`,
  );
  // Blind dailies (guests', fans' later tries, held-flood days) are counted on their own (round 9).
  const blindDailies = await sql.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM quiz_games g
      WHERE g.finished_at IS NOT NULL AND g.mode = 'daily' AND ${BLIND_SQL}`,
  );
  const retired = await retiredIds(sql);
  return {
    perDay: days.map((day) => {
      const r = perDay.find((p) => p.day === day);
      return { day, games: r?.games ?? 0, players: r?.players ?? 0 };
    }),
    byMode: QUIZ_MODES.map((mode) => ({
      mode,
      games: modes.find((m) => m.mode === mode)?.games ?? 0,
    })),
    byUniverse: PUBLISHED_UNIVERSES.map((universe) => {
      // A universe nobody has played a game of reports 0 games, 0% (the page hides it).
      const u = universes.find((r) => r.universe === universe);
      return { universe, games: u?.games ?? 0, accuracy: u ? pct(u.correct, u.answered) : 0 };
    }),
    hardest: [...rated]
      .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered)
      .slice(0, 10),
    easiest: [...rated]
      .sort((a, b) => b.accuracy - a.accuracy || b.answered - a.answered)
      .slice(0, 10),
    totals: {
      games: totals?.games ?? 0,
      players: totals?.players ?? 0,
      answers: answers?.n ?? 0,
      bank: bank.all.filter((q) => !retired.has(q.id)).length,
      retired: retired.size,
      blindDailies: blindDailies?.n ?? 0,
    },
  };
}

/**
 * Yesterday's daily with its answers (Q10: a daily's answers unlock at midnight IST). Questions in the
 * order they were played, options as written, `answer` indexing those. Null when there is no bank.
 */
export async function dailyArchive(sql: Sql, now = Date.now()): Promise<DailyArchive | null> {
  const day = istDay(now - 86400_000);
  const qs = await dailyQuestions(getBank().all, await retiredIds(sql), day);
  if (!qs.length) return null;
  const out: DailyArchive['questions'] = [];
  for (const q of qs)
    out.push({
      q: q.q,
      options: [...q.options] as DailyArchive['questions'][number]['options'],
      answer: q.answer,
      why: q.why,
      source: q.source,
      character: { slug: q.slug, name: q.name, universe: q.universe },
      fansRight: fansRight(await statsOf(sql, q.id)),
    });
  return { day, questions: out };
}

// ─── moderation ──────────────────────────────────────────────────────────────────────────────────

/** Held ranked games (only ranked games are ever held, Q11) and reported facts. */
export async function modQuizQueues(sql: Sql): Promise<{ held: HeldGame[]; reports: ReportRow[] }> {
  const bank = getBank();
  const games = await sql.all<{
    id: number;
    name: string;
    mode: QuizMode;
    universe: string | null;
    character: string | null;
    day: string;
    score: number;
    correct: number;
    total: number;
    reasons: string | null;
    finished_at: number;
  }>(
    `SELECT g.id, u.name, g.mode, g.universe, g.character, g.day, g.score, g.correct, g.total,
            g.reasons, g.finished_at
       FROM quiz_games g JOIN users u ON u.id = g.user_id
      WHERE g.review = 1 AND g.ranked = 1 AND g.finished_at IS NOT NULL
      ORDER BY g.finished_at DESC, g.id DESC LIMIT 500`,
  );
  // Q26: one card per fan per day — the latest held game, with how many more are behind it.
  const card = new Map<string, number>();
  const latest: typeof games = [];
  for (const g of games) {
    const k = `${g.name}:${g.day}`;
    if (card.has(k)) card.set(k, (card.get(k) ?? 0) + 1);
    else {
      card.set(k, 0);
      latest.push(g);
    }
  }
  const held: HeldGame[] = [];
  for (const g of latest.slice(0, 100)) {
    const answers = await answersOf(sql, g.id);
    held.push({
      id: g.id,
      name: g.name,
      mode: g.mode,
      label: labelOf(g),
      score: g.score,
      correct: g.correct,
      total: g.total,
      times: answers.map((a) => Math.round(a.ms / 10) / 100),
      floors: answers.map(
        (a) => Math.round(readFloorMs(bank.byId.get(a.question_id)?.q.length ?? 0) / 10) / 100,
      ),
      signals: await signalsOf(sql, (await getGame(sql, g.id)) as GameRow),
      reason: g.reasons ?? 'held',
      at: g.finished_at,
      more: card.get(`${g.name}:${g.day}`) ?? 0,
    });
  }
  const rows = await sql.all<{ question_id: string; reason: string; note: string | null }>(
    'SELECT question_id, reason, note FROM quiz_reports ORDER BY at DESC LIMIT 2000',
  );
  const retired = await retiredIds(sql);
  const byQ = new Map<string, ReportRow>();
  for (const r of rows) {
    const q = bank.byId.get(r.question_id);
    if (!q) continue;
    let row = byQ.get(q.id);
    if (!row) {
      row = {
        questionId: q.id,
        q: q.q,
        answer: q.options[q.answer] as string,
        why: q.why,
        source: q.source,
        reports: 0,
        reasons: [],
        notes: [],
        retired: retired.has(q.id),
      };
      byQ.set(q.id, row);
    }
    row.reports++;
    if (!row.reasons.includes(r.reason)) row.reasons.push(r.reason);
    if (r.note && row.notes.length < 10) row.notes.push(r.note);
  }
  const reports = [...byQ.values()]
    .sort((a, b) => Number(a.retired) - Number(b.retired) || b.reports - a.reports)
    .slice(0, 100);
  return { held, reports };
}

// ─── moderation calls and trust (Q17–Q21) ─────────────────────────────────────────────────────────

/** The best score a 10-question game can reach (all right, instantly, 3/4/3 difficulties). */
export const MAX_GAME_SCORE = PLAN.reduce(
  (t, d, i) => t + Math.round(150 * MULT[d]) + (i >= 2 ? 25 : 0),
  0,
);

/** What a mod's call did, in plain words for the confirmation (and the caps behind them). */
export interface QuizRuling {
  ok: true;
  gameId: number;
  name: string;
  approved: boolean;
  /** The board the call was for (approve), e.g. "Marvel best"; null for reject/revoke (all boards). */
  board: string | null;
  /** e.g. "Approved X’s game on Marvel best: names show there up to 1,650 points." */
  message: string;
  /** Caps set (approve: the highest value a name shows at) or reset (value null). */
  caps: { board: string; value: number | null }[];
}
/** Why a mod's call did nothing, in words for the mod page. */
export interface QuizRulingRefused {
  ok: false;
  reason: 'not-found' | 'bad-board' | 'not-finished' | 'already';
  message: string;
}
export type QuizRulingResult = QuizRuling | QuizRulingRefused;

const refuse = (reason: QuizRulingRefused['reason'], message: string): QuizRulingRefused => ({
  ok: false,
  reason,
  message,
});

const num = (n: number) => n.toLocaleString('en-US');

async function factsCount(sql: Sql, userId: number): Promise<number> {
  const r = await sql.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM quiz_mastered
      WHERE user_id = ? AND question_id NOT IN (SELECT question_id FROM quiz_retired)`,
    [userId],
  );
  return r?.n ?? 0;
}

async function setCap(sql: Sql, userId: number, board: string, value: number, now: number) {
  await sql.run(
    `INSERT INTO quiz_caps (user_id, board, value, at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, board) DO UPDATE SET value = excluded.value, at = excluded.at`,
    [userId, board, value, now],
  );
}

/** The display name of a game's board of `kind`. */
const boardName = (kind: BoardId, g: { mode: QuizMode; universe: string | null }) =>
  kind === 'facts' ? 'Facts known' : kind === 'daily' ? 'Today’s daily' : boardOf(g);

/**
 * The board a ruling is for, strictly: a BoardId or this game's exact board label (as a TrustCheck
 * shows it). Anything else is refused. Daily approvals are for daily games only, universe approvals
 * for universe games only; facts known (a fan-level board) for any of the fan's games.
 */
function boardFor(b: string, g: { mode: QuizMode; universe: string | null }): BoardId | null {
  const kind: BoardId | null =
    b === 'facts' || b === 'Facts known'
      ? 'facts'
      : b === 'daily' || b === 'Today’s daily'
        ? 'daily'
        : b === 'universe' || (g.mode === 'universe' && b === boardOf(g))
          ? 'universe'
          : null;
  if (kind === 'daily' && g.mode !== 'daily') return null;
  if (kind === 'universe' && g.mode !== 'universe') return null;
  return kind;
}

/** A game's own board (the one an approval is for when the mod names none). */
const ownBoard = (g: { mode: QuizMode }): BoardId => (g.mode === 'character' ? 'facts' : g.mode);

/**
 * Approve on one board (round 5: per board, never per game). The game counts again if it was held or
 * rejected (its first-sight facts are credited), and it is named on `kind`. A clean game's approval
 * also sets that board's cap (the daily podium has none: it is per game). A game whose pace was held
 * gets **no** cap (Q24): a bot-pace score must never cover a fan's future games.
 */
async function approve(
  sql: Sql,
  g: GameRow & { name: string },
  now: number,
  kind: BoardId,
): Promise<QuizRuling> {
  const heldPace = heldReasons(await paceInput(sql, g.id)).length > 0;
  let credited = 0;
  if (g.review !== REVIEW.approved) {
    await sql.run('UPDATE quiz_games SET review = 3, ruled_at = ? WHERE id = ?', [now, g.id]);
    if (g.review === REVIEW.held || g.review === REVIEW.rejected)
      credited = await master(sql, { ...g, review: REVIEW.approved }, now);
  }
  await sql.run(
    `INSERT INTO quiz_approvals (game_id, board, at) VALUES (?, ?, ?)
     ON CONFLICT (game_id, board) DO UPDATE SET at = excluded.at`,
    [g.id, kind, now],
  );
  const board = boardName(kind, g);
  const caps: QuizRuling['caps'] = [];
  const parts: string[] = [];
  if (heldPace || kind === 'daily') {
    parts.push(
      kind === 'facts' ? 'counted on Facts known' : `named on ${board} for this game only`,
    );
  } else if (kind === 'universe') {
    await setCap(sql, g.user_id as number, `u:${g.universe}`, g.score, now);
    const top = Math.floor(g.score * CAP_MARGIN);
    caps.push({ board, value: top });
    parts.push(
      top >= MAX_GAME_SCORE
        ? `this covers any score on ${board}`
        : `names show there up to ${num(top)} points`,
    );
  } else {
    const facts = await factsCount(sql, g.user_id as number);
    await setCap(sql, g.user_id as number, 'facts', facts, now);
    const top = facts + FACTS_CAP_SLACK;
    caps.push({ board, value: top });
    parts.push(
      top >= (await liveBank(sql)).all.length
        ? 'this covers any count on Facts known'
        : `names show there up to ${num(top)} facts`,
    );
  }
  if (credited) parts.push(`credited ${credited} fact${credited === 1 ? '' : 's'} to Facts known`);
  if (heldPace) parts.push('no cap set (a held pace never covers future games)');
  // Only say nothing else moved when that's true (facts credited move Facts known).
  const rest = credited ? '' : ' Other boards are unchanged.';
  return {
    ok: true,
    gameId: g.id,
    name: g.name,
    approved: true,
    board,
    message: `Approved ${g.name}’s ${heldPace ? 'held ' : ''}game on ${board}: ${parts.join('; ')}.${rest}`,
    caps,
  };
}

/** Reject or revoke: the game leaves every board, its facts go, approvals and caps reset. */
async function reject(
  sql: Sql,
  g: GameRow & { name: string },
  verb: 'Rejected' | 'Revoked',
  now: number,
): Promise<QuizRuling> {
  await sql.run('UPDATE quiz_games SET review = 2, ruled_at = ? WHERE id = ?', [now, g.id]);
  await sql.run('DELETE FROM quiz_mastered WHERE game_id = ?', [g.id]);
  await sql.run('DELETE FROM quiz_approvals WHERE game_id = ?', [g.id]);
  const keys = g.mode === 'universe' ? [`u:${g.universe}`, 'facts'] : ['facts'];
  for (const k of keys)
    await sql.run('DELETE FROM quiz_caps WHERE user_id = ? AND board = ?', [g.user_id, k]);
  const boards = keys.map((k) => (k === 'facts' ? 'Facts known' : boardOf(g)));
  return {
    ok: true,
    gameId: g.id,
    name: g.name,
    approved: false,
    board: null,
    message: `${verb}: ${g.name}’s game is off every board and its facts are removed; their ${boards.join(' and ')} cap${boards.length > 1 ? 's are' : ' is'} reset, so their name waits for a new look there. It can be approved again later.`,
    caps: boards.map((board) => ({ board, value: null })),
  };
}

const gameWithName = (sql: Sql, gameId: number) =>
  sql.get<GameRow & { name: string }>(
    'SELECT g.*, u.name FROM quiz_games g JOIN users u ON u.id = g.user_id WHERE g.id = ?',
    [gameId],
  );

/** Shared checks before a ruling: the game exists, is a fan's, and is finished. */
async function rulable(
  sql: Sql,
  gameId: number,
): Promise<(GameRow & { name: string }) | QuizRulingRefused> {
  const g = await gameWithName(sql, gameId);
  if (!g)
    return refuse(
      'not-found',
      `No fan game #${gameId} — it may have been a guest’s, or the id is wrong.`,
    );
  if (g.finished_at === null) return refuse('not-finished', `Game #${gameId} isn’t finished yet.`);
  return g;
}

/**
 * A mod's call on a held game or a trust-queue item, for one board: approve (names it there / sets
 * that board's cap; the game counts again if it was held or rejected) or reject (off every board,
 * approvals and caps reset). `board` takes a BoardId or the item's exact board label, and defaults to
 * the game's own board; an unknown board is refused, never guessed.
 */
export async function ruleGame(
  sql: Sql,
  gameId: number,
  approveIt: boolean,
  now = Date.now(),
  board?: BoardId | string,
): Promise<QuizRulingResult> {
  const g = await rulable(sql, gameId);
  if (!('id' in g)) return g;
  if (!approveIt) {
    if (g.review === REVIEW.rejected)
      return refuse('already', `Game #${gameId} is already off the boards.`);
    return reject(sql, g, 'Rejected', now);
  }
  const kind = board === undefined ? ownBoard(g) : boardFor(board, g);
  if (!kind)
    return refuse(
      'bad-board',
      `“${board}” isn’t a board game #${gameId} can be approved on (try ${boardName(ownBoard(g), g)} or Facts known).`,
    );
  return approve(sql, g, now, kind);
}

/** Take a game back off the boards: rejected, facts removed, approvals and caps reset (re-approvable). */
export async function revokeGame(
  sql: Sql,
  gameId: number,
  now = Date.now(),
): Promise<QuizRulingResult> {
  const g = await rulable(sql, gameId);
  if (!('id' in g)) return g;
  if (g.review === REVIEW.rejected)
    return refuse('already', `Game #${gameId} is already off the boards.`);
  return reject(sql, g, 'Revoked', now);
}

/**
 * "Reject all by player": every game of theirs leaves the boards (approved ones too), every approval
 * and cap is reset and their facts-known credit is removed.
 */
export async function rejectFan(
  sql: Sql,
  userId: number,
  now = Date.now(),
): Promise<{ games: number; message: string }> {
  const r = await sql.run(
    'UPDATE quiz_games SET review = 2, ruled_at = ? WHERE user_id = ? AND review != 2',
    [now, userId],
  );
  await sql.run(
    'DELETE FROM quiz_approvals WHERE game_id IN (SELECT id FROM quiz_games WHERE user_id = ?)',
    [userId],
  );
  await sql.run('DELETE FROM quiz_caps WHERE user_id = ?', [userId]);
  await sql.run('DELETE FROM quiz_mastered WHERE user_id = ?', [userId]);
  const u = await sql.get<{ name: string }>('SELECT name FROM users WHERE id = ?', [userId]);
  return {
    games: r.changes,
    message: `Rejected all of ${u?.name ?? 'this fan'}’s games (${r.changes}): off every board, facts known cleared, every approval and cap reset.`,
  };
}

/**
 * Q21/Q23: scouting signals for a mod — what else came from this game's IP or browser that day, an
 * earlier daily from this browser by someone else, how much was seen before, and a tight band.
 */
async function signalsOf(sql: Sql, g: GameRow): Promise<QuizSignal[]> {
  const out: QuizSignal[] = [];
  const strong = (text: string) => out.push({ text, strong: true });
  const weak = (text: string) => out.push({ text, strong: false });
  if (g.mode === 'daily' && g.browser) {
    // Dailies from this browser by someone else: before this game, or while it was being played.
    const others = await sql.all<{ user_id: number | null; created_at: number }>(
      `SELECT user_id, created_at FROM quiz_games
        WHERE mode = 'daily' AND day = ? AND browser = ? AND id != ? AND owner != ?
          AND created_at <= ?`,
      [g.day, g.browser, g.id, g.owner, g.finished_at ?? Date.now()],
    );
    const said = new Set<string>();
    for (const x of others) {
      const who = x.user_id === null || x.user_id === g.user_id ? 'blind' : 'another fan';
      said.add(
        x.created_at <= g.created_at
          ? `this browser played today’s daily earlier (${who})`
          : `this browser played today’s daily (${who}) during this game`,
      );
    }
    for (const text of said) strong(text);
  }
  // The fan's own record: games of theirs a pace rule held or a mod rejected (round 8).
  if (g.user_id !== null) {
    const h = await sql.get<{ ever: number; today: number }>(
      `SELECT COUNT(*) AS ever, SUM(CASE WHEN day = ? THEN 1 ELSE 0 END) AS today FROM quiz_games
        WHERE user_id = ? AND id != ? AND review IN (1, 2)`,
      [g.day, g.user_id, g.id],
    );
    if (h?.ever) {
      const n = (k: number) => `${k} held/rejected game${k === 1 ? '' : 's'}`;
      strong(`this fan has ${n(h.ever)} ever${h.today ? ` (${h.today} that day)` : ''}`);
    }
  }
  // Other fans' games that day (Q24): a shared browser is a strong signal, a shared IP a weak one.
  const others = await sql.all<{ same_browser: number }>(
    `SELECT (browser IS NOT NULL AND browser = ?) AS same_browser FROM quiz_games
      WHERE id != ? AND day = ? AND user_id IS NOT NULL AND user_id != ?
        AND ((browser IS NOT NULL AND browser = ?) OR (ip IS NOT NULL AND ip = ?))`,
    [g.browser ?? '', g.id, g.day, g.user_id ?? -1, g.browser ?? '', g.ip ?? ''],
  );
  const byBrowser = others.filter((x) => x.same_browser).length;
  const byIp = others.length - byBrowser;
  const games = (n: number) => `${n} game${n === 1 ? '' : 's'}`;
  if (byBrowser) strong(`${games(byBrowser)} by other fans from this browser that day`);
  if (byIp)
    weak(`${games(byIp)} by other fans on the same network that day (could be carrier NAT)`);
  const ids: string[] = JSON.parse(g.questions);
  const marks = ids.map(() => '?').join(',') || 'NULL';
  const seen = await sql.get<{ n: number }>(
    `SELECT COUNT(DISTINCT question_id) AS n FROM quiz_seen
      WHERE who IN (?, ?) AND first_game != ? AND question_id IN (${marks})`,
    [`u${g.user_id}`, g.browser ?? '', g.id, ...ids],
  );
  if (seen?.n) strong(`saw ${seen.n} of these ${ids.length} questions before`);
  const sd = tightBand(await paceInput(sql, g.id));
  if (sd !== null && sd < TIGHT_SIGNAL_MS)
    weak(`tight band: σ ${(sd / 1000).toFixed(2)} s over floor`);
  return out;
}

/**
 * The trust queue (Q17–Q21): every game whose name a public gated place withholds right now (today's
 * daily top 3, each universe board's top 3 all-time and this week, facts known top 10), plus every
 * uncleared pace flag. One item per game and board, with answer times, reading floors, reasons,
 * scouting signals and the board whose cap approving it sets (pass it to ruleGame); newest first.
 */
export async function trustQueue(sql: Sql, now = Date.now()): Promise<TrustCheck[]> {
  const gate = await gateState(sql);
  // One item per game and board: approving an item sets that board's cap only (Q23d).
  const why = new Map<string, { gameId: number; board: BoardId; reasons: string[] }>();
  const add = (gameId: number, board: BoardId, reason: string) => {
    const k = `${gameId}:${board}`;
    const item = why.get(k) ?? { gameId, board, reasons: [] };
    if (!item.reasons.includes(reason)) item.reasons.push(reason);
    why.set(k, item);
  };
  // Only the places the public boards show (/quiz/leaders).
  const views: { id: BoardId; universe?: PublishedUniverse; window: 'all' | 'week' }[] = [
    { id: 'daily', window: 'all' },
    ...PUBLISHED_UNIVERSES.flatMap((universe) =>
      (['all', 'week'] as const).map((window) => ({ id: 'universe' as const, universe, window })),
    ),
    { id: 'facts', window: 'all' },
  ];
  for (const v of views) {
    for (const r of await boardList(sql, v.id, { ...v, now })) {
      if (r.rank > GATED[v.id]) break;
      if (!withheldAt(gate, v.id, r)) continue;
      const name =
        v.id === 'daily'
          ? 'Today’s daily'
          : v.id === 'universe'
            ? `${UNIVERSE_LABEL[v.universe as PublishedUniverse]} best${v.window === 'week' ? ' (this week)' : ''}`
            : 'Facts known';
      let gameId = r.game_id;
      if (gameId === undefined) {
        // A facts row: the fan's latest counting game (a flagged one first).
        const last = await sql.get<{ id: number }>(
          `SELECT id FROM quiz_games WHERE user_id = ? AND finished_at IS NOT NULL
             AND review IN (0, 3) ORDER BY flag = 1 DESC, finished_at DESC, id DESC LIMIT 1`,
          [r.user_id],
        );
        if (!last) continue;
        gameId = last.id;
      }
      add(gameId, v.id, `#${r.rank} on ${name}`);
    }
  }
  const flagged = await sql.all<{ id: number; mode: QuizMode; reasons: string | null }>(
    `SELECT id, mode, reasons FROM quiz_games
      WHERE flag = 1 AND user_id IS NOT NULL AND review IN (0, 3)`,
  );
  for (const f of flagged) {
    // A flag rides on the game's places if it has any, else on its own board.
    const on = [...why.values()].filter((x) => x.gameId === f.id);
    const own: BoardId = f.mode === 'character' ? 'facts' : f.mode;
    for (const x of on.length ? on : [{ board: own }])
      if (!gate.approved.has(`${f.id}:${x.board}`)) add(f.id, x.board, f.reasons ?? 'pace flag');
  }
  const bank = getBank();
  const out: TrustCheck[] = [];
  for (const { gameId, board: kind, reasons } of why.values()) {
    const g = await gameWithName(sql, gameId);
    if (!g || g.user_id === null) continue;
    const answers = await answersOf(sql, gameId);
    out.push({
      userId: g.user_id,
      name: g.name,
      gameId,
      label: labelOf(g),
      score: g.score,
      correct: g.correct,
      total: g.total,
      times: answers.map((a) => Math.round(a.ms / 10) / 100),
      floors: answers.map(
        (a) => Math.round(readFloorMs(bank.byId.get(a.question_id)?.q.length ?? 0) / 10) / 100,
      ),
      // Where it sits first, then pace flags.
      reasons: [
        ...reasons.filter((x) => x.startsWith('#')),
        ...reasons.filter((x) => !x.startsWith('#')),
      ],
      signals: await signalsOf(sql, g),
      board: kind === 'facts' ? 'Facts known' : kind === 'daily' ? 'Today’s daily' : boardOf(g),
      at: g.finished_at ?? g.created_at,
    });
  }
  return out.sort((a, b) => b.at - a.at || b.gameId - a.gameId || a.board.localeCompare(b.board));
}

/** Retire (or bring back) a question. Retired ids never serve and drop off the facts board. */
export async function retireQuestion(sql: Sql, id: string, retired: boolean): Promise<boolean> {
  if (!getBank().byId.has(id)) return false;
  if (retired)
    await sql.run(
      'INSERT INTO quiz_retired (question_id, at) VALUES (?, ?) ON CONFLICT DO NOTHING',
      [id, Date.now()],
    );
  else await sql.run('DELETE FROM quiz_retired WHERE question_id = ?', [id]);
  return true;
}
