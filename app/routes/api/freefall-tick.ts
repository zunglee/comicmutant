/**
 * POST /api/freefall/tick — a progress ping while a run is played ({ token, step }, every ~10 s).
 * The server checks the posted run's pace against these: a run played slower than real time is held.
 */
import { data } from 'react-router';
import { z } from 'zod';
import { getSql } from '~/.server/db';
import { markTick } from '~/.server/freefall';
import { allow, assertSameOrigin, clientIp, readJson } from '~/.server/guard';
import type { Route } from './+types/freefall-tick';

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
  if (!(await allow(sql, `ff-tick:${clientIp(request)}`, 120, 60_000)))
    return data({ ok: false }, { status: 429 });
  return { ok: await markTick(sql, b.data.token, b.data.step) };
}
