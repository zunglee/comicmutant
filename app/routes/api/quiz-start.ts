/**
 * POST /api/quiz/start — { mode, universe?, character? } → a signed game id and its first question
 * (options shuffled, no answer). Guests play too: a guest cookie is issued if there is none, and the
 * game is theirs to claim after joining. Only a signed-in fan's first daily start of the day ranks;
 * daily starts are capped per fan and per browser each IST day (never per IP, Q22).
 */
import { data } from 'react-router';
import { z } from 'zod';
import { currentUser } from '~/.server/auth';
import { getSql } from '~/.server/db';
import { assertSameOrigin, clientIp } from '~/.server/guard';
import { fail, quizBody, quizRate, startGame } from '~/.server/quiz';
import { guestId, newGuest } from '~/.server/voter';
import { QUIZ_MODES } from '~/lib/quiz-contract';
import { PUBLISHED_UNIVERSES } from '~/lib/taxonomy';
import type { Route } from './+types/quiz-start';

const Body = z.object({
  mode: z.enum(QUIZ_MODES),
  universe: z.enum(PUBLISHED_UNIVERSES).optional(),
  character: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') return data(fail('POST only', 'invalid'), { status: 405 });
  assertSameOrigin(request);
  const raw = await quizBody(request, 256);
  if (!raw.ok) return data(raw.reply, { status: raw.status });
  const b = Body.safeParse(raw.body);
  if (!b.success) return data(fail('invalid game', 'invalid'), { status: 400 });
  const sql = await getSql();
  const user = await currentUser(sql, request);
  const ip = clientIp(request);
  const headers = new Headers();
  // Every start carries a browser cookie, signed in too: a guest's lanes are per browser (Q22).
  let guest = guestId(request);
  if (!guest) {
    const g = newGuest();
    guest = g.id;
    headers.append('Set-Cookie', g.cookie);
  }
  // Keyed on the fan, else the browser (a first start: its new cookie); the IP only as a high
  // ceiling (Q23d) — a fresh visitor on a carrier IP never shares a bucket with strangers.
  if (!(await quizRate(sql, 'start', { user, guest, ip }, 30, 60_000)))
    return data(fail('Slow down a little.', 'rate'), { status: 429, headers });
  const r = await startGame(sql, b.data, { user, guest, ip });
  return data(r, { status: r.ok ? 200 : 422, headers });
}
