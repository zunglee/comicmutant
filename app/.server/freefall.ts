/**
 * Freefall leaderboard. The server never trusts a posted score: a run is (signed token, input log),
 * and the score is whatever FreefallCore says when the log is replayed. The token is stateless —
 * `mode.level.day.seed.issuedAt.sig` — so starting a run costs no write; a token posts at most once
 * (its signature is a UNIQUE column), and a run can't claim more game time than has passed since it
 * was issued.
 */
import { LEVELS, type Level } from '~/game/freefall/maths';
import { pausesIn, replay } from '~/game/freefall/replay';
import type { Sql } from './db';
import { hmac } from './guard';

export const MODES = ['daily', 'practice'] as const;
export type Mode = (typeof MODES)[number];

/** Tokens older than this can't be posted (time to finish, sign up and come back). */
const TOKEN_TTL = 3 * 3600_000;
/** Slack between game time and wall-clock time (rounding, a slow first frame). */
const CLOCK_SLACK = 10_000;

/** Today in India (the day boundary of the daily dive). */
export function istDay(at = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(at));
}

/** FNV-1a over a string → u32 (seed derivation; not a security property). */
function u32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0 || 1;
}

/** Everyone gets the same fall on the same day and level; unguessable before the day starts. */
export async function dailySeed(day: string, level: Level): Promise<number> {
  return u32(await hmac(`ff-daily:${day}:${level}`));
}

export interface RunToken {
  mode: Mode;
  level: Level;
  day: string;
  seed: number;
  issuedAt: number;
  /**
   * Daily only: which start of today's tower this is for the signed-in fan (1 = the ranked one);
   * 0 = a guest's unranked look at today's tower.
   */
  attempt: number;
  /** Who started it: `u<id>` (signed in) or `g<hash>` (guest cookie). Only they can post it. */
  owner: string;
  /** Seed of this run's sums (today's tower is shared; its sums are not, so it can't be memorised). */
  qseed: number;
  sig: string;
}

/**
 * Count a start of today's tower for a signed-in fan; the count is the attempt. Ranking today's dive
 * needs an account at the start (a nickname, no email): an anonymous id can be thrown away for a fresh
 * "first" try, an account can't.
 */
export async function countStart(sql: Sql, who: string[], level: Level, day: string) {
  let n = 1;
  for (const w of who) {
    const r = await sql.get<{ n: number }>(
      `INSERT INTO freefall_starts (who, level, day, n) VALUES (?, ?, ?, 1)
       ON CONFLICT (who, level, day) DO UPDATE SET n = n + 1 RETURNING n`,
      [await hmac(`ff-who:${w}`), level, day],
    );
    n = Math.max(n, r?.n ?? 1);
  }
  return n;
}

/** A fan's start-count key: id and name, so an account that reuses a freed id starts fresh. */
export const fanKey = (u: { id: number; name: string }) => `u:${u.id}:${u.name.toLowerCase()}`;

/** Levels whose daily tower this fan has already started today. */
export async function startedToday(sql: Sql, who: string[], day: string) {
  const out: Partial<Record<Level, number>> = {};
  for (const w of who) {
    const rows = await sql.all<{ level: Level; n: number }>(
      'SELECT level, n FROM freefall_starts WHERE who = ? AND day = ?',
      [await hmac(`ff-who:${w}`), day],
    );
    for (const r of rows) out[r.level] = Math.max(out[r.level] ?? 0, r.n);
  }
  return out;
}

/** The token's owner tag for a fan or a guest cookie. */
export async function ownerTag(userId: number | null, guest: string | null): Promise<string> {
  if (userId !== null) return `u${userId}`;
  return `g${(await hmac(`ff-guest:${guest ?? ''}`)).slice(0, 16)}`;
}

