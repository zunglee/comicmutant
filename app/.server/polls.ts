/**
 * Polls and fact reactions for Sacred India, /desi and character pages (contract:
 * app/components/learn/contract.ts; rules: reports/sacred-design.md S7, S10).
 *
 * One vote per voter per poll and one reaction per voter per fact. On comic polls and desi facts a
 * voter is the fan ('u:<id>'), else the browser's guest cookie ('g:<id>', voter.ts). Sacred polls
 * and sacred fact reactions are never linked to an account (S12): always the guest cookie, minted
 * for signed-in fans too, so no row says which fan answered "which festival do you celebrate". Votes can be changed; a reaction toggles
 * off when sent again and switches when the other one is sent. Limits are keyed on the voter, with
 * a high per-IP ceiling against floods only — never an IP block (carrier NAT, Q22/Q23d). A write
 * counts only with a voter cookie issued by an earlier page view (ensureGuest, S14).
 */

import type {
  FactReactBody,
  FactReaction,
  FactReactReply,
  LearnError,
  LearnErrorCode,
  PollView,
  Realm,
} from '~/components/learn/contract';
import { type Poll, PollFile } from '~/lib/polls-schema';
import { Figure } from '~/lib/sacred-schema';
import pollsJson from '../../content/polls.json';
import rosterJson from '../../content/sacred/roster.json';
import { currentUser, readCookie } from './auth';
import { getCharacter } from './content';
import { getSql, type Sql } from './db';
import { ENV } from './env';
import { allow, clientIp, hmac, siteOrigin } from './guard';
import { IP_CEILING_PER_MIN } from './quiz';
import { guestId, newGuest } from './voter';

// ─── content ─────────────────────────────────────────────────────────────────────────────────────

function loadPolls(): Poll[] {
  const r = PollFile.safeParse(pollsJson);
  if (r.success) return r.data;
  // scripts/validate-polls.ts gates the build; in dev a broken file means no polls, not a crash.
  if (process.env.NODE_ENV === 'production') throw new Error(`content/polls.json: ${r.error}`);
  console.warn('[polls] content/polls.json is invalid; run scripts/validate-polls.ts');
  return [];
}

let polls: Map<string, Poll> = new Map(loadPolls().map((p) => [p.id, p]));

export const getPoll = (id: string): Poll | undefined => polls.get(id);
/** Polls for a page: exact scope ('figure:ganesha'), or a prefix ('sacred' matches 'sacred:jain'). */
export const pollsFor = (scope: string): Poll[] =>
  [...polls.values()].filter((p) => p.scope === scope || p.scope.startsWith(`${scope}:`));

export function setPollsForTests(list: readonly Poll[] | null): void {
  polls = new Map((list ?? loadPolls()).map((p) => [p.id, p]));
}

type RosterRow = { slug: string; tradition: string };
const rosterTradition = new Map(
  (rosterJson as RosterRow[]).map((r) => [r.slug, r.tradition] as const),
);
// Profiles are still landing: whichever exist at build time are bundled; the rest are "unknown".
const figureFiles = import.meta.glob('/content/sacred/*/*.json', {
  eager: true,
  import: 'default',
});
const figureFacts = new Map<string, number | null>();

/** Facts on the sacred profile, or null when the slug isn't in the roster or has no valid file. */
function sacredFactCount(slug: string): number | null {
  const cached = figureFacts.get(slug);
  if (cached !== undefined) return cached;
  const tradition = rosterTradition.get(slug);
  const raw = tradition ? figureFiles[`/content/sacred/${tradition}/${slug}.json`] : undefined;
  const r = raw === undefined ? null : Figure.safeParse(raw);
  const n = r?.success && r.data.slug === slug ? r.data.facts.length : null;
  if (rosterTradition.has(slug)) figureFacts.set(slug, n); // never cache arbitrary probe strings
  return n;
}

let factCountOverride: ((target: string) => number | null) | null = null;
export function setFactCountForTests(fn: ((target: string) => number | null) | null): void {
  factCountOverride = fn;
}

