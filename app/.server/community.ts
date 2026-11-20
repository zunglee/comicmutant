/**
 * Takes, reactions, reports and Versus debates. All writes are validated here; routes only
 * parse forms and call these. Three reports from different fans hide a take until a mod rules.
 */
import {
  REACTION_IDS,
  type ReactionId,
  TAKE_MAX,
  VERSUS_PROMPTS,
  type VersusPrompt,
} from '~/lib/community';
import type { Sql } from './db';

const HIDE_AT = 3;

/**
 * Look-alike folding for the filters: each letter of a blocked word matches its common
 * substitutes, and any run of separators between letters ("f u c k", "f*ck", "sh.1t").
 * Kept short on purpose: obvious abuse is blocked, everything else is handled by reports.
 */
const SUBS: Record<string, string> = {
  a: 'a4@*',
  e: 'e3*',
  i: 'i1!|*',
  o: 'o0*',
  u: 'uv*',
  s: 's5$',
  g: 'g9',
  t: 't7+',
  k: 'k',
  c: 'c(k',
};
const SEP = '[\\W_]*';
function blocked(word: string, tail = '') {
  const body = [...word]
    .map((ch) => `[${(SUBS[ch] ?? ch).replace(/[-\\\]^]/g, '\\$&')}]+`)
    .join(SEP);
  return new RegExp(`(?:^|[^a-z0-9])${body}${tail}`, 'i');
}
const BLOCK = [
  blocked('fuck'),
  blocked('shit', '(?![a-z])'),
  blocked('cunt'),
  blocked('nigg'),
  blocked('fag', '(?!in|o)'),
  blocked('retard'),
  blocked('kys', '(?![a-z])'),
];
const TLD =
  '(com|net|org|io|in|xyz|ru|gg|co|me|ly|app|tv|link|site|online|info|biz|cc|to|be|us|uk)';
const LINK = new RegExp(
  `(https?:|www\\s*\\.|\\b[a-z0-9-]+\\s*(\\.|\\[\\.\\]|\\(\\.\\)|\\bdot\\b)\\s*${TLD}\\b)`,
  'i',
);

export type TakeCheck = { ok: true; body: string } | { ok: false; error: string };

export function checkTake(raw: unknown): TakeCheck {
  if (typeof raw !== 'string') return { ok: false, error: 'Say something first.' };
  if (raw.length > TAKE_MAX * 4)
    return { ok: false, error: `Keep it under ${TAKE_MAX} characters.` };
  // NFKC folds full-width and styled letters; \p{Cf} drops zero-width and bidi-override marks.
  const body = raw
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/\p{M}{3,}/u.test(body)) return { ok: false, error: 'Too many stacked accents.' };
  if (body.length < 3) return { ok: false, error: 'At least 3 characters.' };
  if (body.length > TAKE_MAX) return { ok: false, error: `Keep it under ${TAKE_MAX} characters.` };
  if (LINK.test(body)) return { ok: false, error: 'No links — just your take.' };
  if (BLOCK.some((re) => re.test(body)))
    return { ok: false, error: 'Keep it fun — that word is off-limits here.' };
  if (/(.)\1{9,}/u.test(body)) return { ok: false, error: 'Easy on the repeated letters.' };
  return { ok: true, body };
}

export interface TakeRow {
  id: number;
  body: string;
  side: 'a' | 'b' | null;
  created_at: string;
  author: string;
  avatar: string | null;
  role: 'fan' | 'mod';
  reactions: Partial<Record<ReactionId, number>>;
  mine: ReactionId | null;
}

export const TAKES_PAGE = 30;