export async function issueToken(
  mode: Mode,
  level: Level,
  now = Date.now(),
  attempt = 1,
  owner = 'g',
) {
  const day = istDay(now);
  const seed =
    mode === 'daily'
      ? await dailySeed(day, level)
      : crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  const qseed = mode === 'daily' ? crypto.getRandomValues(new Uint32Array(1))[0] || 1 : seed;
  const body = `${mode}.${level}.${day}.${seed}.${now}.${mode === 'daily' ? attempt : 0}.${owner}.${qseed}`;
  return { token: `${body}.${await hmac(`ff-run:${body}`)}`, seed, qseed, day, attempt };
}

export async function readToken(token: string, now = Date.now()): Promise<RunToken | null> {
  const parts = token.split('.');
  if (parts.length !== 9) return null;
  const [mode, level, day, seedS, atS, attS, owner, qS, sig] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (
    !(MODES as readonly string[]).includes(mode) ||
    !(LEVELS as readonly string[]).includes(level)
  )
    return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !/^\d{1,10}$/.test(seedS) ||
    !/^\d{13}$/.test(atS) ||
    !/^\d{1,4}$/.test(attS) ||
    !/^(u\d{1,12}|g[A-Za-z0-9_-]{0,16})$/.test(owner) ||
    !/^\d{1,10}$/.test(qS)
  )
    return null;
  const body = parts.slice(0, 8).join('.');
  if (sig !== (await hmac(`ff-run:${body}`))) return null;
  const issuedAt = Number(atS);
  if (now - issuedAt > TOKEN_TTL || issuedAt > now + 60_000) return null;
  return {
    mode: mode as Mode,
    level: level as Level,
    day,
    seed: Number(seedS),
    issuedAt,
    attempt: Number(attS),
    owner,
    qseed: Number(qS),
    sig,
  };
}

/**
 * Scores above these are always held for a mod: past what a strong player reaches in a solve-time
 * model (a sum takes 1–2.5 s to work out, a guess when there's no time; critic round 6).
 */
export const HOLD_SCORE: Record<Level, number> = { easy: 30_000, normal: 12_000, hard: 8_000 };

/** Review states of a run. */
export const REVIEW = { clean: 0, held: 1, rejected: 2, approved: 3 } as const;

/**
 * Why a person should look at a run before it goes on a board (empty = it goes straight up): a
 * score past what strong players reach, near-perfect maths over a long run, a long run with no
 * rubble hit at all, nearly everyone within reach caught over a long run (players chase people but
 * miss some; a look-ahead script sweeps them all), lots of pauses (free thinking time), or the tower
 * bottom. Held, not rejected: /mod decides, with these reasons and a replay.
 */
export function reviewReasons(s: {
  score: number;
  asked: number;
  correct: number;
  hits: number;
  saved: number;
  people: number;
  pauses: number;
  cause: string | null;
  level: Level;
  /** Logged pause time (ms). */
  pauseMs?: number;
}): string[] {
  const why: string[] = [];
  if ((s.pauseMs ?? 0) > 600_000) why.push('paused for over 10 minutes');
  if (s.cause === 'ground') why.push('reached the tower bottom');
  if (s.score > HOLD_SCORE[s.level]) why.push(`score over ${HOLD_SCORE[s.level]}`);
  if (s.asked >= 40 && s.correct / s.asked >= 0.95) why.push('≥ 95% right over 40+ sums');
  // (40, not 25: strong honest players do get a clean 25 now and then — critic round 11.)
  if (s.asked >= 40 && s.hits === 0) why.push('40+ sums without a rubble hit');
  if (s.people >= 15 && s.saved / s.people >= 0.9) why.push('caught 90%+ of the people in reach');
  if (s.pauses > 6) why.push(`paused ${s.pauses} times`);
  return why;
}

export const needsReview = (s: Parameters<typeof reviewReasons>[0]) => reviewReasons(s).length > 0;

/**
 * Record when a run ended and at which step (the client pings at game over). First ping wins; the
 * step must match the posted run, so an early "end" sent mid-run can't excuse slow play.
 */