export const TARGET_RE = /^(sacred|desi):[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * How many facts a reaction target has, or null when it doesn't exist: "sacred:<roster slug>" with
 * a valid profile file, "desi:<slug>" for an `indian` character carrying facts. Indexes are into the
 * full `facts` array (a kid deck that filters facts must send the original index).
 */
export function factCount(target: string): number | null {
  if (!TARGET_RE.test(target) || target.length > 80) return null;
  if (factCountOverride) return factCountOverride(target);
  const [kind, slug = ''] = target.split(':');
  if (kind === 'sacred') return sacredFactCount(slug);
  const c = getCharacter(slug);
  const n = c?.universe === 'indian' ? (c.facts?.length ?? 0) : 0;
  return n > 0 ? n : null;
}

// ─── errors and limits ───────────────────────────────────────────────────────────────────────────

export const learnFail = (error: string, code: LearnErrorCode): LearnError => ({ error, code });
export const isLearnError = (v: unknown): v is LearnError =>
  typeof v === 'object' && v !== null && 'code' in v && 'error' in v;
/** The HTTP status that goes with each stable code. */
export const LEARN_STATUS: Record<LearnErrorCode, number> = {
  invalid: 400,
  unknown: 404,
  closed: 409,
  rate: 429,
  other: 500,
};

/** Votes (and vote changes) per voter per minute; reactions per voter per minute. */
export const VOTE_MAX_PER_MIN = 20;
export const REACT_MAX_PER_MIN = 60;

/**
 * The key per-IP caps use (S17): an IPv4 address as is; an IPv6 address by its /64 prefix, since
 * one home or phone usually holds a whole /64 and can rotate through it. IPv4-mapped IPv6
 * (::ffff:1.2.3.4) is treated as IPv4. Anything unparseable is returned unchanged.
 */
export function ipPrefix(ip: string): string {
  if (!ip.includes(':')) return ip;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped?.[1]) return mapped[1];
  const halves = ip.toLowerCase().split('::');
  if (halves.length > 2) return ip;
  const part = (h: string | undefined) => (h ? h.split(':') : []);
  const head = part(halves[0]);
  let tail = part(halves[1]);
  // An embedded IPv4 tail (…:1.2.3.4) is two hextets; only the first four matter here.
  if (tail.at(-1)?.includes('.')) tail = [...tail.slice(0, -1), '0', '0'];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return ip;
  const all = [...head, ...Array<string>(fill).fill('0'), ...tail];
  if (all.length !== 8 || !all.every((h) => /^[0-9a-f]{1,4}$/.test(h))) return ip;
  return `${all
    .slice(0, 4)
    .map((h) => Number.parseInt(h, 16).toString(16))
    .join(':')}::/64`;
}

/**
 * True when the voter may go ahead: a per-voter window, then the shared high per-IP ceiling (the
 * same 600/min the quiz uses), which only a flood reaches — thousands of fans share carrier IPs.
 */
export async function learnRate(
  sql: Sql,
  route: 'poll' | 'fact',
  voter: string,
  ip: string,
): Promise<boolean> {
  const max = route === 'poll' ? VOTE_MAX_PER_MIN : REACT_MAX_PER_MIN;
  if (!(await allow(sql, `learn-${route}:${voter}`, max, 60_000))) return false;
  return allow(sql, `learn-ip:${ipPrefix(ip)}`, IP_CEILING_PER_MIN, 60_000);
}

/** Which identity a vote may carry: 'sacred' is the browser only (S12); 'comic' prefers the fan. */
export type VoterRealm = Realm;
/** The realm of a reaction target: sacred profiles are anonymous, desi heroes are comics. */
export const targetRealm = (target: string): Realm =>
  target.startsWith('sacred:') ? 'sacred' : 'comic';
/** A voter key that may be stored in this realm (a fan key never lands on a sacred row). */
const allowedIn = (voter: string, realm: Realm) => realm === 'comic' || voter.startsWith('g:');

/**
 * The caller's voter key without minting one, or null. Comic: the fan, else an existing guest
 * cookie. Sacred: the guest cookie only, even when a fan is signed in (S12).
 */
