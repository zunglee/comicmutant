/** biome-ignore-all lint/style/noNonNullAssertion: tests index values the code under test guarantees. */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser, startSession } from '~/.server/auth';
import { addTake, modRule } from '~/.server/community';
import { getSql, type Sql, sqliteSql } from '~/.server/db';
import { openSqlite } from '~/.server/db.node';
import { DEFAULT_MINT_CEILING, DEFAULT_VOTE_CAP, positiveInt } from '~/.server/env';
import { clearBucket } from '~/.server/guard';
import {
  COUNTED_NEW_VOTERS_PER_IP,
  COUNTED_WINDOW_MS,
  castVote,
  factCount,
  factReactions,
  ipPrefix,
  isLearnError,
  MINT_MAX_PER_IP,
  MINT_WINDOW_MS,
  mintBucket,
  myFactReactions,
  pollsFor,
  pollView,
  REACT_MAX_PER_MIN,
  reactFact,
  setFactCountForTests,
  setPollsForTests,
  VOTE_MAX_PER_MIN,
} from '~/.server/polls';
import type { FactReactReply, LearnError, PollView } from '~/components/learn/contract';
import { LEARN_ERROR_CODES } from '~/components/learn/contract';
import { cachePolicy } from '~/entry.server';
import { checkPolls, type Poll } from '~/lib/polls-schema';
import { Character } from '~/lib/schema';

const db = (): Sql => sqliteSql(openSqlite(':memory:'));
const IP = '203.0.113.7';

const FIXTURE: Poll[] = [
  {
    id: 'p-open',
    realm: 'sacred',
    scope: 'sacred',
    question: 'Which festival story should we tell next?',
    options: [
      { id: 'diwali', label: 'Diwali' },
      { id: 'vesak', label: 'Vesak' },
      { id: 'gurpurab', label: 'Gurpurab' },
    ],
    closed: false,
  },
  {
    id: 'p-closed',
    realm: 'comic',
    scope: 'desi',
    question: 'Who is the best desi hero?',
    options: [
      { id: 'nagraj', label: 'Nagraj' },
      { id: 'dhruva', label: 'Super Commando Dhruva' },
    ],
    closed: true,
  },
  {
    id: 'p-desi',
    realm: 'comic',
    scope: 'desi',
    question: 'Which hero deserves a film?',
    options: [
      { id: 'nagraj', label: 'Nagraj' },
      { id: 'doga', label: 'Doga' },
    ],
    closed: false,
  },
  {
    id: 'p-figure',
    realm: 'sacred',
    scope: 'figure:ganesha',
    question: 'Which Ganesha story first?',
    options: [
      { id: 'a', label: 'The broken tusk' },
      { id: 'b', label: 'The race around the world' },
    ],
    closed: false,
  },
];
/** Fixture fact counts per reaction target. */
const COUNTS: Record<string, number> = {
  'sacred:ganesha': 20,
  'desi:nagraj': 8,
  'desi:shaktimaan': 20,
};

beforeAll(() => {
  setPollsForTests(FIXTURE);
  setFactCountForTests((t) => COUNTS[t] ?? null);
});
afterAll(() => {
  setPollsForTests(null);
  setFactCountForTests(null);
});

const ok = <T>(r: T | LearnError): T => {
  if (isLearnError(r)) throw new Error(`unexpected ${r.code}: ${r.error}`);
  return r;
};

// ─── polls: the rules ────────────────────────────────────────────────────────────────────────────

describe('castVote / pollView', () => {
  it('one vote per voter: voting the same option twice counts once', async () => {
    const sql = db();
    ok(await castVote(sql, { id: 'p-open', option: 'diwali' }, 'g:aaa', IP));
    const v = ok(await castVote(sql, { id: 'p-open', option: 'diwali' }, 'g:aaa', IP));
    expect(v.total).toBe(1);
    expect(v.options.find((o) => o.id === 'diwali')!.votes).toBe(1);
    expect(v.mine).toBe('diwali');
  });

  it('a voter may change their vote; the old option loses it', async () => {
    const sql = db();
    ok(await castVote(sql, { id: 'p-open', option: 'diwali' }, 'g:zzz', IP));
    const v = ok(await castVote(sql, { id: 'p-open', option: 'vesak' }, 'g:zzz', IP));
    expect(v.total).toBe(1);
    expect(Object.fromEntries(v.options.map((o) => [o.id, o.votes]))).toEqual({
      diwali: 0,
      vesak: 1,
      gurpurab: 0,
    });
    expect(v.mine).toBe('vesak');
  });

  it('fans and guests are separate voters; mine is per voter; options keep content order', async () => {
    const sql = db();
    ok(await castVote(sql, { id: 'p-desi', option: 'doga' }, 'u:1', IP));
    ok(await castVote(sql, { id: 'p-desi', option: 'doga' }, 'g:bbb', IP));
    ok(await castVote(sql, { id: 'p-desi', option: 'nagraj' }, 'g:ccc', IP));
    const anon = (await pollView('p-desi', null, sql))!;
    expect(anon).toMatchObject({ id: 'p-desi', total: 3, mine: null });
    expect(anon.options.map((o) => o.id)).toEqual(['nagraj', 'doga']);
    expect((await pollView('p-desi', 'g:ccc', sql))!.mine).toBe('nagraj');
    expect((await pollView('p-desi', 'u:1', sql))!.mine).toBe('doga');
    expect((await pollView('p-desi', 'u:2', sql))!.mine).toBeNull();
    expect((await pollView('p-open', null, sql))!.options.map((o) => o.id)).toEqual([
      'diwali',
      'vesak',
      'gurpurab',
    ]);
  });

  it('S12: a fan key is never stored on a sacred poll or a sacred fact reaction', async () => {
    const sql = db();
    expect(await castVote(sql, { id: 'p-open', option: 'diwali' }, 'u:1', IP)).toMatchObject({
      code: 'invalid',
    });
    expect(
      await reactFact(sql, { target: 'sacred:ganesha', index: 0, reaction: 'whoa' }, 'u:1', IP),
    ).toMatchObject({ code: 'invalid' });
    ok(await reactFact(sql, { target: 'desi:nagraj', index: 0, reaction: 'whoa' }, 'u:1', IP));
    expect(await sql.get("SELECT 1 FROM poll_votes WHERE voter LIKE 'u:%'")).toBeUndefined();
    expect(await sql.all("SELECT target FROM fact_reactions WHERE voter LIKE 'u:%'")).toEqual([
      { target: 'desi:nagraj' },
    ]);
    expect(await myFactReactions('sacred:ganesha', 'u:1', sql)).toEqual({});
  });

  it('unknown poll → unknown; unknown option → invalid; closed poll → closed; pollView null', async () => {
    const sql = db();
    expect(await castVote(sql, { id: 'nope', option: 'x' }, 'g:a', IP)).toMatchObject({
      code: 'unknown',
    });
    expect(await castVote(sql, { id: 'p-open', option: 'holi' }, 'g:a', IP)).toMatchObject({
      code: 'invalid',
    });
    expect(await castVote(sql, { id: 'p-closed', option: 'nagraj' }, 'g:a', IP)).toMatchObject({
      code: 'closed',
    });
    expect(await pollView('nope', null, sql)).toBeNull();
    // A closed poll still shows its results.
    expect(await pollView('p-closed', null, sql)).toMatchObject({ total: 0, mine: null });
  });

  it('a vote for an option later removed from content is neither counted nor "mine"', async () => {
    const sql = db();
    ok(await castVote(sql, { id: 'p-open', option: 'vesak' }, 'g:a', IP));
    setPollsForTests([
      { ...FIXTURE[0]!, options: FIXTURE[0]!.options.filter((o) => o.id !== 'vesak') },
    ]);
    try {
      expect(await pollView('p-open', 'g:a', sql)).toMatchObject({ total: 0, mine: null });
    } finally {
      setPollsForTests(FIXTURE);
    }
  });

  it('the IP is stored only as a keyed hash', async () => {
    const sql = db();
    ok(await castVote(sql, { id: 'p-open', option: 'diwali' }, 'g:a', IP));
    const row = await sql.get<{ ip: string }>('SELECT ip FROM poll_votes');
    expect(row!.ip).not.toContain('203.0.113');
    expect(row!.ip).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  });

  it('pollsFor matches an exact scope or a scope prefix', () => {
    expect(pollsFor('sacred').map((p) => p.id)).toEqual(['p-open']);
    expect(pollsFor('figure:ganesha').map((p) => p.id)).toEqual(['p-figure']);
    expect(pollsFor('desi').map((p) => p.id)).toEqual(['p-closed', 'p-desi']);
  });
});