export async function markEnd(
  sql: Sql,
  token: string,
  step: number,
  now = Date.now(),
): Promise<boolean> {
  const t = await readToken(token, now);
  if (!t || !Number.isInteger(step) || step < 0) return false;
  await sql.run(
    'INSERT INTO freefall_ends (sig, at, step) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
    [t.sig, now, step],
  );
  return true;
}

/**
 * How far a player is trusted at a level: up to TRUST_MARGIN × the best score a mod has approved for
 * them there (0 once a mod has rejected one of their runs at that level). A run within it shows by
 * name at once; a bigger one waits unnamed for a look — so each step up needs a human.
 */
export const TRUST_MARGIN = 1.3;

export async function trustCap(sql: Sql, userId: number, level: Level): Promise<number> {
  const r = await sql.get<{ best: number | null; rejected: number }>(
    `SELECT MAX(CASE WHEN review = 3 THEN score END) AS best,
            SUM(CASE WHEN review = 2 THEN 1 ELSE 0 END) AS rejected
       FROM freefall_runs WHERE user_id = ? AND level = ?`,
    [userId, level],
  );
  return r?.rejected ? 0 : (r?.best ?? 0) * TRUST_MARGIN;
}

/** Pause time beyond which a big run waits for a look even within the trust cap. */
const LONG_PAUSE_MS = 90_000;

/**
 * Does this run need a mod's look before its name can show where names are worth having? Held runs
 * always; clean ones above `bar` that are above the player's trust cap, paused for long (free
 * thinking time) or doubted by the wall clock.
 */
const unchecked = (
  r: { review: number; score: number; pause_ms: number; flag: number },
  cap: number,
  bar: number,
) =>
  r.review === REVIEW.held ||
  (r.review === REVIEW.clean &&
    r.score > bar &&
    (r.score > cap || r.pause_ms > LONG_PAUSE_MS || r.flag === 1));

/**
 * Names on the boards are checked when they are *shown*, not when a run is posted: every run that
 * isn't rejected takes its real place, but inside the windows worth having (today's top 3, the
 * all-time top 10) a run above this bar — about the 75th percentile of honest play — shows its name
 * only once a mod has looked at that player at roughly that score (see trustCap). One bar for every
 * place in the window (critic round 11). Below it, a place is worth too little to fake.
 */
export const HOLD_TOP1: Record<Level, number> = { easy: 4_500, normal: 3_000, hard: 2_500 };

/** Progress pings kept per run (≈ 33 minutes at one every 10 s). */
const MAX_TICKS = 200;

/** A progress ping while a run is being played: "at step n now". */
export async function markTick(sql: Sql, token: string, step: number, now = Date.now()) {
  const t = await readToken(token, now);
  if (!t || !Number.isInteger(step) || step < 0) return false;
  const n = await sql.get<{ n: number }>('SELECT COUNT(*) AS n FROM freefall_ticks WHERE sig = ?', [
    t.sig,
  ]);
  if ((n?.n ?? 0) >= MAX_TICKS) return false;
  await sql.run('INSERT INTO freefall_ticks (sig, at, step) VALUES (?, ?, ?)', [t.sig, now, step]);
  return true;
}

/**
 * The run against the wall clock, checked cumulatively from the start (the token's time), at every
 * progress ping and the end ping:
 *  - game time can't run ahead of real time (a network delay only ever makes real time longer, so
 *    an honest player never trips this — an early or made-up ping does);
 *  - logged pauses must fit in the real time not spent playing;
 *  - overall, real time may exceed game time + logged pauses by at most 20% (+15 s): slower than
 *    that is thinking time bought by slowing the frames.
 * Pings are taken in step order and only their totals count, so pinging more often buys no slack.
 * Missing pings alone don't hold a run (flaky connections); a run with none at all can't be checked.
 */
