/** Request-level protection: client identity, throttling, same-origin checks, bounded form parsing. */
import { data } from 'react-router';
import type { Sql } from './db';
import { ENV } from './env';

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(text: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
}

let hmacKey: Promise<CryptoKey> | undefined;
/** Keyed hash: ids and bucket names derived from IPs can't be reversed without the secret. */
export async function hmac(text: string): Promise<string> {
  hmacKey ??= crypto.subtle.importKey(
    'raw',
    enc.encode(ENV.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', await hmacKey, enc.encode(text));
  return b64url(new Uint8Array(sig)).slice(0, 32);
}

/**
 * The client IP, from the one header the deployment says it can trust (env COMICMUTANT_IP_HEADER).
 * Client-supplied headers are never trusted by default: unknown → one shared bucket ("local"),
 * which fails closed for rate limits.
 */
export function clientIp(request: Request): string {
  const mode = ENV.ipHeader;
  let ip: string | undefined;
  if (mode === 'cf-connecting-ip') ip = request.headers.get('cf-connecting-ip') ?? undefined;
  else if (mode === 'x-forwarded-for')
    ip = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim();
  return ip && /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : 'local';
}

/**
 * Fixed-window limit: one atomic upsert per check (a single round trip on D1). Bucket keys are
 * keyed hashes, so the table never holds raw IPs or names. Old windows are swept occasionally.
 */
export async function allow(
  sql: Sql,
  bucket: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const t = Date.now();
  // `win` is the window's start time in ms, so one sweep works for every window length.
  const win = Math.floor(t / windowMs) * windowMs;
  const key = `${await hmac(bucket)}:${windowMs}`;
  if (Math.random() < 0.01) await sql.run('DELETE FROM throttle WHERE win < ?', [t - 86400_000]);
  const r = await sql.get<{ n: number }>(
    `INSERT INTO throttle (bucket, win, n) VALUES (?, ?, 1)
     ON CONFLICT (bucket, win) DO UPDATE SET n = n + 1 RETURNING n`,
    [key, win],
  );
  return (r?.n ?? 1) <= max;
}

export async function clearBucket(sql: Sql, bucket: string, windowMs: number): Promise<void> {
  await sql.run('DELETE FROM throttle WHERE bucket = ?', [`${await hmac(bucket)}:${windowMs}`]);
}

export function siteOrigin(request: Request): string {
  return ENV.origin ?? new URL(request.url).origin;
}

/**
 * Refuses cross-site state changes. Compares Origin with the configured site origin (never a
 * client-sent X-Forwarded-Host); without Origin, falls back to Fetch Metadata.
 */
export function assertSameOrigin(request: Request): void {
  const refuse = (): never => {
    throw new Response('Cross-site request refused', { status: 403 });
  };
  const origin = request.headers.get('origin');
  if (origin === null) {
    if (request.headers.get('sec-fetch-site') === 'cross-site') refuse();
    return;
  }
  let got = '';
  try {
    got = new URL(origin).origin;
  } catch {
    refuse();
  }
  if (got !== siteOrigin(request)) refuse();
}

const FORM_MAX = 8 * 1024;

/**
 * Parses a small urlencoded form with a hard byte cap — before any auth or hashing work, so a
 * huge or multipart body can't exhaust memory. Every form on the site is tiny.
 */
export async function readForm(request: Request, max = FORM_MAX): Promise<URLSearchParams> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.startsWith('application/x-www-form-urlencoded')) {
    throw data({ ok: false, error: 'Unsupported form encoding.' }, { status: 415 });
  }
  return new URLSearchParams(await readBody(request, max));
}

/** A small JSON body, same streaming cap. */
export async function readJson(request: Request, max = FORM_MAX): Promise<unknown> {
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) {
    throw data({ ok: false, error: 'Expected JSON.' }, { status: 415 });
  }
  try {
    return JSON.parse(await readBody(request, max));
  } catch {
    throw data({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }
}

async function readBody(request: Request, max: number): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > max) throw data({ ok: false, error: 'Too large.' }, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw data({ ok: false, error: 'Too large.' }, { status: 413 });
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    buf.set(c, o);
    o += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

export const VOTER_COOKIE = 'cm_voter';
