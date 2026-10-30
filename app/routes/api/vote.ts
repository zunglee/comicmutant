import { data } from 'react-router';
import { currentUser } from '~/.server/auth';
import { versusExists, vote } from '~/.server/community';
import { getSql } from '~/.server/db';
import { intField } from '~/.server/forms';
import { allow, assertSameOrigin, clientIp, readForm } from '~/.server/guard';
import { guestId, newGuest } from '~/.server/voter';
import type { Route } from './+types/vote';

/**
 * Votes need no account. Guests are a random cookie id; each IP may mint only a few new guest
 * voters per debate per hour, so clearing cookies doesn't stuff the ballot.
 */
export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const form = await readForm(request);
  const id = intField(form, 'versus');
  const side = form.get('side');
  if (id === null || (side !== 'a' && side !== 'b')) return data({ ok: false }, { status: 400 });
  const sql = await getSql();
  if (!(await versusExists(sql, id))) return data({ ok: false }, { status: 404 });
  const user = await currentUser(sql, request);
  const headers = new Headers();
  let voter: string;
  if (user) voter = `u:${user.id}`;
  else {
    let g = guestId(request);
    if (!g) {
      if (!(await allow(sql, `newguest:${clientIp(request)}:${id}`, 5, 3600_000))) {
        return data({ ok: false, error: 'Sign in to vote again from here.' }, { status: 429 });
      }
      const fresh = newGuest();
      g = fresh.id;
      headers.append('Set-Cookie', fresh.cookie);
    }
    voter = `g:${g}`;
  }
  if (!(await allow(sql, `vote:${voter}`, 30, 60_000)))
    return data({ ok: false }, { status: 429, headers });
  await vote(sql, id, voter, side);
  return data({ ok: true }, { headers });
}