async function wallClock(
  sql: Sql,
  t: RunToken,
  steps: number,
  log: readonly number[],
  postedAt: number,
) {
  const why: string[] = [];
  const pauses = pausesIn(log);
  const pauseMs = pauses.reduce((a, p) => a + p.ms, 0);
  const total = (steps * 1000) / 60 + pauseMs;
  const ticks = await sql.all<{ at: number; step: number }>(
    'SELECT MIN(at) AS at, step FROM freefall_ticks WHERE sig = ? GROUP BY step ORDER BY step',
    [t.sig],
  );
  const ping = await sql.get<{ at: number; step: number | null }>(
    'SELECT at, step FROM freefall_ends WHERE sig = ?',
    [t.sig],
  );
  // The end ping must name the run's last step: an "end" sent mid-run doesn't fit.
  if (ping && (ping.step === null || Math.abs(ping.step - steps) > 2))
    why.push("end ping doesn't match the run");
  // A lost end ping (the client retries, but networks drop things): the post itself is the end, as
  // long as it came promptly — a late post can't be told apart from slow play.
  let end = ping ? ping.at : null;
  // Lost with the network at game over: estimate the end from the last progress ping if it came
  // within 15 s of game time of the end; else a prompt post counts as the end.
  const last = ticks.filter((k) => k.step <= steps).at(-1);
  // (Pings come every 10 s, so the last one is up to ~10 s of game time before the end; allow 25.)
  let endSlack = 15_000;
  if (!ping && last && steps - last.step <= 25 * 60) {
    // …plus any pauses logged after that ping.
    const after = pauses.filter((p) => p.step >= last.step).reduce((a, p) => a + p.ms, 0);
    end = last.at + ((steps - last.step) * 1000) / 60 + after;
    // No end ping and a post long after that estimate: the pings may have run ahead of the play.
    if (postedAt - end > 60_000) why.push('posted long after the estimated end');
  } else if (!ping && postedAt - t.issuedAt <= total * 1.2 + 60_000) {
    end = postedAt;
    endSlack = 60_000; // the post may trail the end by a retry or two
  }
  if (end === null) why.push('no end time');
  // Judged by step, not arrival: a ping can arrive after the end ping on a slow connection.
  if (ticks.some((k) => k.step > steps + 2)) why.push('progress pings after the end');
  const points = [
    ...ticks.filter((k) => k.step <= steps),
    ...(end !== null ? [{ at: end, step: steps, end: true as const }] : []),
  ];
  let ahead = false;
  let pauseLie = false;
  let slowAtPing = false;
  for (const p of points) {
    const game = (p.step * 1000) / 60;
    const real = p.at - t.issuedAt;
    const paused = pauses.filter((x) => x.step < p.step).reduce((a, x) => a + x.ms, 0);
    if (game > real + 3000) ahead = true;
    if (game + paused > real + 10_000) pauseLie = true;
    // Every progress ping on the way, not just the end: slow play can't hide behind a lost end
    // ping. (The end itself has its own slack below: a post may stand in for it.)
    if (!('end' in p) && real > (game + paused) * 1.2 + 15_000) slowAtPing = true;
  }
  if (ahead) why.push('progress ahead of the clock');
  else if (pauseLie) why.push("pause times don't match the clock");
  const pace = end !== null ? (end - t.issuedAt) / Math.max(1, total) : null;
  if (slowAtPing || (end !== null && end - t.issuedAt > total * 1.2 + endSlack))
    why.push('played slower than real time');
  if (steps / 60 > 60 && ticks.length === 0) why.push('no progress pings');
  return { why, pauseMs, pace };
}

export type PostResult =
  | {
      ok: true;
      stored: true;
      score: number;
      rank: number;
      of: number;
      mode: Mode;
      level: Level;
      day: string;
      review: boolean;
      /** In place, but the name shows once a mod has checked a run of this player's. */
      pending: boolean;
      /** Practice: the reported rank is the player's best all-time row; true when it is this run. */
      best: boolean;
    }
  | { ok: true; stored: false; score: number; reason: 'ranked-already' | 'not-first' }
  | { ok: false; error: string };

const UNVERIFIED = 'That run could not be verified.';

