/** Shared plumbing for POST endpoints: same-origin check, bounded form, signed-in user, throttle. */
import { data } from 'react-router';
import { currentUser, type User } from './auth';
import { getSql, type Sql } from './db';
import { allow, assertSameOrigin, readForm } from './guard';

export async function guardedPost(
  request: Request,
  bucket: string,
  max: number,
  windowMs: number,
): Promise<{ sql: Sql; user: User; form: URLSearchParams }> {
  if (request.method !== 'POST') throw data({ ok: false, error: 'POST only' }, { status: 405 });
  assertSameOrigin(request);
  const form = await readForm(request);
  const sql = await getSql();
  const user = await currentUser(sql, request);
  if (!user) throw data({ ok: false, error: 'Sign in first.' }, { status: 401 });
  if (!(await allow(sql, `${bucket}:${user.id}`, max, windowMs))) {
    throw data({ ok: false, error: 'Whoa, speedster — slow down a moment.' }, { status: 429 });
  }
  return { sql, user, form };
}

export function intField(form: URLSearchParams, name: string): number | null {
  const raw = form.get(name) ?? '';
  if (!/^\d{1,12}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}