// ─── S15: shared-IP cap on counted new voters ───────────────────────────────────────────────────

describe('S15: new voters per IP hash per hour', () => {
  const N = COUNTED_NEW_VOTERS_PER_IP;
  const T = 1_800_000_000_000;

  it("a shared office IP: the first N voters count; later ones vote (and see it) but aren't counted", async () => {
    const sql = db();
    for (let k = 0; k < N + 3; k++) {
      const v = ok(
        await castVote(sql, { id: 'p-open', option: 'diwali' }, `g:office${k}`, IP, T + k),
      );
      expect(v.mine).toBe('diwali');
      // Their own view counts their vote (S17); the public view stops at N.
      expect(v.total).toBe(k < N ? k + 1 : N + 1);
      expect((await pollView('p-open', null, sql))!.total).toBe(Math.min(k + 1, N));
    }
    // A flagged voter's change of mind keeps the flag; a counted voter's change moves their vote.
    let v = ok(
      await castVote(sql, { id: 'p-open', option: 'vesak' }, `g:office${N + 1}`, IP, T + 50),
    );
    expect(v.options.find((o) => o.id === 'vesak')!.votes).toBe(1); // their own, in their view
    const pub = (await pollView('p-open', null, sql))!;
    expect(pub.options.find((o) => o.id === 'vesak')!.votes).toBe(0);
    v = ok(await castVote(sql, { id: 'p-open', option: 'vesak' }, 'g:office0', IP, T + 60));
    expect(v.options.find((o) => o.id === 'vesak')!.votes).toBe(1);
    expect(v.total).toBe(N); // a counted voter's view is the public one
    // Rows are kept, flagged — never refused.
    const rows = await sql.all<{ flagged: number }>('SELECT flagged FROM poll_votes');
    expect(rows.filter((r) => r.flagged === 1)).toHaveLength(3);
    // Another poll has its own allowance; an hour later the same IP counts again.
    expect(
      ok(await castVote(sql, { id: 'p-desi', option: 'doga' }, 'g:office9', IP, T + 70)).total,
    ).toBe(1);
    const later = ok(
      await castVote(
        sql,
        { id: 'p-open', option: 'diwali' },
        'g:late',
        IP,
        T + COUNTED_WINDOW_MS + 100,
      ),
    );
    expect(later.total).toBe(N + 1);
  });

  it('60 voters from 60 different IPs all count', async () => {
    const sql = db();
    let v: PollView | undefined;
    for (let k = 0; k < 60; k++)
      v = ok(
        await castVote(sql, { id: 'p-open', option: 'vesak' }, `g:ip${k}`, `198.51.100.${k}`, T),
      );
    expect(v!.total).toBe(60);
  });

  it('signed-in fans on a desi poll always count, and use none of the guest allowance', async () => {
    const sql = db();
    for (let k = 0; k < N + 2; k++)
      ok(await castVote(sql, { id: 'p-desi', option: 'doga' }, `u:${k + 1}`, IP, T + k));
    for (let k = 0; k < N + 2; k++)
      ok(await castVote(sql, { id: 'p-desi', option: 'nagraj' }, `g:after${k}`, IP, T + 10 + k));
    const v = (await pollView('p-desi', null, sql))!;
    expect(Object.fromEntries(v.options.map((o) => [o.id, o.votes]))).toEqual({
      nagraj: N,
      doga: N + 2,
    });
  });

  it('reactions: per profile, the first N new voters from an IP count; their later reactions too', async () => {
    const sql = db();
    for (let k = 0; k < N + 4; k++)
      await reactFact(
        sql,
        { target: 'sacred:ganesha', index: 0, reaction: 'whoa' },
        `g:r${k}`,
        IP,
        T + k,
      );
    expect((await factReactions('sacred:ganesha', sql))[0]).toEqual({ whoa: N, knew: 0 });
    // A counted voter reacting to another fact still counts, even though the IP is "full".
    const r = ok(
      await reactFact(
        sql,
        { target: 'sacred:ganesha', index: 4, reaction: 'knew' },
        'g:r0',
        IP,
        T + 99,
      ),
    );
    expect(r).toMatchObject({ knew: 1, mine: 'knew' });
    // A flagged voter sees their own reaction, which isn't in the count.
    const f = ok(
      await reactFact(
        sql,
        { target: 'sacred:ganesha', index: 4, reaction: 'knew' },
        `g:r${N + 1}`,
        IP,
        T + 99,
      ),
    );
    expect(f).toMatchObject({ knew: 2, mine: 'knew' }); // their own counted in their reply (S17)
    expect((await factReactions('sacred:ganesha', sql))[4]).toEqual({ whoa: 0, knew: 1 });
    expect((await factReactions('sacred:ganesha', sql, `g:r${N + 1}`))[4]).toEqual({
      whoa: 0,
      knew: 2,
    });
    expect((await factReactions('sacred:ganesha', sql, `g:r${N + 1}`))[0]).toEqual({
      whoa: N + 1,
      knew: 0,
    });
    expect(await myFactReactions('sacred:ganesha', `g:r${N + 1}`, sql)).toEqual({
      0: 'whoa',
      4: 'knew',
    });
    // Another profile has its own allowance.
    const d = ok(
      await reactFact(
        sql,
        { target: 'desi:nagraj', index: 0, reaction: 'whoa' },
        `g:r${N + 2}`,
        IP,
        T,
      ),
    );
    expect(d.whoa).toBe(1);
  });
});