/** Verify a finished run by replaying it, store it, and say where it ranks. */
export async function postRun(
  sql: Sql,
  userId: number,
  token: string,
  log: readonly number[],
  now = Date.now(),
  /** The request's guest cookie: a run started as a guest posts after sign-in. */
  guest: string | null = null,
): Promise<PostResult> {
  const t = await readToken(token, now);
  if (!t) return { ok: false, error: 'That run has expired or was changed. Start a new one.' };
  // Only whoever started the run can post it (the fan, or the guest browser that became them).
  if (t.owner !== `u${userId}` && t.owner !== (await ownerTag(null, guest)))
    return { ok: false, error: 'That run was started by someone else.' };
  const r = replay(t.seed, t.level, log, t.qseed);
  if (!r.ok) return { ok: false, error: UNVERIFIED };
  const s = r.summary;
  if ((s.steps * 1000) / 60 > now - t.issuedAt + CLOCK_SLACK)
    return { ok: false, error: UNVERIFIED };
  if (t.mode === 'daily') {
    if (t.attempt !== 1) return { ok: true, stored: false, score: s.score, reason: 'not-first' };
    const had = await sql.get<{ id: number }>(
      "SELECT id FROM freefall_runs WHERE mode = 'daily' AND user_id = ? AND level = ? AND day = ?",
      [userId, t.level, t.day],
    );
    if (had) return { ok: true, stored: false, score: s.score, reason: 'ranked-already' };
  }
  const clock = await wallClock(sql, t, s.steps, log, now);
  // Rule reasons hold a run (no name anywhere until a mod looks). Wall-clock doubts are softer — a
  // dropped connection can cause them — so they only withhold the name where it's worth having.
  const hard = reviewReasons({ ...s, level: t.level, pauseMs: clock.pauseMs });
  const why = [...hard, ...clock.why];
  const review = hard.length > 0;
  const ins = await sql.run(
    `INSERT INTO freefall_runs
       (user_id, mode, level, day, seed, qseed, score, floors, correct, asked, saved, people, pauses,
        best, steps, hits, review, reasons, log, pace, pause_ms, flag, token, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
    [
      userId,
      t.mode,
      t.level,
      t.day,
      t.seed,
      t.qseed,
      s.score,
      s.floors,
      s.correct,
      s.asked,
      s.saved,
      s.people,
      s.pauses,
      s.best,
      s.steps,
      s.hits,
      review ? REVIEW.held : REVIEW.clean,
      why.length ? why.join('; ') : null,
      // Every run keeps its input log: any run can land in the queue, and a mod must be able to watch it.
      JSON.stringify(log),
      clock.pace,
      clock.pauseMs,
      clock.why.length ? 1 : 0,
      t.sig,
      new Date(now).toISOString(),
    ],
  );
  if (!ins.changes) return { ok: false, error: 'That run is already posted.' };
  // The run's real place among everything not rejected (held and unapproved runs included).
  // The run's place exactly as the board shows it (same list, ties included): the daily board for
  // today's dive; the all-time board (this run, or the player's own row there) for practice.
  const list =
    t.mode === 'daily'
      ? await dailyDecided(sql, t.level, t.day)
      : await allTimeDecided(sql, t.level);
  const me = list.find((d) => d.r.id === ins.lastId) ?? list.find((d) => d.r.user_id === userId);
  const place = me?.rank ?? list.length;
  // "Pending" is about the row whose rank we report — the one the owner will find on the board.
  const pending = !review && !!me?.pending;
  return {
    ok: true,
    stored: true,
    score: s.score,
    rank: place,
    of: list.length,
    mode: t.mode,
    level: t.level,
    day: t.day,
    review,
    pending,
    best: !me || me.r.id === ins.lastId,
  };
}

/** Rows per page of the mod queue. */
export const QUEUE_PAGE = 30;

/**
 * Runs for a mod's look, biggest first: runs held by a rule, and runs the boards are showing without
 * a name right now (today's top 3, the all-time top 10). Each comes with the player's checked best
 * at that level, so "how far above what we've seen" is plain. Paged.
 */
export async function reviewQueue(sql: Sql, page = 0, day = istDay()) {
  const ids = await withheldIds(sql, day);
  const marks = ids.map(() => '?').join(',') || 'NULL';
  const where = `u.banned = 0 AND (r.review = 1 OR (r.review = 0 AND r.id IN (${marks})))`;
  const rows = await sql.all<{
    id: number;
    user_id: number;
    has_log: number;
    name: string;
    mode: Mode;
    level: Level;
    day: string;
    score: number;
    correct: number;
    asked: number;
    hits: number;
    steps: number;
    saved: number;
    people: number;
    pauses: number;
    pause_ms: number;
    pace: number | null;
    checked_best: number | null;
    reasons: string | null;
    review: number;
  }>(
    `SELECT r.id, r.user_id, u.name, r.mode, r.level, r.day, r.score, r.correct, r.asked, r.hits,
            r.steps, r.saved, r.people, r.pauses, r.pause_ms, r.pace, r.log IS NOT NULL AS has_log,
            (SELECT MAX(t.score) FROM freefall_runs t WHERE t.user_id = r.user_id
               AND t.level = r.level AND t.review = 3) AS checked_best,
            COALESCE(r.reasons, 'big run shown without a name') AS reasons, r.review
       FROM freefall_runs r JOIN users u ON u.id = r.user_id
      WHERE ${where}
      ORDER BY r.score DESC LIMIT ? OFFSET ?`,
    [...ids, QUEUE_PAGE, page * QUEUE_PAGE],
  );
  const n = await sql.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM freefall_runs r JOIN users u ON u.id = r.user_id WHERE ${where}`,
    ids,
  );
  return { rows, total: n?.n ?? 0 };
}

