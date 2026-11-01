/**
 * POST /api/freefall/submit — post a finished run: { token, log }. Signed-in fans only (401 tells the
 * client to keep the run and offer sign-in). The score is computed here by replaying the log.
 */
import { data } from 'react-router';
import { z } from 'zod';
import { currentUser } from '~/.server/auth';
import { getSql } from '~/.server/db';
import { postRun } from '~/.server/freefall';
import { allow, assertSameOrigin, readJson } from '~/.server/guard';
import { guestId } from '~/.server/voter';
import { MAX_LOG } from '~/game/freefall/replay';
import type { Route } from './+types/freefall-submit';

const Body = z.object({
  token: z.string().min(20).max(160),
  log: z
    .array(
      z
        .number()
        .int()
        .min(0)
        .max((1 << 20) + 86_400),
    )
    .max(MAX_LOG),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') return data({ ok: false, error: 'POST only' }, { status: 405 });
  assertSameOrigin(request);
  const b = Body.safeParse(await readJson(request, 640 * 1024));
  if (!b.success) return data({ ok: false, error: 'invalid run' }, { status: 400 });
  const sql = await getSql();
  const user = await currentUser(sql, request);
  if (!user) return data({ ok: false, error: 'sign in to post', login: true }, { status: 401 });
  if (!(await allow(sql, `ff-post:${user.id}`, 20, 60_000)))
    return data({ ok: false, error: 'slow down' }, { status: 429 });
  const r = await postRun(sql, user.id, b.data.token, b.data.log, Date.now(), guestId(request));
  return r.ok ? r : data(r, { status: 422 });
}