// ─── fact reactions: the rules ───────────────────────────────────────────────────────────────────

describe('reactFact / factReactions', () => {
  const body = (index: number, reaction: 'whoa' | 'knew', target = 'sacred:ganesha') => ({
    target,
    index,
    reaction,
  });

  it('one reaction per voter per fact: same again toggles off, the other switches', async () => {
    const sql = db();
    let r = ok(await reactFact(sql, body(3, 'whoa'), 'g:a', IP));
    expect(r).toEqual({ index: 3, whoa: 1, knew: 0, mine: 'whoa' });
    r = ok(await reactFact(sql, body(3, 'knew'), 'g:a', IP));
    expect(r).toEqual({ index: 3, whoa: 0, knew: 1, mine: 'knew' });
    r = ok(await reactFact(sql, body(3, 'knew'), 'g:a', IP));
    expect(r).toEqual({ index: 3, whoa: 0, knew: 0, mine: null });
  });

  it('counts every voter per fact, and per target; mine per voter', async () => {
    const sql = db();
    ok(await reactFact(sql, body(0, 'whoa'), 'g:a', IP));
    ok(await reactFact(sql, body(0, 'whoa'), 'g:d', IP));
    ok(await reactFact(sql, body(0, 'knew'), 'g:b', IP));
    ok(await reactFact(sql, body(19, 'knew'), 'g:a', IP));
    ok(await reactFact(sql, body(0, 'whoa', 'desi:nagraj'), 'g:a', IP));
    expect(await factReactions('sacred:ganesha', sql)).toEqual({
      0: { whoa: 2, knew: 1 },
      19: { whoa: 0, knew: 1 },
    });
    expect(await factReactions('desi:nagraj', sql)).toEqual({ 0: { whoa: 1, knew: 0 } });
    expect(await myFactReactions('sacred:ganesha', 'g:a', sql)).toEqual({ 0: 'whoa', 19: 'knew' });
    expect(await myFactReactions('sacred:ganesha', null, sql)).toEqual({});
    expect(await factReactions('bad target', sql)).toEqual({});
  });

  it('index past the profile fact count → unknown; unknown profile → unknown; bad shape → invalid', async () => {
    const sql = db();
    expect(await reactFact(sql, body(20, 'whoa'), 'g:a', IP)).toMatchObject({ code: 'unknown' });
    expect(await reactFact(sql, body(8, 'whoa', 'desi:nagraj'), 'g:a', IP)).toMatchObject({
      code: 'unknown',
    });
    expect(await reactFact(sql, body(0, 'whoa', 'sacred:zeus'), 'g:a', IP)).toMatchObject({
      code: 'unknown',
    });
    for (const target of ['ganesha', 'marvel:spider-man', 'sacred:Ganesha', 'sacred:', 'desi:a b'])
      expect(await reactFact(sql, body(0, 'whoa', target), 'g:a', IP)).toMatchObject({
        code: 'invalid',
      });
    expect(await reactFact(sql, body(-1, 'whoa'), 'g:a', IP)).toMatchObject({ code: 'invalid' });
    expect(await reactFact(sql, body(1.5, 'whoa'), 'g:a', IP)).toMatchObject({ code: 'invalid' });
    expect(
      await reactFact(
        sql,
        { target: 'sacred:ganesha', index: 0, reaction: 'meh' as 'whoa' },
        'g:a',
        IP,
      ),
    ).toMatchObject({ code: 'invalid' });
    expect(await sql.get('SELECT 1 FROM fact_reactions')).toBeUndefined();
  });
});

describe('factCount against real content', () => {
  beforeAll(() => setFactCountForTests(null));
  afterAll(() => setFactCountForTests((t) => COUNTS[t] ?? null));

  it('sacred: only roster slugs; counted from the profile file when it exists, else unknown', () => {
    expect(factCount('sacred:zeus')).toBeNull();
    const roster = JSON.parse(readFileSync('content/sacred/roster.json', 'utf8')) as {
      slug: string;
      tradition: string;
    }[];
    for (const r of roster.slice(0, 40)) {
      const f = `content/sacred/${r.tradition}/${r.slug}.json`;
      const n = factCount(`sacred:${r.slug}`);
      if (!existsSync(f)) expect(n).toBeNull();
      else if (n !== null) expect(n).toBe((JSON.parse(readFileSync(f, 'utf8')).facts ?? []).length);
    }
  });

  it('desi: only indian characters that carry facts', () => {
    expect(factCount('desi:spider-man')).toBeNull();
    expect(factCount('desi:no-such-hero')).toBeNull();
    // Profiles are landing: a file that fails the schema isn't loaded, so it has no facts to react to.
    const nagraj = Character.safeParse(
      JSON.parse(readFileSync('content/characters/indian/nagraj.json', 'utf8')),
    );
    const n = nagraj.success ? (nagraj.data.facts?.length ?? 0) : 0;
    expect(factCount('desi:nagraj')).toBe(n > 0 ? n : null);
  });
});

// ─── API routes: cookies, limits, codes ──────────────────────────────────────────────────────────