/** A held run's replay material (mods only): seeds, level and the input log. */
export async function heldRun(sql: Sql, id: number) {
  return sql.get<{
    id: number;
    name: string;
    level: Level;
    seed: number;
    qseed: number;
    log: string;
    score: number;
    pace: number | null;
    reasons: string | null;
    review: number;
  }>(
    `SELECT r.id, u.name, r.level, r.seed, r.qseed, r.log, r.score, r.pace, r.review,
            COALESCE(r.reasons, 'big run shown without a name') AS reasons
       FROM freefall_runs r JOIN users u ON u.id = r.user_id
      WHERE r.id = ? AND r.log IS NOT NULL AND r.review IN (0, 1)`,
    [id],
  );
}

/** A mod's call on a player: reject every run of theirs, approved ones too (and so their trust). */
export async function rejectPlayer(sql: Sql, userId: number) {
  await sql.run('UPDATE freefall_runs SET review = 2 WHERE user_id = ? AND review != 2', [userId]);
}

/** A mod's call on a held or podium run: approve (name shows on the boards) or reject (off them). */
export async function ruleRun(sql: Sql, id: number, approve: boolean) {
  await sql.run('UPDATE freefall_runs SET review = ? WHERE id = ? AND review IN (0, 1)', [
    approve ? REVIEW.approved : REVIEW.rejected,
    id,
  ]);
}

export interface BoardRow {
  /** The run's real place (withheld runs count). */
  rank: number;
  /** > 0: a summary row — this many more runs are awaiting a check (not listed one by one). */
  more: number;
  /** Summary row: the lowest rank among the folded runs (the span is rank – last). */
  last?: number;
  /** null: a podium run awaiting a mod's check (its name shows once approved). */
  name: string | null;
  /** The viewer's own row (shown by name even while awaiting a check). */
  mine: boolean;
  /** Awaiting a mod's check. */
  pending: boolean;
  score: number;
  floors: number;
  correct: number;
  asked: number;
}

interface RawRow {
  id: number;
  user_id: number;
  name: string;
  review: number;
  pause_ms: number;
  /** 1: a wall-clock doubt (see postRun). */
  flag: number;
  /** The player's trust cap at this level (see trustCap). */
  cap: number;
  score: number;
  floors: number;
  correct: number;
  asked: number;
}

