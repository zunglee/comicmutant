import { describe, expect, it } from 'vitest';
import {
  createUser,
  hashPassword,
  nameSkeleton,
  safeNext,
  validName,
  verifyPassword,
} from '~/.server/auth';
import {
  addTake,
  checkTake,
  createVersus,
  listTakes,
  listVersus,
  modRule,
  react,
  report,
  vote,
} from '~/.server/community';
import { type Sql, sqliteSql } from '~/.server/db';
import { openSqlite } from '~/.server/db.node';
import { allow, readForm } from '~/.server/guard';

function db() {
  return sqliteSql(openSqlite(':memory:'));
}

async function user(sql: Sql, name: string, ageHours = 48, role: 'fan' | 'mod' = 'fan') {
  const at = new Date(Date.now() - ageHours * 3600_000).toISOString();
  const r = await sql.run(
    "INSERT INTO users (name, skeleton, password_hash, role, created_at) VALUES (?, ?, 'x', ?, ?)",
    [name, nameSkeleton(name), role, at],
  );
  return r.lastId;
}

describe('checkTake', () => {
  it('accepts a normal take and trims it', () => {
    expect(checkTake('  Shaktimaan  had the   best theme song ')).toEqual({
      ok: true,
      body: 'Shaktimaan had the best theme song',
    });
  });
  it.each([
    '',
    'hi',
    'x'.repeat(300),
    'see https://evil.example',
    'visit spam.com now',
    'evil[.]com',
    'evil dot gg',
    'go to spam . co',
    'aaaaaaaaaaaaaaa',
    'f u c k this',
    'f*ck this',
    'sh1t take',
    'f​uck',
    'ｆｕｃｋ',
    'a\u0301\u0302\u0303\u0304\u0305 zalgo',
  ])('rejects %j', (s) => {
    expect(checkTake(s).ok).toBe(false);
  });
  it.each([
    'Push it to the limit',
    'Fagin was a Dickens villain',
    'Mushroom shiitake is fine',
    'Scunthorpe United',
  ])('does not over-block %j', (s) => expect(checkTake(s).ok).toBe(true));
  it('strips zero-width and bidi characters', () => {
    expect(checkTake('Ba​tman ‮rules').ok && checkTake('Ba​tman rules')).toEqual({
      ok: true,
      body: 'Batman rules',
    });
  });
  it('rejects non-strings', () => expect(checkTake(42).ok).toBe(false));
});