export async function voterOf(sql: Sql, request: Request, realm: Realm): Promise<string | null> {
  if (realm === 'comic') {
    const user = await currentUser(sql, request);
    if (user) return `u:${user.id}`;
  }
  const g = guestId(request);
  return g ? `g:${g}` : null;
}

/**
 * Proof that a guest cookie was issued by a page view here, not invented by a script: a keyed hash
 * of the guest id in its own HttpOnly cookie. The guest id itself is unchanged (quiz history keeps
 * working); only writes here check the proof.
 */
export const VOTER_KEY_COOKIE = 'cm_vk';
const voterKey = (guest: string) => hmac(`vk|${guest}`);
async function hasVoterKey(request: Request, guest: string): Promise<boolean> {
  const k = readCookie(request, VOTER_KEY_COOKIE);
  return k !== null && k === (await voterKey(guest));
}

/** New voter cookies (guest id or voter key) one IP may be issued per window (S15). */
/** COMICMUTANT_MINT_CEILING (default 60; e2e raises it — one IP runs every spec). */
export const MINT_MAX_PER_IP = ENV.mintCeiling;
export const MINT_WINDOW_MS = 10 * 60_000;
/** Expired marker cookie set when the mint ceiling withholds cookies (see ensureGuest, S17). */
export const VOTER_PAGE_COOKIE = 'cm_vp';
export const mintBucket = (ip: string) => `learn-mint:${ipPrefix(ip)}`;

/**
 * For loaders and GET /api/poll that show a poll or a fact deck: the browser's guest id, issuing
 * the guest cookie and its voter key (appended to `headers`) when missing. Votes and reactions
 * count only with cookies issued this way by an earlier page view (S14), so a cookieless or
 * forged-cookie script can't mint a voter per POST.
 *
 * Soft per-IP ceiling (S15): past MINT_MAX_PER_IP issues in MINT_WINDOW_MS nothing is issued and
 * null (no usable guest voter) comes back — the page still renders, only a vote from that new browser asks to "reload".
 * Browsers that already hold both cookies are never affected, and no request is refused.
 *
 * Caching (S17): a page that calls this is never shared-cached. It either sets cookies, or the
 * request carries voter cookies, or (ceiling) it sets the expired marker cookie — all three make
 * entry.server's cachePolicy send `private, no-store`.
 */
