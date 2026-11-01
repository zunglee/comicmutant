/**
 * POST /api/freefall/start — a signed run token (seed + start time). Guests get one too: they play
 * first and sign in only to post. The token names who started it (fan or guest cookie) and, for
 * today's tower, which start this is for a signed-in fan: only their first start ranks; a guest's
 * look at today's tower is unranked.
 */
import { data } from 'react-router';
import { z } from 'zod';
import { currentUser } from '~/.server/auth';
import { getSql } from '~/.server/db';
import { countStart, fanKey, issueToken, istDay, MODES, ownerTag } from '~/.server/freefall';
import { allow, assertSameOrigin, clientIp, readJson } from '~/.server/guard';
import { guestId, newGuest } from '~/.server/voter';
import { LEVELS } from '~/game/freefall/maths';
import type { Route } from './+types/freefall-start';

const Body = z.object({ mode: z.enum(MODES), level: z.enum(LEVELS) });

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') return data({ ok: false, error: 'POST only' }, { status: 405 });
  assertSameOrigin(request);
  const b = Body.safeParse(await readJson(request, 256));
  if (!b.success) return data({ ok: false, error: 'invalid run' }, { status: 400 });
  const sql = await getSql();
  if (!(await allow(sql, `ff-start:${clientIp(request)}`, 40, 60_000)))
    return data({ ok: false, error: 'slow down' }, { status: 429 });
  const { mode, level } = b.data;
  const user = await currentUser(sql, request);
  const headers = new Headers();
  let guest = guestId(request);
  if (!guest && !user) {
    const g = newGuest();
    guest = g.id;
    headers.append('Set-Cookie', g.cookie);
  }
  // Today's tower ranks only for a signed-in fan's first start; a guest's run there is unranked (0).
  const attempt =
    mode === 'daily' && user ? await countStart(sql, [fanKey(user)], level, istDay()) : 0;
  const owner = await ownerTag(user?.id ?? null, guest);
  return data(
    { ok: true as const, ...(await issueToken(mode, level, Date.now(), attempt, owner)) },
    { headers },
  );
}