/** Trust cap per row, in SQL (mirrors trustCap). */
const CAP = `CASE WHEN EXISTS (SELECT 1 FROM freefall_runs x WHERE x.user_id = r.user_id
                                  AND x.level = r.level AND x.review = 2) THEN 0
                ELSE ? * COALESCE((SELECT MAX(t.score) FROM freefall_runs t WHERE t.user_id = r.user_id
                                     AND t.level = r.level AND t.review = 3), 0) END AS cap`;

const COLS = `r.id, r.user_id, u.name, r.review, r.pause_ms, r.flag, ${CAP}, r.score, r.floors, r.correct, r.asked`;

/**
 * Names are withheld only where they're worth having: today's top 3 and the all-time top 10. There,
 * an unchecked run shows in its place without its name (its owner still sees "You").
 */
const DAILY_WINDOW = 3;
const ALL_TIME_WINDOW = 10;

/** At most this many unnamed rows are listed one by one; the rest fold into one "+N more" row. */
const MAX_UNNAMED = 3;

interface Decided {
  r: RawRow;
  pending: boolean;
  rank: number;
}

/**
 * Walk rows best-first and decide which names show. The window counts *named* rows, so withheld
 * runs can't push a forged one up into it (critic round 10): an unchecked run is withheld while
 * fewer than `window` rows above it show a name, with one bar (HOLD_TOP1, ~p75) for every place in
 * the window (critic round 11). Rule-held runs never show a name. With `perPlayer`, each player
 * keeps only their best checked and best unchecked run. Every run keeps its real rank.
 */
function decide(rows: RawRow[], level: Level, window: number, perPlayer: boolean): Decided[] {
  const out: Decided[] = [];
  const seenChecked = new Set<number>();
  const seenUnchecked = new Set<number>();
  let named = 0;
  for (const r of rows) {
    const pending =
      r.review === REVIEW.held || (named < window && unchecked(r, r.cap, HOLD_TOP1[level]));
    if (perPlayer) {
      // A withheld run below the player's named best can't matter: one row per player there.
      if (pending && seenChecked.has(r.user_id)) continue;
      const seen = pending ? seenUnchecked : seenChecked;
      if (seen.has(r.user_id)) continue;
      seen.add(r.user_id);
    }
    out.push({ r, pending, rank: out.length + 1 });
    if (!pending) named++;
  }
  return out;
}

/**
 * What a viewer sees: `limit` places in real order. Unnamed rows are listed up to MAX_UNNAMED, the
 * rest folded into one "+N more awaiting a check" row where they sit (so puppet accounts can't
 * blank a board, and honest runs never silently vanish); the viewer's own run is always shown, by
 * name, at its real rank — even below the cut.
 */
function present(list: Decided[], limit: number, me: string | null): BoardRow[] {
  const out: BoardRow[] = [];
  let unnamed = 0;
  let folded: BoardRow | null = null;
  let places = 0;
  let mineShown = false;
  for (const { r, pending, rank } of list) {
    const mine = me !== null && r.name === me;
    if (pending && !mine && unnamed >= MAX_UNNAMED) {
      // Folded runs don't take a place of the `limit`, so puppets can't push names off the board;
      // "+N" counts every unlisted run awaiting a check.
      if (!folded) {
        if (places >= limit) continue;
        folded = {
          rank,
          more: 0,
          name: null,
          mine: false,
          pending: true,
          score: r.score,
          floors: 0,
          correct: 0,
          asked: 0,
        };
        out.push(folded);
      }
      folded.more++;
      folded.last = rank;
      continue;
    }
    if (places >= limit) continue;
    places++;
    if (pending && !mine) unnamed++;
    if (mine) mineShown = true;
    out.push({
      rank,
      more: 0,
      name: !pending || mine ? r.name : null,
      mine,
      pending,
      score: r.score,
      floors: r.floors,
      correct: r.correct,
      asked: r.asked,
    });
  }
  if (me !== null && !mineShown) {
    const own = list.find((d) => d.r.name === me);
    if (own)
      out.push({
        rank: own.rank,
        more: 0,
        name: own.r.name,
        mine: true,
        pending: own.pending,
        score: own.r.score,
        floors: own.r.floors,
        correct: own.r.correct,
        asked: own.r.asked,
      });
  }
  return out;
}