export async function ensureGuest(
  request: Request,
  headers: Headers,
  sqlIn?: Sql,
): Promise<string | null> {
  const existing = guestId(request);
  if (existing && (await hasVoterKey(request, existing))) return existing;
  const sql = sqlIn ?? (await getSql());
  if (!(await allow(sql, mintBucket(clientIp(request)), MINT_MAX_PER_IP, MINT_WINDOW_MS))) {
    // S17: nothing issued, so this copy of the page must never be shared — a cached one would
    // send every new visitor to "reload". React Router forwards only a loader's Set-Cookie to the
    // document, so an expired marker cookie is the signal (any Set-Cookie → private, no-store).
    headers.append(
      'Set-Cookie',
      `${VOTER_PAGE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
    );
    return null;
  }
  let g = existing;
  if (!g) {
    const fresh = newGuest();
    headers.append('Set-Cookie', fresh.cookie);
    g = fresh.id;
  }
  const secure = ENV.prod ? '; Secure' : '';
  headers.append(
    'Set-Cookie',
    `${VOTER_KEY_COOKIE}=${await voterKey(g)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
  );
  return g;
}

/**
 * S15: how many distinct new guest voters one keyed IP hash may add to a poll's (or a profile's facts')
 * public counts per hour. Later ones still vote and see their choice, but their rows are flagged
 * and left out of every displayed count. A shared office's first N count; a cookie-jar loop adds N.
 */
/** COMICMUTANT_VOTE_CAP (default 5). */
export const COUNTED_NEW_VOTERS_PER_IP = ENV.voteCap;
/** Fans (desi/comic only, S12) are accounts — already join-limited per IP — so they always count. */
const guestVoter = (voter: string) => voter.startsWith('g:');
export const COUNTED_WINDOW_MS = 3600_000;

/**
 * For the GET fallbacks (S17): issues voter cookies like a page view and reports, in the
 * `X-CM-Voter` header, whether this browser can now vote in `realm` ("1") or not ("0": the mint
 * ceiling withheld cookies — the widget should say "try again in a few minutes").
 */
export async function ensureVoterHeaders(
  sql: Sql,
  request: Request,
  headers: Headers,
  realm: Realm,
): Promise<void> {
  const guest = await ensureGuest(request, headers, sql);
  const fan = realm === 'comic' && guest === null && (await currentUser(sql, request)) !== null;
  headers.set('X-CM-Voter', guest !== null || fan ? '1' : '0');
}

/**
 * The voter for a write, or null when the browser brought no existing voter (S14): a comic write
 * takes the fan session, else a guest cookie with its voter key; a sacred write only the latter
 * (S12). Nothing is minted here — the client reloads, and the page loader issues the cookies.
 */
export async function voterFor(sql: Sql, request: Request, realm: Realm): Promise<string | null> {
  if (realm === 'comic') {
    const user = await currentUser(sql, request);
    if (user) return `u:${user.id}`;
  }
  const g = guestId(request);
  return g && (await hasVoterKey(request, g)) ? `g:${g}` : null;
}

/** Reply for a write without an existing voter cookie (the client shows "Please reload…"). */
export const NO_VOTER = (): LearnError => learnFail('Please reload and try again.', 'invalid');

/**
 * Stricter than guard's assertSameOrigin for these writes (S14): the Origin header, else the
 * Referer, must be this site; a POST carrying neither is refused. Null when fine.
 */
export function learnOrigin(request: Request): LearnError | null {
  const refuse = learnFail('Cross-site request refused.', 'invalid');
  if (request.headers.get('sec-fetch-site') === 'cross-site') return refuse;
  const site = siteOrigin(request);
  const from = request.headers.get('origin') ?? request.headers.get('referer');
  if (!from) return refuse;
  try {
    return new URL(from).origin === site ? null : refuse;
  } catch {
    return refuse;
  }
}

/** A keyed hash of the client IP: a mods' signal on each row, never read to refuse anyone. */
const ipTag = (ip: string) => hmac(`learn-ip|${ipPrefix(ip)}`);

// ─── polls ───────────────────────────────────────────────────────────────────────────────────────

async function view(sql: Sql, poll: Poll, voter: string | null): Promise<PollView> {
  const rows = await sql.all<{ option: string; n: number }>(
    'SELECT option, COUNT(*) AS n FROM poll_votes WHERE poll_id = ? AND flagged = 0 GROUP BY option',
    [poll.id],
  );
  const by = new Map(rows.map((r) => [r.option, r.n]));
  const options = poll.options.map((o) => ({ id: o.id, label: o.label, votes: by.get(o.id) ?? 0 }));
  let mine: string | null = null;
  if (voter) {
    const m = await sql.get<{ option: string; flagged: number }>(
      'SELECT option, flagged FROM poll_votes WHERE poll_id = ? AND voter = ?',
      [poll.id, voter],
    );
    // A vote for an option since removed from the content is no longer "yours" (nor counted).
    const own = m ? options.find((o) => o.id === m.option) : undefined;
    if (m && own) {
      mine = m.option;
      // S17: a flagged voter sees their own vote counted, in their view only.
      if (m.flagged) own.votes += 1;
    }
  }
  return {
    id: poll.id,
    question: poll.question,
    options,
    total: options.reduce((s, o) => s + o.votes, 0),
    mine,
  };
}

/**
 * A poll's snapshot for a loader or GET /api/poll, or null for an unknown id. `who` is the request
 * (resolved to the fan or guest, nothing minted) or a voter key already resolved.
 */
export async function pollView(
  id: string,
  who: Request | string | null,
  sqlIn?: Sql,
): Promise<PollView | null> {
  const poll = polls.get(id);
  if (!poll) return null;
  const sql = sqlIn ?? (await getSql());
  const voter =
    who instanceof Request
      ? await voterOf(sql, who, poll.realm)
      : who && allowedIn(who, poll.realm)
        ? who
        : null;
  return view(sql, poll, voter);
}

/**
 * Records (or changes) a voter's choice. Re-sending the same option changes nothing. Checks only
 * content here; the route does origin, body, voter and rate.
 */
export async function castVote(
  sql: Sql,
  body: { id: string; option: string },
  voter: string,
  ip: string,
  now = Date.now(),
): Promise<PollView | LearnError> {
  const poll = polls.get(body.id);
  if (!poll) return learnFail('No such poll.', 'unknown');
  if (poll.closed) return learnFail('This poll has closed.', 'closed');
  if (!allowedIn(voter, poll.realm)) return learnFail('Sacred polls are anonymous.', 'invalid');
  if (!poll.options.some((o) => o.id === body.option))
    return learnFail('No such option.', 'invalid');
  const changed = await sql.run(
    'UPDATE poll_votes SET option = ?, at = ? WHERE poll_id = ? AND voter = ? AND option != ?',
    [body.option, now, poll.id, voter, body.option],
  );
  if (changed.changes === 0) {
    // A new voter (or the same choice again, which the IGNORE leaves alone). The flag is decided
    // once, at the first vote; a change of mind keeps it.
    const tag = await ipTag(ip);
    const r = await sql.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM poll_votes
        WHERE poll_id = ? AND ip = ? AND flagged = 0 AND since > ? AND voter != ?
          AND voter LIKE 'g:%'`,
      [poll.id, tag, now - COUNTED_WINDOW_MS, voter],
    );
    const flagged = guestVoter(voter) && (r?.n ?? 0) >= COUNTED_NEW_VOTERS_PER_IP ? 1 : 0;
    await sql.run(
      `INSERT OR IGNORE INTO poll_votes (poll_id, voter, option, ip, at, since, flagged)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [poll.id, voter, body.option, tag, now, now, flagged],
    );
  }
  return view(sql, poll, voter);
}

// ─── fact reactions ──────────────────────────────────────────────────────────────────────────────

type Counts = Record<number, { whoa: number; knew: number }>;

/**
 * Counts per fact index for one target (only indexes someone reacted to). Pass the caller's voter
 * key to see their own flagged reactions counted too (S17) — only in a private response.
 */
export async function factReactions(
  target: string,
  sqlIn?: Sql,
  voter?: string | null,
): Promise<Counts> {
  if (!TARGET_RE.test(target)) return {};
  const sql = sqlIn ?? (await getSql());
  const rows = await sql.all<{ idx: number; reaction: FactReaction; n: number }>(
    `SELECT idx, reaction, COUNT(*) AS n FROM fact_reactions WHERE target = ? AND flagged = 0
     GROUP BY idx, reaction`,
    [target],
  );
  const out: Counts = {};
  for (const r of rows) {
    const c = out[r.idx] ?? { whoa: 0, knew: 0 };
    c[r.reaction] = r.n;
    out[r.idx] = c;
  }
  if (voter && allowedIn(voter, targetRealm(target))) {
    const own = await sql.all<{ idx: number; reaction: FactReaction }>(
      'SELECT idx, reaction FROM fact_reactions WHERE target = ? AND voter = ? AND flagged = 1',
      [target, voter],
    );
    for (const r of own) {
      const c = out[r.idx] ?? { whoa: 0, knew: 0 };
      c[r.reaction] += 1;
      out[r.idx] = c;
    }
  }
  return out;
}

/** The voter's reaction to every fact of a target (index → reaction), for a loader. */
export async function myFactReactions(
  target: string,
  voter: string | null,
  sqlIn?: Sql,
): Promise<Record<number, FactReaction>> {
  if (!voter || !TARGET_RE.test(target) || !allowedIn(voter, targetRealm(target))) return {};
  const sql = sqlIn ?? (await getSql());
  const rows = await sql.all<{ idx: number; reaction: FactReaction }>(
    'SELECT idx, reaction FROM fact_reactions WHERE target = ? AND voter = ?',
    [target, voter],
  );
  return Object.fromEntries(rows.map((r) => [r.idx, r.reaction]));
}

/** Validates a target and index against the content: null when fine, else the error to send. */
export function checkFactTarget(target: string, index: number): LearnError | null {
  if (!TARGET_RE.test(target)) return learnFail('Unknown target.', 'invalid');
  if (!Number.isInteger(index) || index < 0) return learnFail('Bad fact index.', 'invalid');
  const n = factCount(target);
  if (n === null) return learnFail('No such profile.', 'unknown');
  if (index >= n) return learnFail('No such fact.', 'unknown');
  return null;
}

/**
 * S15 for reactions, per profile: a voter keeps the flag of their other reactions on the target;
 * a voter new to it is flagged once N other counted voters from the same IP hash joined this hour.
 */
async function reactionFlag(
  sql: Sql,
  target: string,
  voter: string,
  tag: string,
  now: number,
): Promise<number> {
  const own = await sql.get<{ f: number }>(
    'SELECT MIN(flagged) AS f FROM fact_reactions WHERE target = ? AND voter = ?',
    [target, voter],
  );
  if (own?.f === 0 || own?.f === 1) return own.f;
  if (!guestVoter(voter)) return 0;
  const r = await sql.get<{ n: number }>(
    `SELECT COUNT(DISTINCT voter) AS n FROM fact_reactions
      WHERE target = ? AND ip = ? AND flagged = 0 AND since > ? AND voter LIKE 'g:%'`,
    [target, tag, now - COUNTED_WINDOW_MS],
  );
  return (r?.n ?? 0) >= COUNTED_NEW_VOTERS_PER_IP ? 1 : 0;
}

/**
 * Sets, switches or (same reaction again) clears the voter's reaction to one fact, and returns that
 * fact's counts.
 */
export async function reactFact(
  sql: Sql,
  body: FactReactBody,
  voter: string,
  ip: string,
  now = Date.now(),
): Promise<FactReactReply | LearnError> {
  const bad = checkFactTarget(body.target, body.index);
  if (bad) return bad;
  if (body.reaction !== 'whoa' && body.reaction !== 'knew')
    return learnFail('Unknown reaction.', 'invalid');
  if (!allowedIn(voter, targetRealm(body.target)))
    return learnFail('Sacred reactions are anonymous.', 'invalid');
  const key = [body.target, body.index, voter];
  const had = await sql.get<{ reaction: FactReaction }>(
    'SELECT reaction FROM fact_reactions WHERE target = ? AND idx = ? AND voter = ?',
    key,
  );
  let mine: FactReaction | null = body.reaction;
  if (had?.reaction === body.reaction) {
    await sql.run('DELETE FROM fact_reactions WHERE target = ? AND idx = ? AND voter = ?', key);
    mine = null;
  } else if (had) {
    await sql.run(
      'UPDATE fact_reactions SET reaction = ?, at = ? WHERE target = ? AND idx = ? AND voter = ?',
      [body.reaction, now, ...key],
    );
  } else {
    const tag = await ipTag(ip);
    const flagged = await reactionFlag(sql, body.target, voter, tag, now);
    await sql.run(
      `INSERT OR IGNORE INTO fact_reactions (target, idx, voter, reaction, ip, at, since, flagged)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [body.target, body.index, voter, body.reaction, tag, now, now, flagged],
    );
  }
  const rows = await sql.all<{ reaction: FactReaction; n: number }>(
    `SELECT reaction, COUNT(*) AS n FROM fact_reactions WHERE target = ? AND idx = ? AND flagged = 0
     GROUP BY reaction`,
    [body.target, body.index],
  );
  const c = { whoa: 0, knew: 0 };
  for (const r of rows) c[r.reaction] = r.n;
  if (mine) {
    const own = await sql.get<{ flagged: number }>(
      'SELECT flagged FROM fact_reactions WHERE target = ? AND idx = ? AND voter = ?',
      key,
    );
    if (own?.flagged) c[mine] += 1; // S17: their own reaction counts in their view
  }
  return { index: body.index, ...c, mine };
}