describe('API routes', () => {
  /** `cookie` = every Set-Cookie pair joined, ready to send back. */
  type Reply = {
    status: number;
    body: Record<string, unknown>;
    cookie: string | null;
    /** X-CM-Voter on GETs: '1' can vote, '0' the mint ceiling withheld cookies. */
    voter: string | null;
  };
  const SITE = 'http://localhost';
  const send = async (
    path: 'poll' | 'fact-react',
    body: unknown,
    opts: { cookie?: string; method?: string; origin?: string | null; referer?: string } = {},
  ): Promise<Reply> => {
    const mod = (await import(`~/routes/api/${path}.ts`)) as {
      action: (a: { request: Request }) => Promise<unknown>;
    };
    const method = opts.method ?? 'POST';
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.cookie) headers.cookie = opts.cookie;
    const origin = opts.origin === undefined ? SITE : opts.origin;
    if (origin) headers.origin = origin;
    if (opts.referer) headers.referer = opts.referer;
    const request = new Request(`${SITE}/api/${path}`, {
      method,
      headers,
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    });
    return unwrap(await mod.action({ request }));
  };
  const get = async (query: string, cookie?: string, path = 'poll'): Promise<Reply> => {
    const mod = (await import(`~/routes/api/${path}.ts`)) as unknown as {
      loader: (a: { request: Request }) => Promise<unknown>;
    };
    const request = new Request(`${SITE}/api/${path}${query}`, {
      headers: cookie ? { cookie } : {},
    });
    return unwrap(await mod.loader({ request }));
  };
  const unwrap = (r: unknown): Reply => {
    const d = r as { data?: unknown; init?: { status?: number; headers?: HeadersInit } };
    const h = new Headers(d.init?.headers);
    const set = h.getSetCookie().map((c) => c.split(';')[0]!);
    return {
      status: d.init?.status ?? 200,
      body: d.data as Record<string, unknown>,
      cookie: set.length ? set.join('; ') : null,
      voter: h.get('x-cm-voter'),
    };
  };
  /** A browser that has viewed a poll: its guest cookie plus the voter key the view issued. */
  const browser = async (existing?: string): Promise<string> => {
    const r = await get('?id=p-open', existing);
    return [existing, r.cookie].filter(Boolean).join('; ');
  };
  const guest = (n: number) => `cm_voter=guest-${String(n).padStart(4, '0')}-xxxxxxxxxxxxxxxx`;
  const guestOf = (cookie: string) => `g:${/cm_voter=([^;]+)/.exec(cookie)![1]}`;

  const prevDb = process.env.COMICMUTANT_DB;
  beforeAll(() => {
    process.env.COMICMUTANT_DB = ':memory:';
  });
  afterAll(() => {
    if (prevDb === undefined) delete process.env.COMICMUTANT_DB;
    else process.env.COMICMUTANT_DB = prevDb;
  });
  // Every request here comes from one IP ('local'): each test starts with a fresh mint allowance.
  beforeEach(async () => clearBucket(await getSql(), mintBucket('local'), MINT_WINDOW_MS));

  it('S14: viewing a poll issues the guest cookie and voter key; then one vote per browser', async () => {
    const view = await get('?id=p-figure');
    expect(view.cookie).toMatch(/^cm_voter=[A-Za-z0-9_-]{22,64}; cm_vk=[A-Za-z0-9_-]{20,}$/);
    expect(view.body).toMatchObject({ id: 'p-figure', total: 0, mine: null });
    const c = view.cookie!;
    expect((await get('?id=p-figure', c)).cookie).toBeNull(); // nothing re-issued
    const first = await send('poll', { id: 'p-figure', option: 'a' }, { cookie: c });
    expect(first).toMatchObject({ status: 200, cookie: null, body: { total: 1, mine: 'a' } });
    const again = await send('poll', { id: 'p-figure', option: 'b' }, { cookie: c });
    expect(again.body).toMatchObject({ total: 1, mine: 'b' });
    expect((await get('?id=p-figure', c)).body).toMatchObject({ total: 1, mine: 'b' });
  });

  it('S14: cookieless POSTs never mint voters — 15 of them add no votes', async () => {
    for (let k = 0; k < 15; k++) {
      const r = await send('poll', { id: 'p-figure', option: 'a' });
      expect(r).toMatchObject({ status: 400, cookie: null, body: { code: 'invalid' } });
      expect(r.body.error).toMatch(/reload/i);
      const f = await send('fact-react', { target: 'desi:nagraj', index: 1, reaction: 'whoa' });
      expect(f).toMatchObject({ status: 400, cookie: null, body: { code: 'invalid' } });
    }
    const sql = await getSql();
    expect(await sql.all('SELECT 1 FROM fact_reactions WHERE idx = 1')).toEqual([]);
  });

  it('S14: a forged guest cookie (no voter key, or a wrong one) is refused; a view repairs it', async () => {
    const forged = guest(7);
    const r = await send('poll', { id: 'p-open', option: 'vesak' }, { cookie: forged });
    expect(r).toMatchObject({ status: 400, body: { code: 'invalid' } });
    const wrong = `${forged}; cm_vk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    expect((await send('poll', { id: 'p-open', option: 'vesak' }, { cookie: wrong })).status).toBe(
      400,
    );
    // An older guest cookie (e.g. from the quiz) keeps its id: the page view only adds the key.
    const viewed = await get('?id=p-open', forged);
    expect(viewed.cookie).toMatch(/^cm_vk=/);
    const ok2 = await send(
      'poll',
      { id: 'p-open', option: 'vesak' },
      {
        cookie: `${forged}; ${viewed.cookie}`,
      },
    );
    expect(ok2).toMatchObject({ status: 200, body: { mine: 'vesak' } });
    const sql = await getSql();
    expect(
      await sql.all('SELECT 1 FROM poll_votes WHERE voter = ?', [guestOf(forged)]),
    ).toHaveLength(1);
  });

  it('S14: POST needs a same-origin Origin or Referer; neither → 403 invalid', async () => {
    const c = await browser();
    const body = { id: 'p-open', option: 'diwali' };
    const none = await send('poll', body, { cookie: c, origin: null });
    expect(none).toMatchObject({ status: 403, body: { code: 'invalid' } });
    const evil = await send('poll', body, { cookie: c, origin: 'https://evil.example' });
    expect(evil.status).toBe(403);
    const evilRef = await send('poll', body, {
      cookie: c,
      origin: null,
      referer: 'https://evil.example/sacred',
    });
    expect(evilRef.status).toBe(403);
    const ref = await send('poll', body, { cookie: c, origin: null, referer: `${SITE}/sacred` });
    expect(ref.status).toBe(200);
    const react = await send(
      'fact-react',
      { target: 'desi:nagraj', index: 2, reaction: 'knew' },
      { cookie: c, origin: null },
    );
    expect(react.status).toBe(403);
  });

  it('a signed-in fan votes as themselves on desi polls (session is their existing voter)', async () => {
    const sql = await getSql();
    const id = await createUser(sql, 'PollFan', 'correct horse battery', null);
    const session = (await startSession(sql, id!)).split(';')[0]!;
    const r = await send('poll', { id: 'p-desi', option: 'doga' }, { cookie: session });
    expect(r).toMatchObject({ status: 200, cookie: null, body: { mine: 'doga' } });
    const other = await send(
      'poll',
      { id: 'p-desi', option: 'nagraj' },
      { cookie: `${session}; ${await browser(guest(9001))}` },
    );
    expect(other.body).toMatchObject({ mine: 'nagraj' });
    const rows = await sql.all<{ voter: string }>(
      "SELECT voter FROM poll_votes WHERE poll_id = 'p-desi'",
    );
    expect(rows.map((x) => x.voter)).toEqual([`u:${id}`]);
  });

  it("S12: a signed-in fan's sacred vote and sacred reaction rows carry no user id", async () => {
    const sql = await getSql();
    const id = await createUser(sql, 'SacredFan', 'correct horse battery', null);
    const session = (await startSession(sql, id!)).split(';')[0]!;
    // A session alone is not a sacred voter: the browser must have viewed the poll first.
    const bare = await send('poll', { id: 'p-figure', option: 'b' }, { cookie: session });
    expect(bare).toMatchObject({ status: 400, body: { code: 'invalid' } });
    const view = await get('?id=p-figure', session);
    expect(view.cookie).toMatch(/^cm_voter=/);
    const both = `${session}; ${view.cookie}`;
    const v = await send('poll', { id: 'p-figure', option: 'b' }, { cookie: both });
    expect(v).toMatchObject({ status: 200, body: { mine: 'b' } });
    const f = await send(
      'fact-react',
      { target: 'sacred:ganesha', index: 11, reaction: 'knew' },
      { cookie: both },
    );
    expect(f).toMatchObject({ status: 200, cookie: null, body: { mine: 'knew' } });
    const g = guestOf(view.cookie!);
    expect(
      await sql.all("SELECT voter FROM poll_votes WHERE poll_id = 'p-figure' AND voter = ?", [g]),
    ).toHaveLength(1);
    expect(
      await sql.all('SELECT voter FROM fact_reactions WHERE target = ? AND voter = ?', [
        'sacred:ganesha',
        g,
      ]),
    ).toHaveLength(1);
    // No fan key on any sacred row, and none for this fan anywhere.
    expect(
      await sql.all(
        "SELECT 1 FROM poll_votes WHERE voter LIKE 'u:%' AND poll_id IN ('p-open', 'p-figure')",
      ),
    ).toEqual([]);
    expect(
      await sql.all(
        "SELECT 1 FROM fact_reactions WHERE voter LIKE 'u:%' AND target LIKE 'sacred:%'",
      ),
    ).toEqual([]);
    for (const table of ['poll_votes', 'fact_reactions'])
      expect(await sql.all(`SELECT 1 FROM ${table} WHERE voter = ?`, [`u:${id}`])).toEqual([]);
    // The sacred view follows the browser cookie, not the session.
    expect((await get('?id=p-figure', session)).body).toMatchObject({ mine: null });
    expect((await get('?id=p-figure', both)).body).toMatchObject({ mine: 'b' });
  });

  it("S13: a soft-ban deletes the fan's desi votes and reactions; sacred rows are unlinkable", async () => {
    const sql = await getSql();
    const troll = (await createUser(sql, 'PollTroll', 'correct horse battery', null))!;
    const mod = (await createUser(sql, 'PollMod', 'correct horse battery', null, 'mod'))!;
    const session = (await startSession(sql, troll)).split(';')[0]!;
    const view = await get('?id=p-open', session);
    const cookie = `${session}; ${view.cookie}`;
    expect((await send('poll', { id: 'p-open', option: 'gurpurab' }, { cookie })).status).toBe(200);
    await send('poll', { id: 'p-desi', option: 'doga' }, { cookie });
    await send('fact-react', { target: 'desi:nagraj', index: 3, reaction: 'whoa' }, { cookie });
    await send('fact-react', { target: 'sacred:ganesha', index: 3, reaction: 'whoa' }, { cookie });
    const voter = `u:${troll}`;
    expect(await sql.all('SELECT 1 FROM poll_votes WHERE voter = ?', [voter])).toHaveLength(1);
    const take = await addTake(sql, troll, 'c:nagraj', 'trolling the polls here', null);
    expect(await modRule(sql, mod, take, 'ban')).toBeNull();
    expect(await sql.all('SELECT 1 FROM poll_votes WHERE voter = ?', [voter])).toEqual([]);
    expect(await sql.all('SELECT 1 FROM fact_reactions WHERE voter = ?', [voter])).toEqual([]);
    expect((await pollView('p-desi', voter, sql))!.mine).toBeNull();
    // The sacred rows sit under the browser cookie only, so the ban can't (and doesn't) find them.
    const g = guestOf(view.cookie!);
    expect(await sql.all('SELECT 1 FROM poll_votes WHERE voter = ?', [g])).toHaveLength(1);
    expect(await sql.all('SELECT 1 FROM fact_reactions WHERE voter = ?', [g])).toHaveLength(1);
  });

  it(`flood ceiling: the ${VOTE_MAX_PER_MIN + 1}th vote change in a minute → 429, code rate`, async () => {
    const c = await browser(guest(1));
    const statuses: number[] = [];
    let last: Reply | undefined;
    for (let k = 0; k <= VOTE_MAX_PER_MIN; k++) {
      last = await send(
        'poll',
        { id: 'p-open', option: k % 2 ? 'diwali' : 'vesak' },
        { cookie: c },
      );
      statuses.push(last.status);
    }
    expect(statuses.slice(0, VOTE_MAX_PER_MIN).every((s) => s === 200)).toBe(true);
    expect(last).toMatchObject({ status: 429, body: { code: 'rate' } });
    // Another browser is unaffected.
    const c2 = await browser(guest(2));
    expect((await send('poll', { id: 'p-open', option: 'vesak' }, { cookie: c2 })).status).toBe(
      200,
    );
  });

  it(`reaction flood: the ${REACT_MAX_PER_MIN + 1}th reaction in a minute → 429`, async () => {
    const c = await browser(guest(3));
    let last: Reply | undefined;
    for (let k = 0; k <= REACT_MAX_PER_MIN; k++)
      last = await send(
        'fact-react',
        { target: 'sacred:ganesha', index: k % 20, reaction: 'whoa' },
        { cookie: c },
      );
    expect(last).toMatchObject({ status: 429, body: { code: 'rate' } });
  });

  it('S15 critic loop: 60 fresh cookie jars on one IP are all answered, but totals grow by ≤ N', async () => {
    const before = (await pollView('p-desi', null, await getSql()))!; // a GET would use a mint
    const reactBefore = (await factReactions('desi:shaktimaan', await getSql()))[0]?.whoa ?? 0;
    const statuses: number[] = [];
    for (let k = 0; k < 60; k++) {
      const c = await browser();
      statuses.push((await send('poll', { id: 'p-desi', option: 'doga' }, { cookie: c })).status);
      const f = await send(
        'fact-react',
        { target: 'desi:shaktimaan', index: 0, reaction: 'whoa' },
        { cookie: c },
      );
      statuses.push(f.status);
    }
    // Never refused, never blocked…
    expect(statuses.filter((s) => s !== 200)).toEqual([]);
    // …but only N of them reach the public counts.
    const after = (await pollView('p-desi', null, await getSql()))!;
    expect(after.total - before.total).toBeLessThanOrEqual(COUNTED_NEW_VOTERS_PER_IP);
    const reactAfter = (await factReactions('desi:shaktimaan', await getSql()))[0]!.whoa;
    expect(reactAfter - reactBefore).toBeLessThanOrEqual(COUNTED_NEW_VOTERS_PER_IP);
  });

  it(`S15 soft mint ceiling: past ${MINT_MAX_PER_IP} new browsers per IP per window, no cookie is issued`, async () => {
    const settled = await browser(guest(8)); // a browser that already holds both cookies
    for (let k = 1; k < MINT_MAX_PER_IP; k++)
      expect((await get('?id=p-open')).cookie).not.toBeNull();
    const late = await get('?id=p-open');
    expect(late.voter).toBe('0');
    // S17: the expired marker cookie keeps this copy out of shared caches.
    expect(late.cookie).toBe('cm_vp=');
    const h = new Headers({ 'Set-Cookie': 'cm_vp=; Path=/; Max-Age=0' });
    cachePolicy(new Request(`${SITE}/sacred/f/ganesha`), h, 200);
    expect(h.get('Cache-Control')).toBe('private, no-store');
    expect(late.status).toBe(200); // the page still renders
    // That browser's vote asks for a reload; the settled browser votes as before.
    const r = await send('poll', { id: 'p-open', option: 'diwali' }, { cookie: undefined });
    expect(r).toMatchObject({ status: 400, body: { code: 'invalid' } });
    expect(
      (await send('poll', { id: 'p-open', option: 'diwali' }, { cookie: settled })).status,
    ).toBe(200);
    expect((await get('?id=p-open', settled)).cookie).toBeNull();
  });

  it('every error carries a stable code; failed writes never set a cookie', async () => {
    const c = await browser(guest(5));
    const cases: [Promise<Reply>, number, string][] = [
      [send('poll', { id: 'Bad Id', option: 'a' }, { cookie: c }), 400, 'invalid'],
      [send('poll', { id: 'p-open' }, { cookie: c }), 400, 'invalid'],
      [send('poll', { id: 'nope', option: 'a' }, { cookie: c }), 404, 'unknown'],
      [send('poll', { id: 'p-open', option: 'holi' }, { cookie: c }), 400, 'invalid'],
      [send('poll', { id: 'p-closed', option: 'nagraj' }, { cookie: c }), 409, 'closed'],
      [send('poll', null, { method: 'PUT', cookie: c }), 405, 'invalid'],
      [
        send(
          'fact-react',
          { target: 'sacred:ganesha', index: 20, reaction: 'whoa' },
          { cookie: c },
        ),
        404,
        'unknown',
      ],
      [
        send('fact-react', { target: 'sacred:zeus', index: 0, reaction: 'whoa' }, { cookie: c }),
        404,
        'unknown',
      ],
      [
        send('fact-react', { target: 'ganesha', index: 0, reaction: 'whoa' }, { cookie: c }),
        400,
        'invalid',
      ],
      [
        send(
          'fact-react',
          { target: 'sacred:ganesha', index: -1, reaction: 'whoa' },
          { cookie: c },
        ),
        400,
        'invalid',
      ],
      [
        send('fact-react', { target: 'sacred:ganesha', index: 0, reaction: 'meh' }, { cookie: c }),
        400,
        'invalid',
      ],
      [
        send(
          'fact-react',
          { target: 'sacred:ganesha', index: '0', reaction: 'whoa' },
          { cookie: c },
        ),
        400,
        'invalid',
      ],
      [get(''), 400, 'invalid'],
      [get('?id=nope'), 404, 'unknown'],
    ];
    for (const [p, status, code] of cases) {
      const r = await p;
      expect(r.status, JSON.stringify(r.body)).toBe(status);
      expect(r.body).toMatchObject({ code });
      expect(typeof r.body.error).toBe('string');
      expect(LEARN_ERROR_CODES).toContain(r.body.code);
      expect(r.cookie).toBeNull();
    }
  });

  it('a big body is refused before parsing', async () => {
    const r = await send('fact-react', {
      target: `sacred:${'a'.repeat(400)}`,
      index: 0,
      reaction: 'whoa',
    });
    expect(r).toMatchObject({ status: 413, body: { code: 'invalid' } });
  });

  it('S17 fallback: GET /api/fact-react issues voter cookies and returns the deck counts', async () => {
    const r = await get('?target=desi:nagraj', undefined, 'fact-react');
    expect(r.status).toBe(200);
    expect(r.voter).toBe('1');
    expect(r.cookie).toMatch(/^cm_voter=[A-Za-z0-9_-]{22,64}; cm_vk=/);
    expect(Object.keys(r.body).sort()).toEqual(['counts', 'mine', 'target']);
    const react = await send(
      'fact-react',
      { target: 'desi:nagraj', index: 6, reaction: 'whoa' },
      { cookie: r.cookie! },
    );
    expect(react.status).toBe(200);
    const again = await get('?target=desi:nagraj', r.cookie!, 'fact-react');
    expect(again).toMatchObject({ cookie: null, voter: '1', body: { mine: { 6: 'whoa' } } });
    expect((again.body.counts as Record<number, { whoa: number }>)[6]!.whoa).toBeGreaterThan(0);
    for (const [q, status, code] of [
      ['', 400, 'invalid'],
      ['?target=ganesha', 400, 'invalid'],
      ['?target=sacred:zeus', 404, 'unknown'],
    ] as const) {
      const e = await get(q, undefined, 'fact-react');
      expect(e).toMatchObject({ status, cookie: null, body: { code } });
    }
    // GET /api/poll reports the same header.
    expect((await get('?id=p-open')).voter).toBe('1');
  });

  it('S17: the 6th guest on one IP sees their own vote counted; others still do not', async () => {
    const sql = await getSql();
    await sql.run("DELETE FROM poll_votes WHERE poll_id = 'p-figure'");
    const jars: string[] = [];
    for (let k = 0; k <= COUNTED_NEW_VOTERS_PER_IP; k++) jars.push(await browser());
    let last: Reply | undefined;
    for (const c of jars) last = await send('poll', { id: 'p-figure', option: 'b' }, { cookie: c });
    const N = COUNTED_NEW_VOTERS_PER_IP;
    expect(last!.body).toMatchObject({ mine: 'b', total: N + 1 });
    const mineView = (await get('?id=p-figure', jars.at(-1))).body as unknown as PollView;
    expect(mineView.options.find((o) => o.id === 'b')!.votes).toBe(N + 1);
    const other = (await get('?id=p-figure', jars[0])).body as unknown as PollView;
    expect(other).toMatchObject({ total: N, mine: 'b' });
    expect((await pollView('p-figure', null, sql))!.total).toBe(N);
  });

  it('fact-react replies with the contract shape; GET poll replies with PollView', async () => {
    await (await getSql()).run('DELETE FROM fact_reactions'); // earlier tests filled this IP's allowance
    const c = await browser(guest(4));
    const r = await send(
      'fact-react',
      { target: 'desi:nagraj', index: 5, reaction: 'knew' },
      { cookie: c },
    );
    const reply = r.body as unknown as FactReactReply;
    expect(reply).toEqual({ index: 5, whoa: 0, knew: 1, mine: 'knew' });
    const v = (await get('?id=p-open', c)).body as unknown as PollView;
    expect(Object.keys(v).sort()).toEqual(['id', 'mine', 'options', 'question', 'total']);
  });
});

// ─── S7 poll validator ───────────────────────────────────────────────────────────────────────────

describe('checkPolls (S7: never rank faiths or deities)', () => {
  const roster = JSON.parse(readFileSync('content/sacred/roster.json', 'utf8')) as {
    slug: string;
    name: string;
  }[];
  const opts = {
    figureSlugs: new Set(roster.map((r) => r.slug)),
    figureNames: roster.map((r) => r.name),
  };
  const poll = (question: string, labels: string[], extra: Partial<Poll> = {}): Poll => ({
    id: 'x',
    realm: 'sacred',
    scope: 'sacred',
    question,
    options: labels.map((label, i) => ({ id: `o${i}`, label })),
    closed: false,
    ...extra,
  });
  const check = (p: Poll) => checkPolls([p], opts);

  it('the shipped content/polls.json passes, with sacred and desi polls', () => {
    const raw = JSON.parse(readFileSync('content/polls.json', 'utf8')) as Poll[];
    expect(checkPolls(raw, opts)).toEqual([]);
    expect(raw.filter((p) => p.realm === 'sacred').length).toBeGreaterThanOrEqual(16);
    expect(raw.filter((p) => p.realm === 'comic').length).toBeGreaterThanOrEqual(10);
  });

  it.each([
    ['Who is the greatest god?', ['Yes', 'No']],
    ['Which is the most powerful goddess?', ['Durga', 'Kali']],
    ['Which faith is best?', ['Hindu', 'Buddhist']],
    ['Which god is the strongest?', ['A', 'B']],
    ['Which is the true religion?', ['A', 'B']],
    ['Who is your favourite deity?', ['A', 'B']],
    ['Which of these is the best?', ['Shiva', 'Vishnu', 'Brahma']],
    ['Who is the greatest of them all?', ['Lord Rama', 'Lord Krishna']],
    ['Whom do you like most?', ['Guru Nanak', 'Mahavira']],
    ['Which path is better?', ['Hinduism', 'Buddhism', 'Jainism', 'Sikhism']],
    ['Who would win, Rama or Ravana?', ['Rama', 'Ravana']],
    ['Pick one for this poll today', ['The best guru', 'Another']],
    ['Which festival do you celebrate with your family?', ['Diwali', 'Vesak']],
    ['Which practice do you follow at home?', ['Fasting', 'Prayer']],
    ['What do you believe happens after death?', ['Rebirth', 'Moksha']],
    ['Pick the one closest to your faith', ['A', 'B']],
    ['Which of these do you practise?', ['Yoga', 'Seva']],
  ])('catches "%s"', (q, labels) => {
    expect(check(poll(q, labels)).length).toBeGreaterThan(0);
  });

  it.each([
    ['Which festival story should we tell next?', ['Light over darkness', 'Sharing', 'Courage']],
    ['Which figure should we profile next?', ['Hanuman', 'Mahavira', 'Guru Nanak']],
    ['Which is your favourite story about a god?', ['The churning of the ocean', 'The flood']],
    ['Which lesson matters most to you?', ['Kindness', 'Truth', 'Courage']],
  ])('allows "%s"', (q, labels) => {
    expect(check(poll(q, labels))).toEqual([]);
  });

  it('desi-hero polls may compare heroes', () => {
    const p = poll('Who is the best desi superhero?', ['Nagraj', 'Krrish', 'Shaktimaan'], {
      realm: 'comic',
      scope: 'desi',
    });
    expect(check(p)).toEqual([]);
    const fight = poll('Who would win: Krrish or Minnal Murali?', ['Krrish', 'Minnal Murali'], {
      realm: 'comic',
      scope: 'desi',
    });
    expect(check(fight)).toEqual([]);
    // …but no realm may ask for the greatest god.
    expect(check({ ...p, question: 'Who is the greatest god in comics?' }).length).toBe(1);
  });

  it('catches scope, id and option problems', () => {
    const base = poll('Which festival story should we tell next?', ['Diwali', 'Holi']);
    expect(checkPolls([base, base], opts)).toContain('x: duplicate poll id');
    expect(check({ ...base, realm: 'comic' })[0]).toMatch(/comic poll with scope sacred/);
    expect(check({ ...base, scope: 'desi' })[0]).toMatch(/sacred poll with scope desi/);
    expect(check({ ...base, scope: 'sacred:greek' })[0]).toMatch(/unknown tradition/);
    expect(check({ ...base, scope: 'figure:zeus' })[0]).toMatch(/not in the roster/);
    expect(check({ ...base, scope: 'figure:ganesha' })).toEqual([]);
    const dupOpt = { ...base, options: [base.options[0]!, base.options[0]!] };
    expect(check(dupOpt).join()).toMatch(/duplicate option id/);
    expect(checkPolls([{ ...base, options: [base.options[0]] }], opts)[0]).toMatch(/^schema/);
    expect(checkPolls({ not: 'an array' })[0]).toMatch(/^schema/);
  });
});

// ─── S15: shared caches never hold a voter's page ────────────────────────────────────────────────

describe('S15: cache policy for pages that carry votes', () => {
  const page = (cookie?: string) =>
    new Request('http://localhost/sacred/f/ganesha', { headers: cookie ? { cookie } : {} });
  const policy = (req: Request, set?: string) => {
    const h = new Headers();
    if (set) h.append('Set-Cookie', set);
    cachePolicy(req, h, 200);
    return h.get('Cache-Control');
  };

  it('a first visit that is issued voter cookies is private, never shared', () => {
    expect(policy(page(), 'cm_voter=abcdefghijklmnopqrstuvwx; Path=/; HttpOnly')).toBe(
      'private, no-store',
    );
    expect(policy(page(), 'cm_vk=abc; Path=/; HttpOnly')).toBe('private, no-store');
  });

  it('a visitor holding a voter cookie (own votes in the page) gets private, no-store', () => {
    expect(policy(page('cm_voter=abcdefghijklmnopqrstuvwx; cm_vk=xyz'))).toBe('private, no-store');
    expect(policy(page('theme=x; cm_vk=xyz'))).toBe('private, no-store');
  });

  it('a cookie-less page with nothing set may still be shared for a minute', () => {
    expect(policy(page())).toMatch(/^public, .*s-maxage=60/);
    expect(policy(page('theme=batman'))).toMatch(/^public/);
  });

  it('Set-Cookie overrides a route that asked for a public cache', () => {
    const h = new Headers({ 'Cache-Control': 'public, max-age=600' });
    h.append('Set-Cookie', 'cm_voter=abcdefghijklmnopqrstuvwx; Path=/');
    cachePolicy(page(), h, 200);
    expect(h.get('Cache-Control')).toBe('private, no-store');
  });
});

describe('checkPolls S15: options may not map one-per-faith', () => {
  const poll = (question: string, labels: string[]): Poll => ({
    id: 'x',
    realm: 'sacred',
    scope: 'sacred',
    question,
    options: labels.map((label, i) => ({ id: `o${i}`, label })),
    closed: false,
  });
  it.each([
    [
      'Which festival story should we tell next?',
      ['Diwali', 'Vesak', 'Mahavir Jayanti', 'Gurpurab'],
    ],
    [
      'Where did you first hear these stories?',
      ['At a temple', 'At a gurdwara', 'At a monastery', 'At a Jain derasar'],
    ],
    [
      'Which place should we write about?',
      ['River ghats of Varanasi', 'The Golden Temple', 'Bodh Gaya'],
    ],
    ['Who should we profile next?', ['Jain heroes', 'Sikh heroes', 'Buddhist disciples']],
  ])('catches "%s"', (q, labels) => {
    expect(checkPolls([poll(q, labels)]).join()).toMatch(/one-per-faith/);
  });
  it('allows themes, and options from one or two traditions', () => {
    expect(
      checkPolls([
        poll('Which theme should our next festival story have?', ['Courage', 'Kindness', 'Light']),
      ]),
    ).toEqual([]);
    expect(
      checkPolls([
        poll('Which story should we tell next?', ['Diwali lamps', 'Holi colours', 'Vesak']),
      ]),
    ).toEqual([]);
  });
});

describe('S17: per-IP caps key IPv6 on the /64', () => {
  it('ipPrefix: IPv4 as is, IPv6 by /64, mapped IPv4 as IPv4, junk unchanged', () => {
    expect(ipPrefix('203.0.113.7')).toBe('203.0.113.7');
    expect(ipPrefix('2001:db8:abcd:12:1::5')).toBe('2001:db8:abcd:12::/64');
    expect(ipPrefix('2001:DB8:ABCD:0012:ffff:1:2:3')).toBe('2001:db8:abcd:12::/64');
    expect(ipPrefix('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipPrefix('2001:db8:0:0:ffff::2')).toBe('2001:db8:0:0::/64');
    expect(ipPrefix('::1')).toBe('0:0:0:0::/64');
    expect(ipPrefix('64:ff9b::192.0.2.33')).toBe('64:ff9b:0:0::/64');
    expect(ipPrefix('::ffff:198.51.100.4')).toBe('198.51.100.4');
    expect(ipPrefix('local')).toBe('local');
    expect(ipPrefix('1:2:3')).toBe('1:2:3');
    expect(ipPrefix('1::2::3')).toBe('1::2::3');
  });

  it('rotating addresses inside one /64 shares one allowance; another /64 has its own', async () => {
    const sql = db();
    const T = 1_800_000_000_000;
    const N = COUNTED_NEW_VOTERS_PER_IP;
    for (let k = 0; k < N + 3; k++)
      ok(
        await castVote(
          sql,
          { id: 'p-open', option: 'diwali' },
          `g:v6${k}`,
          `2001:db8:1:2::${k + 1}`,
          T,
        ),
      );
    expect((await pollView('p-open', null, sql))!.total).toBe(N);
    for (let k = 0; k < 3; k++)
      ok(
        await castVote(
          sql,
          { id: 'p-open', option: 'diwali' },
          `g:w6${k}`,
          `2001:db8:1:${k + 3}::1`,
          T,
        ),
      );
    expect((await pollView('p-open', null, sql))!.total).toBe(N + 3);
  });
});

describe('ceilings are configurable, defaults unchanged', () => {
  it('defaults: 60 voter cookies per IP per 10 min, 5 counted new guests per IP per hour', () => {
    expect(DEFAULT_MINT_CEILING).toBe(60);
    expect(DEFAULT_VOTE_CAP).toBe(5);
    // This test run sets neither variable, so the live values are the defaults.
    expect(process.env.COMICMUTANT_MINT_CEILING).toBeUndefined();
    expect(process.env.COMICMUTANT_VOTE_CAP).toBeUndefined();
    expect(MINT_MAX_PER_IP).toBe(60);
    expect(COUNTED_NEW_VOTERS_PER_IP).toBe(5);
    expect(MINT_WINDOW_MS).toBe(600_000);
    expect(COUNTED_WINDOW_MS).toBe(3_600_000);
  });

  it('positiveInt: a valid override wins; junk, zero or negatives keep the default', () => {
    expect(positiveInt('100000', 60)).toBe(100000);
    expect(positiveInt(' 7 ', 5)).toBe(7);
    for (const bad of [undefined, '', '0', '-5', 'abc', '1e9', '12.5', '9999999999'])
      expect(positiveInt(bad, 60)).toBe(60);
  });
});