async function dailyDecided(sql: Sql, level: Level, day: string) {
  // One run per player per day: every one of today's runs, so withheld rows can't starve the board.
  const rows = await sql.all<RawRow>(
    `SELECT ${COLS} FROM freefall_runs r JOIN users u ON u.id = r.user_id
      WHERE r.mode = 'daily' AND r.level = ? AND r.day = ? AND r.review != 2 AND u.banned = 0
      ORDER BY r.score DESC, r.id ASC LIMIT 2000`,
    [TRUST_MARGIN, level, day],
  );
  return decide(rows, level, DAILY_WINDOW, false);
}

/** Today's top dives for a level (first ranked run per player; rejected and banned left out). */
export async function dailyBoard(
  sql: Sql,
  level: Level,
  day: string,
  limit = 10,
  me: string | null = null,
) {
  const list = await dailyDecided(sql, level, day);
  return { rows: present(list, limit, me), total: list.length };
}

/**
 * The all-time top: each player's best checked run by name, and their best unchecked run (if any)
 * in its place without a name — so a withheld record never hides the named run they've earned.
 */
async function allTimeDecided(sql: Sql, level: Level) {
  // One checked and one unchecked candidate per player, chosen in SQL before the limit — so one
  // account posting hundreds of runs can't crowd everyone else out of the fetch (critic round 11).
  const rows = await sql.all<RawRow>(
    `SELECT * FROM (
       SELECT q.*, ROW_NUMBER() OVER (PARTITION BY q.user_id, q.uc ORDER BY q.score DESC, q.id ASC) AS rn
         FROM (SELECT b.*,
                      -- Same test as unchecked(): held, or above the bar and past the player's trust
                      -- cap / paused long / clock-flagged. (A run within the cap is a checked one.)
                      CASE WHEN b.review = 1 THEN 1
                           WHEN b.review = 0 AND b.score > ?
                                AND (b.score > b.cap OR b.pause_ms > ? OR b.flag = 1) THEN 1
                           ELSE 0 END AS uc
                 FROM (SELECT ${COLS} FROM freefall_runs r JOIN users u ON u.id = r.user_id
                        WHERE r.level = ? AND r.review != 2 AND u.banned = 0) b) q)
      WHERE rn = 1 ORDER BY score DESC, id ASC LIMIT 2000`,
    // Positional: the CASE's two come first in the text, then the cap's margin inside COLS.
    [HOLD_TOP1[level], LONG_PAUSE_MS, TRUST_MARGIN, level],
  );
  return decide(rows, level, ALL_TIME_WINDOW, true);
}

/** Best run per player, ever, for a level (daily and practice both count). */
export async function allTimeBoard(
  sql: Sql,
  level: Level,
  limit = 10,
  me: string | null = null,
): Promise<BoardRow[]> {
  return present(await allTimeDecided(sql, level), limit, me);
}

/** Every run the boards withhold a name for right now (all of them, listed or folded). */
async function withheldIds(sql: Sql, day: string, levels: readonly Level[] = LEVELS) {
  const ids: number[] = [];
  for (const level of levels) {
    for (const d of await dailyDecided(sql, level, day)) if (d.pending) ids.push(d.r.id);
    for (const d of await allTimeDecided(sql, level)) if (d.pending) ids.push(d.r.id);
  }
  return [...new Set(ids)];
}

/** Which levels this player has already posted today's ranked dive for. */
export async function rankedToday(sql: Sql, userId: number, day: string) {
  const rows = await sql.all<{ level: Level; score: number }>(
    "SELECT level, score FROM freefall_runs WHERE mode = 'daily' AND user_id = ? AND day = ?",
    [userId, day],
  );
  return Object.fromEntries(rows.map((r) => [r.level, r.score])) as Partial<Record<Level, number>>;
}