describe('safeNext', () => {
  it.each([
    ['/c/batman', '/c/batman'],
    ['/versus?page=2#x', '/versus?page=2#x'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['/\t/evil.com', '/'],
    ['/%09/evil.com', '/%09/evil.com'],
    ['https://evil.com', '/'],
    [null, '/'],
  ])('%j → %j', (input, out) => expect(safeNext(input)).toBe(out));
});

describe('names and passwords', () => {
  it('reserved and look-alike names are refused', () => {
    expect(validName('Mod')).toBe(false);
    expect(validName('M0D')).toBe(false);
    expect(validName('com_ic_mutant')).toBe(false);
    expect(validName('webhead_42')).toBe(true);
  });
  it('look-alike duplicates collide', async () => {
    const sql = db();
    expect(await createUser(sql, 'Bob_1', 'correct horse battery', null)).toBeTruthy();
    expect(await createUser(sql, 'B0B_l', 'correct horse battery', null)).toBeNull();
  });
  it('peppered hashes verify, and long passwords are refused at join', async () => {
    const h = await hashPassword('correct horse battery');
    expect(h.startsWith('pbkdf2p$100000$')).toBe(true);
    expect(await verifyPassword('correct horse battery', h)).toBe(true);
    expect(await verifyPassword('wrong horse battery', h)).toBe(false);
    expect(await createUser(db(), 'longpw', 'x'.repeat(129), null)).toBeNull();
  });
});

describe('guard', () => {
  it('fixed-window limit counts and blocks', async () => {
    const sql = db();
    for (let i = 0; i < 3; i++) expect(await allow(sql, 'k', 3, 60_000)).toBe(true);
    expect(await allow(sql, 'k', 3, 60_000)).toBe(false);
    expect(await allow(sql, 'other', 3, 60_000)).toBe(true);
    const raw = await sql.all<{ bucket: string }>('SELECT bucket FROM throttle');
    expect(raw.every((r) => !r.bucket.includes('other'))).toBe(true);
  });
  it('readForm caps the body and refuses multipart', async () => {
    const post = (body: string, type = 'application/x-www-form-urlencoded') =>
      new Request('http://x/', { method: 'POST', body, headers: { 'content-type': type } });
    expect((await readForm(post('a=1&b=2'))).get('b')).toBe('2');
    await expect(readForm(post(`a=${'x'.repeat(9000)}`))).rejects.toBeTruthy();
    await expect(readForm(post('--x', 'multipart/form-data; boundary=x'))).rejects.toBeTruthy();
  });
});

describe('community store', () => {
  it('reaction tallies follow toggles and switches', async () => {
    const sql = db();
    const a = await user(sql, 'ana');
    const b = await user(sql, 'bob');
    const id = await addTake(sql, a, 'c:batman', 'Batman is mostly prep time', null);
    expect(await react(sql, b, id, 'pow')).toBe(true);
    expect(await react(sql, b, id, 'nope')).toBe(false);
    let [t] = await listTakes(sql, 'c:batman', b);
    expect(t?.reactions.pow).toBe(1);
    expect(t?.mine).toBe('pow');
    await react(sql, b, id, 'lol');
    [t] = await listTakes(sql, 'c:batman', b);
    expect(t?.reactions).toEqual({ lol: 1 });
    await react(sql, b, id, 'lol');
    [t] = await listTakes(sql, 'c:batman', b);
    expect(t?.reactions).toEqual({});
  });

  it('only trusted reporters auto-hide; new accounts and self-reports do not; mod restore sticks', async () => {
    const sql = db();
    const author = await user(sql, 'author');
    const id = await addTake(sql, author, 'c:batman', 'A spicy but fine take', null);
    // Three brand-new throwaway accounts: reports land in the queue but never hide.
    for (const n of ['n1', 'n2', 'n3']) await report(sql, await user(sql, n, 0), id);
    expect(await listTakes(sql, 'c:batman', null)).toHaveLength(1);
    expect(await report(sql, author, id)).toBe(false);
    // Established fans (old account + a visible take) can hide it.
    const vets = [];
    for (const n of ['v1', 'v2', 'v3']) {
      const v = await user(sql, n);
      await addTake(sql, v, 'c:joker', `${n} has opinions`, null);
      vets.push(v);
    }
    for (const v of vets) await report(sql, v, id);
    expect(await listTakes(sql, 'c:batman', null)).toHaveLength(0);
    const mod = await user(sql, 'boss', 48, 'mod');
    expect(await modRule(sql, mod, id, 'restore')).toBeNull();
    for (const n of ['w1', 'w2', 'w3']) {
      const w = await user(sql, n);
      await addTake(sql, w, 'c:joker', `${n} also`, null);
      await report(sql, w, id);
    }
    expect(await listTakes(sql, 'c:batman', null)).toHaveLength(1);
  });

  it('reporting a missing take is a no-op, not an error', async () => {
    const sql = db();
    expect(await report(sql, await user(sql, 'r'), 99999)).toBe(false);
  });

  it('keyset paging and per-side listing', async () => {
    const sql = db();
    const u = await user(sql, 'pager');
    for (let i = 0; i < 35; i++)
      await addTake(sql, u, 'v:1', `take number ${i}`, i % 2 ? 'a' : 'b');
    const first = await listTakes(sql, 'v:1', null, { side: 'a' });
    expect(first.every((t) => t.side === 'a')).toBe(true);
    const all1 = await listTakes(sql, 'v:1', null);
    expect(all1).toHaveLength(30);
    const all2 = await listTakes(sql, 'v:1', null, { before: all1[all1.length - 1]?.id });
    expect(all2).toHaveLength(5);
    expect(new Set([...all1, ...all2].map((t) => t.id)).size).toBe(35);
  });

  it('versus is order-insensitive, counters follow vote switches, bans remove votes', async () => {
    const sql = db();
    const a = await createVersus(sql, 'joker', 'batman', 'villain', null);
    expect(await createVersus(sql, 'batman', 'joker', 'villain', null)).toBe(a);
    await vote(sql, a, 'g:1', 'a');
    await vote(sql, a, 'g:1', 'b');
    await vote(sql, a, 'g:2', 'b');
    const troll = await user(sql, 'troll');
    await vote(sql, a, `u:${troll}`, 'a');
    let [v] = await listVersus(sql);
    expect([v?.votes_a, v?.votes_b]).toEqual([1, 2]);
    const mod = await user(sql, 'boss', 48, 'mod');
    const t = await addTake(sql, troll, `v:${a}`, 'trolling hard here', 'a');
    expect(await modRule(sql, mod, t, 'ban')).toBeNull();
    [v] = await listVersus(sql);
    expect([v?.votes_a, v?.votes_b]).toEqual([0, 2]);
    const t2 = await addTake(sql, mod, `v:${a}`, 'mod take', 'b');
    expect(await modRule(sql, mod, t2, 'ban')).not.toBeNull();
  });
});
