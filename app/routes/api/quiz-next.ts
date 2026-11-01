/**
 * POST /api/quiz/next — { game, index }: serve the question after the last answered (Q9). Its clock
 * starts on the first call; a repeat returns the same question without resetting it.
 */
import { data } from 'react-router';
import { z } from 'zod';
import { currentUser } from '~/.server/auth';
import { getSql } from '~/.server/db';
import { assertSameOrigin, clientIp } from '~/.server/guard';
import { fail, nextQuestion, quizBody, quizRate } from '~/.server/quiz';
import { guestId } from '~/.server/voter';
import type { Route } from './+types/quiz-next';

const Body = z.object({
  game: z.string().min(10).max(80),
  index: z.number().int().min(0).max(40),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') return data(fail('POST only', 'invalid'), { status: 405 });
  assertSameOrigin(request);
  const raw = await quizBody(request, 256);
  if (!raw.ok) return data(raw.reply, { status: raw.status });
  const b = Body.safeParse(raw.body);
  if (!b.success) return data(fail('invalid request', 'invalid'), { status: 400 });
  const sql = await getSql();
  // Same budget as answers (one /next per answer), per fan or browser.
  const user = await currentUser(sql, request);
  const guest = guestId(request);
  if (!(await quizRate(sql, 'next', { user, guest, ip: clientIp(request) }, 120, 60_000)))
    return data(fail('Slow down a little.', 'rate'), { status: 429 });
  const r = await nextQuestion(sql, b.data, { user, guest });
  return r.ok ? r : data(r, { status: 422 });
}
