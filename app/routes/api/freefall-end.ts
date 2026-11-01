/**
 * POST /api/freefall/end — "this run just ended, at step n" (the client pings at game over). The server keeps
 * the time against the run token so a posted run can be checked against the wall clock: a game run
 * slower than real time (thinking time bought by throttling frames) is held for a mod.
 */
import { data } from 'react-router';
import { z } from 'zod';
import { getSql } from '~/.server/db';
import { markEnd } from '~/.server/freefall';
import { allow, assertSameOrigin, clientIp, readJson } from '~/.server/guard';
import type { Route } from './+types/freefall-end';

const Body = z.object({
  token: z.string().min(20).max(200),
  step: z
    .number()
    .int()
    .min(0)
    .max(60 * 60 * 20),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') return data({ ok: false }, { status: 405 });
  assertSameOrigin(request);
  const b = Body.safeParse(await readJson(request, 512));
  if (!b.success) return data({ ok: false }, { status: 400 });
  const sql = await getSql();
  if (!(await allow(sql, `ff-end:${clientIp(request)}`, 60, 60_000)))
    return data({ ok: false }, { status: 429 });
  return { ok: await markEnd(sql, b.data.token, b.data.step) };
}
