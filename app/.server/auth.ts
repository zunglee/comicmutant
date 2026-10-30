/**
 * Light fan accounts: a nickname + password, no email. Passwords use PBKDF2 through WebCrypto so
 * the same code runs on Node and Workers. Sessions are random tokens stored hashed.
 */
import { redirect } from 'react-router';
import { NAME_RE, PASSWORD_MAX, PASSWORD_MIN, RESERVED_NAMES } from '~/lib/community';
import type { Sql } from './db';
import { ENV } from './env';
import { b64url, fromB64url, hmac, randomToken, sha256 } from './guard';

/**
 * 100k is Cloudflare Workers' WebCrypto ceiling; a server-side pepper (HMAC with
 * COMICMUTANT_SECRET) makes a stolen DB alone useless for offline guessing.
 */
const ITERATIONS = 100_000;
/** Idle expiry; every use within the window slides it forward (rolling session). */
const SESSION_DAYS = 21;
/** `__Host-` binds the cookie to this exact host over HTTPS (no sibling-subdomain planting). */
export const SESSION_COOKIE = ENV.prod ? '__Host-cm_session' : 'cm_session';

/**
 * PBKDF2 is deliberately slow; cap how many run at once so a flood of logins can't starve the
 * thread pool. Over the cap the request is refused with 503.
 */
const MAX_HASHING = 4;
let hashing = 0;
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (hashing >= MAX_HASHING) throw new Response('Busy — try again in a moment.', { status: 503 });
  hashing++;
  try {
    return await fn();
  } finally {
    hashing--;
  }
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await limited(async () => pbkdf2(await hmac(`pw|${password}`), salt, ITERATIONS));
  return `pbkdf2p$${ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split('$');
  // pbkdf2p = peppered (current); pbkdf2 = legacy dev hashes from before the pepper.
  if ((scheme !== 'pbkdf2p' && scheme !== 'pbkdf2') || !iter || !salt || !hash) return false;
  const input = scheme === 'pbkdf2p' ? await hmac(`pw|${password}`) : password;
  const got = await limited(() => pbkdf2(input, fromB64url(salt), Number(iter)));
  const want = fromB64url(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= (got[i] ?? 0) ^ (want[i] ?? 0);
  return diff === 0;
}

export interface User {
  id: number;
  name: string;
  role: 'fan' | 'mod';
  avatar: string | null;
}

/** Fold look-alikes so "M0D", "m_o_d" and "Mod" collide. */
export function nameSkeleton(name: string): string {
  return name
    .toLowerCase()
    .replace(/_/g, '')
    .replace(/0/g, 'o')
    .replace(/[1l]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't');
}

export function validName(name: string): boolean {
  return NAME_RE.test(name) && !RESERVED_NAMES.map(nameSkeleton).includes(nameSkeleton(name));
}

export function validPassword(password: string): boolean {
  return password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;
}

export async function createUser(
  sql: Sql,
  name: string,
  password: string,
  avatar: string | null,
  role: 'fan' | 'mod' = 'fan',
): Promise<number | null> {
  if (!validName(name) || !validPassword(password)) return null;
  const taken = await sql.get('SELECT 1 FROM users WHERE name = ? OR skeleton = ?', [
    name,
    nameSkeleton(name),
  ]);
  if (taken) return null;
  try {
    const r = await sql.run(
      'INSERT INTO users (name, skeleton, password_hash, role, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        name,
        nameSkeleton(name),
        await hashPassword(password),
        role,
        avatar,
        new Date().toISOString(),
      ],
    );
    return r.lastId;
  } catch (e) {
    // Two joins racing for one name: the UNIQUE index decides, the loser gets "taken".
    if (String(e).includes('UNIQUE')) return null;
    throw e;
  }
}

/** Constant work whether or not the name exists, so timing doesn't reveal accounts. */
const DUMMY = `pbkdf2p$${ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

export async function checkPassword(
  sql: Sql,
  name: string,
  password: string,
): Promise<number | null> {
  const row = await sql.get<{ id: number; password_hash: string; banned: number }>(
    'SELECT id, password_hash, banned FROM users WHERE name = ?',
    [name],
  );
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY);
  return row && ok && !row.banned ? row.id : null;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) {
      try {
        return decodeURIComponent(v.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function cookie(value: string, maxAge: number): string {
  const secure = ENV.prod ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function startSession(sql: Sql, userId: number): Promise<string> {
  const token = randomToken();
  const now = new Date();
  await sql.run('DELETE FROM sessions WHERE expires_at < ?', [now.toISOString()]);
  await sql.run('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)', [
    await sha256(token),
    userId,
    new Date(now.getTime() + SESSION_DAYS * 86400_000).toISOString(),
    now.toISOString(),
  ]);
  return cookie(token, SESSION_DAYS * 86400);
}

export async function endSession(sql: Sql, request: Request): Promise<string> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await sql.run('DELETE FROM sessions WHERE id = ?', [await sha256(token)]);
  return cookie('', 0);
}

export async function currentUser(sql: Sql, request: Request): Promise<User | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await sql.get<User & { expires_at: string; banned: number }>(
    `SELECT u.id, u.name, u.role, u.avatar, u.banned, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    [await sha256(token)],
  );
  const now = Date.now();
  if (!row || row.banned || row.expires_at < new Date(now).toISOString()) return null;
  // Rolling expiry: refresh the row at most daily (the cookie's own Max-Age is re-sent on login).
  if (new Date(row.expires_at).getTime() - now < (SESSION_DAYS - 1) * 86400_000) {
    await sql.run('UPDATE sessions SET expires_at = ? WHERE id = ?', [
      new Date(now + SESSION_DAYS * 86400_000).toISOString(),
      await sha256(token),
    ]);
  }
  return { id: row.id, name: row.name, role: row.role, avatar: row.avatar };
}

export async function requireUser(sql: Sql, request: Request): Promise<User> {
  const user = await currentUser(sql, request);
  if (!user) {
    const url = new URL(request.url);
    throw redirect(`/login?next=${encodeURIComponent(url.pathname)}`);
  }
  return user;
}

export async function requireMod(sql: Sql, request: Request): Promise<User> {
  const user = await requireUser(sql, request);
  if (user.role !== 'mod') throw new Response('Moderators only', { status: 403 });
  return user;
}

/** Only same-site paths survive as a post-login redirect (control chars and backslashes refused). */
export function safeNext(next: string | null): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point.
  if (!next || !next.startsWith('/') || /[\u0000-\u001f\u007f\\]/.test(next)) return '/';
  try {
    const base = 'http://comicmutant.invalid';
    const u = new URL(next, base);
    return u.origin === base ? `${u.pathname}${u.search}${u.hash}` : '/';
  } catch {
    return '/';
  }
}