/** Newest first, keyset-paged by id (`before`), optionally one Versus side only. */
export async function listTakes(
  sql: Sql,
  target: string,
  viewer: number | null,
  opts: { side?: 'a' | 'b'; before?: number; limit?: number } = {},
): Promise<TakeRow[]> {
  const limit = Math.min(opts.limit ?? TAKES_PAGE, 60);
  const rows = await sql.all<
    Omit<TakeRow, 'reactions' | 'mine'> & { rx: string | null; mine: string | null }
  >(
    `SELECT t.id, t.body, t.side, t.created_at, u.name AS author, u.avatar, u.role,
            (SELECT group_concat(kind || ':' || n) FROM reaction_counts WHERE take_id = t.id AND n > 0) AS rx,
            (SELECT kind FROM reactions WHERE take_id = t.id AND user_id = ?) AS mine
       FROM takes t JOIN users u ON u.id = t.user_id
      WHERE t.target = ? ${opts.side ? 'AND t.side = ?' : ''} AND t.hidden = 0 AND u.banned = 0
        AND t.id < ?
      ORDER BY t.id DESC LIMIT ?`,
    // Two query shapes (with/without side), each served by its own index — no temp sort.
    [
      viewer ?? -1,
      target,
      ...(opts.side ? [opts.side] : []),
      opts.before ?? Number.MAX_SAFE_INTEGER,
      limit,
    ],
  );
  return rows.map(({ rx, mine, ...r }) => ({
    ...r,
    mine: (mine as ReactionId | null) ?? null,
    reactions: Object.fromEntries(
      (rx ?? '')
        .split(',')
        .filter(Boolean)
        .map((p) => {
          const [k, n] = p.split(':');
          return [k, Number(n)];
        }),
    ),
  }));
}

export async function addTake(
  sql: Sql,
  userId: number,
  target: string,
  body: string,
  side: 'a' | 'b' | null,
): Promise<number> {
  const r = await sql.run(
    'INSERT INTO takes (user_id, target, side, body, created_at) VALUES (?, ?, ?, ?, ?)',
    [userId, target, side, body, new Date().toISOString()],
  );
  return r.lastId;
}

async function bump(sql: Sql, takeId: number, kind: string, by: 1 | -1) {
  await sql.run(
    `INSERT INTO reaction_counts (take_id, kind, n) VALUES (?, ?, MAX(0, ?))
     ON CONFLICT (take_id, kind) DO UPDATE SET n = MAX(0, n + ?)`,
    [takeId, kind, by, by],
  );
}

/** Toggle: same reaction again removes it; a different one replaces it. Tallies kept in step. */
export async function react(
  sql: Sql,
  userId: number,
  takeId: number,
  kind: string,
): Promise<boolean> {
  if (!(REACTION_IDS as readonly string[]).includes(kind)) return false;
  const exists = await sql.get('SELECT 1 FROM takes WHERE id = ? AND hidden = 0', [takeId]);
  if (!exists) return false;
  const cur = await sql.get<{ kind: string }>(
    'SELECT kind FROM reactions WHERE take_id = ? AND user_id = ?',
    [takeId, userId],
  );
  if (cur?.kind === kind) {
    await sql.run('DELETE FROM reactions WHERE take_id = ? AND user_id = ?', [takeId, userId]);
    await bump(sql, takeId, kind, -1);
    return true;
  }
  await sql.run(
    `INSERT INTO reactions (take_id, user_id, kind) VALUES (?, ?, ?)
     ON CONFLICT (take_id, user_id) DO UPDATE SET kind = excluded.kind`,
    [takeId, userId, kind],
  );
  if (cur) await bump(sql, takeId, cur.kind, -1);
  await bump(sql, takeId, kind, 1);
  return true;
}

/**
 * Reports only count from established fans (account ≥ 1 h old with a visible take), at most
 * 5 per reporter per author per day, and never re-hide a take a mod already cleared.
 * Returns false when the report was ignored.
 */
