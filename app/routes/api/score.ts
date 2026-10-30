/**
 * POST /api/score — an arena result. Stored for the signed-in fan (anonymous results stay in the
 * browser only: app/game/records.ts). Rate-limited; body capped before parsing.
 */
import { data } from 'react-router';
import { z } from 'zod';
import { currentUser } from '~/.server/auth';
import { getFighter } from '~/.server/content';
import { getSql } from '~/.server/db';
import { allow, assertSameOrigin, clientIp, readJson } from '~/.server/guard';
import { GAME_IDS } from '~/game/types';
import type { Route } from './+types/score';

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(60);
const pts = z.number().int().min(0).max(999);

const ScoreBody = z.object({
  game: z.enum(GAME_IDS),
  p1: slug,
  p2: slug,
  winner: z.enum(['p1', 'p2', 'draw']),
  score: z.tuple([pts, pts]),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') return data({ ok: false, error: 'POST only' }, { status: 405 });
  assertSameOrigin(request);
  const r = ScoreBody.safeParse(await readJson(request, 1024));
  if (!r.success) return data({ ok: false, error: 'invalid score' }, { status: 400 });
  if (!getFighter(r.data.p1) || !getFighter(r.data.p2)) {
    return data({ ok: false, error: 'unknown fighter' }, { status: 400 });
  }
  const sql = await getSql();
  const user = await currentUser(sql, request);
  if (!user) return { ok: true as const, stored: false };
  if (!(await allow(sql, `score:${user.id}:${clientIp(request)}`, 20, 60_000))) {
    return data({ ok: false, error: 'slow down' }, { status: 429 });
  }
  const winner = r.data.winner === 'draw' ? 'draw' : r.data[r.data.winner];
  await sql.run(
    'INSERT INTO scores (user_id, game, winner, score, created_at) VALUES (?, ?, ?, ?, ?)',
    [user.id, r.data.game, winner, Math.max(...r.data.score), new Date().toISOString()],
  );
  return { ok: true as const, stored: true };
}