export async function report(sql: Sql, userId: number, takeId: number): Promise<boolean> {
  const take = await sql.get<{ user_id: number; mod_cleared: number }>(
    'SELECT user_id, mod_cleared FROM takes WHERE id = ? AND hidden = 0',
    [takeId],
  );
  if (!take || take.user_id === userId) return false;
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const trusted = await sql.get(
    `SELECT 1 FROM users u WHERE u.id = ? AND u.created_at < ?
       AND EXISTS (SELECT 1 FROM takes WHERE user_id = u.id AND hidden = 0)`,
    [userId, hourAgo],
  );
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const recent = await sql.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM reports r JOIN takes t ON t.id = r.take_id
      WHERE r.user_id = ? AND t.user_id = ? AND r.created_at > ?`,
    [userId, take.user_id, dayAgo],
  );
  if ((recent?.n ?? 0) >= 5) return false;
  const r = await sql.run(
    'INSERT OR IGNORE INTO reports (take_id, user_id, created_at) VALUES (?, ?, ?)',
    [takeId, userId, new Date().toISOString()],
  );
  if (!r.changes) return false;
  // Untrusted reports still reach the mod queue; only trusted ones can auto-hide.
  await sql.run(
    `UPDATE takes SET reports = reports + 1,
       hidden = CASE WHEN ? AND mod_cleared = 0 AND reports + 1 >= ? THEN 1 ELSE hidden END
     WHERE id = ?`,
    [trusted ? 1 : 0, HIDE_AT, takeId],
  );
  return true;
}

// ── Versus ────────────────────────────────────────────────────────────────────────────

export interface VersusRow {
  id: number;
  a: string;
  b: string;
  prompt: VersusPrompt;
  official: number;
  votes_a: number;
  votes_b: number;
  takes: number;
  created_at: string;
}

// Vote tallies are counters on the row (kept by vote()), so listing never scans the votes table.
const VERSUS_SELECT = `SELECT v.id, v.a, v.b, v.prompt, v.official, v.created_at, v.votes_a, v.votes_b,
   (SELECT COUNT(*) FROM takes WHERE target = 'v:' || v.id AND hidden = 0) AS takes
   FROM versus v`;

/** Hottest first: official debates, then by votes. Paged; never the whole table. */
export async function listVersus(sql: Sql, limit = 30, offset = 0): Promise<VersusRow[]> {
  return sql.all<VersusRow>(
    `${VERSUS_SELECT} ORDER BY v.official DESC, v.score DESC, v.id DESC LIMIT ? OFFSET ?`,
    [limit, offset],
  );
}

export async function countVersus(sql: Sql): Promise<number> {
  return (await sql.get<{ n: number }>('SELECT COUNT(*) AS n FROM versus'))?.n ?? 0;
}

/** Cheap existence check for write paths. */
export async function versusExists(sql: Sql, id: number): Promise<boolean> {
  return !!(await sql.get('SELECT 1 FROM versus WHERE id = ?', [id]));
}

export async function getVersus(sql: Sql, id: number): Promise<VersusRow | undefined> {
  return sql.get<VersusRow>(`${VERSUS_SELECT} WHERE v.id = ?`, [id]);
}

export async function myVote(sql: Sql, versusId: number, voter: string): Promise<'a' | 'b' | null> {
  return (
    (
      await sql.get<{ side: 'a' | 'b' }>(
        'SELECT side FROM votes WHERE versus_id = ? AND voter = ?',
        [versusId, voter],
      )
    )?.side ?? null
  );
}

export async function vote(
  sql: Sql,
  versusId: number,
  voter: string,
  side: 'a' | 'b',
): Promise<void> {
  const prev = await myVote(sql, versusId, voter);
  if (prev === side) return;
  await sql.run(
    `INSERT INTO votes (versus_id, voter, side, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (versus_id, voter) DO UPDATE SET side = excluded.side`,
    [versusId, voter, side, new Date().toISOString()],
  );
  const col = side === 'a' ? 'votes_a' : 'votes_b';
  const other = side === 'a' ? 'votes_b' : 'votes_a';
  await sql.run(
    prev
      ? `UPDATE versus SET ${col} = ${col} + 1, ${other} = MAX(0, ${other} - 1) WHERE id = ?`
      : `UPDATE versus SET ${col} = ${col} + 1 WHERE id = ?`,
    [versusId],
  );
}

export function isPrompt(p: unknown): p is VersusPrompt {
  return typeof p === 'string' && Object.hasOwn(VERSUS_PROMPTS, p);
}

/** Returns the existing debate when the same pair + prompt was already started (race-safe). */
export async function createVersus(
  sql: Sql,
  a: string,
  b: string,
  prompt: VersusPrompt,
  userId: number | null,
  official = false,
): Promise<number> {
  const [x, y] = a < b ? [a, b] : [b, a];
  await sql.run(
    `INSERT INTO versus (a, b, prompt, official, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (a, b, prompt) DO NOTHING`,
    [x, y, prompt, official ? 1 : 0, userId, new Date().toISOString()],
  );
  const row = await sql.get<{ id: number }>(
    'SELECT id FROM versus WHERE a = ? AND b = ? AND prompt = ?',
    [x, y, prompt],
  );
  if (!row) throw new Error('versus insert failed');
  return row.id;
}

// ── Moderation ────────────────────────────────────────────────────────────────────────

export async function modQueue(sql: Sql) {
  return sql.all<{
    id: number;
    body: string;
    target: string;
    reports: number;
    hidden: number;
    author: string;
    user_id: number;
  }>(
    `SELECT t.id, t.body, t.target, t.reports, t.hidden, u.name AS author, u.id AS user_id
       FROM takes t JOIN users u ON u.id = t.user_id
      WHERE t.reports > 0 OR t.hidden = 1 ORDER BY t.hidden DESC, t.reports DESC LIMIT 200`,
  );
}

export async function modRule(
  sql: Sql,
  modId: number,
  takeId: number,
  ruling: 'restore' | 'hide' | 'ban',
): Promise<string | null> {
  const t = await sql.get<{ user_id: number; role: string }>(
    'SELECT t.user_id, u.role FROM takes t JOIN users u ON u.id = t.user_id WHERE t.id = ?',
    [takeId],
  );
  if (!t) return 'No such take.';
  if (ruling === 'restore') {
    // mod_cleared: the same reporters can't hide it again.
    await sql.run('UPDATE takes SET hidden = 0, reports = 0, mod_cleared = 1 WHERE id = ?', [
      takeId,
    ]);
    await sql.run('DELETE FROM reports WHERE take_id = ?', [takeId]);
  } else if (ruling === 'hide') {
    await sql.run('UPDATE takes SET hidden = 1 WHERE id = ?', [takeId]);
  } else {
    if (t.role === 'mod' || t.user_id === modId) return 'Mods can’t be banned from here.';
    // Soft: the account and its takes stay in the DB, invisible; sessions end; their votes and
    // reactions stop counting.
    await sql.run('UPDATE users SET banned = 1 WHERE id = ?', [t.user_id]);
    await sql.run('DELETE FROM sessions WHERE user_id = ?', [t.user_id]);
    const voter = `u:${t.user_id}`;
    await sql.run(
      `UPDATE versus SET
         votes_a = MAX(0, votes_a - (SELECT COUNT(*) FROM votes WHERE versus_id = versus.id AND voter = ? AND side = 'a')),
         votes_b = MAX(0, votes_b - (SELECT COUNT(*) FROM votes WHERE versus_id = versus.id AND voter = ? AND side = 'b'))
       WHERE id IN (SELECT versus_id FROM votes WHERE voter = ?)`,
      [voter, voter, voter],
    );
    await sql.run('DELETE FROM votes WHERE voter = ?', [voter]);
    await sql.run(
      `UPDATE reaction_counts SET n = MAX(0, n - 1)
        WHERE (take_id, kind) IN (SELECT take_id, kind FROM reactions WHERE user_id = ?)`,
      [t.user_id],
    );
    await sql.run('DELETE FROM reactions WHERE user_id = ?', [t.user_id]);
    // Desi/comic poll votes and fact reactions (S13). Sacred ones are keyed by the browser cookie,
    // never the fan (S12), so by design they can't be traced to this account and stay.
    await sql.run('DELETE FROM poll_votes WHERE voter = ?', [voter]);
    await sql.run('DELETE FROM fact_reactions WHERE voter = ?', [voter]);
  }
  await sql.run(
    'INSERT INTO mod_actions (mod_id, take_id, target_user, action, created_at) VALUES (?, ?, ?, ?, ?)',
    [modId, takeId, t.user_id, ruling, new Date().toISOString()],
  );
  return null;
}
